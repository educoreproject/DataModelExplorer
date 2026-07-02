#!/usr/bin/env node
'use strict';
// @concept: [[ManifestEditor]]
// @concept: [[AccessPointPattern]]

/**
 * ACCESS POINT: MANIFEST DIFF
 *
 * Block-membership delta between two manifests via `manifestEditor -diff`. Output:
 *   { from, to, added:[blockId], removed:[blockId], common:[blockId] }
 * (block-id level; the client joins against the catalog for type/subject).
 *
 * inputData: { from, to }
 */

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const qt = require('qtools-functional-library');
const { pipeRunner, taskListPlus, mergeArgs, forwardArgs } = new require(
	'qtools-asynchronous-pipe-plus',
)();

const cliBridge = require('../../../lib/educoreforge-cli-bridge');

//START OF moduleFunction() ============================================================

const moduleFunction = function ({ dotD, passThroughParameters }) {
	// ================================================================================
	// INITIALIZATION AND DEPENDENCY INJECTION

	const { xLog, getConfig, rawConfig, commandLineParameters } = process.global;
	const localConfig = getConfig(moduleName);

	const { sqlDb, hxAccess, dataMapping } = passThroughParameters;

	// ================================================================================
	// SERVICE FUNCTION

	const serviceFunction = (requestData, callback) => {
		if (typeof requestData == 'function') {
			callback = requestData;
			requestData = {};
		}

		const taskList = new taskListPlus();

		// --------------------------------------------------------------------------------
		// PIPELINE STAGE 1: VALIDATE INPUT

		taskList.push((args, next) => {
			const { from, to } = args.requestData;
			if (!from || !to) {
				next('manifest-diff requires both from and to manifest keys', args);
				return;
			}
			next('', { ...args, from, to });
		});

		// --------------------------------------------------------------------------------
		// PIPELINE STAGE 2: SHELL OUT TO educoreForge -diff

		taskList.push((args, next) => {
			cliBridge.runManifestEditor(
				'diff',
				{ from: args.from, to: args.to },
				(err, result) => {
					if (err) {
						next(err, args);
						return;
					}
					next('', { ...args, result });
				},
			);
		});

		// --------------------------------------------------------------------------------
		// EXECUTE PIPELINE

		const initialData = { requestData };
		pipeRunner(taskList.getList(), initialData, (err, args) => {
			if (err) {
				callback(err, {});
				return;
			}
			callback('', args.result);
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
