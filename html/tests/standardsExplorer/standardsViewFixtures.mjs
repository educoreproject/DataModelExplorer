// standardsViewFixtures.mjs — the /api/* answers the Standards view's browser specs (standardsView.spec.mjs,
// standardsAgentNavigation.spec.mjs) give the page, so they need no backend and no graph. The shapes are the ones the
// server's standards-neighbourhood access point and standard-downloads endpoints answer with; the numbers are
// illustrative, not read from a graph.

const FAMILY_CLASS_COUNT_BY_NAME = { CASE: 36, CEDS: 402, CIP: 2538, CLR: 25, CTDL: 136, EdFi: 201, EduAPI: 34, JEDx: 88, LIF: 61, OpenBadges: 22, PESC: 310, SIF: 290 };
const familyItemOf = (standardFamily) => ({
	stableId: `family:${standardFamily}`, name: standardFamily, kind: 'family', description: '', hasChildren: true, standardFamily,
	standardCount: 1, releaseCount: 1, classCount: FAMILY_CLASS_COUNT_BY_NAME[standardFamily], versionList: [{ releaseLabel: standardFamily, version: '1.0', classCount: FAMILY_CLASS_COUNT_BY_NAME[standardFamily] }], version: '1.0',
});
const standardItemOf = (standardFamily) => ({
	stableId: `urn:fixture:${standardFamily}:root`, name: standardFamily, kind: 'standard', description: '', hasChildren: false, standardFamily,
	standardKey: `${standardFamily}@1.0`, releaseLabel: standardFamily, version: '1.0', classCount: FAMILY_CLASS_COUNT_BY_NAME[standardFamily],
});
// ⟪meaningsExplorer⟫ the Meanings walk's top and one meaning, whose one "Expressed in" element walks to family:CEDS in the Standards Explorer
export const FIXTURE_MEANING_STABLE_ID = 'meaning:urn:fixture:card';
export const FIXTURE_EXPRESSED_IN_PATH = ['families:all', 'family:CEDS'];
const meaningNeighbourhoodOf = (stableId) => {
	if (stableId === 'meanings:all') {
		const itemList = [{ stableId: 'meaningHub:CEDS', name: 'CEDS', kind: 'meaningHub', hubName: 'CEDS', standardFamily: 'CEDS', description: 'Common Education Data Standards', hasChildren: true, domainCount: 2, meaningCount: 2 }];
		return { node: { stableId, name: 'Meanings', kind: 'meaningCatalog', description: '' }, ancestorList: [], childGroupList: [{ relationshipType: 'HAS_MEANING_HUB', count: 1, truncated: false, itemList }], mappingList: [] };
	}
	const elementList = [{ stableId: 'urn:fixture:CEDS:element', name: 'Fixture Element', kind: 'property', matchKind: 'exact', matchBasis: 'derived', mappingConfidence: 0.9, ancestorList: [], standardsWalkPathStableIdList: FIXTURE_EXPRESSED_IN_PATH }];
	return {
		node: {
			stableId, name: 'Fixture Meaning', kind: 'meaning', hubName: 'CEDS', standardFamily: 'CEDS', description: '', hasChildren: true, referenceTier: 'property', elementCount: 1,
			uri: 'https://w3id.org/EDUcore/CEDStandards/hub/fixture', uriKind: 'edc', tuple: {}, rangePartList: [], rangeIsIdentity: true, rangeDatatypeList: [],
			expressionCount: 1, expressionsTruncated: false,
			expressedInGroupList: [{ stableId: 'standardGroup:fixture@urn:fixture:card', name: 'Fixture Standard', kind: 'standardGroup', standardKey: 'fixture', standardFamily: 'CEDS', releaseLabel: 'CEDS', version: '1.0', elementCount: 1, matchKindCountList: [{ matchKind: 'exact', elementCount: 1 }], elementList, elementsTruncated: false }],
		},
		ancestorList: [], childGroupList: [], mappingList: [],
	};
};
// ⟪meaningsPolish review B1, S3, S6⟫ a hub with two domains (one holding two meanings and its own term, one holding its own term only), each domain's level,
// and a retired property-level id the server refuses (HTTP 400, its words)
export const FIXTURE_DOMAIN_STABLE_ID = 'meaningDomain:urn:fixture:domain';
export const FIXTURE_TERM_ONLY_DOMAIN_STABLE_ID = 'meaningDomain:urn:fixture:termOnlyDomain';
export const FIXTURE_RETIRED_STABLE_ID = 'meaningProperty:urn:fixture:domain@urn:fixture:property';
export const FIXTURE_RETIRED_REFUSAL_TEXT = "standards-neighbourhood: 'meaningProperty:urn:fixture:domain@urn:fixture:property' is no longer a level of the meanings walk (it is hub, domain, meaning); open its domain, meaningDomain:urn:fixture:domain";
const fixtureMeaningRowOf = (cardName, extraFields) => ({ stableId: `meaning:urn:fixture:${cardName}`, name: cardName, kind: 'meaning', hubName: 'CEDS', standardFamily: 'CEDS', description: '', hasChildren: true, referenceTier: 'property', elementCount: 0, ...extraFields });
const fixtureDomainRowList = [
	{ stableId: FIXTURE_DOMAIN_STABLE_ID, name: 'Fixture Domain', kind: 'meaningDomain', hubName: 'CEDS', standardFamily: 'CEDS', description: '', hasChildren: true, meaningCount: 2, mappedMeaningCount: 1, termMeaningCount: 1, nativeId: { cedsId: 'C000001' } },
	{ stableId: FIXTURE_TERM_ONLY_DOMAIN_STABLE_ID, name: 'Fixture Term-Only Domain', kind: 'meaningDomain', hubName: 'CEDS', standardFamily: 'CEDS', description: '', hasChildren: true, meaningCount: 0, mappedMeaningCount: 0, termMeaningCount: 1, nativeId: { cedsId: 'C000002' } },
];
const fixtureMeaningLevelOf = (stableId) => {
	if (stableId === 'meaningHub:CEDS') {
		return { node: { stableId, name: 'CEDS', kind: 'meaningHub', hubName: 'CEDS', standardFamily: 'CEDS', description: 'Common Education Data Standards', domainCount: 2, meaningCount: 2 }, ancestorList: [], childGroupList: [{ relationshipType: 'HAS_MEANING_DOMAIN', count: 2, truncated: false, itemList: fixtureDomainRowList }], mappingList: [] };
	}
	const domainRow = fixtureDomainRowList.find((oneRow) => oneRow.stableId === stableId);
	const meaningList = domainRow.meaningCount ? [fixtureMeaningRowOf('First Meaning', { elementCount: 3 }), fixtureMeaningRowOf('Second Meaning', {})] : [];
	const termList = [fixtureMeaningRowOf(domainRow.name, { referenceTier: 'term', termKind: 'class', stableId: `meaning:urn:fixture:term:${domainRow.name}` })];
	return {
		node: { ...domainRow, hasChildren: undefined },
		ancestorList: [],
		childGroupList: [
			{ relationshipType: 'HAS_MEANING', count: meaningList.length, truncated: false, itemList: meaningList },
			{ relationshipType: 'HAS_TERM_MEANING', count: termList.length, truncated: false, itemList: termList },
		].filter((oneGroup) => oneGroup.count > 0),
		mappingList: [],
	};
};
const neighbourhoodOf = (stableId) => {
	if (stableId === 'meanings:all' || stableId === FIXTURE_MEANING_STABLE_ID) return meaningNeighbourhoodOf(stableId);
	if (stableId === 'meaningHub:CEDS' || fixtureDomainRowList.some((oneRow) => oneRow.stableId === stableId)) return fixtureMeaningLevelOf(stableId);
	if (stableId === 'families:all') {
		const itemList = Object.keys(FAMILY_CLASS_COUNT_BY_NAME).map(familyItemOf);
		return { node: { stableId, name: 'Standards', kind: 'familyCatalog', description: '' }, ancestorList: [], childGroupList: [{ relationshipType: 'HAS_FAMILY', count: itemList.length, truncated: false, itemList }], mappingList: [] };
	}
	const standardFamily = stableId.replace(/^family:/, '');
	const itemList = [standardItemOf(standardFamily)];
	return { node: { stableId, name: standardFamily, kind: 'family', standardFamily, description: '' }, ancestorList: [], childGroupList: [{ relationshipType: 'HAS_STANDARD', count: 1, truncated: false, itemList }], mappingList: [], releaseList: [] };
};
const downloadEntryOf = (standardFamily, facet) => ({
	downloadId: `${standardFamily}-${facet}`, family: standardFamily, group: standardFamily, standardKey: `${standardFamily}@1.0`, standardName: standardFamily, version: '1.0',
	facet, available: true, byteSize: 123456, ...(facet === 'graph' ? { roundTrip: { inventedTotal: 0, lostTotal: 0, contentGapTotal: 0, explicitlyOmittedTotal: 0 } } : {}),
});
const DOWNLOADS_MANIFEST = {
	graphName: 'fixture-graph', generatedAt: '2026-11-03', graphContractSha256: 'f'.repeat(64),
	entryList: ['CEDS', 'PESC', 'SIF'].flatMap((standardFamily) => [downloadEntryOf(standardFamily, 'source'), downloadEntryOf(standardFamily, 'graph')]),
};

export const answerApi = async (route) => {
	const requestUrl = new URL(route.request().url());
	const body = route.request().postDataJSON?.() || {};
	const json = (payload, headers = {}) => route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(payload) });
	if (requestUrl.pathname.endsWith('/api/login')) return json([{ username: 'fixture', first: 'Fixture', last: 'User', role: 'user' }], { authtoken: 'fixture-token', 'access-control-expose-headers': 'authtoken' });
	if (requestUrl.pathname.endsWith('/api/standards-neighbourhood')) {
		if ((body.stableIdList || [body.stableId]).includes(FIXTURE_RETIRED_STABLE_ID)) return route.fulfill({ status: 400, contentType: 'text/html', body: FIXTURE_RETIRED_REFUSAL_TEXT });
		if (body.action === 'node') return json([neighbourhoodOf(body.stableId)]);
		if (body.action === 'pathSummary') return json([{ nodeSummaryList: body.stableIdList.map((oneId) => neighbourhoodOf(oneId).node) }]);
		if (body.action === 'versionCounterparts') return json([{ stableId: body.stableId, counterpartList: [] }]);
	}
	if (requestUrl.pathname.endsWith('/api/standard-downloads-manifest')) return json([DOWNLOADS_MANIFEST]);
	if (requestUrl.pathname.endsWith('/api/standard-downloads-publications')) return json([{ publicLabel: 'fixture-publication', manifestRefId: 'e'.repeat(64), generatedAt: '2026-11-03', entryList: [] }]);
	return json([]);
};

// only the API: dev-server module URLs can hold an /api/ segment too (eg a package's api/ folder)
export const isApiUrl = (requestUrl) => requestUrl.pathname.startsWith('/api/');
