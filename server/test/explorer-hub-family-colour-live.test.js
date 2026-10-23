'use strict';
// explorer-hub-family-colour-live.test.js — ⟪lane zbE, E2-5⟫ every hub the live graph holds is drawn in its own family's
// colours in the standards explorer. A family absent from explorerVocabulary.familyStyleByName is drawn in neutral grey
// (familyStyleOf), which is right for a newly loaded non-hub standard and wrong for a hub: hub anchors are drawn with the
// family's `fill`, so a hub without an entry is indistinguishable from an unknown family (CTDL, measured by R6).
//   1. every :HubDefinition's family (its StandardDefinition.standardFamily) has a familyStyleByName entry with color,
//      fill and tint;
//   2. RED TWIN: the vocabulary with that hub's entry removed fails assertion 1.
//
// Reads the graph the DEV pointer names (liveGraphHarness). Run: /usr/local/bin/node server/test/explorer-hub-family-colour-live.test.js

const fs = require('fs');
const os = require('os');
const path = require('path');

const codeRootPath = path.join(__dirname, '..', '..');
const harness = require(path.join(codeRootPath, 'cli/lib.d/data-model-explorer/test/lib/liveGraphHarness'))({ gateTitle: 'E2-5 every hub has a family colour' });
const { assert, runQuery, finish, taskListPlus, pipeRunner } = harness;
const vocabularyFilePath = path.join(codeRootPath, 'html', 'components', 'standardsExplorer', 'explorerVocabulary.js');

const HUB_FAMILY_CYPHER = 'MATCH (h:HubDefinition) OPTIONAL MATCH (d:StandardDefinition {sourceKey: h._source}) RETURN h.hubName AS hubName, d.standardFamily AS standardFamily ORDER BY hubName';
const REQUIRED_STYLE_NAME_LIST = ['color', 'fill', 'tint'];

const importVocabularyFrom = (sourceText, fileTag, callback) => {
	const temporaryFilePath = path.join(os.tmpdir(), `explorerVocabulary-${process.pid}-${fileTag}.mjs`);
	fs.writeFileSync(temporaryFilePath, sourceText);
	import(temporaryFilePath).then(
		(vocabularyModule) => { fs.unlinkSync(temporaryFilePath); callback('', vocabularyModule); },
		(importError) => { fs.unlinkSync(temporaryFilePath); callback(`importing the vocabulary failed: ${importError.message}`); },
	);
};

// uncoloredHubListOf — the hubs whose family has no complete style entry
const uncoloredHubListOf = (vocabulary, hubFamilyRowList) => hubFamilyRowList.filter((hubRow) => {
	const familyStyle = vocabulary.familyStyleByName[hubRow.standardFamily];
	return !familyStyle || REQUIRED_STYLE_NAME_LIST.some((styleName) => typeof familyStyle[styleName] !== 'string');
}).map((hubRow) => `${hubRow.hubName} (family ${hubRow.standardFamily})`);

const vocabularySourceText = fs.readFileSync(vocabularyFilePath, 'utf8');
const taskList = new taskListPlus();
taskList.push((args, next) => runQuery(HUB_FAMILY_CYPHER, {}, (err, hubFamilyRowList) => {
	if (err) { next(err, args); return; }
	if (hubFamilyRowList.length === 0) { next('the graph holds no :HubDefinition; nothing to colour', args); return; }
	const familylessHubList = hubFamilyRowList.filter((hubRow) => !hubRow.standardFamily).map((hubRow) => hubRow.hubName);
	if (familylessHubList.length) { next(`hub(s) with no StandardDefinition family: ${familylessHubList.join(', ')}`, args); return; }
	next('', { ...args, hubFamilyRowList });
}));
taskList.push((args, next) => importVocabularyFrom(vocabularySourceText, 'real', (err, vocabulary) => {
	if (err) { next(err, args); return; }
	const uncoloredHubList = uncoloredHubListOf(vocabulary, args.hubFamilyRowList);
	assert(`every hub in the graph (${args.hubFamilyRowList.map((hubRow) => hubRow.hubName).join(', ')}) has a family colour with ${REQUIRED_STYLE_NAME_LIST.join(', ')}`, uncoloredHubList.length === 0, uncoloredHubList.join(', '));
	next('', args);
}));
// red twin: drop the last hub's family entry from the module source
taskList.push((args, next) => {
	const twinFamilyName = args.hubFamilyRowList[args.hubFamilyRowList.length - 1].standardFamily;
	const entryPattern = new RegExp(`^\\s*${twinFamilyName}: \\{[^\\n]*\\},?\\n`, 'm');
	if (!entryPattern.test(vocabularySourceText)) {
		assert(`RED TWIN: the ${twinFamilyName} entry is found in the source to remove`, false, 'entry not found; the twin is blind');
		next('', args);
		return;
	}
	importVocabularyFrom(vocabularySourceText.replace(entryPattern, ''), 'twin', (err, twinVocabulary) => {
		if (err) { next(err, args); return; }
		assert(`RED TWIN: without the ${twinFamilyName} entry the check fails`, uncoloredHubListOf(twinVocabulary, args.hubFamilyRowList).length === 1);
		next('', args);
	});
});
pipeRunner(taskList.getList(), {}, (err) => finish(err));
