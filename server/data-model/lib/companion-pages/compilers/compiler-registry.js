#!/usr/bin/env node
'use strict';
// @concept: [[CompanionPages]]
//
// The companion page compilers, by the compilerName a compiled companionPage row names. Each entry says what the
// compile reads and how it builds:
//   compilerVersion                   a freshness stamp: raising it makes every stored compile of that compiler stale
//   goldenQueryNameByRowSetName       the companion-compile mapper's Cypher, by the goldenRowSet list it fills
//   compile({ sourceListByRole, goldenRowSet }) -> { compileErrorText, payloadBody }
//     sourceListByRole: the page's current sources with their bytes, { <sourceRole>: [{ sourcePart, fileName,
//     documentDate, contentBuffer }] }
// A page naming a compiler not listed here is refused by name.

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

const { compileJedxDictionary } = require('./jedx-dictionary-compiler');
const jedxDictionaryRules = require('./jedx-dictionary-rules.json');

const compilerByName = Object.freeze({
	jedxDictionary: {
		compilerVersion: jedxDictionaryRules.compilerVersion,
		goldenQueryNameByRowSetName: { propertyRowList: 'jedxPropertyList', schemaReferenceRowList: 'jedxSchemaReferenceList', matchRowList: 'jedxMatchList', rootRowList: 'jedxRootList' },
		compile: ({ sourceListByRole, goldenRowSet }) => {
			const arkansasPilotSourceList = sourceListByRole[jedxDictionaryRules.arkansasPilotSourceRole] || [];
			if (arkansasPilotSourceList.length > 1) {
				return { compileErrorText: `${moduleName}: jedxDictionary takes one ${jedxDictionaryRules.arkansasPilotSourceRole} source, the page has ${arkansasPilotSourceList.length}` };
			}
			const rootRowList = goldenRowSet.rootRowList || [];
			if (rootRowList.length !== 1) {
				return { compileErrorText: `${moduleName}: jedxDictionary needs exactly one JEDx root in the golden, it holds ${rootRowList.length}` };
			}
			return compileJedxDictionary({
				dictionarySourceList: sourceListByRole[jedxDictionaryRules.dictionarySourceRole] || [],
				arkansasPilotSource: arkansasPilotSourceList[0] || null,
				goldenRowSet: { ...goldenRowSet, jedxVersion: rootRowList[0].jedxVersion },
				compileRules: jedxDictionaryRules,
			});
		},
	},
});

module.exports = { compilerByName };
