#!/usr/bin/env node
'use strict';

/**
 * ACCESS POINT: LIBRARY CATALOG
 *
 * Scans the uploadLibrary directory for HTML files and returns a catalog
 * with metadata extracted from each file (title, description, hasOwnNav, etc).
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
		// PIPELINE STAGE 1: RESOLVE AND VALIDATE DIRECTORY PATH

		taskList.push((args, next) => {
			const resolvedPath = path.resolve(uploadLibraryPath);

			if (!fs.existsSync(resolvedPath)) {
				next(`Upload library directory not found: ${resolvedPath}`, args);
				return;
			}

			next('', { ...args, resolvedPath });
		});

		// --------------------------------------------------------------------------------
		// PIPELINE STAGE 2: READ DIRECTORY AND FILTER HTML FILES

		taskList.push((args, next) => {
			const { resolvedPath } = args;

			const localCallback = (err, fileList) => {
				if (err) {
					next(`Failed to read upload library directory: ${err.toString()}`, args);
					return;
				}

				const htmlFiles = fileList.filter((filename) => {
					const ext = path.extname(filename).toLowerCase();
					return ext === '.html' || ext === '.htm';
				});

				next('', { ...args, htmlFiles });
			};

			fs.readdir(resolvedPath, localCallback);
		});

		// --------------------------------------------------------------------------------
		// PIPELINE STAGE 3: EVALUATE EACH FILE AND BUILD CATALOG

		taskList.push((args, next) => {
			const { resolvedPath, htmlFiles } = args;

			const catalogEntries = [];
			let processedCount = 0;

			if (htmlFiles.length === 0) {
				next('', { ...args, catalog: [] });
				return;
			}

			htmlFiles.forEach((filename) => {
				const filePath = path.join(resolvedPath, filename);

				fs.readFile(filePath, 'utf8', (readErr, fileContent) => {
					if (readErr) {
						xLog.status(`library-catalog: Failed to read ${filename}: ${readErr.toString()}`);
						processedCount++;
						if (processedCount === htmlFiles.length) {
							next('', { ...args, catalog: catalogEntries });
						}
						return;
					}

					fs.stat(filePath, (statErr, stats) => {
						if (statErr) {
							xLog.status(`library-catalog: Failed to stat ${filename}: ${statErr.toString()}`);
							processedCount++;
							if (processedCount === htmlFiles.length) {
								next('', { ...args, catalog: catalogEntries });
							}
							return;
						}

						// Detect hasOwnNav
						const hasOwnNav = fileContent.includes('<nav');

						// Extract displayName from <title> tag
						const titleMatch = fileContent.match(/<title[^>]*>(.*?)<\/title>/i);
						let displayName = '';
						if (titleMatch && titleMatch[1]) {
							displayName = titleMatch[1].trim();
						} else {
							// Fallback: filename without extension, titlecased
							displayName = path.basename(filename, path.extname(filename))
								.replace(/[-_]/g, ' ')
								.replace(/\b\w/g, (char) => char.toUpperCase());
						}

						// Extract tooltip from <meta name="description">
						const metaMatch = fileContent.match(/<meta\s+name=["']description["']\s+content=["'](.*?)["']/i);
						const tooltip = (metaMatch && metaMatch[1]) ? metaMatch[1].trim() : '';

						// Generate anchor from filename
						const anchor = path.basename(filename, path.extname(filename)).toLowerCase();

						catalogEntries.push({
							filename,
							displayName,
							hasOwnNav,
							anchor,
							tooltip,
							fileSize: stats.size,
							lastModified: stats.mtime.toISOString(),
						});

						processedCount++;
						if (processedCount === htmlFiles.length) {
							next('', { ...args, catalog: catalogEntries });
						}
					});
				});
			});
		});

		// --------------------------------------------------------------------------------
		// PIPELINE STAGE 4: SORT CATALOG BY DISPLAY NAME

		taskList.push((args, next) => {
			const { catalog } = args;

			const sortedCatalog = catalog.sort((a, b) =>
				a.displayName.localeCompare(b.displayName),
			);

			next('', { ...args, catalog: sortedCatalog });
		});

		// --------------------------------------------------------------------------------
		// EXECUTE PIPELINE

		const initialData = {};
		pipeRunner(taskList.getList(), initialData, (err, args) => {
			if (err) {
				callback(err, { catalog: [] });
				return;
			}

			const { catalog } = args;
			callback('', { catalog });
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
