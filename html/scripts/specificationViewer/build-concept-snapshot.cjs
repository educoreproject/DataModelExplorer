#!/usr/bin/env node
'use strict';
// @concept: [[SpecificationViewer]]
// @concept: [[CedsHub]]
//
// BUILD THE CEDS CONCEPT SNAPSHOT (html/data/educore-equivalents-snapshot.json)
//
// Every HubReference that any standard is matched to — one concept per hub node,
// so a shared option value ("Tatar") keeps each property context — with its CEDS
// anchors and every matched element. Run AFTER build-spec-models.cjs: each
// matched element is labelled with its structural trail from the bundled spec
// model (so a SIF field reads "AccountingPeriod › SIF_Metadata › … › Name", not
// the lossy graph path "AccountingPeriod.Name") and keyed by its stableId.
//
// Usage: node build-concept-snapshot.cjs <edges> <anchors>
//
// EDGES
//   MATCH (s:ForgedNode)-[m:EXACT_MATCH|CLOSE_MATCH|NARROW_MATCH|RELATED_MATCH|BROAD_MATCH]->(h:HubReference)
//   WITH h.stableId AS hk, s._source AS src, s.name AS name, coalesce(s.path,'') AS path, s.role AS role, type(m) AS rel,
//        round(coalesce(m.confidence, 0) * 100) / 100 AS c, s.stableId AS sid
//   ORDER BY hk, src, path
//   RETURN collect([hk, src, name, path, CASE role WHEN 'DmeClass' THEN 'C' WHEN 'DmeOptionValue' THEN 'V'
//          WHEN 'DmeOptionSet' THEN 'S' ELSE 'P' END, rel, c, sid]) AS rows
//
// ANCHORS
//   MATCH (h:HubReference) WHERE EXISTS { MATCH (:ForgedNode)-[:EXACT_MATCH|CLOSE_MATCH|NARROW_MATCH|RELATED_MATCH]->(h) }
//   OPTIONAL MATCH (h)-[:HAS_CEDS_PROPERTY]->(p:ForgedNode)
//   OPTIONAL MATCH (h)-[:HAS_CEDS_DOMAIN]->(d:ForgedNode)
//   OPTIONAL MATCH (h)-[:HAS_CEDS_VALUE]->(v:ForgedNode)
//   WITH h, head(collect(DISTINCT p)) AS p, head(collect(DISTINCT d)) AS d, head(collect(DISTINCT v)) AS v
//   RETURN collect([h.stableId, h.name, p.name, coalesce(p.cedsId, ''), coalesce(p.path, ''), left(coalesce(p.description, ''), 160),
//          d.name, coalesce(d.cedsId, ''), left(coalesce(d.description, ''), 120),
//          v.name, coalesce(v.cedsId, ''), left(coalesce(v.description, ''), 120)]) AS rows
//
// Output (v2, expanded by the store on load):
//   { version: 2, generated, source,
//     ceds: { <cedsId>: [k, name, desc, path] },
//     hubs: [ [key, name, [cedsIds], [[source, name, displayPath, k, rel, confidence, stableId], …]], … ] }

const fs = require('fs');
const path = require('path');

const [edgesFile, anchorsFile] = process.argv.slice(2);
if (!edgesFile || !anchorsFile) {
	console.error('usage: build-concept-snapshot.cjs <edges> <anchors>');
	process.exit(2);
}
const HTML = path.resolve(__dirname, '..', '..');
const OUT = path.join(HTML, 'data', 'educore-equivalents-snapshot.json');
const MODELS = path.join(HTML, 'data', 'spec-elements');

const readRows = (file) => {
	let d = JSON.parse(fs.readFileSync(file, 'utf8'));
	if (Array.isArray(d) && d[0] && d[0].type === 'text') d = JSON.parse(d[0].text);
	return d[0].rows;
};
const shortId = (id) => String(id || '').replace(/^https?:\/\/w3id\.org\/CEDStandards\/terms\//, '');
const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();

// stableId → display path, from the bundled models (first occurrence: a CTDL
// property under many classes shows its first home).
const displayPathById = new Map();
for (const f of fs.readdirSync(MODELS)) {
	if (!/^[^.]+\.json$/.test(f) || f === 'manifest.json') continue;
	const model = JSON.parse(fs.readFileSync(path.join(MODELS, f), 'utf8'));
	const S = model.strings;
	for (const [, rawId, nameIx, trail] of model.elements) {
		const id = Array.isArray(rawId) ? S[rawId[0]] + rawId[1] : rawId;
		if (displayPathById.has(`${model.source}|${id}`)) continue;
		displayPathById.set(`${model.source}|${id}`, [...trail.map((i) => S[i]), S[nameIx]].join(' › '));
	}
}

const ceds = {};
const hubs = new Map();
for (const [key, hubName, pName, pId, pPath, pDesc, dName, dId, dDesc, vName, vId, vDesc] of readRows(anchorsFile)) {
	const ids = [];
	const add = (k, name, id, desc, p) => {
		if (!name) return;
		const sid = shortId(id) || `${k}:${name}`;
		if (!ceds[sid]) ceds[sid] = [k, name, clean(desc), p || ''];
		ids.push(sid);
	};
	add('V', vName, vId, vDesc, '');
	add('P', pName, pId, pDesc, pPath);
	add('C', dName, dId, dDesc, dName || '');
	hubs.set(key, [String(key).replace(/^cedsHubRef:/, '').slice(0, 16), hubName || pName || vName || key, ids, []]);
}

let edgeCount = 0;
let labelled = 0;
for (const [key, source, name, graphPath, k, rel, c, sid] of readRows(edgesFile)) {
	const hub = hubs.get(key);
	if (!hub || !name) continue;
	const display = displayPathById.get(`${source}|${sid}`);
	if (display) labelled++;
	hub[3].push([source, name, display || graphPath || '', k, rel, c || 0, sid || '']);
	edgeCount++;
}

const out = {
	version: 2,
	generated: new Date().toISOString().slice(0, 10),
	source: 'EDUcore knowledge graph — every HubReference with at least one match, its CEDS anchors, and every matched element (stableId, structural path, edge confidence). Built by html/scripts/specificationViewer/build-concept-snapshot.cjs',
	ceds,
	hubs: [...hubs.values()].filter((h) => h[3].length).sort((a, b) => a[1].localeCompare(b[1])),
};
fs.writeFileSync(OUT, JSON.stringify(out));
console.log({ concepts: out.hubs.length, cedsElements: Object.keys(ceds).length, edges: edgeCount, withStructuralPath: labelled, KB: Math.round(fs.statSync(OUT).size / 1024) });
