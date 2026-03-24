'use strict';

// schemaExporter.js — Query Neo4j schema and export schema-summary.json
// Used by traversalGenerator to produce traversal.cypher

const fs = require('fs');
const path = require('path');

const exportSchema = async ({ neo4jBoltUri, neo4jUser, neo4jPassword, outputDir }) => {
	const neo4j = require('neo4j-driver');
	const { xLog } = process.global;

	xLog.status('[schemaExporter] Querying graph schema...');

	const driver = neo4j.driver(neo4jBoltUri, neo4j.auth.basic(neo4jUser, neo4jPassword), { encrypted: false });
	const session = driver.session();

	const toNumber = (val) => {
		if (val === null || val === undefined) return 0;
		if (typeof val === 'number') return val;
		if (typeof val.toNumber === 'function') return val.toNumber();
		return Number(val);
	};

	try {
		// 1. Node labels with counts
		xLog.status('[schemaExporter] Querying node types...');
		const nodeResult = await session.run(`
			CALL db.labels() YIELD label
			CALL {
				WITH label
				MATCH (n)
				WHERE label IN labels(n)
				RETURN count(n) AS cnt
			}
			RETURN label, cnt AS count
			ORDER BY cnt DESC
		`);

		// Get properties per label via schema introspection
		const propResult = await session.run(`
			CALL db.schema.nodeTypeProperties() YIELD nodeLabels, propertyName
			RETURN nodeLabels, collect(DISTINCT propertyName) AS properties
		`);

		const propsByLabel = new Map();
		for (const rec of propResult.records) {
			const labels = rec.get('nodeLabels') || [];
			const props = rec.get('properties');
			for (const label of labels) {
				if (!propsByLabel.has(label)) propsByLabel.set(label, new Set());
				for (const p of props) propsByLabel.get(label).add(p);
			}
		}

		const nodeTypes = nodeResult.records.map(rec => {
			const label = rec.get('label');
			return {
				label,
				count: toNumber(rec.get('count')),
				properties: propsByLabel.has(label) ? [...propsByLabel.get(label)] : [],
			};
		});

		// 2. Relationship types with from/to labels and counts
		xLog.status('[schemaExporter] Querying relationship types...');
		// Pick most specific label — filter out umbrella labels (CEDS, SifModel)
		const relResult = await session.run(`
			MATCH (a)-[r]->(b)
			WITH type(r) AS relType,
				COALESCE([l IN labels(a) WHERE NOT l IN ['CEDS', 'SifModel']][0], labels(a)[0]) AS fromLabel,
				COALESCE([l IN labels(b) WHERE NOT l IN ['CEDS', 'SifModel']][0], labels(b)[0]) AS toLabel
			WITH relType, fromLabel, toLabel, count(*) AS cnt
			RETURN relType, fromLabel, toLabel, cnt AS count
			ORDER BY cnt DESC
		`);

		const relMap = new Map();
		for (const rec of relResult.records) {
			const relType = rec.get('relType');
			const fromLabel = rec.get('fromLabel');
			const toLabel = rec.get('toLabel');
			const count = toNumber(rec.get('count'));
			const key = `${relType}:${fromLabel}:${toLabel}`;

			if (!relMap.has(key)) {
				relMap.set(key, { type: relType, from: fromLabel, to: toLabel, count });
			}
		}

		// Compute avgCardinality for each relationship type
		// avgCardinality = count / distinctSourceNodes
		xLog.status('[schemaExporter] Computing cardinality...');
		const relationships = [];
		for (const rel of relMap.values()) {
			const cardResult = await session.run(`
				MATCH (a:\`${rel.from}\`)-[r:\`${rel.type}\`]->(b:\`${rel.to}\`)
				WITH a, count(b) AS outDegree
				RETURN avg(outDegree) AS avgCard
			`);
			const avgCard = cardResult.records.length > 0
				? toNumber(cardResult.records[0].get('avgCard'))
				: 1;

			relationships.push({
				type: rel.type,
				from: rel.from,
				to: rel.to,
				count: rel.count,
				avgCardinality: Math.round(avgCard * 10) / 10,
			});
		}

		// 3. Vector indexes
		xLog.status('[schemaExporter] Querying vector indexes...');
		const vecResult = await session.run(`
			SHOW INDEXES YIELD name, type, labelsOrTypes, properties, options
			WHERE type = 'VECTOR'
			RETURN name, labelsOrTypes, properties, options
		`);

		const vectorIndexes = [];
		for (const rec of vecResult.records) {
			const options = rec.get('options') || {};
			const indexConfig = options.indexConfig || {};
			const indexName = rec.get('name');
			const indexLabel = (rec.get('labelsOrTypes') || [])[0];
			const embeddingProp = (rec.get('properties') || [])[0] || 'embedding';

			// Resolve umbrella labels to ALL specific embedded types
			// CEDS umbrella has CedsProperty, CedsOptionValue, CedsOptionSet, CedsClass — all with embeddings
			let primaryNodeLabel = indexLabel;
			const embeddedTypes = [];
			const umbrellaLabels = ['CEDS', 'SifModel'];
			if (umbrellaLabels.includes(indexLabel)) {
				const typeCheckResult = await session.run(`
					MATCH (n:\`${indexLabel}\`)
					WHERE n.\`${embeddingProp}\` IS NOT NULL
					WITH labels(n) AS lbls
					UNWIND lbls AS lbl
					WITH lbl WHERE NOT lbl IN $umbrellas
					RETURN lbl AS specificLabel, count(*) AS cnt
					ORDER BY cnt DESC
				`, { umbrellas: umbrellaLabels });

				for (const rec of typeCheckResult.records) {
					embeddedTypes.push({
						label: rec.get('specificLabel'),
						count: toNumber(rec.get('cnt')),
					});
				}

				// Primary = the most-connected type with cross-type relationships
				// For CEDS, CedsProperty is more useful than CedsOptionValue for graph traversal
				// because it has HAS_PROPERTY, HAS_OPTION_SET, MAPS_TO relationships
				if (embeddedTypes.length > 0) {
					primaryNodeLabel = embeddedTypes[0].label;
				}
			}

			vectorIndexes.push({
				name: indexName,
				nodeLabel: indexLabel,
				primaryNodeLabel,
				embeddedTypes: embeddedTypes.length > 0 ? embeddedTypes : [{ label: indexLabel, count: 0 }],
				dimensions: toNumber(indexConfig['vector.dimensions']) || 1024,
				similarity: indexConfig['vector.similarity_function'] || 'cosine',
			});
		}

		// 4. Fulltext indexes
		xLog.status('[schemaExporter] Querying fulltext indexes...');
		const ftResult = await session.run(`
			SHOW INDEXES YIELD name, type, labelsOrTypes
			WHERE type = 'FULLTEXT'
			RETURN name, labelsOrTypes
		`);

		const fulltextIndexes = ftResult.records.map(rec => ({
			name: rec.get('name'),
			nodeLabels: rec.get('labelsOrTypes') || [],
		}));

		// Assemble schema summary
		const schema = {
			generatedAt: new Date().toISOString(),
			container: 'rag_DataModelExplorer',
			vectorIndexes,
			fulltextIndexes,
			nodeTypes,
			relationships,
		};

		// Write to output directory
		if (!fs.existsSync(outputDir)) {
			fs.mkdirSync(outputDir, { recursive: true });
		}

		const outputPath = path.join(outputDir, 'schema-summary.json');
		fs.writeFileSync(outputPath, JSON.stringify(schema, null, 2));
		xLog.status(`[schemaExporter] Wrote ${outputPath}`);
		xLog.status(`[schemaExporter] ${vectorIndexes.length} vector indexes, ${fulltextIndexes.length} fulltext indexes, ${nodeTypes.length} node types, ${relationships.length} relationship types`);

		return schema;
	} finally {
		await session.close();
		await driver.close();
	}
};

module.exports = { exportSchema };
