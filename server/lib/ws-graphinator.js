'use strict';

const { WebSocketServer } = require('ws');
const { spawn } = require('child_process');

const escapeHtml = (str) => str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const moduleFunction = ({ server }) => {
	const { xLog } = process.global;

	// noServer: true — upgrade routing handled centrally in startApiServer.js
	// to avoid conflicts when multiple WebSocketServer instances share one HTTP server.
	const wss = new WebSocketServer({ noServer: true });

	// Prevent unhandled error from crashing the process (e.g., EADDRINUSE on restart)
	wss.on('error', (err) => {
		xLog.error(`WebSocket server error: ${err.message}`);
	});

	xLog.status('WebSocket server registered for /ws/explorer');

	// Fetch askMilo config defaults and send to client on connection.
	// Spawns askMilo -getDefaults (reads ini, discovers providers, exits).
	const sendConfigDefaults = (ws) => {
		const child = spawn('askMilo', [], { shell: true, env: process.env });
		let stdout = '';
		child.stdin.write(JSON.stringify({ switches: { getDefaults: true }, values: {}, fileList: [] }));
		child.stdin.end();
		child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
		child.on('close', () => {
			try {
				const config = JSON.parse(stdout.trim());
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
					values.aiTools = [settings.aiToolsSuppressed.join(',')];
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
								delta: `Process error: ${escapeHtml(err.message)}\n`,
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

		// Clean up child process on WebSocket disconnect
		ws.on('close', () => {
			if (activeChild) {
				activeChild.kill('SIGTERM');
				activeChild = null;
			}
		});
	});

	return wss;
};

module.exports = moduleFunction;
