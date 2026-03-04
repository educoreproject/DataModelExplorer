'use strict';

const { WebSocketServer } = require('ws');
const { spawn } = require('child_process');

const moduleFunction = ({ server }) => {
	const { xLog } = process.global;

	// noServer: true — upgrade routing handled centrally in startApiServer.js
	// to avoid conflicts when multiple WebSocketServer instances share one HTTP server.
	const wss = new WebSocketServer({ noServer: true });

	// Prevent unhandled error from crashing the process (e.g., EADDRINUSE on restart)
	wss.on('error', (err) => {
		xLog.error(`WebSocket server error: ${err.message}`);
	});

	xLog.status('WebSocket server registered for /ws/askmilo');

	wss.on('connection', (ws) => {
		let activeChild = null;

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

				// Tools available to agents
				if (settings.tools && settings.tools.length > 0) {
					values.tools = [settings.tools.join(',')];
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

				// Pipe stderr chunks to WebSocket stderr channel
				child.stderr.on('data', (chunk) => {
					if (ws.readyState === ws.OPEN) {
						ws.send(
							JSON.stringify({
								channel: 'stderr',
								delta: chunk.toString(),
							}),
						);
					}
				});

				// Process exit signals done
				child.on('close', (exitCode) => {
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
								delta: `Process error: ${err.message}\n`,
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
