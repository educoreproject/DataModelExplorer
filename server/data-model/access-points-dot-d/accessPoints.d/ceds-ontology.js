#!/usr/bin/env node
'use strict';
// @concept: [[StandardsIntegration]]
// @concept: [[AccessPointPattern]]

/**
 * ACCESS POINT: CEDS ONTOLOGY
 *
 * Spawns ceds1.js as a child process with JSON on stdin.
 * Captures stdout (JSON output from ceds1) and returns it to the endpoint.
 *
 * This access point is PROCESS-BASED -- it does not use the database or mappers.
 * It spawns the ceds1 CLI tool and communicates via JSON stdin/stdout.
 */

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const qt = require('qtools-functional-library');
const { pipeRunner, taskListPlus, mergeArgs, forwardArgs } = new require(
	'qtools-asynchronous-pipe-plus',
)();

const path = require('path');
const { spawn } = require('child_process');

//START OF moduleFunction() ============================================================

const moduleFunction = function ({ dotD, passThroughParameters }) {
	// ================================================================================
	// INITIALIZATION AND DEPENDENCY INJECTION

	const { xLog, getConfig, rawConfig, commandLineParameters } = process.global;

	// No database dependencies needed -- this is process-based

	// ================================================================================
	// SERVICE FUNCTION

	const serviceFunction = (requestBody, callback) => {
		if (typeof requestBody == 'function') {
			callback = requestBody;
			requestBody = {};
		}

		const taskList = new taskListPlus();

		// --------------------------------------------------------------------------------
		// PIPELINE STAGE 1: VALIDATE REQUEST

		taskList.push((args, next) => {
			const { requestBody } = args;

			const validActions = [
				'help',
				'stats',
				'lookup',
				'explore',
				'optionSet',
				'property',
				'path',
				'search',
				'compare',
				'dataSpec',
				'shared',
				'listClasses',
				'listOptionSets',
				'listProperties',
			];

			const action = requestBody.action;
			if (!action) {
				next('Missing required field: action', args);
				return;
			}

			if (!validActions.includes(action)) {
				next(
					`Invalid action: "${action}". Valid actions: ${validActions.join(', ')}`,
					args,
				);
				return;
			}

			next('', args);
		});

		// --------------------------------------------------------------------------------
		// PIPELINE STAGE 2: SPAWN CEDS1 AND COLLECT OUTPUT

		taskList.push((args, next) => {
			const { requestBody } = args;

			const ceds1Path = path.join(
				__dirname,
				'../../../../cli/lib.d/ceds-ontology/ceds1.js',
			);

			// Build stdin JSON: always force json:true for structured output
			const stdinPayload = {
				action: requestBody.action,
				args: requestBody.args || [],
				options: requestBody.options || {},
				json: true,
			};

			const childProcess = spawn('node', [ceds1Path], {
				cwd: path.dirname(ceds1Path),
				stdio: ['pipe', 'pipe', 'pipe'],
			});

			let stdoutData = '';
			let stderrData = '';

			// 30-second timeout (semantic search can be slow)
			const timeout = setTimeout(() => {
				childProcess.kill('SIGTERM');
				next('ceds1 timed out after 30 seconds', args);
			}, 30000);

			childProcess.stdout.on('data', (chunk) => {
				stdoutData += chunk.toString();
			});

			childProcess.stderr.on('data', (chunk) => {
				stderrData += chunk.toString();
			});

			childProcess.on('close', (exitCode) => {
				clearTimeout(timeout);

				if (exitCode !== 0) {
					xLog.error(
						`ceds1 exited with code ${exitCode}: ${stderrData}`,
					);
					next(
						`ceds1 failed: ${stderrData.slice(0, 500)}`,
						args,
					);
					return;
				}

				// Parse JSON output from ceds1
				let parsedResult;
				try {
					parsedResult = JSON.parse(stdoutData);
				} catch (parseErr) {
					xLog.error(
						`Failed to parse ceds1 output: ${parseErr.message}`,
					);
					xLog.error(
						`Raw output (first 500 chars): ${stdoutData.slice(0, 500)}`,
					);
					next('ceds1 returned unparseable output', args);
					return;
				}

				next('', { ...args, cedsResult: parsedResult });
			});

			childProcess.on('error', (spawnErr) => {
				clearTimeout(timeout);
				next(`Failed to spawn ceds1: ${spawnErr.message}`, args);
			});

			// Send JSON input on stdin and close
			childProcess.stdin.write(JSON.stringify(stdinPayload));
			childProcess.stdin.end();
		});

		// --------------------------------------------------------------------------------
		// EXECUTE PIPELINE

		const initialData = { requestBody };
		pipeRunner(taskList.getList(), initialData, (err, args) => {
			if (err) {
				callback(err, {});
				return;
			}

			const { cedsResult } = args;
			callback('', { cedsResult });
		});
	};

	// ================================================================================
	// ACCESS POINT REGISTRATION

	const addEndpoint = ({ name, serviceFunction, dotD }) => {
		dotD.logList.push(name);
		dotD.library.add(name, serviceFunction);
	};

	const name = moduleName;
	addEndpoint({ name, serviceFunction, dotD });

	return {};
};

//END OF moduleFunction() ============================================================

module.exports = moduleFunction;
