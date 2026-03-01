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

		// Load ontology navigation tools
		require('./lib/stats/stats')({ dotD, employerModuleName: moduleName, passThroughParameters });
		require('./lib/lookup/lookup')({ dotD, employerModuleName: moduleName, passThroughParameters });
		require('./lib/explore/explore')({ dotD, employerModuleName: moduleName, passThroughParameters });
		require('./lib/option-set/option-set')({ dotD, employerModuleName: moduleName, passThroughParameters });
		require('./lib/property/property')({ dotD, employerModuleName: moduleName, passThroughParameters });
		require('./lib/path/path')({ dotD, employerModuleName: moduleName, passThroughParameters });
		require('./lib/search/search')({ dotD, employerModuleName: moduleName, passThroughParameters });
		require('./lib/compare/compare')({ dotD, employerModuleName: moduleName, passThroughParameters });
		require('./lib/data-spec/data-spec')({ dotD, employerModuleName: moduleName, passThroughParameters });
		require('./lib/shared/shared')({ dotD, employerModuleName: moduleName, passThroughParameters });
		require('./lib/list-classes/list-classes')({ dotD, employerModuleName: moduleName, passThroughParameters });
		require('./lib/list-option-sets/list-option-sets')({ dotD, employerModuleName: moduleName, passThroughParameters });
		require('./lib/list-properties/list-properties')({ dotD, employerModuleName: moduleName, passThroughParameters });
	};

//END OF moduleFunction() ============================================================

module.exports = moduleFunction({ moduleName });
