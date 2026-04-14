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
askMilo -- AI Chorus of Experts Pipeline Processor

  Default: single prompt, single call, single response.
  Add --perspectives=N for multi-perspective chorus research.
  Add -summarize for cross-perspective synthesis.
  Any prompt from [prompts] section can serve any role.

Usage:
  askMilo [options] "your prompt here"
  askMilo [options] /path/to/prompt-file.txt
  echo '{ JSON }' | askMilo
  askMilo <<EOF
  { JSON }
  EOF

Pipeline control:
  --perspectives=N       Number of chorus perspectives. 0 = single-call (default: 0)
  --promptFile=PATH      Use file contents as system prompt (overrides --firstPrompt)
  --firstPrompt=NAME     Select prompt from [prompts] section of .ini
  -summarize             Add synthesis stage after chorus (requires perspectives>0)
  -serialFanOut          Run chorus agents sequentially instead of in parallel
                         (avoids 429 rate-limit errors on concurrent connections)
  -interrogate           Set prompt to interrogator + prepend analysis framing

Model & driver:
  --driver=DRIVER        API driver: direct|sdk (default: direct)
  --model=MODEL          Model for agents/single-call: opus|sonnet|haiku (default: sonnet)
  --expandModel=MODEL    Model for expansion stage: opus|sonnet|haiku (default: opus)

  SDK driver only (ignored by direct driver):
  --budget=USD           Max budget per agent in USD (default: 1.00)
  --maxTurns=N           Max conversation turns per agent (default: 10)
  --aiTools=LIST         Colon-separated provider paths/names to add for this run

Output control:
  -stream                Stream response text to stdout as it arrives
  -verbose               Show detailed progress and cost info per stage
  -json                  Output raw JSON instead of formatted text report
  -dryRun                Run with mock responses, no API calls (alias for -mockApi)
  -mockApi               Same as -dryRun: return canned responses for testing
  -noSave                Do not save this run as a session
  -restoreSwitches       On --resumeSession, restore saved CLI args as defaults
  -help                  Show this help message

Configuration:
  --configPath=PATH      Override config directory (default: auto-discovered via __dirname).
                         When set, askMilo reads its .ini from this directory instead of
                         the project root derived from the script location. Used by
                         ws-graphinator to ensure the server's config is used regardless
                         of symlink resolution.

Session management:
  --resumeSession=NAME   Continue a previous session with a follow-up prompt
                         (auto-creates session if NAME doesn't exist)
  --sessionName=NAME     Name this session (default: auto-generated)
  -listSessions          List all saved sessions with date, size, prompt preview
  --viewSession=NAME     Display full session content
  --deleteSession=NAME   Delete a saved session
  --renameSession=NAME   Rename a session (use with --sessionName=NEW_NAME)

JSON input (programmatic):
  Accepts a JSON object via stdin or as the first argument, replacing
  CLI flag parsing entirely. The JSON must have the structure:
    { "switches": {...}, "values": {...}, "fileList": [...] }

  switches   Boolean flags (e.g. mockApi, noSave, verbose, summarize, serialFanOut)
  values     Keyed arrays    (e.g. model: ["haiku"], perspectives: ["3"], promptFile: ["/path/to/prompt.txt"])
  fileList   Positional args (the prompt goes here as the first element)

Examples:
  askMilo "What is quantum computing?"
  askMilo --perspectives=3 "Evaluate microservices vs monolith"
  askMilo --perspectives=3 -summarize "Compare ML frameworks"
  askMilo --firstPrompt=chorusResearcher "Analyze this transcript"
  askMilo --resumeSession=amber_ridge "How does this affect developing nations?"
  askMilo --resumeSession=amber_ridge -interrogate "Expand on the economic impacts"
  askMilo -stream "Explain quantum entanglement"
  askMilo --aiTools=/path/to/my-tool "Use my custom tool" -stream
  askMilo -listSessions
  askMilo --viewSession=amber_ridge

  JSON via stdin (for piping from scripts or AI agents):
  echo '{"switches":{"noSave":true},"values":{},"fileList":["What is 2+2?"]}' | askMilo

  JSON as argument:
  askMilo '{"switches":{"verbose":true},"values":{"model":["haiku"]},"fileList":["Summarize this"]}'

  JSON via heredoc (readable multi-line):
  askMilo <<EOF
  {
    "switches": { "noSave": true, "verbose": true },
    "values": { "model": ["haiku"], "perspectives": ["3"] },
    "fileList": ["Compare React, Vue, and Svelte"]
  }
  EOF
		`);
		return;
	}

	// -- session manager --
	const sessionManager = require('./lib/sessionManager');

	// -- timing instrumentation --
	const { createTimingLog } = require('./lib/timingLog');

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
				const turnLabel = turn.turnType === 'singleCall' ? 'SingleCall'
					: turn.turnType === 'interrogation' ? 'Interrogation'
					: 'Turn';
				xLog.result(`--- ${turnLabel} ${turn.turnNumber} (${turn.timestamp || 'N/A'}) ---`);
				xLog.result(`Prompt: ${turn.prompt}`);
				xLog.result('');
				if (turn.turnType === 'singleCall') {
					const promptLabel = turn.promptName ? `[${turn.promptName}] ` : '';
					const resp = turn.response || '';
					xLog.result(`  ${promptLabel}RESPONSE: ${resp.slice(0, 400)}${resp.length > 400 ? '...' : ''}`);
					xLog.result('');
				} else if (turn.turnType === 'interrogation') {
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
			xLog.error('Usage: askMilo --renameSession=OLD_NAME --sessionName=NEW_NAME');
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

	// -- auto-detect file path as prompt --
	// If the positional arg is a single token that exists as a file, read its contents as the prompt.
	const resolvePromptFromFileList = (fileList) => {
		const raw = fileList.join(' ');
		if (fileList.length === 1 && !raw.includes('\n') && fs.existsSync(raw)) {
			xLog.status(`[askMilo] Reading prompt from file: ${raw}`);
			return fs.readFileSync(raw, 'utf-8');
		}
		return raw;
	};

	// -- build config from .ini + CLI args --
	const buildConfig = () => {
		let prompt = resolvePromptFromFileList(commandLineParameters.fileList);
		const cfg = localConfig;
		const parsedPerspectives = parseInt(cfg.perspectives, 10);
		const perspectives = isNaN(parsedPerspectives) ? 0 : parsedPerspectives;
		const interrogate = !!commandLineParameters.switches.interrogate;

		// Read [prompts] section
		const prompts = getConfig('prompts') || {};

		// Resolve a prompt name to its text, applying template variables
		// and injecting injectablePromptComponents unless the prompt is omitted.
		const injectableComponents = getConfig('injectablePromptComponents') || {};

		const resolvePrompt = (name, templateVars) => {
			const text = prompts[name];
			if (!text) throw new Error(`Prompt "${name}" not found in [prompts]. Available: ${Object.keys(prompts).join(', ')}`);
			let resolved = text.replace(/\\n/g, '\n');
			if (templateVars) {
				Object.keys(templateVars).forEach(key => {
					resolved = resolved.replace(new RegExp(`\\{${key}\\}`, 'g'), templateVars[key]);
				});
			}

			// Append injectable prompt components (unless this prompt is in omitFromList)
			Object.keys(injectableComponents).forEach(idx => {
				const component = injectableComponents[idx];
				if (!component || typeof component !== 'object' || !component.text) return;
				const omitValues = Object.values(component.omitFromList || {});
				if (omitValues.includes(name)) return;
				resolved += component.text.replace(/\\n/g, '\n');
			});

// console.log(`\n=-=============   resolved  ========================= [askMilo.js.]\n`);
// 
// 
// 
// require('fs').writeFileSync('/tmp/tqTest.txt', resolved);
// 
// console.log(`\n=-=============   resolved 2 ========================= [askMilo.js.]\n`);
// 
// console.log(' Debug Exit [askMilo.js.]', {depth:4, colors:true}); process.exit(); //tqDebug


			return resolved;
		};

		const templateVars = { N: String(perspectives) };

		// Resolve firstPromptName based on mode and flags
		let firstPromptName = (commandLineParameters.values.firstPrompt || [])[0];

		if (interrogate && !firstPromptName) {
			firstPromptName = 'interrogator';
		}
		if (!firstPromptName) {
			firstPromptName = perspectives > 0
				? (cfg.chorusExpanderPromptName || 'chorusExpander')
				: (cfg.singleCallPromptName || 'default');
		}

		// -interrogate prepends framing to the user's prompt
		if (interrogate) {
			prompt = `Analyze the prior research findings in context of the following question: ${prompt}`;
		}

		// --promptFile: read file contents as the user prompt (message content).
		// The system prompt (firstPromptText) is still resolved from the mode-appropriate
		// prompt name (chorusExpander for chorus, default for single-call, etc.).
		const promptFilePath = (commandLineParameters.values.promptFile || [])[0];
		if (promptFilePath) {
			if (!fs.existsSync(promptFilePath)) {
				xLog.error(`promptFile not found: ${promptFilePath}`);
				return null;
			}
			prompt = fs.readFileSync(promptFilePath, 'utf-8');
		}
		const firstPromptText = resolvePrompt(firstPromptName, templateVars);

		return {
			prompt,
			perspectives,
			agentModel: resolveModel(cfg.agentModel || 'sonnet'),
			expandModel: resolveModel(cfg.expandModel || 'opus'),
			budget: parseFloat(cfg.budget) || 1.00,
			maxTurns: parseInt(cfg.maxTurns, 10) || 10,
			aiToolsAdditional: (() => {
				// --aiTools is ADDITIVE: colon-separated list of extra provider paths/names
				const cliAiTools = (commandLineParameters.values.aiTools || [])[0] || '';
				return cliAiTools ? cliAiTools.split(':').map(t => t.trim()).filter(Boolean) : [];
			})(),
			aiToolsSuppressed: (() => {
				// Suppression list from config (comma-separated)
				const rawSuppressed = (cfg.aiToolsLib && cfg.aiToolsLib.suppressedTools) || '';
				const configSuppressed = rawSuppressed ? rawSuppressed.split(',').map(t => t.trim()).filter(Boolean) : [];
				// CLI/JSON suppression (comma-separated, from ws-graphinator UI)
				const cliSuppressed = (commandLineParameters.values.aiToolsSuppressed || [])[0] || '';
				const cliList = cliSuppressed ? cliSuppressed.split(',').map(t => t.trim()).filter(Boolean) : [];
				return [...configSuppressed, ...cliList];
			})(),
			verbose: !!commandLineParameters.switches.verbose,
			stream: !!commandLineParameters.switches.stream,
			json: !!commandLineParameters.switches.json,
			dryRun: !!commandLineParameters.switches.dryRun,
			driver: (cfg.driver || 'direct').toLowerCase(),
			anthropicApiKey: cfg.anthropicApiKey,
			summarize: !!commandLineParameters.switches.summarize,
			interrogate,
			noSave: !!commandLineParameters.switches.noSave,
			restoreSwitches: !!commandLineParameters.switches.restoreSwitches,
			timingLog: cfg.timingLog !== 'false' && cfg.timingLog !== false,
			mockApi: !!commandLineParameters.switches.mockApi || !!commandLineParameters.switches.dryRun,
			serialFanOut: !!commandLineParameters.switches.serialFanOut,
			firstPromptName,
			firstPromptText,
			agentPromptName: cfg.agentPromptName || 'chorusResearcher',
			agentPromptText: resolvePrompt(cfg.agentPromptName || 'chorusResearcher', {}),
			summarizerPromptName: cfg.summarizerPromptName || 'chorusSynthesizer',
			summarizerPromptText: resolvePrompt(cfg.summarizerPromptName || 'chorusSynthesizer', templateVars),
			aiToolsBasePath: (cfg.aiToolsLib && cfg.aiToolsLib.basePath) || '',
			aiToolsEnabled: (() => {
				const raw = (cfg.aiToolsLib && cfg.aiToolsLib.enabled) || '';
				return raw ? raw.split(':').map(t => t.trim()).filter(Boolean) : [];
			})(),
			toolsDefaultTimeout: parseInt((cfg.aiToolsLib && cfg.aiToolsLib.toolsDefaultTimeout) || 30, 10) || 30,
			confluenceBaseUrl: cfg.confluenceBaseUrl,
			confluenceEmail: cfg.confluenceEmail,
			confluenceApiToken: cfg.confluenceApiToken,
			confluenceDefaultSpace: cfg.confluenceDefaultSpace || 'ARCHITECTU',
			resumeAddendumText: resolvePrompt('resumeAddendum', {}),
			jsonEnforcementText: resolvePrompt('jsonEnforcement', {}),
		};
	};

	const evalConfig = buildConfig();
	if (!evalConfig) return; // promptFile not found or other early-exit

	// -- Provider registry (config-driven tool loading) --
	// Must be created before getDefaults so the UI can discover available tools
	const { createProviderRegistry } = require('./lib/providerRegistry');
	const mergedEnabled = [...evalConfig.aiToolsEnabled, ...evalConfig.aiToolsAdditional];
	const registry = createProviderRegistry({
		basePath: evalConfig.aiToolsBasePath,
		enabled: mergedEnabled,
		suppressedTools: evalConfig.aiToolsSuppressed,
	});

	// -- -getDefaults: output config defaults as JSON and exit --
	if (commandLineParameters.switches.getDefaults) {
		const builtinTools = ['WebSearch', 'WebFetch', 'Read', 'Glob', 'Grep'];
		const suppressedSet = new Set((evalConfig.aiToolsSuppressed || []).map(t => t.toLowerCase()));
		const allTools = [...builtinTools, ...registry.getRegisteredNames()]
			.filter(t => !suppressedSet.has(t.toLowerCase()));

		// Build user-facing prompt list from [prompts] section.
		// Internal prompts (chorus pipeline, resume, json enforcement) are excluded.
		const internalPrompts = new Set([
			'chorusExpander', 'chorusResearcher', 'chorusSynthesizer',
			'resumeAddendum', 'jsonEnforcement',
		]);
		const prompts = getConfig('prompts') || {};
		const availablePrompts = Object.keys(prompts)
			.filter(name => !internalPrompts.has(name))
			.map(name => ({ title: name.charAt(0).toUpperCase() + name.slice(1), value: name }));

		xLog.result(JSON.stringify({
			aiToolsSuppressed: evalConfig.aiToolsSuppressed,
			availableTools: allTools,
			availablePrompts,
		}));
		return;
	}

	// -- -summarize warning --
	if (evalConfig.summarize && evalConfig.perspectives === 0) {
		xLog.error('Warning: -summarize ignored (no perspectives to synthesize)');
	}

	// -- session resume logic (Phase 6) --
	let resumeSession = null;
	let sessionContext = null;
	const resumeSessionName = (commandLineParameters.values.resumeSession || [])[0];
	if (resumeSessionName) {
		try {
			resumeSession = sessionManager.loadSession(resumeSessionName);
		} catch (e) {
			// Session not found — start a new one with that name
			xLog.error(`Session "${resumeSessionName}" not found. Starting new session with that name.`);
			commandLineParameters.values.sessionName = [resumeSessionName];
		}
		// Validate that a new prompt exists
		if (!evalConfig.prompt) {
			xLog.error('--resumeSession requires a new prompt.');
			xLog.error('Usage: askMilo --resumeSession=NAME "your follow-up question"');
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
				firstPrompt: { prop: 'firstPromptName', parse: (v) => String(v) },
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

			// If firstPromptName was restored, re-resolve firstPromptText to match
			if (restoredKeys.some(k => k.startsWith('firstPrompt='))) {
				const prompts = getConfig('prompts') || {};
				const text = prompts[evalConfig.firstPromptName];
				if (text) {
					let resolved = text.replace(/\\n/g, '\n');
					const templateVars = { N: String(evalConfig.perspectives) };
					Object.keys(templateVars).forEach(key => {
						resolved = resolved.replace(new RegExp(`\\{${key}\\}`, 'g'), templateVars[key]);
					});
					evalConfig.firstPromptText = resolved;
				}
			}
		}
		// Build session context from prior turns (only if session was found)
		if (resumeSession) {
			sessionContext = sessionManager.buildSessionContext(resumeSession);
			if (evalConfig.verbose) {
				xLog.status(`[Resume] Loaded session "${resumeSessionName}" with ${resumeSession.turns.length} prior turn(s)`);
				xLog.status(`[Resume] Session context: ${sessionContext.length} chars`);
			}
		}
	}

	const hasToolProviders = registry.hasProviders();

	// Legacy: keep confluence check for SDK driver path (replaced with MCP in next phase)
	const hasConfluenceTools = registry.getRegisteredNames().some(n => n.toLowerCase() === 'confluence');

	if (evalConfig.verbose) {
		const modeLabel = evalConfig.perspectives === 0 ? 'singleCall' : `chorus (${evalConfig.perspectives} perspectives)`;
		xLog.status(`\n--- Config ---`);
		xLog.status(`  Mode:          ${modeLabel}`);
		xLog.status(`  First prompt:  ${evalConfig.firstPromptName}`);
		xLog.status(`  Expand model:  ${evalConfig.expandModel}`);
		xLog.status(`  Agent model:   ${evalConfig.agentModel}`);
		xLog.status(`  Perspectives:  ${evalConfig.perspectives}`);
		xLog.status(`  Max turns:     ${evalConfig.maxTurns}`);
		xLog.status(`  Budget/agent:  $${evalConfig.budget}`);
		xLog.status(`  Suppressed:    ${evalConfig.aiToolsSuppressed.length > 0 ? evalConfig.aiToolsSuppressed.join(', ') : '(none)'}`);
		xLog.status(`  Driver:        ${evalConfig.driver}`);
		xLog.status(`  Dry run:       ${evalConfig.dryRun}`);
		xLog.status(`  Summarize:     ${evalConfig.summarize}`);
		xLog.status(`  No save:       ${evalConfig.noSave}`);
		xLog.status(`  Restore args:  ${evalConfig.restoreSwitches}`);
		if (hasToolProviders) {
			xLog.status(`  Providers:     ${registry.getRegisteredNames().join(', ')}`);
			xLog.status(`  Provider tools: ${registry.getToolNames().join(', ')}`);
		}
		if (resumeSessionName) {
			xLog.status(`  Resume:        ${resumeSessionName}`);
		}
		xLog.status(`--- End Config ---\n`);
	}

	// -- usage validation --
	// --promptFile counts as providing a prompt even without a positional argument
	const hasPromptFile = (commandLineParameters.values.promptFile || [])[0];
	if (!evalConfig.prompt && !hasPromptFile) {
		xLog.error('Usage: askMilo [options] "your prompt here"');
		xLog.error('Use -help for full options list');
		return;
	}

	// -- pipeline setup --
	const { pipeRunner, taskListPlus } = new (require('qtools-asynchronous-pipe-plus'))();
	const { collect } = require('./stages/collect');

	const taskList = new taskListPlus();

	// -- driver registry: maps driver name to stage module paths --
	const stageRegistry = {
		singleCall: { sdk: './stages/single-call.mjs', direct: './stages/single-call-direct.mjs' },
		singleCallTools: { direct: './stages/single-call-tools-direct.mjs' },
		expand: { sdk: './stages/expand.mjs', direct: './stages/expand-direct.mjs' },
		fanOut: { sdk: './stages/fanOut.mjs', direct: './stages/fanOut-direct.mjs' },
		synthesize: { sdk: './stages/synthesize.mjs', direct: './stages/synthesize-direct.mjs' },
	};

	const resolveStage = (stage, driver) => stageRegistry[stage][driver];

	// -- shared streaming callback --
	const streamingOnEvent = evalConfig.stream ? (event) => {
		if (event.type === 'text') {
			process.stdout.write(event.delta);
		}
	} : undefined;

	if (evalConfig.perspectives === 0) {
		// ============================================================
		// SINGLE-CALL PIPELINE
		// ============================================================

		// SingleCall stage — route via registry, with tools branch for confluence
		taskList.push((args, next) => {
			args.timing.mark('singleCall', 'stage_enter');
			const useToolsDriver = hasToolProviders && args.config.driver === 'direct';

			// Common completion handler for all branches
			const onComplete = ({ responseText, cost }) => {
				if (args.config.stream) {
					process.stdout.write('\n');
				}
				args.timing.mark('singleCall', 'api_call_done', { tokens: cost.outputTokens, usd: cost.usd });
				next('', { ...args, responseText, singleCallCost: cost });
			};

			if (useToolsDriver) {
				// -- Tools-enabled direct driver (generic providers) --
				const mod = resolveStage('singleCallTools', 'direct');
				if (args.config.verbose) {
					xLog.status(`[SingleCall] Loading ${mod} (tools-enabled)...`);
					xLog.status(`[SingleCall] Mode: singleCallWithTools, Prompt: ${args.config.firstPromptName}, Model: ${args.config.agentModel}`);
					xLog.status(`[SingleCall] Providers: ${registry.getRegisteredNames().join(', ')}`);
				}

				const { createToolHandler } = require('./lib/toolHandler');
				const toolHandler = createToolHandler(registry, {
					defaultTimeout: args.config.toolsDefaultTimeout,
					verbose: args.config.verbose,
				});

				args.timing.mark('singleCall', 'api_call_start', { driver: 'direct+tools' });
				import(mod).then(({ singleCallWithTools }) => {
					singleCallWithTools({
						prompt: args.originalPrompt,
						systemPrompt: args.config.firstPromptText,
						sessionContext: args.sessionContext,
						config: args.config,
						tools: registry.getToolDefinitions(),
						toolHandler,
						timing: args.timing,
						onEvent: streamingOnEvent,
					}).then(onComplete).catch(err => next(err.message, args));
				});
			} else if (hasConfluenceTools && args.config.driver === 'sdk') {
				// -- SDK driver with Confluence MCP --
				const mod = resolveStage('singleCall', 'sdk');
				if (args.config.verbose) {
					xLog.status(`[SingleCall] Loading ${mod} (with Confluence MCP)...`);
				}

				const confluenceAccessor = require('./lib/confluenceAccessor')({
					baseUrl: args.config.confluenceBaseUrl,
					email: args.config.confluenceEmail,
					apiToken: args.config.confluenceApiToken,
					defaultSpace: args.config.confluenceDefaultSpace,
					mockApi: args.config.mockApi,
				});

				args.timing.mark('singleCall', 'api_call_start', { driver: 'sdk+confluence' });
				import(mod).then(({ singleCall }) => {
					singleCall({
						prompt: args.originalPrompt,
						systemPrompt: args.config.firstPromptText,
						sessionContext: args.sessionContext,
						config: args.config,
						accessor: confluenceAccessor,
					}).then(onComplete).catch(err => next(err.message, args));
				});
			} else {
				// -- Standard driver (no tools) --
				const mod = resolveStage('singleCall', args.config.driver);
				if (args.config.verbose) {
					xLog.status(`[SingleCall] Loading ${mod}...`);
					xLog.status(`[SingleCall] Mode: singleCall, Prompt: ${args.config.firstPromptName}, Model: ${args.config.agentModel}`);
				}
				args.timing.mark('singleCall', 'api_call_start', { driver: args.config.driver });
				import(mod).then(({ singleCall }) => {
					singleCall({
						prompt: args.originalPrompt,
						systemPrompt: args.config.firstPromptText,
						sessionContext: args.sessionContext,
						config: args.config,
						timing: args.timing,
						onEvent: streamingOnEvent,
					}).then(onComplete).catch(err => next(err.message, args));
				});
			}
		});

		// Collect stage (single-call)
		taskList.push((args, next) => {
			args.timing.mark('collect', 'stage_enter');
			const elapsedSeconds = (Date.now() - args.startTime) / 1000;
			if (args.config.verbose) {
				xLog.status(`[Collect] Formatting singleCall output...`);
			}
			const { report, reportJson } = collect({
				mode: 'singleCall',
				promptName: args.config.firstPromptName,
				prompt: args.originalPrompt,
				responseText: args.responseText,
				cost: args.singleCallCost,
				model: args.config.agentModel,
				elapsedSeconds,
				config: args.config,
			});
			next('', { ...args, report, reportJson, elapsedSeconds });
		});

	} else {
		// ============================================================
		// CHORUS PIPELINE (perspectives > 0)
		// ============================================================

		// Expand stage
		taskList.push((args, next) => {
			args.timing.mark('expand', 'stage_enter');
			const expandModule = resolveStage('expand', args.config.driver);
			if (args.config.verbose) {
				xLog.status(`[Expand] Loading ${expandModule}...`);
			}
			import(expandModule).then(({ expand }) => {
				if (args.config.verbose) {
					xLog.status(`[Expand] Calling ${args.config.expandModel} for expansion into ${args.config.perspectives} perspectives...`);
				}
				const stageStart = Date.now();
				args.timing.mark('expand', 'api_call_start');
				expand({ originalPrompt: args.originalPrompt, config: args.config, sessionContext: args.sessionContext })
					.then(({ instructions, expandCost }) => {
						args.timing.mark('expand', 'api_call_done', { perspectiveCount: instructions.length });
						if (args.config.verbose) {
							const elapsed = ((Date.now() - stageStart) / 1000).toFixed(1);
							xLog.status(`[Expand] Complete in ${elapsed}s. Got ${instructions.length} perspectives:`);
							instructions.forEach(instr => {
								xLog.status(`  ${instr.id}. [${instr.perspective}]`);
							});
							xLog.status(`[Expand] Cost: $${expandCost.usd.toFixed(4)}`);
						}
						next('', { ...args, instructions, expandCost });
					})
					.catch(err => next(err.message, args));
			});
		});

		// Fan-out stage (skip if dry-run)
		taskList.push((args, next) => {
			args.timing.mark('fanOut', 'stage_enter');
			if (args.config.dryRun) {
				if (args.config.verbose) {
					xLog.status(`[Fan-Out] Skipped (dry-run mode)`);
				}
				next('', args);
				return;
			}
			const fanOutModule = resolveStage('fanOut', args.config.driver);
			if (args.config.verbose) {
				xLog.status(`[Fan-Out] Loading ${fanOutModule}...`);
			}
			import(fanOutModule).then(({ fanOut }) => {
				if (args.config.verbose) {
					xLog.status(`[Fan-Out] Launching ${args.instructions.length} research agents in parallel...`);
				}
				const stageStart = Date.now();
				args.timing.mark('fanOut', 'api_call_start', { agentCount: args.instructions.length });
				fanOut({ instructions: args.instructions, config: args.config })
					.then(({ results }) => {
						args.timing.mark('fanOut', 'api_call_done', { resultCount: results.length });
						if (args.config.verbose) {
							const elapsed = ((Date.now() - stageStart) / 1000).toFixed(1);
							xLog.status(`[Fan-Out] All agents returned in ${elapsed}s`);
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

		// Synthesize stage (only if -summarize is set and not dry-run)
		if (evalConfig.summarize) {
			taskList.push((args, next) => {
				args.timing.mark('synthesize', 'stage_enter');
				if (args.config.dryRun) {
					if (args.config.verbose) {
						xLog.status(`[Synthesize] Skipped (dry-run mode)`);
					}
					next('', args);
					return;
				}
				const synthesizeModule = resolveStage('synthesize', args.config.driver);
				if (args.config.verbose) {
					xLog.status(`[Synthesize] Loading ${synthesizeModule}...`);
				}
				import(synthesizeModule).then(({ synthesize }) => {
					if (args.config.verbose) {
						xLog.status(`[Synthesize] Calling ${args.config.expandModel} for cross-perspective synthesis...`);
					}
					const stageStart = Date.now();
					args.timing.mark('synthesize', 'api_call_start');
				synthesize({
						originalPrompt: args.originalPrompt,
						instructions: args.instructions,
						results: args.results,
						config: args.config,
					})
						.then(({ synthesis, synthesisCost }) => {
							args.timing.mark('synthesize', 'api_call_done');
							if (args.config.verbose) {
								const elapsed = ((Date.now() - stageStart) / 1000).toFixed(1);
								xLog.status(`[Synthesize] Complete in ${elapsed}s. Synthesis: ${synthesis.length} chars`);
								xLog.status(`[Synthesize] Cost: $${synthesisCost.usd.toFixed(4)}`);
							}
							next('', { ...args, synthesis, synthesisCost });
						})
						.catch(err => next(err.message, args));
				});
			});
		}

		// Collect stage (chorus)
		taskList.push((args, next) => {
			const elapsedSeconds = (Date.now() - args.startTime) / 1000;
			if (args.config.verbose) {
				xLog.status(`[Collect] Collecting and formatting chorus output...`);
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
				mode: 'chorus',
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
	}

	// Run pipeline
	const sessionName = (commandLineParameters.values.sessionName || [])[0] || 'auto';
	const timing = createTimingLog({
		enabled: evalConfig.timingLog,
		sessionName,
		logDir: `${projectRoot}/logs`,
	});
	timing.mark('pipeline', 'start', {
		perspectives: evalConfig.perspectives,
		driver: evalConfig.driver,
		model: evalConfig.agentModel,
		promptLength: evalConfig.prompt.length,
		hasSessionContext: !!sessionContext,
	});

	const initialData = {
		originalPrompt: evalConfig.prompt,
		config: evalConfig,
		startTime: Date.now(),
		sessionContext: sessionContext || null,
		session: resumeSession || null,
		timing,
	};

	pipeRunner(taskList.getList(), initialData, (err, result) => {
		if (err) {
			xLog.error(`Pipeline error: ${err}`);
			process.exit(1);
		}

		result.timing.mark('pipeline', 'complete', { elapsedSeconds: result.elapsedSeconds });

		if (result.config.verbose) {
			xLog.status(`Elapsed: ${result.elapsedSeconds.toFixed(1)}s`);
		}

		if (result.report) {
			if (!result.config.stream) {
				xLog.result(result.report);
			}
		}

		// Output cost summary to stderr (appears in web UI STDERR panel)
		if (result.config.perspectives === 0) {
			const cost = result.singleCallCost || {};
			xLog.status(`Cost: $${(cost.usd || 0).toFixed(4)}  (${cost.inputTokens || 0} input / ${cost.outputTokens || 0} output)  Model: ${result.config.agentModel}  Elapsed: ${(result.elapsedSeconds || 0).toFixed(1)}s`);
		} else {
			const expandUsd = result.expandCost ? result.expandCost.usd : 0;
			const fanOutUsd = result.results ? result.results.reduce((sum, r) => sum + r.cost.usd, 0) : 0;
			const synthesisUsd = result.synthesisCost ? result.synthesisCost.usd : 0;
			const totalUsd = expandUsd + fanOutUsd + synthesisUsd;
			const totalInput = (result.expandCost?.inputTokens || 0) +
				(result.results ? result.results.reduce((sum, r) => sum + (r.cost.inputTokens || 0), 0) : 0) +
				(result.synthesisCost?.inputTokens || 0);
			const totalOutput = (result.expandCost?.outputTokens || 0) +
				(result.results ? result.results.reduce((sum, r) => sum + (r.cost.outputTokens || 0), 0) : 0) +
				(result.synthesisCost?.outputTokens || 0);
			xLog.status(`Cost: $${totalUsd.toFixed(4)}  (${totalInput} input / ${totalOutput} output)  ${result.config.perspectives} perspectives  Elapsed: ${(result.elapsedSeconds || 0).toFixed(1)}s`);
		}

		// -- Query log --
		try {
			const logDir = path.join(projectRoot, 'logs');
			if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
			const logPath = path.join(logDir, 'askMilo-queries.log');
			const ts = new Date().toISOString();
			const model = result.config.expandModel || 'unknown';
			const promptName = result.config.firstPromptName || 'unknown';
			const query = (result.originalPrompt || '').replace(/\n/g, ' ');
			const perspectives = result.config.perspectives || 0;
			let costUsd = 0;
			if (perspectives === 0) {
				costUsd = (result.singleCallCost && result.singleCallCost.usd) || 0;
			} else {
				costUsd = ((result.expandCost ? result.expandCost.usd : 0) +
					(result.results ? result.results.reduce((sum, r) => sum + r.cost.usd, 0) : 0) +
					(result.synthesisCost ? result.synthesisCost.usd : 0));
			}
			const elapsed = (result.elapsedSeconds || 0).toFixed(1);
			const logLine = `${ts}\t${model}\t${promptName}\t$${costUsd.toFixed(4)}\t${elapsed}s\t${perspectives}p\t${query}\n`;
			fs.appendFileSync(logPath, logLine);
		} catch (logErr) {
			// Query logging is best-effort — never fail the pipeline
		}

		// -- Session save --
		if (!result.config.noSave) {
			result.timing.mark('sessionSave', 'start');
			try {
				const elapsedSeconds = result.elapsedSeconds || ((Date.now() - result.startTime) / 1000);
				const turnNumber = result.session ? result.session.turns.length + 1 : 1;

				let thisTurn;
				if (result.config.perspectives === 0) {
					// Single-call turn
					thisTurn = {
						turnNumber,
						turnType: 'singleCall',
						promptName: result.config.firstPromptName,
						prompt: result.originalPrompt,
						response: result.responseText,
						totalCost: result.singleCallCost,
						elapsedSeconds,
						timestamp: new Date().toISOString(),
					};
				} else {
					// Chorus turn
					thisTurn = sessionManager.buildTurnFromResults({
						originalPrompt: result.originalPrompt,
						instructions: result.instructions,
						results: result.results,
						expandCost: result.expandCost,
						synthesis: result.synthesis,
						synthesisCost: result.synthesisCost,
						elapsedSeconds,
						turnNumber,
					});
				}

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
				result.timing.mark('sessionSave', 'done', { sessionName: session.sessionName });
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

	let commandLineParameters = commandLineParser.getParameters({ noFunctions: true });

	// Accept JSON from stdin or argv[2] as override (bb2 pattern)
	try {
		const stdinText = !process.stdin.isTTY ? fs.readFileSync(0, 'utf8') : '';
		const possibleJson = process.argv[2] ? process.argv[2] : stdinText;
		commandLineParameters = JSON.parse(possibleJson);
		commandLineParameters.fromJson = true;
	} catch (err) {
		// no JSON found — use normal commandLineParameters from qtools-parse-command-line
	}

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
	
	const specialConfigPath=commandLineParameters.qtGetSurePath('values.configPath[0]');
	
	const findProjectRoot = ({ rootFolderName = 'system', closest = true } = {}) =>
		(specialConfigPath || __dirname).replace(new RegExp(`^(.*${closest ? '' : '?'}\\/${rootFolderName}).*$`), "$1");
	let projectRoot = findProjectRoot();

	const configName = os.hostname() == 'qMini.local' ? 'instanceSpecific/qbook' : '';
	const configDirPath = specialConfigPath || `${projectRoot}/configs/${configName}/`;
	const config = configFileProcessor.getConfig(`${moduleName}.ini`, configDirPath, { resolve: false, userSubstitutions:{...userSubstitutions, projectRoot} });

	const getConfig = (name) => {
		if (name == 'allConfigs') { return config; }
		return config[name];
	};
console.log('HELLO FROM TQ ASK MILO');
	process.global = Object.freeze({
		xLog: Object.freeze({ status: console.error, error: console.error, result: console.log }),
		getConfig,
		commandLineParameters,
		projectRoot,
		rawConfig: config,
	});
}

module.exports = moduleFunction({ moduleName })({});
