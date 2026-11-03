#!/usr/bin/env node
'use strict';
// @concept: [[SpecificationViewer]]
//
// BUILD THE SPECIFICATION VIEWER'S BUNDLED MODELS FROM THE GRAPH
//
// Writes html/data/spec-elements/<SPEC>.json (structure), <SPEC>.codes.json (code
// lists) and manifest.json from four Cypher results. Each standard is read by its
// own STRUCTURAL edges — never by splitting the dotted `path` property, which is
// lossy (SIF folds five different `Name` fields into `AccountingPeriod.Name`):
//
//   model      root -HAS_CLASS-> class [-HAS_CLASS-> class …] -HAS_PROPERTY-> property
//              (CEDS, Ed-Fi, LIF, CTDL*, CASE, CLR, Open Badges, Ed-API, JEDx, DCTAP).
//              A property owned by several classes (CTDL) is listed under each.
//              SUBCLASS_OF is shown as "extends", not used for grouping
//              (CEDS's classes nearly all extend "Base CEDS Resource").
//   taxonomy   class -SUBCLASS_OF-> class is the hierarchy (CIP family › series ›
//              program; SOC major › minor › broad › occupation).
//   messages   one more level above the class: the message / schema version the
//              class belongs to, read from its stableId (PESC AcademicRecord …,
//              MedBiquitous curriculumInventory v2 …). Each class belongs to one.
//   xpath      SIF: objects own every field; a field's element path inside its
//              object is its stableId XPath. Complex types are listed as types.
//   elements   SEDM: properties hang off no class; their stableId carries the
//              element number and its grouping (000010.parentguardian.contactaddress…).
//
// Within any profile, intermediate groups that live only in a stableId (JEDx's
// repeating groups, organization.taxIds[]) become sections too.
//
// Usage (each argument a saved `RETURN collect([...]) AS rows` result, in order):
//   node build-spec-models.cjs <classes> <properties> [<properties2> …] -- <codeSets>
//
// The Cypher (read-only), as run 2026-10-27:
//
// CLASSES
//   MATCH (c:DmeClass) WHERE c.role = 'DmeClass' AND NOT c:HubReference
//   OPTIONAL MATCH (c)-[:SUBCLASS_OF]->(sup:DmeClass)
//   OPTIONAL MATCH (pc:DmeClass)-[:HAS_CLASS]->(c)
//   WITH c, head(collect(DISTINCT sup.stableId)) AS superId, head(collect(DISTINCT pc.stableId)) AS parentId,
//        [l IN labels(c) WHERE NOT l IN ['ForgedNode','golden','DmeClass']][0] AS nativeLabel
//   RETURN collect([c._source, c.stableId, c.name, left(coalesce(c.description,''),160), coalesce(nativeLabel,''),
//          coalesce(superId,''), coalesce(parentId,''), coalesce(c.path,''), coalesce(c.socCode, c.cedsId, '')]) AS rows
//
// PROPERTIES (run once for SIF with left(...,100), once for everything else with 160)
//   MATCH (p:DmeProperty) WHERE p.role = 'DmeProperty' AND p._source <> 'SIF'
//   OPTIONAL MATCH (o)-[:HAS_PROPERTY]->(p) WHERE o:DmeClass OR o:DmeSupport
//   OPTIONAL MATCH (p)-[:REFERENCES|REFERENCES_TYPE]->(t:DmeClass)
//   OPTIONAL MATCH (p)-[:HAS_OPTION_SET]->(s:DmeOptionSet)
//   WITH p, collect(DISTINCT o.stableId) AS owners, head(collect(DISTINCT t.stableId)) AS typeId,
//        head(collect(DISTINCT s.stableId)) AS setId, head(collect(DISTINCT s.valueCount)) AS valueCount
//   RETURN collect([p._source, p.stableId, p.name, left(coalesce(p.description,''),160), owners, coalesce(typeId,''),
//          coalesce(setId,''), coalesce(valueCount, 0), coalesce(p.path,''), coalesce(p.cedsId,'')]) AS rows
//
// CODE SETS
//   MATCH (s:DmeOptionSet)-[:HAS_VALUE]->(v:DmeOptionValue) WHERE EXISTS { (:DmeProperty)-[:HAS_OPTION_SET]->(s) }
//   WITH s, v ORDER BY s.stableId, v.name
//   WITH s, collect([v.name, left(coalesce(v.description,''),90)]) AS values
//   RETURN collect([s._source, s.stableId, s.name, values]) AS rows

const fs = require('fs');
const path = require('path');

const OUT_DIR = path.resolve(__dirname, '..', '..', 'data', 'spec-elements');
const GENERATED = new Date().toISOString().slice(0, 10);

const args = process.argv.slice(2);
const sep = args.indexOf('--');
if (args.length < 3 || sep < 2) {
	console.error('usage: build-spec-models.cjs <classes> <properties…> -- <codeSets>');
	process.exit(2);
}
const readRows = (file) => {
	let data = JSON.parse(fs.readFileSync(file, 'utf8'));
	if (Array.isArray(data) && data[0] && data[0].type === 'text') data = JSON.parse(data[0].text);
	return data[0].rows;
};
const classRows = readRows(args[0]);
const propertyRows = args.slice(1, sep).flatMap(readRows);
const setRows = readRows(args[sep + 1]);

const PROFILE_BY_SOURCE = {
	CIP: 'taxonomy',
	SOC: 'taxonomy',
	PESC: 'messages',
	MedBiquitous: 'messages',
	SIF: 'xpath',
	SEDM: 'elements',
};
const profileOf = (source) => PROFILE_BY_SOURCE[source] || 'model';

const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const cedsShort = (id) => String(id || '').replace(/^https?:\/\/w3id\.org\/CEDStandards\/terms\//, '');

// ---------------------------------------------------------------------------
// Per-source indexes

const classesBySource = new Map();
for (const [source, id, name, desc, nativeLabel, superId, parentId, graphPath, code] of classRows) {
	if (!source || !id) continue;
	if (!classesBySource.has(source)) classesBySource.set(source, new Map());
	classesBySource.get(source).set(id, { id, name: clean(name), desc: clean(desc), nativeLabel, superId, parentId, graphPath, code: cedsShort(code) });
}
const propertiesBySource = new Map();
for (const [source, id, name, desc, owners, typeId, setId, valueCount, graphPath, cedsId] of propertyRows) {
	if (!source || !id) continue;
	if (!propertiesBySource.has(source)) propertiesBySource.set(source, []);
	propertiesBySource.get(source).push({ id, name: clean(name), desc: clean(desc), owners: owners || [], typeId, setId, valueCount: valueCount || 0, graphPath, code: cedsShort(cedsId) });
}
const setsBySource = new Map();
for (const [source, id, name, values] of setRows) {
	if (!setsBySource.has(source)) setsBySource.set(source, {});
	setsBySource.get(source)[id] = [clean(name), (values || []).map(([v, d]) => (d ? [clean(v), clean(d)] : [clean(v)]))];
}

// ---------------------------------------------------------------------------
// Profile helpers

// The message / schema a PESC or MedBiquitous node belongs to, from its stableId.
function messageOf(source, stableId) {
	const rest = String(stableId).replace(/^[a-z]+:(class|field|support)\//, '');
	const parts = rest.split('/');
	if (source === 'PESC') return parts[0] || '';
	if (source === 'MedBiquitous') return parts[0] && parts[1] ? `${parts[0]} ${parts[1]}` : parts[0] || '';
	return '';
}

// SOC groups are named by code; give them a readable name from their description.
function displayClassName(source, cls) {
	if (source === 'SOC' && cls.nativeLabel === 'SocGroup') {
		const m = cls.desc.match(/SOC (Major Group|Minor Group|Broad Occupation) (\S+)/);
		if (m) return `${m[2]} · ${m[1].replace(/ Group$/, ' group').replace('Broad Occupation', 'Broad occupation')}`;
	}
	if (source === 'CIP') {
		const code = String(cls.id).split('/').pop();
		if (code && code !== cls.name) return `${code} ${cls.name}`;
	}
	return cls.name;
}

// Segments a property's stableId adds between its owning class and itself:
// JEDx `organization.taxIds[].agencyUri` → ['taxIds[]']. Splits on '.' only
// where it is not followed by a space ("1. Employer" is one name).
function stableIdMiddle(stableId, ownerName, leafName) {
	const tail = String(stableId).replace(/^[^:]+:(field\/|element\/)?/, '');
	const tokens = tail.split(/\.(?! )/).filter(Boolean);
	if (tokens.length < 3) return [];
	if (tokens[0].toLowerCase() !== String(ownerName).toLowerCase()) return [];
	if (tokens[tokens.length - 1].toLowerCase() !== String(leafName).toLowerCase()) return [];
	return tokens.slice(1, -1);
}

// SIF: the element path between the object and the field, from the XPath.
function sifMiddle(stableId, objectName) {
	const parts = String(stableId).replace(/^sif:field\/\//, '').split('/').filter(Boolean);
	const at = parts.indexOf(objectName);
	if (at < 0) return [];
	return parts.slice(at + 1, -1);
}

// ---------------------------------------------------------------------------
// Build one spec

function buildSpec(source) {
	const profile = profileOf(source);
	const classes = classesBySource.get(source) || new Map();
	const properties = propertiesBySource.get(source) || [];
	const rows = [];

	// The trail ABOVE a class (not including itself).
	const classTrailCache = new Map();
	const classTrail = (cls, guard = 0) => {
		if (!cls) return [];
		if (classTrailCache.has(cls.id)) return classTrailCache.get(cls.id);
		let trail = [];
		if (guard > 12) return trail;
		if (profile === 'taxonomy') {
			const sup = cls.superId && classes.get(cls.superId);
			if (sup) trail = [...classTrail(sup, guard + 1), displayClassName(source, sup)];
		} else {
			const parent = cls.parentId && classes.get(cls.parentId);
			if (parent) trail = [...classTrail(parent, guard + 1), displayClassName(source, parent)];
			else if (profile === 'messages') trail = [messageOf(source, cls.id)].filter(Boolean);
			else if (profile === 'xpath' && cls.nativeLabel !== 'SifObject') trail = ['Types'];
			else if (profile === 'elements') trail = ['Classes', ...String(cls.graphPath || '').split('.').slice(0, -1)].filter(Boolean);
		}
		classTrailCache.set(cls.id, trail);
		return trail;
	};

	// ---- classes
	for (const cls of classes.values()) {
		const sup = cls.superId && classes.get(cls.superId);
		const row = ['C', cls.id, displayClassName(source, cls), classTrail(cls)];
		const extra = {};
		if (cls.desc) extra.d = cls.desc;
		if (cls.code && cls.code !== cls.name) extra.c = cls.code;
		if (sup && profile !== 'taxonomy') extra.x = sup.name; // "extends"
		if (cls.graphPath) extra.g = cls.graphPath;
		if (Object.keys(extra).length) row.push(extra);
		rows.push(row);
	}

	// ---- properties
	let unattached = 0;
	for (const prop of properties) {
		const extra = {};
		if (prop.desc) extra.d = prop.desc;
		if (prop.code) extra.c = prop.code;
		const type = prop.typeId && classes.get(prop.typeId);
		if (type) {
			extra.t = type.name;
			extra.ti = type.id;
		}
		if (prop.setId) {
			extra.s = prop.setId;
			// count the codes themselves: the set's valueCount property is not set
			// for every standard (Ed-Fi descriptors carry none)
			const set = (setsBySource.get(source) || {})[prop.setId];
			extra.n = set ? set[1].length : prop.valueCount;
		}
		if (prop.graphPath) extra.g = prop.graphPath;

		if (profile === 'elements' && !prop.owners.length) {
			// SEDM: 000010.parentguardian.contactaddress.leaf → Data elements › parentguardian › contactaddress
			const tokens = String(prop.id).replace(/^sedm:element\//, '').split('.');
			if (/^\d+$/.test(tokens[0])) extra.c = tokens[0];
			rows.push(['P', prop.id, prop.name, tokens.slice(1, -1), extra]);
			continue;
		}

		const owners = prop.owners.map((o) => classes.get(o) || { id: o, name: String(o).split(/[\/:.]/).pop(), support: true });
		if (!owners.length) {
			unattached++;
			rows.push(['P', prop.id, prop.name, ['Properties without a class'], extra]);
			continue;
		}
		for (const owner of owners) {
			const ownerName = owner.support ? owner.name : displayClassName(source, owner);
			let trail = owner.support
				? [...(profile === 'messages' ? [messageOf(source, owner.id)].filter(Boolean) : []), 'Supporting types', ownerName]
				: [...classTrail(owner), ownerName];
			if (profile === 'xpath') trail = [...trail, ...sifMiddle(prop.id, owner.name)];
			else trail = [...trail, ...stableIdMiddle(prop.id, owner.name, prop.name)];
			rows.push(['P', prop.id, prop.name, trail, extra]);
		}
	}

	// Model order: by trail, then classes before properties, then name.
	const sortKey = (r) => [...r[3], r[0] === 'C' ? `\u0000${r[2]}` : `\u0001${r[2]}`].join('\u0002').toLowerCase();
	rows.sort((a, b) => sortKey(a).localeCompare(sortKey(b)));

	const entities = new Set(rows.map((r) => (r[3].length ? r[3][0] : r[2])));
	const usedSets = new Set(rows.filter((r) => r[4] && r[4].s).map((r) => r[4].s));
	const codes = Object.fromEntries(Object.entries(setsBySource.get(source) || {}).filter(([id]) => usedSets.has(id)));

	// ---- compact encoding. Names, trail segments, descriptions and type names
	// repeat thousands of times (every SIF object has a SIF_Metadata subtree;
	// CTDL lists one property under up to a hundred classes), so each string is
	// stored once in `strings` and rows refer to it by index. A property's type
	// is the row index of its class. The graph's own dotted path (g) is kept,
	// interned: it carries old path-keyed mappings over to stableId keys, and
	// names a code value's place for the CEDS concept lookup.
	const strings = [];
	const stringIndex = new Map();
	const S = (s) => {
		const key = String(s);
		if (!stringIndex.has(key)) {
			stringIndex.set(key, strings.length);
			strings.push(key);
		}
		return stringIndex.get(key);
	};
	const classRowIndex = new Map();
	rows.forEach((r, i) => {
		if (r[0] === 'C' && !classRowIndex.has(r[1])) classRowIndex.set(r[1], i);
	});
	const encoded = rows.map(([k, id, name, trail, extra]) => {
		const e = {};
		if (extra) {
			if (extra.d) e.d = S(extra.d);
			if (extra.c) e.c = extra.c;
			if (extra.x) e.x = S(extra.x);
			if (extra.t) e.t = S(extra.t);
			if (extra.ti && classRowIndex.has(extra.ti)) e.ti = classRowIndex.get(extra.ti);
			if (extra.s) e.s = extra.s;
			if (extra.n) e.n = extra.n;
			if (extra.g) e.g = S(extra.g);
		}
		// stableIds share long prefixes (SIF XPaths: sif:field//AccountingPeriods/
		// AccountingPeriod/SIF_Metadata/…/); store the prefix once, as [prefix, rest].
		const cut = Math.max(id.lastIndexOf('/'), id.lastIndexOf('.'));
		const encodedId = cut > 8 ? [S(id.slice(0, cut + 1)), id.slice(cut + 1)] : id;
		const row = [k, encodedId, S(name), trail.map(S)];
		if (Object.keys(e).length) row.push(e);
		return row;
	});

	return {
		structure: {
			source,
			version: 3,
			generated: GENERATED,
			profile,
			origin: 'EDUcore knowledge graph, read by its structural edges (see html/scripts/specificationViewer/build-spec-models.cjs)',
			fields: ['kind (C class | P property)', 'stableId, or [prefix → strings[i], rest]', 'name → strings[i]', 'trail (sections above the element) → strings[i][]', '{ d description → strings[i], c code/id, x extends → strings[i], t type name → strings[i], ti type → elements[i], s code-list id, n code count, g graph path → strings[i] }'],
			strings,
			classCount: rows.filter((r) => r[0] === 'C').length,
			propertyCount: properties.length,
			rowCount: rows.length,
			entityCount: entities.size,
			codeListCount: Object.keys(codes).length,
			unattached,
			elements: encoded,
		},
		codes: { source, generated: GENERATED, sets: codes },
	};
}

// ---------------------------------------------------------------------------
// Write

fs.mkdirSync(OUT_DIR, { recursive: true });
for (const f of fs.readdirSync(OUT_DIR)) if (f.endsWith('.json')) fs.unlinkSync(path.join(OUT_DIR, f));

const manifest = { generated: GENERATED, version: 3, specs: {} };
const sources = [...new Set([...classesBySource.keys(), ...propertiesBySource.keys()])].sort();
for (const source of sources) {
	const { structure, codes } = buildSpec(source);
	fs.writeFileSync(path.join(OUT_DIR, `${source}.json`), JSON.stringify(structure));
	const hasCodes = Object.keys(codes.sets).length > 0;
	if (hasCodes) fs.writeFileSync(path.join(OUT_DIR, `${source}.codes.json`), JSON.stringify(codes));
	manifest.specs[source] = {
		profile: structure.profile,
		elementCount: structure.classCount + structure.propertyCount,
		classCount: structure.classCount,
		propertyCount: structure.propertyCount,
		entityCount: structure.entityCount,
		codeListCount: structure.codeListCount,
	};
	const kb = (f) => (fs.existsSync(f) ? Math.round(fs.statSync(f).size / 1024) : 0);
	console.log(
		`${source.padEnd(13)} ${structure.profile.padEnd(9)} ${String(structure.classCount).padStart(5)} classes ${String(structure.propertyCount).padStart(6)} properties ${String(structure.rowCount).padStart(6)} rows ${String(structure.entityCount).padStart(5)} entities ${String(structure.codeListCount).padStart(4)} code lists  ${kb(path.join(OUT_DIR, `${source}.json`))} KB + ${kb(path.join(OUT_DIR, `${source}.codes.json`))} KB${structure.unattached ? `  (${structure.unattached} unattached)` : ''}`,
	);
}
fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 1));
console.log(`manifest: ${sources.length} specs → ${OUT_DIR}`);
