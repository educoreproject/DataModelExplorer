'use strict';
// @concept: [[WebSocketGraphTool]]
// @concept: [[DataModelExplorer]]

const { WebSocketServer } = require('ws');
const { spawn } = require('child_process');
const path = require('path');
const { buildGraphConnection } = require('../data-model/lib/user-graph/user-graph');
const { buildUserModeAskmiloContext } = require('./dme-usermode-context');
const dmeResumeContextGen = require('./dme-resume-context');
const resumeLimitByName = require('./dme-resume-limits.json');

const escapeHtml = (str) => str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const moduleFunction = ({ server }) => {
	const { xLog, getConfig } = process.global;

	// Every askMilo session the DME uses is named, and every resume decided, by dme-resume-context.js. Its proofs are
	// keyed by THIS instance's own secret, startApiServer.ini [dmeResumeProof] secret. Without a good one the server
	// still starts (only reopened-session resume is affected: those sessions are rebuilt), and says so once, loudly.
	const resumeContext = dmeResumeContextGen({
		resumeProofSecret: (getConfig('dmeResumeProof') || {}).secret,
		limitByName: resumeLimitByName,
	});
	if (!resumeContext.isProofEnabled) {
		xLog.error(`\n${'!'.repeat(100)}\n[ws-graphinator] WARNING: ${resumeContext.proofDisabledReasonText}\n${'!'.repeat(100)}\n`);
	}

	// a pipe to or from an askMilo child can fail (EPIPE when the child dies before reading a large prompt); with no
	// listener that 'error' would exit the API process, so every spawned child's pipes report into its own stream
	const reportPipeErrorsOf = (child, onPipeError) => {
		['stdin', 'stdout', 'stderr'].forEach((pipeName) => child[pipeName].on('error', (pipeError) => onPipeError(`${pipeName}: ${pipeError && pipeError.code ? pipeError.code : pipeError}`)));
	};

	// Derive askMilo config directory from the server's own config file path.
	// process.global.configurationSourceFilePath is set in startApiServer.js
	// from _meta.configurationSourceFilePath — ensures askMilo reads the same
	// config directory as the server, regardless of where the symlink resolves.
	const askMiloConfigPath = process.global.configurationSourceFilePath
		? path.dirname(process.global.configurationSourceFilePath)
		: undefined;

	// Spawn the repo's OWN askMilo, never a PATH-resolved one. A bare 'askMilo'
	// resolves through /usr/local/bin, which on a dev machine can point at a
	// different project's copy (with its own config and toolset) — the app then
	// answers from the wrong prompt and wrong tools. Quoted for shell:true.
	const askMiloCommand = `"${process.execPath}" "${path.resolve(
		__dirname,
		'../data-model/lib/ask-milo-multitool/askMilo.js',
	)}"`;

	// noServer: true — upgrade routing handled centrally in startApiServer.js
	// to avoid conflicts when multiple WebSocketServer instances share one HTTP server.
	// maxPayload: the largest message the DME needs (lib/dme-resume-limits.json), not the ws default of 100 MiB
	const wss = new WebSocketServer({ noServer: true, maxPayload: resumeLimitByName.webSocketMaxPayloadBytes });

	// Prevent unhandled error from crashing the process (e.g., EADDRINUSE on restart)
	wss.on('error', (err) => {
		xLog.error(`WebSocket server error: ${err.message}`);
	});

	xLog.status('WebSocket server registered for /ws/explorer');

	// ---------------------------------------------------------------------
	// buildToolsByRole - parse [explorerToolsByRole] config into structured object
	//
	// Input (from ini):  { super: { available: "getAllFromAskMilo", default: "Tool1,Tool2" }, ... }
	// Output:            { super: { available: "getAllFromAskMilo", default: ["Tool1","Tool2"] }, ... }
	//
	// Comma-separated strings become arrays. The magic value "getAllFromAskMilo"
	// stays as a string — the client interprets it to mean "use the full list."
	const buildToolsByRole = () => {
		const rawSection = getConfig('explorerToolsByRole') || {};
		const toolsByRole = {};
		const roleKeys = Object.keys(rawSection).filter(key => key !== 'ANNOTATION');

		roleKeys.forEach(roleName => {
			const roleConfig = rawSection[roleName];
			if (roleConfig && typeof roleConfig === 'object') {
				toolsByRole[roleName] = {
					available: roleConfig.available === 'getAllFromAskMilo'
						? 'getAllFromAskMilo'
						: roleConfig.available.split(',').map(t => t.trim()).filter(Boolean),
					default: roleConfig.default
						? roleConfig.default.split(',').map(t => t.trim()).filter(Boolean)
						: [],
				};
			}
		});

		return toolsByRole;
	};

	// Fetch askMilo config defaults and send to client on connection.
	// Spawns askMilo -getDefaults (reads ini, discovers providers, exits).
	// Includes toolsByRole from [explorerToolsByRole] config section.
	const sendConfigDefaults = (ws) => {
		const child = spawn(askMiloCommand, [], { shell: true, env: process.env });
		reportPipeErrorsOf(child, (pipeErrorText) => xLog.error(`[ws-graphinator] askMilo defaults child pipe failed: ${pipeErrorText}`));
		child.on('error', (spawnError) => xLog.error(`[ws-graphinator] askMilo defaults child failed: ${spawnError && spawnError.message}`));
		let stdout = '';
		const defaultsInput = { switches: { getDefaults: true }, values: {}, fileList: [] };
		if (askMiloConfigPath) { defaultsInput.values.configPath = [askMiloConfigPath]; }
		child.stdin.write(JSON.stringify(defaultsInput));
		child.stdin.end();
		child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
		child.on('close', () => {
			try {
				const config = JSON.parse(stdout.trim());
				config.toolsByRole = buildToolsByRole();
				if (ws.readyState === ws.OPEN) {
					ws.send(JSON.stringify({ channel: 'config', config }));
				}
			} catch (e) {
				xLog.error(`[ws-graphinator] Failed to parse askMilo defaults: ${e.message}`);
			}
		});
	};

	wss.on('connection', (ws) => {
		let activeChild = null;
		// the askMilo sessions this server named for THIS connection and saw saved: their follow-ups need no proof
		const connectionSessionNameSet = new Set();

		// a socket-level error (a message over maxPayload, a bad frame) closes this connection; unheard, it would exit
		// the API process
		ws.on('error', (socketError) => xLog.error(`[ws-graphinator] connection error, closed: ${socketError && socketError.message}`));

		// WebSocket keepalive — send ping every 30s to prevent timeouts.
		// The ws library handles pong responses automatically on the client side.
		ws.isAlive = true;
		ws.on('pong', () => { ws.isAlive = true; });

		const pingInterval = setInterval(() => {
			if (!ws.isAlive) {
				clearInterval(pingInterval);
				ws.terminate();
				return;
			}
			ws.isAlive = false;
			if (ws.readyState === ws.OPEN) ws.ping();
		}, 30000);

		// Send config defaults so the client knows what tools are available
		sendConfigDefaults(ws);

		// answerMessage runs inside the BOUNDARY below (ws.on('message')): a throw while answering one message must end
		// that prompt with a visible error, never the API process (an uncaught throw here exits Node and kills every
		// user's stream; seen 2026-11-19 with savedTurnList [null]). Inputs are still validated, not left to the boundary.
		const answerMessage = (raw) => {
			let msg;
			try {
				msg = JSON.parse(raw);
			} catch (e) {
				ws.send(
					JSON.stringify({
						channel: 'stderr',
						delta: 'Invalid JSON message\n',
					}),
				);
				return;
			}

			if (msg.type === 'prompt' && msg.text) {
				// Kill any running process before starting a new one
				if (activeChild) {
					activeChild.kill('SIGTERM');
					activeChild = null;
				}

				// Build askMilo JSON input from client settings
				// (qtools-parse-command-line stdin format)
				const settings = msg.settings || {};
				const switches = { stream: true };
				const values = {};

				// Model → expandModel (primary model for single-call and chorus expander)
				if (settings.model) {
					values.expandModel = [settings.model];
				}

				// Perspectives count
				if (settings.perspectives !== undefined) {
					values.perspectives = [String(settings.perspectives)];
				}

				// Summarize (switch — only meaningful when perspectives > 0)
				if (settings.summarize && settings.perspectives > 0) {
					switches.summarize = true;
				}

				// Agent model (chorus researcher model — only relevant when perspectives > 0)
				if (settings.agentModel && settings.perspectives > 0) {
					values.agentModel = [settings.agentModel];
				}

				// Serial fan-out (run chorus agents sequentially to avoid rate limits)
				if (settings.serialFanOut) {
					switches.serialFanOut = true;
				}

				// AI tool providers to suppress + prompt selection, graphMode-aware.
				// The per-user graph tools (dme-user-read/-write) are offered ONLY in User
				// mode; in Standard mode they are force-suppressed so they are never offered.
				// User mode also uses the authoring prompt that explains how to build the
				// user's model. (CLI askMilo never loads these — they are not in its enabled
				// list — so this gating only concerns the WS Standard-vs-User split.)
				const USER_MODE_PROVIDERS = ['DmeUserRead', 'DmeUserWrite'];
				// Standard providers connect to the GOLDEN bolt; they must NOT be reachable in
				// User mode (their raw-cypher tool could otherwise touch golden, breaking
				// isolation). If more standard providers are added to aiToolsLib.enabled, add
				// them here too.
				const STANDARD_PROVIDERS = ['DataModelExplorer', 'SifSearch'];
				let suppressedProviders = Array.isArray(settings.aiToolsSuppressed)
					? settings.aiToolsSuppressed.slice()
					: [];

				const suppress = (provider) => {
					if (!suppressedProviders.includes(provider)) suppressedProviders.push(provider);
				};

				if (settings.graphMode === 'user') {
					// User mode: offer ONLY the per-user graph tools; suppress the golden-bolt
					// standards tools; use the authoring prompt.
					suppressedProviders = suppressedProviders.filter(
						(provider) => !USER_MODE_PROVIDERS.includes(provider),
					);
					STANDARD_PROVIDERS.forEach(suppress);
					values.singleCallPromptName = ['DmeUserAuthoring'];
				} else {
					// Standard mode: never offer the per-user graph tools.
					USER_MODE_PROVIDERS.forEach(suppress);
					if (settings.promptName) {
						values.singleCallPromptName = [settings.promptName];
					}
				}

				if (suppressedProviders.length > 0) {
					values.aiToolsSuppressed = [suppressedProviders.join(',')];
				}


				if (askMiloConfigPath) { values.configPath = [askMiloConfigPath]; }

				// Multi-tenant (03): in User mode the server resolves the user graph's
				// connection and hands it to askMilo in its command input. askMilo uses
				// graphConnection when present, else its own config (doc 02 — backward
				// compatible). STUB: buildGraphConnection returns the standard DME
				// connection, so askMilo answers exactly as it does today; Phase 5 makes
				// this the live per-user clone's bolt URI/password. The browser never
				// sends this — the server places it (the bolt secret stays server-side).
				// User-mode env handed to the askMilo subprocess (Option A internal secret).
				// Empty in Standard mode — nothing extra is injected.
				let askmiloUserEnv = {};

				if (settings.graphMode === 'user') {
					const graphConnection = buildGraphConnection();
					if (graphConnection) {
						values.graphConnection = [JSON.stringify(graphConnection)];
					}

					// Multi-tenant write layer (Phase 2): hand askMilo the live versionRefId +
					// the executor base URL (command input) and the server-only internal secret
					// (env only — never command input, so it cannot be echoed to the browser via
					// piped stdout/stderr). Only when a version is actually open in User mode.
					const userCtx = buildUserModeAskmiloContext({ settings, getConfig });
					Object.keys(userCtx.commandValues).forEach((key) => {
						const value = userCtx.commandValues[key];
						if (value !== undefined && value !== null) {
							values[key] = [String(value)];
						}
					});
					askmiloUserEnv = userCtx.env;
				}

				// Which askMilo conversation this prompt continues, decided in ONE place: a name is resumed (--resumeSession)
				// only with the proof this server issued for it; otherwise the SERVER names a new session (--sessionName).
				// A reopened DME session's saved turns (sent until a save is confirmed) become --priorContextText when the
				// name cannot be resumed as is. askMilo replays context within the same budget (--sessionContextCharacterBudget).
				const resumeDecision = resumeContext.resumeDecisionOf({
					promptText: msg.text,
					requestedSessionName: settings.newSession ? '' : settings.resumeSessionName,
					resumeProof: settings.resumeProof,
					savedTurnList: msg.savedTurnList,
					isNameKnownToConnection: (askMiloSessionName) => connectionSessionNameSet.has(askMiloSessionName),
				});
				if (resumeDecision.refusalText) {
					xLog.error(`[ws-graphinator] RESUME refused: ${resumeDecision.refusalText}`);
					ws.send(JSON.stringify({ channel: 'stderr', delta: `<span class="ws-error">${escapeHtml(resumeDecision.refusalText)}</span>\n` }));
					ws.send(JSON.stringify({ channel: 'done', exitCode: 1 }));
					return;
				}
				if (resumeDecision.resumeSessionName) {
					values.resumeSession = [resumeDecision.resumeSessionName];
				} else {
					values.sessionName = [resumeDecision.newSessionName];
				}
				if (resumeDecision.priorContextText) {
					values.priorContextText = [resumeDecision.priorContextText];
				}
				values.sessionContextCharacterBudget = [String(resumeLimitByName.rebuiltContextCharacterBudget)];
				// the session this run writes, known BEFORE it starts; its proof goes to the browser only once askMilo has saved it
				const askMiloSessionName = resumeDecision.resumeSessionName || resumeDecision.newSessionName;
				if (resumeDecision.rebuiltTurnCount) {
					xLog.status(`[ws-graphinator] RESUME rebuilt resume=${resumeDecision.resumeSessionName || '(new)'} from ${resumeDecision.rebuiltTurnCount} saved turn(s), ${resumeDecision.omittedTurnCount} left out`);
					ws.send(JSON.stringify({ channel: 'contextRebuilt', noticeText: resumeDecision.noticeText }));
				}

				const askMiloInput = JSON.stringify({
					switches,
					values,
					fileList: [msg.text],
				});

				const queryPreview = msg.text.length > 400
					? `${msg.text.slice(0, 400)}… [${msg.text.length} chars total]`
					: msg.text;
				const modelInfo = settings.model || '(default)';
				const promptInfo = settings.promptName || '(default)';
				const perspectivesInfo = settings.perspectives || 0;
				const sessionInfo = resumeDecision.resumeSessionName ? `resume=${resumeDecision.resumeSessionName}` : `newSession=${resumeDecision.newSessionName}`;
				xLog.status(`[ws-graphinator] QUERY model=${modelInfo} prompt=${promptInfo} perspectives=${perspectivesInfo} ${sessionInfo}`);
				xLog.status(`[ws-graphinator] QUERY text: ${queryPreview}`);

				const spawnStartMs = Date.now();
				const child = spawn(askMiloCommand, [], {
					shell: true,
					env: { ...process.env, ...askmiloUserEnv },
				});
				activeChild = child;
				reportPipeErrorsOf(child, (pipeErrorText) => {
					xLog.error(`[ws-graphinator] askMilo pipe failed (${askMiloSessionName}): ${pipeErrorText}`);
					if (ws.readyState === ws.OPEN) {
						ws.send(JSON.stringify({ channel: 'stderr', delta: `<span class="ws-error">The connection to the answering process broke (${escapeHtml(pipeErrorText)}).</span>\n` }));
					}
				});

				// Write prompt via stdin
				child.stdin.write(askMiloInput);
				child.stdin.end();

				// Pipe stdout chunks to WebSocket stdout channel
				child.stdout.on('data', (chunk) => {
					if (ws.readyState === ws.OPEN) {
						ws.send(
							JSON.stringify({
								channel: 'stdout',
								delta: chunk.toString(),
							}),
						);
					}
				});

				// Pipe stderr chunks to WebSocket stderr channel (HTML-escaped for v-html rendering). Nothing in it is
				// trusted: the session name and its proof come from the server's own decision, after askMilo exits.
				child.stderr.on('data', (chunk) => {
					if (ws.readyState === ws.OPEN) {
						ws.send(
							JSON.stringify({
								channel: 'stderr',
								delta: escapeHtml(chunk.toString()),
							}),
						);
					}
				});

				// Heartbeat: confirm child process is alive every 5s
				const heartbeatStyles = [
					{ sym: '♥', color: '#e74c3c' },
					{ sym: '♦', color: '#3498db' },
					{ sym: '♣', color: '#2ecc71' },
					{ sym: '♠', color: '#e67e22' },
					{ sym: '●', color: '#9b59b6' },
					{ sym: '◆', color: '#1abc9c' },
				];
				let heartbeatTick = 0;
				const heartbeatInterval = setInterval(() => {
					if (ws.readyState === ws.OPEN && child.pid) {
						try {
							process.kill(child.pid, 0); // Signal 0 = existence check
							ws.send(JSON.stringify({ channel: 'heartbeat', alive: true }));
							// Colored HTML heartbeat in stderr so user sees proof of life
							const { sym, color } = heartbeatStyles[heartbeatTick % heartbeatStyles.length];
							const ts = new Date().toLocaleTimeString();
							ws.send(JSON.stringify({ channel: 'stderr', delta: `<span style="color:${color}">${sym} heartbeat: Process ALIVE ${ts}</span>\n` }));
							heartbeatTick++;
						} catch (e) {
							ws.send(JSON.stringify({ channel: 'heartbeat', alive: false }));
							clearInterval(heartbeatInterval);
						}
					}
				}, 5000);

				// Process exit signals done
				child.on('close', (exitCode) => {
					clearInterval(heartbeatInterval);
					// the save is confirmed by the session FILE, written by this run, not by anything askMilo printed
					const isSaveConfirmed = exitCode === 0 && resumeContext.askMiloSessionSavedSinceOf(askMiloSessionName, spawnStartMs);
					if (isSaveConfirmed) connectionSessionNameSet.add(askMiloSessionName);
					// with proofs off (no [dmeResumeProof] secret) resumeProof is '': the browser still learns the save happened
					if (isSaveConfirmed && ws.readyState === ws.OPEN) {
						ws.send(JSON.stringify({ channel: 'askMiloSessionSaved', askMiloSessionName, resumeProof: resumeContext.resumeProofOf(askMiloSessionName) }));
					}
					if (ws.readyState === ws.OPEN) {
						ws.send(
							JSON.stringify({ channel: 'done', exitCode }),
						);
					}
					if (activeChild === child) {
						activeChild = null;
					}
				});

				child.on('error', (err) => {
					if (ws.readyState === ws.OPEN) {
						ws.send(
							JSON.stringify({
								channel: 'stderr',
								delta: `<span class="ws-error">PROCESS ERROR: ${escapeHtml(err.message)}</span>\n`,
							}),
						);
						ws.send(
							JSON.stringify({ channel: 'done', exitCode: -1 }),
						);
					}
					if (activeChild === child) {
						activeChild = null;
					}
				});
			}
		};

		ws.on('message', (raw) => {
			let answerError = null;
			try {
				answerMessage(raw);
			} catch (thrownError) {
				answerError = thrownError;
			}
			if (!answerError) return;
			xLog.error(`[ws-graphinator] a message could not be answered: ${answerError && answerError.stack ? answerError.stack : answerError}`);
			if (ws.readyState === ws.OPEN) {
				ws.send(JSON.stringify({ channel: 'stderr', delta: '<span class="ws-error">SERVER ERROR: this prompt could not be run. Please try again.</span>\n' }));
				ws.send(JSON.stringify({ channel: 'done', exitCode: 1 }));
			}
		});

		// Clean up on WebSocket disconnect
		ws.on('close', () => {
			clearInterval(pingInterval);
			if (activeChild) {
				activeChild.kill('SIGTERM');
				activeChild = null;
			}
		});
	});

	return wss;
};

module.exports = moduleFunction;
