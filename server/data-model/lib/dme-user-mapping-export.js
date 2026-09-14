#!/usr/bin/env node
'use strict';
// @concept: [[UserMappingPersistence]]
//
// Renders a list of user-mapping rows (already decorated with proposer names)
// as JSON, CSV, or a Cypher script for ingestion into the EDUcore graph.
// Pure functions — no database access — so they are unit-testable and the
// export access point stays a thin wrapper.

const EXPORT_COLUMNS = [
	'refId',
	'status',
	'sourceStandard',
	'sourceName',
	'sourceId',
	'sourcePath',
	'targetStandard',
	'targetName',
	'targetSourceId',
	'targetPath',
	'rel',
	'transformType',
	'transformRule',
	'transformNotes',
	'detail',
	'mappingKey',
	'proposedBy',
	'proposedByUsername',
	'userRefId',
	'reviewedByName',
	'reviewNote',
	'reviewedAt',
	'createdAt',
	'updatedAt',
];

// The browser stores the display name of a standard; the graph keys nodes by
// its `_source` code. Anything not listed passes through unchanged.
const GRAPH_SOURCE_BY_DISPLAY = {
	'Ed-Fi': 'EdFi',
	'Ed-API': 'EduAPI',
	'Open Badges': 'OpenBadges',
};
// Standards the browser can propose against that are not in the graph at all.
// Their rows are exported in JSON/CSV but skipped (with a comment) in Cypher.
const NOT_IN_GRAPH = new Set(['HR Open']);

const graphSource = (display) => GRAPH_SOURCE_BY_DISPLAY[display] || display || '';

const csvCell = (value) => {
	const text = value === undefined || value === null ? '' : String(value);
	return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const toCsv = (rows) =>
	[EXPORT_COLUMNS.join(','), ...rows.map((r) => EXPORT_COLUMNS.map((c) => csvCell(r[c])).join(','))].join('\r\n');

const toJson = (rows, meta = {}) =>
	JSON.stringify(
		{
			exportedAt: new Date().toISOString(),
			source: 'EDUcore Schema Verifier — user-proposed mappings (dme_user_mappings)',
			...meta,
			mappingCount: rows.length,
			mappings: rows.map((r) => Object.fromEntries(EXPORT_COLUMNS.map((c) => [c, r[c] ?? '']))),
		},
		null,
		2,
	);

// Cypher string literal: JSON.stringify gives valid double-quoted Cypher with
// quotes, backslashes and newlines escaped.
const lit = (v) => JSON.stringify(v === undefined || v === null ? '' : String(v));

// One MERGE per row. Element resolution prefers the exact `path` (unique within
// a standard), then the stable/CEDS id, then the bare name — in that order —
// so a LIF `identifier` lands on the right entity rather than all nine.
//
// The edge type is PROPOSED_MATCH (not EXACT/CLOSE_MATCH) so ingested rows are
// visibly human proposals until the forge promotes them; `proposalId` keeps the
// MERGE idempotent across re-runs.
function rowToCypher(row) {
	const src = graphSource(row.sourceStandard);
	const tgt = graphSource(row.targetStandard);
	const skip = [];
	if (!src || NOT_IN_GRAPH.has(row.sourceStandard)) skip.push(`source standard ${row.sourceStandard || '(none)'} is not in the graph`);
	if (!tgt || NOT_IN_GRAPH.has(row.targetStandard)) skip.push(`target standard ${row.targetStandard || '(none)'} is not in the graph`);
	if (!row.sourceName || !row.targetName) skip.push('missing element name');
	if (skip.length) {
		return `// SKIPPED ${row.refId}: ${skip.join('; ')} — ${row.sourceStandard}:${row.sourceName} -> ${row.targetStandard}:${row.targetName}`;
	}

	// CEDS HubReference nodes share the CEDS _source and a leaf's name, so they
	// are excluded explicitly: a proposal is between two standard elements, and
	// the hub is the forge's business.
	const match = (alias, source, name, id, path) => {
		const clauses = [];
		if (path) clauses.push(`${alias}.path = ${lit(path)}`);
		if (id) clauses.push(`${alias}.stableId = ${lit(id)}`, `${alias}.cedsId = ${lit(id)}`, `${alias}._id = ${lit(id)}`);
		clauses.push(`${alias}.name = ${lit(name)}`);
		const carry = alias === 's' ? 's' : 's, t';
		return [
			`MATCH (${alias}:ForgedNode {_source: ${lit(source)}})`,
			`WHERE NOT ${alias}:HubReference AND (${clauses.join(' OR ')})`,
			`WITH ${carry} ORDER BY CASE WHEN ${path ? `${alias}.path = ${lit(path)}` : 'false'} THEN 0 WHEN ${id ? `${alias}.stableId = ${lit(id)} OR ${alias}.cedsId = ${lit(id)}` : 'false'} THEN 1 ELSE 2 END LIMIT 1`,
		].join('\n');
	};

	return [
		`// ${row.status} — ${row.sourceStandard}:${row.sourceName} -> ${row.targetStandard}:${row.targetName} (proposed by ${row.proposedBy || row.userRefId})`,
		match('s', src, row.sourceName, row.sourceId, row.sourcePath),
		match('t', tgt, row.targetName, row.targetSourceId, row.targetPath),
		`MERGE (s)-[r:PROPOSED_MATCH {proposalId: ${lit(row.refId)}}]->(t)`,
		`SET r.rel = ${lit(row.rel)}, r.status = ${lit(row.status || 'proposed')},`,
		`    r.transformType = ${lit(row.transformType || 'direct')}, r.transformRule = ${lit(row.transformRule)}, r.transformNotes = ${lit(row.transformNotes)},`,
		`    r.detail = ${lit(row.detail)}, r.mappingKey = ${lit(row.mappingKey)},`,
		`    r.proposedBy = ${lit(row.proposedBy)}, r.proposedByRefId = ${lit(row.userRefId)}, r.proposedAt = ${lit(row.createdAt)},`,
		`    r.reviewedBy = ${lit(row.reviewedByName)}, r.reviewedAt = ${lit(row.reviewedAt)}, r.reviewNote = ${lit(row.reviewNote)},`,
		`    r.owner = 'dme-schema-verifier', r.provenanceTier = 'human-proposed', r.ingestedAt = datetime();`,
	].join('\n');
}

function toCypher(rows, meta = {}) {
	const header = [
		'// EDUcore Schema Verifier — user-proposed mappings',
		`// exported ${new Date().toISOString()}${meta.statusFilter ? ` · status = ${meta.statusFilter}` : ''} · ${rows.length} row(s)`,
		'// Run with cypher-shell against the EDUcore graph. Idempotent: re-running updates the same PROPOSED_MATCH edges.',
		'// Each statement resolves both elements by path, then stable id, then name, and takes the best single hit.',
		'',
	];
	return header.concat(rows.map(rowToCypher).join('\n\n')).join('\n') + '\n';
}

const FORMATS = {
	json: { ext: 'json', mimeType: 'application/json', render: toJson },
	csv: { ext: 'csv', mimeType: 'text/csv', render: toCsv },
	cypher: { ext: 'cypher', mimeType: 'text/plain', render: toCypher },
};

function renderExport(rows, { format = 'json', statusFilter = '' } = {}) {
	const spec = FORMATS[format] || FORMATS.json;
	const stamp = new Date().toISOString().slice(0, 10);
	const suffix = statusFilter && statusFilter !== 'all' ? `-${statusFilter}` : '';
	return {
		filename: `educore-user-mappings${suffix}-${stamp}.${spec.ext}`,
		mimeType: spec.mimeType,
		content: spec.render(rows, { statusFilter }),
	};
}

module.exports = { renderExport, toCsv, toJson, toCypher, rowToCypher, EXPORT_COLUMNS, FORMATS, graphSource };
