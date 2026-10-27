#!/usr/bin/env node
// @concept: [[SpecificationViewer]]
// @concept: [[CedsHub]]
//
// The CEDS concept view on the rebuilt snapshot: concepts are found by node
// identity (stableId), spokes are labelled with their structural place and
// approved per node, and mappings saved by earlier versions are carried forward.
//
//   node html/test/specificationViewer/concepts.test.mjs

import { loadStore, makeAssert } from './store-harness.mjs';

const { assert, done } = makeAssert();

// Browser storage as an earlier version left it: the OLD storage key, with
// mappings under the OLD path keys.
const storage = {
	'schemaVerifier.userEquivalents': JSON.stringify({
		'EdFi::School.City': [{ standard: 'CEDS', name: 'Address City', sourceStandard: 'Ed-Fi', sourceName: 'City', sourcePath: 'School.City' }],
		'I.G.1': [{ standard: 'HR Open', name: 'LegalName', sourceName: 'Legal Name' }],
	}),
};
const { store, mod } = await loadStore({ storage });
const { elementCurationKey } = mod;

await store.loadSpecifications();
const open = async (source) => {
	store.selectSpec(store.specs.find((s) => s.source === source));
	await store.loadSpecElements(source);
	return store.elements;
};

// ---- old storage key, old path keys ---------------------------------------------------------------
assert(store.userEquivalents['I.G.1']?.length === 1, 'mappings saved under the old Schema Verifier storage key are loaded');
let els = await open('EdFi');
const school = els.find((e) => e.stableId === 'edfi:field/School.City');
assert(school && school.trail.join('/') === 'School', `Ed-Fi School.City: a property of the School entity (${school && school.path})`);
assert(
	!store.userEquivalents['EdFi::School.City'] && store.userEquivalents[elementCurationKey(school)]?.[0]?.name === 'Address City',
	`opening Ed-Fi moved the old path-keyed mapping onto ${elementCurationKey(school)}`,
);

// ---- concept by stableId ----------------------------------------------------------------------------
let concepts = await store.lookupCedsConcepts(school);
const city = concepts.find((c) => c.anchor.name === 'Address City');
assert(city && city.selfRel === 'EXACT_MATCH' && city.domain?.name === 'Location Address', 'Ed-Fi School.City → exact → CEDS Location Address › Address City');
assert(!city.spokes.some((s) => s.stableId === school.stableId), 'the element itself is not one of its own spokes');
const sifSpokes = city.spokes.filter((s) => s.source === 'SIF');
assert(sifSpokes.length > 5 && sifSpokes.every((s) => s.stableId && s.path.includes(' › ')), `SIF spokes carry stableIds and structural paths (e.g. ${sifSpokes[0] && sifSpokes[0].path})`);
assert(new Set(city.spokes.map((s) => `${s.source}|${s.stableId}`)).size === city.spokes.length, `one row per node across ${city.spokes.length} spokes`);

// ---- a SIF field finds its concept by identity, not by its folded path -------------------------------
els = await open('SIF');
const sifCity = els.find((e) => e.stableId === sifSpokes[0].stableId);
concepts = await store.lookupCedsConcepts(sifCity);
assert(concepts.some((c) => c.anchor.name === 'Address City'), `SIF ${sifCity && sifCity.path} → CEDS Address City`);

// ---- a CEDS element is its own concept (by CEDS id) ---------------------------------------------------
els = await open('CEDS');
const cedsCity = els.find((e) => e.kind === 'property' && e.sourceId === 'P000040');
concepts = await store.lookupCedsConcepts(cedsCity);
assert(concepts.length >= 1 && concepts.every((c) => c.isSelf && c.anchor.id === 'P000040'), `CEDS Address City (P000040) anchors ${concepts.length} concept(s) with ${concepts[0] && concepts[0].spokes.length} spokes`);

// ---- a code reaches its concept through its property ----------------------------------------------------
els = await open('LIF');
// the framework's own language (CompetencyFramework › Competency › language is a second, nested one)
const language = els.find((e) => e.kind === 'property' && e.name === 'language' && e.trail.join('/') === 'CompetencyFramework');
const languageCodes = await store.loadCodeList(language);
const tat = languageCodes && languageCodes.values.find((v) => v.name === 'Tat');
concepts = tat ? await store.lookupCedsConcepts(store.codeValueElement(language, tat)) : [];
assert(
	concepts.length === 1 && concepts[0].anchor.name === 'Tatar' && concepts[0].property?.name === 'Has Competency Framework Language',
	`LIF code Tat (from the language code list) → CEDS Tatar under Has Competency Framework Language`,
);

// ---- spoke approval is per node and exports the node's identity ------------------------------------------
const staffSpoke = city.spokes.find((s) => s.source === 'EdFi' && s.path === 'Staff › City');
const cedsTarget = { standard: 'CEDS', name: 'Address City', sourceId: 'P000040', targetPath: 'Location Address.Address City', rel: 'EXACT_MATCH' };
store.addUserEquivalent(elementCurationKey(staffSpoke), cedsTarget, { standard: 'Ed-Fi', name: 'City', sourceId: staffSpoke.stableId, path: staffSpoke.path });
assert(store.hasUserEquivalent('EdFi::edfi:field/Staff.City', cedsTarget), 'approving Ed-Fi Staff › City is recorded under its node');
assert(!store.hasUserEquivalent('EdFi::edfi:field/Contact.City', cedsTarget), 'Ed-Fi Contact › City (same name, other entity) is not approved by it');
const row = store.allMappings.find((m) => m.mappingKey === 'EdFi::edfi:field/Staff.City');
assert(row && row.sourceId === 'edfi:field/Staff.City' && row.targetName === 'Address City', 'export row carries the source node stableId → CEDS Address City');
assert(!!storage['specificationViewer.userEquivalents'], 'mappings now persist under the Specification Viewer storage key');

done();
