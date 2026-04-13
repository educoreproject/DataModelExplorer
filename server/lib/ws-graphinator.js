'use strict';
// @concept: [[WebSocketGraphTool]]
// @concept: [[DataModelExplorer]]

const { WebSocketServer } = require('ws');
const { spawn } = require('child_process');
const path = require('path');

const escapeHtml = (str) => str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const moduleFunction = ({ server }) => {
	const { xLog, getConfig } = process.global;

	// Derive askMilo config directory from the server's own config file path.
	// process.global.configurationSourceFilePath is set in startApiServer.js
	// from _meta.configurationSourceFilePath — ensures askMilo reads the same
	// config directory as the server, regardless of where the symlink resolves.
	const askMiloConfigPath = process.global.configurationSourceFilePath
		? path.dirname(process.global.configurationSourceFilePath)
		: undefined;

	// noServer: true — upgrade routing handled centrally in startApiServer.js
	// to avoid conflicts when multiple WebSocketServer instances share one HTTP server.
	const wss = new WebSocketServer({ noServer: true });

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
		const child = spawn('askMilo', [], { shell: true, env: process.env });
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

		ws.on('message', (raw) => {
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

				// AI tool providers to suppress (exclude from loading)
				if (settings.aiToolsSuppressed && settings.aiToolsSuppressed.length > 0) {
					values.aiToolsSuppressed = [settings.aiToolsSuppressed.join(',')];
				}

				// Prompt name (maps to singleCallPromptName in askMilo config)
				if (settings.promptName) {
					values.singleCallPromptName = [settings.promptName];
				}

				// Resume a previous session (askMilo CLI: --resumeSession=NAME)
				// Only sent when newSession is false — checkbox lets user start fresh
				if (!settings.newSession && settings.resumeSessionName) {
					values.resumeSession = [settings.resumeSessionName];
				}

				if (askMiloConfigPath) { values.configPath = [askMiloConfigPath]; }

				const askMiloInput = JSON.stringify({
					switches,
					values,
					fileList: [msg.text],
				});

				const child = spawn('askMilo', [], {
					shell: true,
					env: process.env,
				});
				activeChild = child;

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

				// Pipe stderr chunks to WebSocket stderr channel (HTML-escaped for v-html rendering)
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
