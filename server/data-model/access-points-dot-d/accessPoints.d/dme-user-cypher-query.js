#!/usr/bin/env node
'use strict';
// @concept: [[DataModelExplorer]]
// @concept: [[MultiTenant]]
// @concept: [[AccessPointPattern]]

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const qt = require('qtools-functional-library');
const { pipeRunner, taskListPlus, mergeArgs, forwardArgs } = new require(
	'qtools-asynchronous-pipe-plus',
)();

//START OF moduleFunction() ============================================================

const moduleFunction = function ({ dotD, passThroughParameters }) {
	// ================================================================================
	// INITIALIZATION AND DEPENDENCY INJECTION

	const { xLog, getConfig, rawConfig, commandLineParameters } = process.global;

	// The access-points loader injects the whole library, so this leg can delegate
	// to the standard read path by name (see access-points-dot-d.js).
	const { accessPointsDotD } = passThroughParameters;

	// ================================================================================
	// SERVICE FUNCTION
	//
	// Phase 1 (mode-aware proxy): the user query leg exists as its own access point
	// and its own endpoint, but for now it delegates to the standard read path. This
	// proves the user leg is genuinely on its own code path (its endpoint is hit, this
	// access point runs) while returning results identical to Standard mode, because
	// the same graph answers underneath. Phase 2 replaces the delegation below with a
	// real, authenticated user leg (resolve userRefId; later, a per-user connection).
	// That delegation line IS the proxy shim Phase 2 removes.

	const serviceFunction = (queryData, callback) => {
		const standardReadPath = accessPointsDotD['dme-cypher-query'];

		if (typeof standardReadPath !== 'function') {
			callback(
				'dme-user-cypher-query: the standard read path (dme-cypher-query) is not available',
				[],
			);
			return;
		}

		xLog.status(
			'[graphMode:user] dme-user-cypher-query proxying to standard read path',
		);

		standardReadPath(queryData, callback);
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
