'use strict';

// traversalGenerator.js — Generate complete traversal.cypher from schema-summary.json
// Produces a self-contained, executable Cypher query with:
//   - UNION ALL preamble (vector + BM25 indexes)
//   - Dedup and ranking
//   - Label-filtered OPTIONAL MATCHes for graph context
//   - Complete RETURN clause

const fs = require('fs');
const path = require('path');

const UMBRELLA_LABELS = ['CEDS', 'SifModel'];

// Cardinality threshold: above this, use CALL {} subquery with collect() to prevent Cartesian products
const HIGH_CARDINALITY_THRESHOLD = 2;

const generateTraversal = ({ schemaPath, outputDir, apply, preview }) => {
	const { xLog } = process.global;

	if (!fs.existsSync(schemaPath)) {
		xLog.error(`[traversalGenerator] schema-summary.json not found: ${schemaPath}`);
		return null;
	}

	const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
	xLog.status(`[traversalGenerator] Loaded schema from ${schemaPath}`);

	// Identify the PRIMARY vector-indexed node types (the ones with actual embeddings)
	const vectorNodeLabels = identifyPrimaryVectorTypes(schema);
	xLog.status(`[traversalGenerator] Primary vector-indexed types: ${vectorNodeLabels.join(', ')}`);

	// Generate the complete Cypher query
	const cypher = buildCypherQuery(schema, vectorNodeLabels);

	// Write traversal.generated.cypher (always overwritten)
	const generatedPath = path.join(outputDir, 'traversal.generated.cypher');
	fs.writeFileSync(generatedPath, cypher);
	xLog.status(`[traversalGenerator] Wrote ${generatedPath}`);

	// Handle traversal.cypher
	const traversalPath = path.join(outputDir, 'traversal.cypher');

	if (!fs.existsSync(traversalPath)) {
		fs.writeFileSync(traversalPath, cypher);
		xLog.status(`[traversalGenerator] Created ${traversalPath} (first generation)`);
	} else if (preview) {
		const existing = fs.readFileSync(traversalPath, 'utf8');
		if (existing === cypher) {
			xLog.status('[traversalGenerator] traversal.cypher is already up-to-date');
		} else {
			const existingLines = existing.split('\n').length;
			const newLines = cypher.split('\n').length;
			xLog.status(`[traversalGenerator] traversal.cypher differs: existing ${existingLines} lines, generated ${newLines} lines`);
			xLog.status('[traversalGenerator] Run -generateTraversal --apply to update (backs up current via filestash)');
		}
	} else if (apply) {
		try {
			const { execSync } = require('child_process');
			execSync(`filestash "${traversalPath}"`, { encoding: 'utf8' });
			xLog.status(`[traversalGenerator] Backed up existing traversal.cypher via filestash`);
		} catch (err) {
			xLog.error(`[traversalGenerator] filestash backup failed: ${err.message}`);
			xLog.error('[traversalGenerator] Aborting --apply to protect existing file');
			return cypher;
		}
		fs.writeFileSync(traversalPath, cypher);
		xLog.status(`[traversalGenerator] Updated ${traversalPath}`);
	} else {
		const existing = fs.readFileSync(traversalPath, 'utf8');
		if (existing !== cypher) {
			xLog.status('[traversalGenerator] Generated file differs from traversal.cypher.');
			xLog.status('[traversalGenerator] Run -generateTraversal --apply to update (backs up current via filestash).');
			xLog.status('[traversalGenerator] Run -generateTraversal --preview to see diff.');
		} else {
			xLog.status('[traversalGenerator] traversal.cypher is already up-to-date');
		}
	}

	return cypher;
};

// Identify primary vector-indexed types for traversal generation
// For each vector index, pick the ONE type with the richest cross-type connectivity
// (most distinct relationship types involving other node types)
const identifyPrimaryVectorTypes = (schema) => {
	const result = [];

	for (const vecIdx of schema.vectorIndexes) {
		if (vecIdx.embeddedTypes && vecIdx.embeddedTypes.length > 1) {
			// Multiple embedded types — pick the one with most relationship diversity
			let best = null;
			let bestScore = -1;

			for (const et of vecIdx.embeddedTypes) {
				const rels = schema.relationships.filter(r =>
					(r.from === et.label || r.to === et.label) &&
					r.type !== 'PART_OF'
				);
				const distinctRelTypes = new Set(rels.map(r => r.type)).size;
				if (distinctRelTypes > bestScore) {
					bestScore = distinctRelTypes;
					best = et.label;
				}
			}
			if (best) result.push(best);
		} else {
			result.push(vecIdx.primaryNodeLabel || vecIdx.nodeLabel);
		}
	}

	return [...new Set(result)];
};

const buildCypherQuery = (schema, vectorNodeLabels) => {
	const lines = [];
	const returnFields = ['node', 'combinedScore', 'vecScore', 'ftScore', 'labels(node) AS nodeLabels'];

	// Header
	lines.push('// traversal.cypher — DataModelExplorer');
	lines.push(`// Vector-indexed: ${vectorNodeLabels.map(l => {
		const idx = schema.vectorIndexes.find(v => v.nodeLabel === l || resolveUmbrella(v.nodeLabel, schema) === l);
		return `${l} (${idx ? idx.name : '?'})`;
	}).join(', ')}`);
	lines.push(`// BM25: ${schema.fulltextIndexes.map(f => f.name).join(', ')}`);
	lines.push(`// Generated: ${new Date().toISOString().split('T')[0]}`);
	lines.push('// Parameters: $embedding (list<float>), $limit (int), $query (string)');
	lines.push('');

	// === Search preamble ===
	lines.push('// === Search preamble: hybrid across all indexes ===');
	lines.push('CALL {');

	const unionParts = [];
	for (const vecIdx of schema.vectorIndexes) {
		unionParts.push(`  CALL db.index.vector.queryNodes('${vecIdx.name}', $limit, $embedding) YIELD node, score\n  RETURN node, score AS vecScore, 0.0 AS ftScore`);
	}
	for (const ftIdx of schema.fulltextIndexes) {
		unionParts.push(`  CALL db.index.fulltext.queryNodes('${ftIdx.name}', $query) YIELD node, score\n  RETURN node, 0.0 AS vecScore, score AS ftScore`);
	}
	lines.push(unionParts.join('\n  UNION ALL\n'));
	lines.push('}');
	lines.push('');

	// === Dedup and rank ===
	lines.push('// === Dedup and rank ===');
	lines.push('WITH node, max(vecScore) AS vecScore, max(ftScore) AS ftScore');
	lines.push('WITH node, vecScore, ftScore,');
	lines.push('     (CASE WHEN ftScore > 0 THEN 0.5 ELSE 0 END) +');
	lines.push('     (CASE WHEN vecScore > 0 THEN vecScore * 0.5 ELSE 0 END) AS combinedScore');
	lines.push('ORDER BY combinedScore DESC LIMIT $limit');
	lines.push('');

	// === Traversal ===
	lines.push('// === Traversal: label-filtered OPTIONAL MATCHes ===');

	for (const nodeLabel of vectorNodeLabels) {
		lines.push('');
		lines.push(`// ${nodeLabel} context (only fires when node is ${nodeLabel})`);

		// Get outbound relationships from this type
		const outbound = schema.relationships.filter(r =>
			r.from === nodeLabel &&
			!UMBRELLA_LABELS.includes(r.to) &&
			r.to !== 'CedsOntology' // Skip ontology self-refs
		);

		// Get inbound relationships to this type
		const inbound = schema.relationships.filter(r =>
			r.to === nodeLabel &&
			!UMBRELLA_LABELS.includes(r.from) &&
			r.from !== 'CedsOntology' &&
			// Skip if this is a cross-bridge (handled separately below)
			!vectorNodeLabels.includes(r.from)
		);

		// Process outbound (node -> target)
		for (const rel of outbound) {
			// Skip cross-type bridges (handled separately)
			if (vectorNodeLabels.includes(rel.to)) continue;

			const varSuffix = lcFirst(rel.to);

			if (rel.avgCardinality <= HIGH_CARDINALITY_THRESHOLD) {
				lines.push(`OPTIONAL MATCH (node:${nodeLabel})-[:${rel.type}]->(${varSuffix}:${rel.to})`);
				returnFields.push(varSuffix);
			} else {
				const collectVar = lcFirst(`${nodeLabel}${rel.type.replace(/_/g, '')}${rel.to}List`);
				lines.push('CALL {');
				lines.push('  WITH node');
				lines.push(`  OPTIONAL MATCH (node:${nodeLabel})-[:${rel.type}]->(t:${rel.to})`);
				lines.push(`  RETURN collect(DISTINCT t { .* })[..10] AS ${collectVar}`);
				lines.push('}');
				returnFields.push(collectVar);
			}
		}

		// Process inbound (source -> node)
		for (const rel of inbound) {
			const varSuffix = lcFirst(`${rel.from}Via${rel.type.replace(/_/g, '')}`);

			if (rel.avgCardinality <= HIGH_CARDINALITY_THRESHOLD) {
				lines.push(`OPTIONAL MATCH (${varSuffix}:${rel.from})-[:${rel.type}]->(node:${nodeLabel})`);
				returnFields.push(varSuffix);
			} else {
				const collectVar = lcFirst(`${rel.from}${rel.type.replace(/_/g, '')}List`);
				lines.push('CALL {');
				lines.push('  WITH node');
				lines.push(`  OPTIONAL MATCH (s:${rel.from})-[:${rel.type}]->(node:${nodeLabel})`);
				lines.push(`  RETURN collect(DISTINCT s { .* })[..10] AS ${collectVar}`);
				lines.push('}');
				returnFields.push(collectVar);
			}
		}
	}

	// === Cross-standard bridges ===
	// Only actual cross-standard relationships (MAPS_TO, ALIGNS_WITH, STRUCTURALLY_MAPS_TO)
	const BRIDGE_TYPES = ['MAPS_TO', 'ALIGNS_WITH', 'STRUCTURALLY_MAPS_TO'];
	const crossBridges = schema.relationships.filter(r =>
		BRIDGE_TYPES.includes(r.type) &&
		(vectorNodeLabels.includes(r.from) || vectorNodeLabels.includes(r.to))
	);

	if (crossBridges.length > 0) {
		lines.push('');
		lines.push('// Cross-standard bridge traversals');

		for (const bridge of crossBridges) {
			// Forward: node as source
			const fwdVar = lcFirst(`${bridge.from}MapsTo${bridge.to}`);
			const fwdProps = getKeyProps(bridge.to, schema, 't');
			lines.push('CALL {');
			lines.push('  WITH node');
			lines.push(`  OPTIONAL MATCH (node:${bridge.from})-[m:${bridge.type}]->(t:${bridge.to})`);
			lines.push(`  RETURN collect({ ${fwdProps}, confidence: m.confidence, source: m.source })[..5] AS ${fwdVar}`);
			lines.push('}');
			returnFields.push(fwdVar);

			// Reverse: node as target
			const revVar = lcFirst(`${bridge.to}MappedFrom${bridge.from}`);
			lines.push('CALL {');
			lines.push('  WITH node');
			lines.push(`  OPTIONAL MATCH (s:${bridge.from})-[m:${bridge.type}]->(node:${bridge.to})`);

			// Special case: SifField->CedsProperty — include parent SifObject
			if (bridge.from === 'SifField') {
				lines.push('  OPTIONAL MATCH (obj:SifObject)-[:HAS_FIELD]->(s)');
				lines.push(`  RETURN collect({ object: obj.name, field: s.name, confidence: m.confidence })[..5] AS ${revVar}`);
			} else {
				const revProps = getKeyProps(bridge.from, schema, 's');
				lines.push(`  RETURN collect({ ${revProps}, confidence: m.confidence })[..5] AS ${revVar}`);
			}
			lines.push('}');
			returnFields.push(revVar);
		}
	}

	// === SIF reference network ===
	if (vectorNodeLabels.includes('SifField')) {
		lines.push('');
		lines.push('// SIF reference network');
		lines.push('CALL {');
		lines.push('  WITH node');
		lines.push('  OPTIONAL MATCH (sifObj:SifObject)-[:HAS_FIELD]->(node:SifField)');
		lines.push('  OPTIONAL MATCH (referrer:SifObject)-[:REFERENCES]->(sifObj)');
		lines.push('  RETURN collect(DISTINCT referrer.name)[..10] AS sifReferencedBy');
		lines.push('}');
		returnFields.push('sifReferencedBy');

		lines.push('CALL {');
		lines.push('  WITH node');
		lines.push('  OPTIONAL MATCH (sifObj:SifObject)-[:HAS_FIELD]->(node:SifField)');
		lines.push('  OPTIONAL MATCH (sifObj)-[:REFERENCES]->(referenced:SifObject)');
		lines.push('  RETURN collect(DISTINCT referenced.name)[..10] AS sifReferencesTo');
		lines.push('}');
		returnFields.push('sifReferencesTo');
	}

	// === CEDS class context ===
	if (vectorNodeLabels.includes('CedsProperty')) {
		lines.push('');
		lines.push('// CEDS class context');
		lines.push('CALL {');
		lines.push('  WITH node');
		lines.push('  OPTIONAL MATCH (cedsClass:CedsClass)-[:HAS_PROPERTY]->(node:CedsProperty)');
		lines.push('  RETURN collect(DISTINCT cedsClass.label) AS cedsClasses');
		lines.push('}');
		returnFields.push('cedsClasses');

		lines.push('CALL {');
		lines.push('  WITH node');
		lines.push('  OPTIONAL MATCH (node:CedsProperty)-[:HAS_OPTION_SET]->(os:CedsOptionSet)');
		lines.push('  RETURN collect(DISTINCT os.label) AS cedsOptionSets');
		lines.push('}');
		returnFields.push('cedsOptionSets');
	}

	// === RETURN ===
	lines.push('');
	lines.push('// === Return ===');
	const uniqueFields = [...new Set(returnFields)];
	lines.push(`RETURN\n  ${uniqueFields.join(',\n  ')}`);
	lines.push('');

	return lines.join('\n');
};

// Get key property accessors for return maps
const getKeyProps = (label, schema, varName) => {
	const nodeType = schema.nodeTypes.find(n => n.label === label);
	if (!nodeType) return `name: ${varName}.name`;

	const props = nodeType.properties;
	const keyProps = [];

	if (props.includes('cedsId')) keyProps.push(`cedsId: ${varName}.cedsId`);
	if (props.includes('label') && label.startsWith('Ceds')) keyProps.push(`label: ${varName}.label`);
	if (props.includes('name') && !label.startsWith('Ceds')) keyProps.push(`name: ${varName}.name`);
	if (props.includes('xpath')) keyProps.push(`xpath: ${varName}.xpath`);

	return keyProps.length > 0 ? keyProps.join(', ') : `name: ${varName}.name`;
};

// Resolve umbrella label to specific
const resolveUmbrella = (label, schema) => {
	if (!UMBRELLA_LABELS.includes(label)) return label;
	const candidates = schema.nodeTypes
		.filter(nt => nt.properties.includes('embedding') && !UMBRELLA_LABELS.includes(nt.label))
		.sort((a, b) => b.count - a.count);
	return candidates.length > 0 ? candidates[0].label : label;
};

// Lowercase first character
const lcFirst = (str) => str.charAt(0).toLowerCase() + str.slice(1);

module.exports = { generateTraversal };
