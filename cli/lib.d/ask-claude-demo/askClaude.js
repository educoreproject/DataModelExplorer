#!/usr/bin/env node
'use strict';
process.noDeprecation = true;

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

const os = require('os');
const path = require('path');
const fs = require('fs');
const commandLineParser = require('qtools-parse-command-line');
const configFileProcessor = require('qtools-config-file-processor');

//START OF moduleFunction() ============================================================
const moduleFunction = ({ moduleName } = {}) => ({ unused } = {}) => {
	const { xLog, getConfig, rawConfig, commandLineParameters, projectRoot } = process.global;
	const localConfig = getConfig(moduleName);

	// -- help text --
	if (commandLineParameters.switches.help) {
		xLog.result(`
askClaude -- Multi-perspective research tool

  Decomposes a prompt into N distinct analytical perspectives, runs each
  through a separate Claude instance in parallel, and collects results
  into a unified report. Two drivers available: "direct" calls the
  Anthropic API with no overhead; "sdk" uses the Agent SDK with tool access.

Usage:
  askClaude [options] "your prompt here"

Options:
  --driver=DRIVER        API driver: direct|sdk (default: direct)
  --perspectives=N       Number of parallel perspectives (default: 3)
  --model=MODEL          Model for research agents: opus|sonnet|haiku (default: sonnet)
  --expandModel=MODEL    Model for expansion stage: opus|sonnet|haiku (default: opus)
  -verbose               Show detailed progress and cost info per stage
  -json                  Output raw JSON instead of formatted text report
  -dryRun                Run expansion only; show perspectives without research
  -help                  Show this help message

  SDK driver only (ignored by direct driver):
  --budget=USD           Max budget per agent in USD (default: 1.00)
  --maxTurns=N           Max conversation turns per agent (default: 10)
  --tools=LIST           Comma-separated tools for agents (use "none" to disable)

Examples:
  askClaude "What are the implications of quantum computing for cryptography?"
  askClaude --perspectives=5 --model=opus "Evaluate microservices vs monolith"
  askClaude -dryRun "How should we restructure authentication?"
  askClaude --driver=sdk --tools=WebSearch "Research current AI regulations"
		`);
		return;
	}

	// -- API key check --
	const apiKey = localConfig.anthropicApiKey;
	if (!apiKey || apiKey === 'YOUR_API_KEY_HERE') {
		xLog.error(`Error: Set anthropicApiKey in ${moduleName}.ini`);
		xLog.error('Get an API key from https://platform.claude.com/');
		return;
	}

	// -- resolve model shorthand --
	const resolveModel = (shorthand) => {
		const substitutions = getConfig('_substitutions') || {};
		const modelMap = substitutions.modelMap || {};
		return modelMap[shorthand] || shorthand;
	};

	// -- build config from .ini + CLI args --
	const buildConfig = () => {
		const prompt = commandLineParameters.fileList.join(' ');
		const cfg = localConfig;

		return {
			prompt,
			perspectives: parseInt(cfg.perspectives, 10) || 3,
			agentModel: resolveModel(cfg.agentModel || 'sonnet'),
			expandModel: resolveModel(cfg.expandModel || 'opus'),
			budget: parseFloat(cfg.budget) || 1.00,
			maxTurns: parseInt(cfg.maxTurns, 10) || 10,
			tools: (cfg.tools || 'WebSearch,WebFetch,Read,Glob,Grep').toLowerCase() === 'none'
				? []
				: (cfg.tools || 'WebSearch,WebFetch,Read,Glob,Grep').split(',').map(t => t.trim()),
			verbose: !!commandLineParameters.switches.verbose,
			json: !!commandLineParameters.switches.json,
			dryRun: !!commandLineParameters.switches.dryRun,
			driver: (cfg.driver || 'direct').toLowerCase(),
			anthropicApiKey: cfg.anthropicApiKey,
			expansionSystemPrompt: (cfg.expansionSystemPrompt || '').replace(/\\n/g, '\n'),
			researcherSystemPrompt: (cfg.researcherSystemPrompt || '').replace(/\\n/g, '\n'),
		};
	};

	const evalConfig = buildConfig();

	if (evalConfig.verbose) {
		xLog.status(`\n--- Config ---`);
		xLog.status(`  Expand model:  ${evalConfig.expandModel}`);
		xLog.status(`  Agent model:   ${evalConfig.agentModel}`);
		xLog.status(`  Perspectives:  ${evalConfig.perspectives}`);
		xLog.status(`  Max turns:     ${evalConfig.maxTurns}`);
		xLog.status(`  Budget/agent:  $${evalConfig.budget}`);
		xLog.status(`  Tools:         ${evalConfig.tools.length > 0 ? evalConfig.tools.join(', ') : '(none)'}`);
		xLog.status(`  Driver:        ${evalConfig.driver}`);
		xLog.status(`  Dry run:       ${evalConfig.dryRun}`);
		xLog.status(`--- End Config ---\n`);
	}

	// -- usage validation --
	if (!evalConfig.prompt) {
		xLog.error('Usage: askClaude [options] "your prompt here"');
		xLog.error('Use -help for full options list');
		return;
	}

	// -- pipeline setup --
	const { pipeRunner, taskListPlus } = new (require('qtools-asynchronous-pipe-plus'))();
	const { collect } = require('./stages/collect');

	const taskList = new taskListPlus();

	// Stage 1: Expand
	taskList.push((args, next) => {
		const expandModule = args.config.driver === 'sdk' ? './stages/expand.mjs' : './stages/expand-direct.mjs';
		if (args.config.verbose) {
			xLog.status(`[Stage 1] Loading ${expandModule}...`);
		}
		import(expandModule).then(({ expand }) => {
			if (args.config.verbose) {
				xLog.status(`[Stage 1] expand.mjs loaded. Calling Opus for expansion into ${args.config.perspectives} perspectives...`);
			}
			const stageStart = Date.now();
			expand({ originalPrompt: args.originalPrompt, config: args.config })
				.then(({ instructions, expandCost }) => {
					if (args.config.verbose) {
						const elapsed = ((Date.now() - stageStart) / 1000).toFixed(1);
						xLog.status(`[Stage 1] Complete in ${elapsed}s. Got ${instructions.length} perspectives:`);
						instructions.forEach(instr => {
							xLog.status(`  ${instr.id}. [${instr.perspective}]`);
						});
						xLog.status(`[Stage 1] Cost: $${expandCost.usd.toFixed(4)}`);
					}
					next('', { ...args, instructions, expandCost });
				})
				.catch(err => next(err.message, args));
		});
	});

	// Stage 2: Fan-out (skip if dry-run)
	taskList.push((args, next) => {
		if (args.config.dryRun) {
			if (args.config.verbose) {
				xLog.status(`[Stage 2] Skipped (dry-run mode)`);
			}
			next('', args);
			return;
		}
		const fanOutModule = args.config.driver === 'sdk' ? './stages/fanOut.mjs' : './stages/fanOut-direct.mjs';
		if (args.config.verbose) {
			xLog.status(`[Stage 2] Loading ${fanOutModule}...`);
		}
		import(fanOutModule).then(({ fanOut }) => {
			if (args.config.verbose) {
				xLog.status(`[Stage 2] fanOut.mjs loaded. Launching ${args.instructions.length} research agents in parallel...`);
			}
			const stageStart = Date.now();
			fanOut({ instructions: args.instructions, config: args.config })
				.then(({ results }) => {
					if (args.config.verbose) {
						const elapsed = ((Date.now() - stageStart) / 1000).toFixed(1);
						xLog.status(`[Stage 2] All agents returned in ${elapsed}s`);
						results.forEach(r => {
							if (r.findings.startsWith('[AGENT FAILED') || r.findings.startsWith('[AGENT ERROR')) {
								xLog.error(`  Agent ${r.id} (${r.perspective}): FAILED`);
							} else {
								xLog.status(`  Agent ${r.id} (${r.perspective}): done ($${r.cost.usd.toFixed(4)}, ${r.turns} turns)`);
							}
						});
					}
					next('', { ...args, results });
				})
				.catch(err => next(err.message, args));
		});
	});

	// Stage 3: Collect & format
	taskList.push((args, next) => {
		const elapsedSeconds = (Date.now() - args.startTime) / 1000;
		if (args.config.verbose) {
			xLog.status(`[Stage 3] Collecting results and formatting output...`);
		}

		if (args.config.dryRun) {
			const report = JSON.stringify(
				{ instructions: args.instructions, expandCost: args.expandCost },
				null, 2
			);
			next('', { ...args, report, elapsedSeconds });
			return;
		}
		const { report, reportJson } = collect({
			originalPrompt: args.originalPrompt,
			instructions: args.instructions,
			results: args.results,
			expandCost: args.expandCost,
			elapsedSeconds,
			config: args.config,
		});
		next('', { ...args, report, reportJson, elapsedSeconds });
	});

	// Run pipeline
	const initialData = {
		originalPrompt: evalConfig.prompt,
		config: evalConfig,
		startTime: Date.now(),
	};

	pipeRunner(taskList.getList(), initialData, (err, result) => {
		if (err) {
			xLog.error(`Pipeline error: ${err}`);
			process.exit(1);
		}

		if (result.config.verbose) {
			xLog.status(`Elapsed: ${result.elapsedSeconds.toFixed(1)}s`);
		}

		if (result.report) {
			xLog.result(result.report);
		}
	});
};

//END OF moduleFunction() ============================================================

// prettier-ignore
{
	const findProjectRoot = ({ rootFolderName = 'system', closest = true } = {}) =>
		__dirname.replace(new RegExp(`^(.*${closest ? '' : '?'}\\/${rootFolderName}).*$`), "$1");
	const projectRoot = findProjectRoot();

	const commandLineParameters = commandLineParser.getParameters({ noFunctions: true });

	// Map CLI flag names to .ini substitution tag names
	const cliToIniMap = { model: 'agentModel' };

	// Build userSubstitutions from CLI --key=value args to override .ini defaults
	const userSubstitutions = {};
	if (commandLineParameters.values) {
		Object.keys(commandLineParameters.values).forEach(key => {
			const val = commandLineParameters.values[key];
			const iniKey = cliToIniMap[key] || key;
			userSubstitutions[iniKey] = Array.isArray(val) ? val[0] : val;
		});
	}

	const configName = os.hostname() == 'qMini.local' ? 'instanceSpecific/qbook' : '';
	const configDirPath = `${projectRoot}/configs/${configName}/`;
	const config = configFileProcessor.getConfig(`${moduleName}.ini`, configDirPath, { resolve: false, userSubstitutions });

	const getConfig = (name) => {
		if (name == 'allConfigs') { return config; }
		return config[name];
	};

	process.global = {};
	process.global.xLog = { status: console.error, error: console.error, result: console.log };
	process.global.getConfig = getConfig;
	process.global.commandLineParameters = commandLineParameters;
	process.global.projectRoot = projectRoot;
	process.global.rawConfig = config;
}

module.exports = moduleFunction({ moduleName })({});
