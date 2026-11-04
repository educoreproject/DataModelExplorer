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
const neighbourhoodOf = (stableId) => {
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
