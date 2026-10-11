'use strict';

// required-label-probe.js — A11 / W-E-8 (campaign P4b, 2026-10-07). A page whose mapper reads labels the graph does not
// carry used to return [] with HTTP 200, which reads as "no such data" when the truth is "this graph has no such
// structure". A mapper now DECLARES the labels its Cypher reads (requiredLabelList), and its access point asks this probe
// first: the probe runs `CALL db.labels()` once per connection and refuses BY NAME, naming every absent label.
//
//   makeRequiredLabelProbe({ neo4jDb, ownerName, requiredLabelList, absentReason }) → probe(callback)
//     callback('', { liveLabelList })                      every required label is live
//     callback('<ownerName>: ... labels absent: A, B ...')   otherwise (absentReason says why, in the owner's words)
//
// The live label list is cached after the first successful read: a graph's labels change only when the server is
// pointed at another graph, and that is a restart.

const makeRequiredLabelProbe = ({ neo4jDb, ownerName, requiredLabelList, absentReason }) => {
	if (typeof ownerName !== 'string' || ownerName === '') {
		throw new Error('required-label-probe: ownerName is REQUIRED (it names the refusal)');
	}
	if (!Array.isArray(requiredLabelList) || requiredLabelList.length === 0) {
		throw new Error(`required-label-probe: ${ownerName} declared no requiredLabelList`);
	}
	let cachedLiveLabelList = null;

	const judge = (liveLabelList, callback) => {
		const absentLabelList = requiredLabelList.filter((oneLabel) => liveLabelList.indexOf(oneLabel) === -1);
		if (absentLabelList.length) {
			callback(`${ownerName}: this graph does not carry the labels this page reads (required labels absent: ${absentLabelList.join(', ')})${absentReason ? `; ${absentReason}` : ''}`);
			return;
		}
		callback('', { liveLabelList });
	};

	return (callback) => {
		if (!neo4jDb) {
			callback(`${ownerName}: Neo4j database is not available. Check dataModelExplorerSearch configuration.`);
			return;
		}
		if (cachedLiveLabelList) {
			judge(cachedLiveLabelList, callback);
			return;
		}
		neo4jDb.runQuery('CALL db.labels() YIELD label RETURN label', {}, (labelError, labelRowList) => {
			if (labelError) {
				callback(`${ownerName}: could not read the graph's labels: ${labelError}`);
				return;
			}
			cachedLiveLabelList = labelRowList.map((oneRow) => oneRow.label);
			judge(cachedLiveLabelList, callback);
		});
	};
};

module.exports = { makeRequiredLabelProbe };
