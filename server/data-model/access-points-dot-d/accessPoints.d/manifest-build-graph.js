#!/usr/bin/env node
'use strict';
// @concept: [[ManifestEditor]]
// @concept: [[AccessPointPattern]]

/**
 * ACCESS POINT: MANIFEST BUILD GRAPH
 *
 * Builds (replays) a graph from a saved manifest via educoreForge's
 * `edf-replay -buildGraph --manifest=<key> --destination=<name> [--owner=<:golden|:user>]`.
 * edf-replay hardcodes the store path and takes NO --db (the bridge handles that).
 * What happens to the built graph downstream is OUT of scope for this tool.
 *
 * inputData: { manifest, destination, owner? }
 * returns:   the replay result JSON (nodesMerged, edgesMerged, danglingRefs count, etc.)
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
			const { manifest, destination } = args.requestData;
			if (!manifest) {
				next('manifest-build-graph requires a manifest key', args);
				return;
			}
			if (!destination) {
				next('manifest-build-graph requires a destination', args);
				return;
			}
			next('', { ...args, manifest, destination });
		});

		// --------------------------------------------------------------------------------
		// PIPELINE STAGE 2: SHELL OUT TO educoreForge edf-replay -buildGraph (NO --db)

		taskList.push((args, next) => {
			const params = {
				manifest: args.manifest,
				destination: args.destination,
				owner: args.requestData.owner,
			};

			cliBridge.runEdfReplay('buildGraph', params, (err, result) => {
				if (err) {
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
