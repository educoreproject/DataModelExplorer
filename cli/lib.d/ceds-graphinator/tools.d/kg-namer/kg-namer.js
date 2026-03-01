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

		// Load kg-namer tools
		require('./lib/connection-analysis/connection-analysis')({ dotD, employerModuleName: moduleName, passThroughParameters });
		require('./lib/name-suggest/name-suggest')({ dotD, employerModuleName: moduleName, passThroughParameters });
		require('./lib/name-export/name-export')({ dotD, employerModuleName: moduleName, passThroughParameters });
		require('./lib/name-import/name-import')({ dotD, employerModuleName: moduleName, passThroughParameters });
		require('./lib/schema-upload/schema-upload')({ dotD, employerModuleName: moduleName, passThroughParameters });
		require('./lib/thing-name-suggest/thing-name-suggest')({ dotD, employerModuleName: moduleName, passThroughParameters });
		require('./lib/detail-name-suggest/detail-name-suggest')({ dotD, employerModuleName: moduleName, passThroughParameters });
	};

//END OF moduleFunction() ============================================================

module.exports = moduleFunction({ moduleName });
