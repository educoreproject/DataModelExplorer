#!/usr/bin/env node
'use strict';

/**
 * ACCESS POINT: LIBRARY PAGE
 *
 * Reads and returns a single HTML file from the uploadLibrary directory.
 * Validates the filename to prevent path traversal attacks.
 *
 * This access point is FILESYSTEM-BASED -- it does not use the database or mappers.
 * It reads the upload directory path from configuration via getConfig(moduleName).
 */

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const qt = require('qtools-functional-library');
const { pipeRunner, taskListPlus, mergeArgs, forwardArgs } = new require(
	'qtools-asynchronous-pipe-plus',
)();

const fs = require('fs');
const path = require('path');

//START OF moduleFunction() ============================================================

const moduleFunction = function ({ dotD, passThroughParameters }) {
	// ================================================================================
	// INITIALIZATION AND DEPENDENCY INJECTION

	const { xLog, getConfig, rawConfig, commandLineParameters } = process.global;
	const { uploadLibraryPath } = getConfig(moduleName);

	// No database dependencies needed -- this is filesystem-only

	// ================================================================================
	// SERVICE FUNCTION

	const serviceFunction = (inputData, callback) => {
		if (typeof inputData == 'function') {
			callback = inputData;
			inputData = {};
		}

		const taskList = new taskListPlus();

		// --------------------------------------------------------------------------------
		// PIPELINE STAGE 1: VALIDATE FILENAME

		taskList.push((args, next) => {
			const { filename } = args;

			if (!filename) {
				next('filename parameter required', args);
				return;
			}

			// Reject path traversal attempts
			if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
				next('invalid filename', args);
				return;
			}

			next('', args);
		});

		// --------------------------------------------------------------------------------
		// PIPELINE STAGE 2: RESOLVE PATH AND CHECK EXISTENCE

		taskList.push((args, next) => {
			const { filename } = args;
			const resolvedPath = path.resolve(uploadLibraryPath);
			const filePath = path.join(resolvedPath, filename);

			if (!fs.existsSync(filePath)) {
				next('file not found', args);
				return;
			}

			next('', { ...args, filePath });
		});

		// --------------------------------------------------------------------------------
		// PIPELINE STAGE 3: READ FILE CONTENT

		taskList.push((args, next) => {
			const { filePath } = args;

			const localCallback = (err, content) => {
				if (err) {
					next(err.toString(), args);
					return;
				}

				next('', { ...args, content });
			};

			fs.readFile(filePath, 'utf8', localCallback);
		});

		// --------------------------------------------------------------------------------
		// EXECUTE PIPELINE

		const initialData = { filename: inputData.filename };
		pipeRunner(taskList.getList(), initialData, (err, args) => {
			if (err) {
				callback(err, {});
				return;
			}

			const { filename, content } = args;
			callback('', { filename, content, contentType: 'text/html' });
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
