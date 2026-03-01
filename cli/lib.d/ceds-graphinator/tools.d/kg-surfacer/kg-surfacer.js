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

		// Load kg-surfacer tools
		require('./lib/kg-view/kg-view')({ dotD, employerModuleName: moduleName, passThroughParameters });
		require('./lib/kg-scope/kg-scope')({ dotD, employerModuleName: moduleName, passThroughParameters });
		require('./lib/kg-collapse/kg-collapse')({ dotD, employerModuleName: moduleName, passThroughParameters });
		require('./lib/kg-paths/kg-paths')({ dotD, employerModuleName: moduleName, passThroughParameters });
		require('./lib/surface-export/surface-export')({ dotD, employerModuleName: moduleName, passThroughParameters });
	};

//END OF moduleFunction() ============================================================

module.exports = moduleFunction({ moduleName });
