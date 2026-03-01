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

		// Load kg-classifier tools
		require('./lib/classify-data/classify-data')({ dotD, employerModuleName: moduleName, passThroughParameters });
		require('./lib/classify-export/classify-export')({ dotD, employerModuleName: moduleName, passThroughParameters });
		require('./lib/classify-import/classify-import')({ dotD, employerModuleName: moduleName, passThroughParameters });
	};

//END OF moduleFunction() ============================================================

module.exports = moduleFunction({ moduleName });
