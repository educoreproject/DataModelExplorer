#!/usr/bin/env node
'use strict';
// @concept: [[ManifestEditor]]
// @concept: [[AccessPointPattern]]

/**
 * ACCESS POINT: MANIFEST VALIDATE
 *
 * Bridge-closure validation of one manifest via educoreForge's `manifestEditor -validate`.
 * For pure/new-model manifests this is a real check: every block's blockId-requires must
 * be present AND ordered earlier. Output shape: { wellFormed, violations:[...] } with
 * human-readable violations. LEGACY (bridge-era, subject-form requires) manifests return
 * { wellFormed:false, reason:'legacy subject-form requires ...' } -- an HONEST verdict,
 * NOT an error to retry. We pass the verdict through as data either way.
 *
 * inputData: { manifest }
 * returns:   { wellFormed, violations?, reason? }
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
				next('manifest-validate requires a manifest key', args);
				return;
			}
			next('', { ...args, manifest });
		});

		// --------------------------------------------------------------------------------
		// PIPELINE STAGE 2: SHELL OUT TO educoreForge -validate

		taskList.push((args, next) => {
			cliBridge.runManifestEditor(
				'validate',
				{ manifest: args.manifest },
				(err, result) => {
					if (err) {
						next(err, args);
						return;
					}
					// A {wellFormed:false} verdict (incl. the legacy reason) is a normal
					// result, not an error -- pass it straight through.
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
