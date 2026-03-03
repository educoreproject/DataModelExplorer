'use strict';

const { WebSocketServer } = require('ws');
const { spawn } = require('child_process');

const moduleFunction = ({ server }) => {
	const { xLog } = process.global;

	const wss = new WebSocketServer({ server, path: '/ws/graphinator' });

	// Prevent unhandled error from crashing the process (e.g., EADDRINUSE on restart)
	wss.on('error', (err) => {
		xLog.error(`WebSocket server error: ${err.message}`);
	});

	xLog.status('WebSocket server listening on /ws/graphinator');

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

				// Build askMilo JSON input (qtools-parse-command-line format)
				const askMiloInput = JSON.stringify({
					switches: { stream: true },
					values: {},
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
};

module.exports = moduleFunction;
