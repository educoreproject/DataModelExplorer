#!/usr/bin/env node
'use strict';
// @concept: [[ManifestEditor]]
// @concept: [[AccessPointPattern]]

/**
 * ACCESS POINT: MANIFEST SHOW
 *
 * Returns one manifest's membership (in derived build order) by shelling out to
 * educoreForge's `manifestEditor -show --manifest=<key>`. Output shape:
 *   { manifestKey, label, basedOn, note, members:[ { blockId, position, type, subject, version, requires } ] }
 * (position is null -- build order is derived at replay, not stored).
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
			const manifest = args.requestData.manifest;
			if (!manifest) {
				next('manifest-show requires a manifest key', args);
				return;
			}
			next('', { ...args, manifest });
		});

		// --------------------------------------------------------------------------------
		// PIPELINE STAGE 2: SHELL OUT TO educoreForge -show

		taskList.push((args, next) => {
			cliBridge.runManifestEditor(
				'show',
				{ manifest: args.manifest },
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
			// result is the manifest object; the endpoint wraps it in an array
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
