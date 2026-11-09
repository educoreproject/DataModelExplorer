#!/usr/bin/env node
// @concept: [[SpecificationViewer]]
//
// Every specification loads by the graph's own structure, the way its standard
// is actually organised — checked on the real bundled files with the live
// endpoints down (how the dev site runs until the server is deployed).
//
//   node html/test/specificationViewer/structure.test.mjs

import fs from 'node:fs';
import path from 'node:path';
import { loadStore, makeAssert, HTML } from './store-harness.mjs';

const { assert, done } = makeAssert();
const { store } = await loadStore();
const manifest = JSON.parse(fs.readFileSync(path.join(HTML, 'data/spec-elements/manifest.json'), 'utf8'));

const open = async (source, search = '') => {
	store.selectSpec(store.specs.find((s) => s.source === source));
	await store.loadSpecElements(source, { search });
	return store.elements;
};
const trailIs = (el, trail) => JSON.stringify(el.trail) === JSON.stringify(trail);

// ---- the spec list ----------------------------------------------------------------------
await store.loadSpecifications();
assert(store.specs.length === Object.keys(manifest.specs).length, `spec list offers all ${store.specs.length} specs`);

// ---- every spec: complete, ordered, identified ----------------------------------------------
for (const spec of store.specs) {
	const els = await open(spec.source);
	const m = manifest.specs[spec.source];
	const properties = new Set(els.filter((e) => e.kind === 'property').map((e) => e.stableId));
	const classes = new Set(els.filter((e) => e.kind === 'class').map((e) => e.stableId));
	assert(
		properties.size === m.propertyCount && classes.size === m.classCount,
		`${spec.source} (${m.profile}): every class (${classes.size}) and property (${properties.size}) present, by stableId`,
	);
	assert(els.every((e) => e.stableId && Array.isArray(e.trail)), `${spec.source}: every row carries a stableId and a trail`);
	// a row is one placement of one node; two distinct nodes may share a name
	// under one parent (CEDS P600161 / P600553), so identity is stableId + path
	const keys = els.map((e) => `${e.stableId}|${e.path}`);
	assert(new Set(keys).size === keys.length, `${spec.source}: every row is a distinct placement (stableId + path)`);
}

// ---- model: nested classes (LIF) ---------------------------------------------------------
let els = await open('LIF');
assert(store.elementGroups.length === 9, `LIF: 9 entities (${store.elementGroups.map((g) => g.name).join(', ')})`);
const lifFirst = els.find((e) => e.stableId === 'lif:Person.Name.firstName');
assert(lifFirst && trailIs(lifFirst, ['Person', 'Name']), `LIF firstName sits in Person › Name (${lifFirst && lifFirst.trail.join(' › ')})`);
const lifAddress = els.find((e) => e.kind === 'class' && e.name === 'Address' && e.trail.includes('Contact'));
assert(lifAddress && lifAddress.trail[0] === 'Person' || lifAddress?.trail[0] === 'Organization', `LIF Address is a nested class under ${lifAddress && lifAddress.trail.join(' › ')}`);

// ---- model: one property, many classes (CTDL) ---------------------------------------------
els = await open('CTDL');
const accredited = els.filter((e) => e.name === 'Accredited By' || e.stableId === 'ceterms:accreditedBy');
assert(accredited.length > 1 && new Set(accredited.map((e) => e.stableId)).size === 1, `CTDL accreditedBy is one node listed under ${accredited.length} classes`);

// ---- model: superclass shown, not used for grouping (CEDS) ----------------------------------
els = await open('CEDS');
const extended = els.filter((e) => e.kind === 'class' && e.extends);
assert(extended.length > 300 && store.elementGroups.length > 300, `CEDS: ${extended.length} classes say what they extend; ${store.elementGroups.length} entities (not collapsed under one superclass)`);

// ---- taxonomy (SOC, CIP) -------------------------------------------------------------------
els = await open('SOC');
const ceo = els.find((e) => e.name === 'Chief Executives');
assert(ceo && ceo.trail.length === 3 && /^11-0000/.test(ceo.trail[0]) && /Broad occupation/.test(ceo.trail[2]), `SOC Chief Executives: ${ceo && ceo.trail.join(' › ')}`);
assert(store.elementGroups.length === 24, `SOC: 24 major groups as entities (${store.elementGroups.length})`);
els = await open('CIP');
const program = els.find((e) => e.trail.length === 2);
assert(program && store.elementGroups.length === 50, `CIP: 50 families; a program sits at ${program && program.trail.join(' › ')} › ${program && program.name}`);

// ---- messages (PESC, MedBiquitous) -----------------------------------------------------------
els = await open('PESC');
const awardDates = els.filter((e) => e.name === 'AcademicAwardDate');
const messages = new Set(awardDates.map((e) => e.trail[0]));
assert(awardDates.length >= 2 && messages.has('AcademicRecord') && messages.has('AdmissionsRecord'), `PESC AcademicAwardDate under ${[...messages].join(', ')} — message › class › property`);
assert(store.elementGroups.length === manifest.specs.PESC.entityCount, `PESC: ${store.elementGroups.length} messages as entities`);
els = await open('MedBiquitous');
assert(
	store.elementGroups.every((g) => !g.name.includes(':')) && store.elementGroups.filter((g) => / v\d+$/.test(g.name)).length >= 15,
	`MedBiquitous entities are its schemas and versions (${store.elementGroups.slice(0, 4).map((g) => g.name).join(', ')} …), no raw id prefixes`,
);

// ---- xpath (SIF) -------------------------------------------------------------------------------
els = await open('SIF');
const apNames = els.filter((e) => e.kind === 'property' && e.name === 'Name' && e.trail[0] === 'AccountingPeriod');
assert(
	apNames.length > 1 &&
		new Set(apNames.map((e) => e.stableId)).size === apNames.length &&
		new Set(apNames.map((e) => e.trail.join('/'))).size === apNames.length,
	`SIF: ${apNames.length} different AccountingPeriod Name fields, each in its own element path (the graph's dotted path folds them into one)`,
);
assert(apNames.some((e) => trailIs(e, ['AccountingPeriod', 'SIF_Metadata', 'LifeCycle', 'Created', 'Creators', 'Creator'])), 'SIF: Creator Name sits in its element path AccountingPeriod › SIF_Metadata › LifeCycle › Created › Creators › Creator');
assert(els.some((e) => e.kind === 'class' && e.trail[0] === 'Types'), 'SIF: complex types listed under Types');

// ---- stableId groups (JEDx) and loose elements (SEDM) -------------------------------------------
els = await open('JEDx');
assert(els.some((e) => e.trail.includes('taxIds[]')), 'JEDx: the taxIds[] repeating group is a section');
els = await open('SEDM');
assert(store.elementGroups.length > 10 && els.filter((e) => e.kind === 'property').every((e) => e.trail.length >= 1), `SEDM: elements grouped (${store.elementGroups.length} groups, e.g. ${store.elementGroups[0].name})`);

// ---- typed properties and code lists ------------------------------------------------------------
els = await open('PESC');
const typed = els.find((e) => e.kind === 'property' && e.typeStableId);
const typeTarget = typed && (await store.findElementByStableId('PESC', typed.typeStableId));
assert(typeTarget && typeTarget.kind === 'class' && typeTarget.name === typed.typeName, `PESC ${typed && typed.name} → opens class ${typeTarget && typeTarget.name}`);
els = await open('EdFi');
const coded = els.find((e) => e.codeListId && e.codeCount > 3);
const codes = coded && (await store.loadCodeList(coded));
assert(codes && codes.values.length === coded.codeCount, `Ed-Fi ${coded && coded.name}: code list loads ${codes && codes.values.length} of ${coded && coded.codeCount} codes`);

// ---- search spans name, path and description ---------------------------------------------------
els = await open('SIF', 'lifecycle');
assert(els.length > 100 && els.every((e) => (e.name + e.path + e.description).toLowerCase().includes('lifecycle')), `SIF filter "lifecycle": ${els.length} fields, all in a LifeCycle subtree or naming it`);

done();
