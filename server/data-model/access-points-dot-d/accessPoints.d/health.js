#!/usr/bin/env node
'use strict';
// @concept: [[DataModelExplorer]]

// health.js — what GET /api/health reports: the golden graph's state, from the golden handle. The process being able to
// answer at all is the other half of the report, so this never refuses.
//   connected                                 the handle holds a live connection
//   waiting, goldenContainerName              the handle is retrying; the name says what it is waiting for
//   notConfigured                             no handle: a configuration fault (data-model.js logs which)
// Public, so it carries names only: never a port, a URI or a credential.

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

const moduleFunction = function ({ dotD, passThroughParameters }) {
	const { neo4jDb } = passThroughParameters;

	const serviceFunction = (unusedRequest, callback) => {
		if (!neo4jDb) {
			callback('', { graphState: 'notConfigured' });
			return;
		}
		const { graphState, goldenContainerName } = neo4jDb.graphStateOf();
		callback('', graphState === 'waiting' ? { graphState, goldenContainerName } : { graphState });
	};

	dotD.logList.push(moduleName);
	dotD.library.add(moduleName, serviceFunction);
	return {};
};

module.exports = moduleFunction;
