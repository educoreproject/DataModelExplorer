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
  through a separate Claude instance in parallel, synthesizes findings
  into cross-cutting analysis, and collects results into a unified report.
  Two drivers available: "direct" calls the Anthropic API with no
  overhead; "sdk" uses the Agent SDK with tool access.

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
  -noSynthesize          Skip cross-perspective synthesis stage
  -noSave                Do not save this run as a session
  -restoreSwitches       On --resumeSession, restore saved CLI args as defaults
  -help                  Show this help message

  SDK driver only (ignored by direct driver):
  --budget=USD           Max budget per agent in USD (default: 1.00)
  --maxTurns=N           Max conversation turns per agent (default: 10)
  --tools=LIST           Comma-separated tools for agents (use "none" to disable)

Session management:
  --resumeSession=NAME   Continue a previous session with a follow-up prompt
  --sessionName=NAME     Name this session (default: auto-generated)
  -interrogateSession    Ask a single question about prior research (requires --resumeSession)
  -listSessions          List all saved sessions with date, size, prompt preview
  --viewSession=NAME     Display full session content
  --deleteSession=NAME   Delete a saved session
  --renameSession=NAME   Rename a session (use with --sessionName=NEW_NAME)

Examples:
  askClaude "What are the implications of quantum computing for cryptography?"
  askClaude --perspectives=5 --model=opus "Evaluate microservices vs monolith"
  askClaude -dryRun "How should we restructure authentication?"
  askClaude --driver=sdk --tools=WebSearch "Research current AI regulations"
  askClaude --resumeSession=amber_ridge "How does this affect developing nations?"
  askClaude --resumeSession=amber_ridge -interrogateSession "Expand on the economic impacts"
  askClaude -listSessions
  askClaude --viewSession=amber_ridge
		`);
		return;
	}

	// -- session manager --
	const sessionManager = require('./lib/sessionManager');

	// -- session CLI commands (early exit, no pipeline needed) --

	// -listSessions
	if (commandLineParameters.switches.listSessions) {
		const sessions = sessionManager.listSessions();
		if (sessions.length === 0) {
			xLog.result('No saved sessions found.');
		} else {
			const header = `${'NAME'.padEnd(25)} ${'UPDATED'.padEnd(22)} ${'TURNS'.padEnd(6)} ${'SIZE'.padEnd(10)} PROMPT`;
			xLog.result(header);
			xLog.result('-'.repeat(header.length + 20));
			sessions.forEach(s => {
				const sizeKb = (s.sizeBytes / 1024).toFixed(1) + ' KB';
				const date = s.updatedAt.slice(0, 19).replace('T', ' ');
				xLog.result(`${s.name.padEnd(25)} ${date.padEnd(22)} ${String(s.turnCount).padEnd(6)} ${sizeKb.padEnd(10)} ${s.promptPreview}`);
			});
		}
		return;
	}

	// --viewSession=NAME
	const viewSessionName = (commandLineParameters.values.viewSession || [])[0];
	if (viewSessionName) {
		try {
			const session = sessionManager.loadSession(viewSessionName);
			xLog.result(`\n=== Session: ${session.sessionName} ===`);
			xLog.result(`Created: ${session.createdAt}`);
			xLog.result(`Updated: ${session.updatedAt}`);
			xLog.result(`Turns: ${(session.turns || []).length}`);
			if (session.totalCost) {
				xLog.result(`Total cost: $${(session.totalCost.usd || 0).toFixed(4)}`);
			}
			xLog.result('');
			(session.turns || []).forEach(turn => {
				const turnLabel = turn.turnType === 'interrogation' ? 'Interrogation' : 'Turn';
				xLog.result(`--- ${turnLabel} ${turn.turnNumber} (${turn.timestamp || 'N/A'}) ---`);
				xLog.result(`Prompt: ${turn.prompt}`);
				xLog.result('');
				if (turn.turnType === 'interrogation') {
					const resp = turn.response || '';
					xLog.result(`  RESPONSE: ${resp.slice(0, 400)}${resp.length > 400 ? '...' : ''}`);
					xLog.result('');
				} else {
					if (turn.perspectives) {
						turn.perspectives.forEach(p => {
							xLog.result(`  [${p.perspective}]: ${(p.findings || '').slice(0, 200)}${(p.findings || '').length > 200 ? '...' : ''}`);
						});
						xLog.result('');
					}
					if (turn.synthesis && turn.synthesis.text) {
						xLog.result(`  SYNTHESIS: ${turn.synthesis.text.slice(0, 300)}${turn.synthesis.text.length > 300 ? '...' : ''}`);
						xLog.result('');
					}
				}
				if (turn.totalCost) {
					xLog.result(`  Cost: $${(turn.totalCost.usd || 0).toFixed(4)}`);
				}
				xLog.result('');
			});
		} catch (e) {
			xLog.error(e.message);
		}
		return;
	}

	// --deleteSession=NAME
	const deleteSessionName = (commandLineParameters.values.deleteSession || [])[0];
	if (deleteSessionName) {
		try {
			sessionManager.deleteSession(deleteSessionName);
			xLog.result(`Session deleted: ${deleteSessionName}`);
		} catch (e) {
			xLog.error(e.message);
		}
		return;
	}

	// --renameSession=OLD --sessionName=NEW
	const renameSessionOld = (commandLineParameters.values.renameSession || [])[0];
	if (renameSessionOld) {
		const renameSessionNew = (commandLineParameters.values.sessionName || [])[0];
		if (!renameSessionNew) {
			xLog.error('--renameSession requires --sessionName=NEW_NAME');
			xLog.error('Usage: askClaude --renameSession=OLD_NAME --sessionName=NEW_NAME');
			return;
		}
		try {
			sessionManager.renameSession(renameSessionOld, renameSessionNew);
			xLog.result(`Session renamed: ${renameSessionOld} -> ${renameSessionNew}`);
		} catch (e) {
			xLog.error(e.message);
		}
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
			noSynthesize: !!commandLineParameters.switches.noSynthesize,
			noSave: !!commandLineParameters.switches.noSave,
			restoreSwitches: !!commandLineParameters.switches.restoreSwitches,
			interrogateSession: !!commandLineParameters.switches.interrogateSession,
			expansionSystemPrompt: (cfg.expansionSystemPrompt || '').replace(/\\n/g, '\n'),
			researcherSystemPrompt: (cfg.researcherSystemPrompt || '').replace(/\\n/g, '\n'),
			synthesisSystemPrompt: (cfg.synthesisSystemPrompt || '').replace(/\\n/g, '\n'),
			interrogationSystemPrompt: (cfg.interrogationSystemPrompt || '').replace(/\\n/g, '\n'),
		};
	};

	const evalConfig = buildConfig();

	// -- session resume logic (Phase 6) --
	let resumeSession = null;
	let sessionContext = null;
	const resumeSessionName = (commandLineParameters.values.resumeSession || [])[0];
	if (resumeSessionName) {
		try {
			resumeSession = sessionManager.loadSession(resumeSessionName);
		} catch (e) {
			xLog.error(e.message);
			return;
		}
		// Validate that a new prompt exists
		if (!evalConfig.prompt) {
			xLog.error('--resumeSession requires a new prompt.');
			xLog.error('Usage: askClaude --resumeSession=NAME "your follow-up question"');
			return;
		}
		// Restore saved CLI args as defaults when -restoreSwitches is set
		if (evalConfig.restoreSwitches && resumeSession.commandLineParameters) {
			const savedValues = resumeSession.commandLineParameters.values || {};
			const currentValues = commandLineParameters.values || {};
			const restoredKeys = [];

			// Map of saved value keys to evalConfig properties and their parsers
			const restoreMap = {
				perspectives: { prop: 'perspectives', parse: (v) => parseInt(v, 10) },
				agentModel: { prop: 'agentModel', parse: (v) => resolveModel(v) },
				model: { prop: 'agentModel', parse: (v) => resolveModel(v) },
				expandModel: { prop: 'expandModel', parse: (v) => resolveModel(v) },
				budget: { prop: 'budget', parse: (v) => parseFloat(v) },
				maxTurns: { prop: 'maxTurns', parse: (v) => parseInt(v, 10) },
				driver: { prop: 'driver', parse: (v) => String(v).toLowerCase() },
			};

			Object.keys(savedValues).forEach(key => {
				// Skip keys the current CLI explicitly set
				if (currentValues[key]) return;
				// Skip keys we don't know how to restore
				const mapping = restoreMap[key];
				if (!mapping) return;

				const savedVal = Array.isArray(savedValues[key]) ? savedValues[key][0] : savedValues[key];
				evalConfig[mapping.prop] = mapping.parse(savedVal);
				restoredKeys.push(`${key}=${savedVal}`);
			});

			if (evalConfig.verbose && restoredKeys.length > 0) {
				xLog.status(`[Resume] Restored from saved session: ${restoredKeys.join(', ')}`);
			}
		}
		// Build session context from prior turns
		sessionContext = sessionManager.buildSessionContext(resumeSession);
		if (evalConfig.verbose) {
			xLog.status(`[Resume] Loaded session "${resumeSessionName}" with ${resumeSession.turns.length} prior turn(s)`);
			xLog.status(`[Resume] Session context: ${sessionContext.length} chars`);
		}
	}

	// -- interrogate session mode (single-call Q&A, no pipeline) --
	if (evalConfig.interrogateSession) {
		if (!resumeSession || !sessionContext) {
			xLog.error('-interrogateSession requires --resumeSession=NAME');
			xLog.error('Usage: askClaude --resumeSession=NAME -interrogateSession "your question"');
			return;
		}
		if (evalConfig.verbose) {
			xLog.status(`[Interrogate] Model: ${evalConfig.agentModel}`);
			xLog.status(`[Interrogate] Session: ${resumeSessionName}, ${resumeSession.turns.length} prior turn(s)`);
			xLog.status(`[Interrogate] Question: ${evalConfig.prompt}`);
		}

		const startTime = Date.now();
		import('./stages/interrogate-direct.mjs').then(({ interrogate }) => {
			interrogate({ question: evalConfig.prompt, sessionContext, config: evalConfig })
				.then(({ responseText, cost }) => {
					const elapsedSeconds = (Date.now() - startTime) / 1000;

					// Output the response
					xLog.result(`\n================================================================`);
					xLog.result(`INTERROGATION — ${resumeSessionName}`);
					xLog.result(`================================================================`);
					xLog.result(`\nQUESTION: ${evalConfig.prompt}\n`);
					xLog.result(responseText);
					xLog.result(`\n================================================================`);
					xLog.result(`Cost: $${cost.usd.toFixed(4)}  (${cost.inputTokens} input / ${cost.outputTokens} output)  Model: ${evalConfig.agentModel}  Elapsed: ${elapsedSeconds.toFixed(1)}s`);
					xLog.result(`================================================================`);

					// Save as a turn in the session
					if (!evalConfig.noSave) {
						try {
							const thisTurn = {
								turnNumber: resumeSession.turns.length + 1,
								turnType: 'interrogation',
								prompt: evalConfig.prompt,
								response: responseText,
								totalCost: cost,
								elapsedSeconds,
								timestamp: new Date().toISOString(),
							};
							sessionManager.appendTurnToSession(resumeSession, thisTurn);
							sessionManager.saveSession(resumeSession);
							xLog.status(`Session saved: ${resumeSession.sessionName}`);
						} catch (saveErr) {
							xLog.error(`Warning: Failed to save session: ${saveErr.message}`);
						}
					}
				})
				.catch(err => {
					xLog.error(`Interrogation error: ${err.message}`);
					process.exit(1);
				});
		});
		return;
	}

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
		xLog.status(`  No synthesize: ${evalConfig.noSynthesize}`);
		xLog.status(`  No save:       ${evalConfig.noSave}`);
		xLog.status(`  Restore args:  ${evalConfig.restoreSwitches}`);
		if (resumeSessionName) {
			xLog.status(`  Resume:        ${resumeSessionName}`);
		}
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
			expand({ originalPrompt: args.originalPrompt, config: args.config, sessionContext: args.sessionContext })
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

	// Stage 3: Synthesize (skip if dry-run or -noSynthesize)
	taskList.push((args, next) => {
		if (args.config.dryRun) {
			if (args.config.verbose) {
				xLog.status(`[Stage 3] Skipped (dry-run mode)`);
			}
			next('', args);
			return;
		}
		if (args.config.noSynthesize) {
			if (args.config.verbose) {
				xLog.status(`[Stage 3] Skipped (-noSynthesize)`);
			}
			next('', args);
			return;
		}
		const synthesizeModule = args.config.driver === 'sdk' ? './stages/synthesize.mjs' : './stages/synthesize-direct.mjs';
		if (args.config.verbose) {
			xLog.status(`[Stage 3] Loading ${synthesizeModule}...`);
		}
		import(synthesizeModule).then(({ synthesize }) => {
			if (args.config.verbose) {
				xLog.status(`[Stage 3] Calling ${args.config.expandModel} for cross-perspective synthesis...`);
			}
			const stageStart = Date.now();
			synthesize({
				originalPrompt: args.originalPrompt,
				instructions: args.instructions,
				results: args.results,
				config: args.config,
			})
				.then(({ synthesis, synthesisCost }) => {
					if (args.config.verbose) {
						const elapsed = ((Date.now() - stageStart) / 1000).toFixed(1);
						xLog.status(`[Stage 3] Complete in ${elapsed}s. Synthesis: ${synthesis.length} chars`);
						xLog.status(`[Stage 3] Cost: $${synthesisCost.usd.toFixed(4)}`);
					}
					next('', { ...args, synthesis, synthesisCost });
				})
				.catch(err => next(err.message, args));
		});
	});

	// Stage 4: Collect & format
	taskList.push((args, next) => {
		const elapsedSeconds = (Date.now() - args.startTime) / 1000;
		if (args.config.verbose) {
			xLog.status(`[Stage 4] Collecting results and formatting output...`);
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
			synthesis: args.synthesis || null,
			synthesisCost: args.synthesisCost || null,
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
		sessionContext: sessionContext || null,
		session: resumeSession || null,
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

		// -- Session save --
		if (!result.config.noSave) {
			try {
				const elapsedSeconds = result.elapsedSeconds || ((Date.now() - result.startTime) / 1000);
				const turnNumber = result.session ? result.session.turns.length + 1 : 1;

				const thisTurn = sessionManager.buildTurnFromResults({
					originalPrompt: result.originalPrompt,
					instructions: result.instructions,
					results: result.results,
					expandCost: result.expandCost,
					synthesis: result.synthesis,
					synthesisCost: result.synthesisCost,
					elapsedSeconds,
					turnNumber,
				});

				let session;
				if (result.session) {
					session = sessionManager.appendTurnToSession(result.session, thisTurn);
				} else {
					const sessionName = (commandLineParameters.values.sessionName || [])[0] || sessionManager.generateSessionName();
					session = sessionManager.createNewSession({
						sessionName,
						commandLineParameters,
						config: result.config,
						turn: thisTurn,
					});
				}

				sessionManager.saveSession(session);
				xLog.status(`Session saved: ${session.sessionName}`);
			} catch (saveErr) {
				xLog.error(`Warning: Failed to save session: ${saveErr.message}`);
			}
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
