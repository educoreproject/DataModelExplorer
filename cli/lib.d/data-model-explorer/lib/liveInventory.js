'use strict';

// liveInventory.js — what this graph holds, read from the graph at call time (campaign P1, 2026-10-06). Two questions
// every verb used to answer with a literal: which `_source` values a `standard` filter may name (W-D-2; the tool
// descriptions once listed CTDL, SEDM, LIF… — standards this graph does not hold), and which standard is the hub
// (W-D-5/8/9; the verbs once wrote 'CEDS'). Both answer through callback(errorText) or callback('', answer); an input the
// graph cannot satisfy is answered as { refusal } for the verb to pass on, never as an empty filter.

const { runCypherQuery } = require('./runCypherQuery');
const {
	LIVE_SOURCE_LIST_CYPHER,
	STANDARD_FAMILY_LIST_CYPHER,
	STANDARD_FILTER_FAMILY_RULE,
	HUB_STANDARD_SOURCE_CYPHER,
	refusalFor,
} = require('./toolPayloadContract');

// resolveStandardFilter — callback('', { sourceList }) with sourceList null (no filter) or the _source values to keep;
// callback('', { refusal }) when the text names no live _source and no declared family
const resolveStandardFilter = (session, verbName, standardText, callback) => {
	if (standardText === undefined || standardText === null) {
		callback('', { sourceList: null });
		return;
	}
	runCypherQuery(session, LIVE_SOURCE_LIST_CYPHER, {}, (sourceError, sourceResult) => {
		if (sourceError) {
			callback(`reading the live _source list failed: ${sourceError}`);
			return;
		}
		const liveSourceList = sourceResult.records.map((sourceRecord) => sourceRecord.get('source'));
		if (typeof standardText === 'string' && liveSourceList.indexOf(standardText) !== -1) {
			callback('', { sourceList: [standardText] });
			return;
		}
		runCypherQuery(session, STANDARD_FAMILY_LIST_CYPHER, {}, (familyError, familyResult) => {
			if (familyError) {
				callback(`reading the standard families failed: ${familyError}`);
				return;
			}
			const familyRecord = familyResult.records.find((oneRecord) => oneRecord.get('family') === standardText);
			if (familyRecord && STANDARD_FILTER_FAMILY_RULE === 'expandFamilyToReleases') {
				callback('', { sourceList: familyRecord.get('sourceList'), expandedFromFamily: standardText });
				return;
			}
			const familyText = familyResult.records.length === 0
				? " This build's StandardDefinitions carry no standardFamily, so a family name (such as SIF or PESC) cannot be expanded: name a release."
				: ` Families this build declares: ${familyResult.records.map((oneRecord) => oneRecord.get('family')).join(', ')}.`;
			const shownText = typeof standardText === 'string' ? `'${standardText}'` : 'a standard flag with no value';
			callback('', {
				refusal: refusalFor(verbName, 'unknownStandard',
					`standard ${shownText} is not a _source value in this graph (a _source value is what dme_list_standards returns as \`source\`).${familyText} Valid values: ${liveSourceList.join(', ')}.`,
					liveSourceList),
			});
		});
	});
};

// resolveHubIdentity — callback('', { hubSource, hubName }) from the one :HubDefinition; zero or several is an error by
// name (the graph does not say which standard is the hub, and no verb may guess)
const resolveHubIdentity = (session, callback) => {
	runCypherQuery(session, HUB_STANDARD_SOURCE_CYPHER, {}, (hubError, hubResult) => {
		if (hubError) {
			callback(`reading the HubDefinition failed: ${hubError}`);
			return;
		}
		if (hubResult.records.length !== 1) {
			callback(`this graph holds ${hubResult.records.length} :HubDefinition nodes; exactly one names the hub standard`);
			return;
		}
		const hubRecord = hubResult.records[0];
		if (!hubRecord.get('hubSource') || !hubRecord.get('hubName')) {
			callback('the :HubDefinition lacks _source or hubName; the hub standard cannot be named');
			return;
		}
		callback('', { hubSource: hubRecord.get('hubSource'), hubName: hubRecord.get('hubName') });
	});
};

module.exports = Object.freeze({ resolveStandardFilter, resolveHubIdentity });
