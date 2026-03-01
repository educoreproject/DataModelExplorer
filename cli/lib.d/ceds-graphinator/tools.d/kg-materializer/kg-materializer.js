#!/usr/bin/env node
'use strict';
process.noDeprecation = true;

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const qt = require('qtools-functional-library');

//START OF moduleFunction() ============================================================
const moduleFunction =
	({ moduleName } = {}) =>
	({ dotD, passThroughParameters } = {}) => {
		const { xLog, getConfig, commandLineParameters } = process.global;

		const { addToDispatchMap, actionSwitchesList, toolMetadataGenerator } =
			passThroughParameters;

		// Load kg-materializer tools
		require('./lib/materialize-json-ld/materialize-json-ld')({ dotD, employerModuleName: moduleName, passThroughParameters });
		require('./lib/materialize-cypher/materialize-cypher')({ dotD, employerModuleName: moduleName, passThroughParameters });
		require('./lib/materialize-schema/materialize-schema')({ dotD, employerModuleName: moduleName, passThroughParameters });
		require('./lib/materialize-diagram/materialize-diagram')({ dotD, employerModuleName: moduleName, passThroughParameters });
		require('./lib/materialize-validate/materialize-validate')({ dotD, employerModuleName: moduleName, passThroughParameters });
	};

//END OF moduleFunction() ============================================================

module.exports = moduleFunction({ moduleName });
