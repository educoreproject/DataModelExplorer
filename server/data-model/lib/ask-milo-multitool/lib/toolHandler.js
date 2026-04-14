'use strict';

// toolHandler.js - Generic tool execution dispatcher for the direct API driver
// Receives tool_use blocks from Claude's response, looks up CLI mapping from
// the provider registry, spawns the CLI command, returns stdout as tool_result.
// CJS module.

const { execFile } = require('child_process');

// createToolHandler - Factory that closes over a provider registry.
// Returns an object with executeToolCall() matching the interface expected
// by single-call-tools-direct.mjs.
const createToolHandler = (registry, options = {}) => {
	const defaultTimeout = (options.defaultTimeout || 30) * 1000; // seconds → ms

	return {
		executeToolCall: async ({ toolName, toolInput }) => {
			const mapping = registry.getProviderForTool(toolName);
			if (!mapping) {
				return {
					content: `Unknown tool: ${toolName}`,
					is_error: true,
				};
			}

			const { command, positionalArgs, flagArgs } = mapping.cli;
			const providerDir = mapping.providerDir || null;
			const timeout = (mapping.cli.timeout || options.defaultTimeout || 30) * 1000;

			// Build the argument list from Claude's input object
			const args = buildCliArgs({ positionalArgs, flagArgs }, toolInput);

			// command is e.g. "node careerStorySearch.js" — split into executable + initial args
			const parts = command.split(/\s+/);
			const executable = parts[0];
			const baseArgs = parts.slice(1);
			const fullArgs = [...baseArgs, ...args];

			if (options.verbose) {
				console.error(`[toolHandler] ${executable} ${fullArgs.join(' ')} (cwd: ${providerDir || 'inherited'})`);
			}

			try {
				const { stdout, stderr } = await spawnCli(executable, fullArgs, timeout, providerDir);

				// Always pipe stderr through to askMilo's stderr
				if (stderr) {
					console.error(stderr);
				}

				return { content: stdout || '(no output)' };
			} catch (err) {
				return {
					content: `Tool error (${toolName}): ${err.message}`,
					is_error: true,
				};
			}
		},
	};
};

// buildCliArgs - Translate Claude's input object into a CLI argument array
// using the positionalArgs and flagArgs mappings from provider.json.
//
// positionalArgs: ["query"] → toolInput.query becomes a positional arg
// flagArgs: { "limit": "--limit" } → toolInput.limit becomes --limit=value
const buildCliArgs = ({ positionalArgs = [], flagArgs = {} }, toolInput) => {
	const args = [];

	// Positional args first, in declared order
	for (const paramName of positionalArgs) {
		const value = toolInput[paramName];
		if (value !== undefined && value !== null) {
			args.push(String(value));
		}
	}

	// Flag args
	for (const [paramName, flag] of Object.entries(flagArgs)) {
		const value = toolInput[paramName];
		if (value !== undefined && value !== null) {
			args.push(`${flag}=${value}`);
		}
	}

	return args;
};

// spawnCli - Execute a CLI command and return { stdout, stderr }
// Rejects on non-zero exit code or timeout.
const spawnCli = (executable, args, timeout, cwd) => {
	return new Promise((resolve, reject) => {
		execFile(executable, args, { timeout, maxBuffer: 1024 * 1024, cwd: cwd || undefined }, (err, stdout, stderr) => {
			if (err) {
				// Include stderr in the error message if available
				const detail = stderr ? `${err.message}\n${stderr}` : err.message;
				reject(new Error(detail));
				return;
			}
			resolve({ stdout, stderr });
		});
	});
};

module.exports = { createToolHandler };
