#!/usr/bin/env node
'use strict';
// @concept: [[ManifestEditor]]
// @concept: [[AccessPointPattern]]

/**
 * ACCESS POINT: MANIFEST COMBINE (derive a new immutable manifest)
 *
 * Composes a NEW content-addressed manifest from a block set (and an optional base)
 * by shelling out to educoreForge's `manifestEditor -combine`. Manifests are immutable:
 * "editing" is deriving a new manifest whose basedOn points at the parent. Nothing is
 * mutated. combine() single-fires; on a missing block it errors ONCE with the FULL
 * missing-blockId list, which we surface verbatim to the client.
 *
 * inputData: { base?, set:[blockId,...], label?, note? }
 * returns:   the combine() result (carries the new manifestKey)
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
			const set = args.requestData.set;
			if (!Array.isArray(set) || set.length === 0) {
				next('manifest-combine requires a non-empty block set', args);
				return;
			}
			next('', { ...args, set });
		});

		// --------------------------------------------------------------------------------
		// PIPELINE STAGE 2: SHELL OUT TO educoreForge -combine

		taskList.push((args, next) => {
			const params = {
				base: args.requestData.base,
				set: args.set, // array -> comma-joined by the bridge
				label: args.requestData.label,
				note: args.requestData.note,
			};

			cliBridge.runManifestEditor('combine', params, (err, result) => {
				if (err) {
					// combine's missing-block error text carries the FULL list; pass through.
					next(err, args);
					return;
				}
				next('', { ...args, result });
			});
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
