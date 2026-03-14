'use strict';

// bridgeBuilder.js — Create cross-standard edges between CEDS and SIF
//
// MAPS_TO — field-level mapping (from cedsId annotations + embedding inference)
// ALIGNS_WITH — codeset/value set comparison
// STRUCTURALLY_MAPS_TO — class-level correspondence inferred from field-level mappings

const https = require('https');

// =====================================================================
// VOYAGE AI QUERY EMBEDDING
// =====================================================================

const embedQuery = (text, apiKey) => new Promise((resolve, reject) => {
	const body = JSON.stringify({
		model: 'voyage-3',
		input: [text],
		input_type: 'query'
	});

	const req = https.request({
		hostname: 'api.voyageai.com',
		path: '/v1/embeddings',
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'Authorization': `Bearer ${apiKey}`
		}
	}, (res) => {
		let data = '';
		res.on('data', chunk => data += chunk);
		res.on('end', () => {
			if (res.statusCode !== 200) {
				reject(new Error(`Voyage API ${res.statusCode}: ${data}`));
				return;
			}
			const parsed = JSON.parse(data);
			resolve(parsed.data[0].embedding);
		});
	});
	req.on('error', reject);
	req.write(body);
	req.end();
});

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// =====================================================================
// BUILD BRIDGES
// =====================================================================

const buildBridges = async ({ neo4jBoltUri, neo4jUser, neo4jPassword, voyageApiKey }) => {
	const neo4j = require('neo4j-driver');
	const { xLog } = process.global;

	const driver = neo4j.driver(neo4jBoltUri, neo4j.auth.basic(neo4jUser, neo4jPassword), { encrypted: false });

	try {
		await driver.verifyConnectivity();
	} catch (err) {
		throw new Error(`Cannot connect to Neo4j: ${err.message}`);
	}

	const session = driver.session();

	try {
		// Clear existing bridge edges
		xLog.status('[bridgeBuilder] Clearing existing bridge edges...');
		await session.run('MATCH ()-[r:MAPS_TO]->() DELETE r');
		await session.run('MATCH ()-[r:ALIGNS_WITH]->() DELETE r');
		await session.run('MATCH ()-[r:STRUCTURALLY_MAPS_TO]->() DELETE r');

		// =================================================================
		// Phase 1: MAPS_TO from cedsId annotations (spec-sourced, confidence=1.0)
		// =================================================================
		// SIF stores CEDS Global IDs (e.g., "000040"). The CEDS v14 RDF uses
		// Element IDs with a "P" prefix (e.g., "P000040"). Concatenation resolves them.
		// ~63 SIF cedsIds don't exist in CEDS v14 RDF (deprecated/renumbered).
		xLog.status('[bridgeBuilder] Phase 1: Creating MAPS_TO edges from cedsId annotations...');

		const batchSize = 500;

		const annotatedResult = await session.run(`
			MATCH (f:SifField)
			WHERE f.cedsId IS NOT NULL AND f.cedsId <> ''
			WITH f, 'P' + f.cedsId AS derivedId
			MATCH (p:CedsProperty {cedsId: derivedId})
			RETURN count(*) AS matchable
		`);
		const matchableCount = annotatedResult.records[0].get('matchable').toNumber();

		// Create the edges in batches
		let specMapped = 0;
		const specResult = await session.run(`
			MATCH (f:SifField)
			WHERE f.cedsId IS NOT NULL AND f.cedsId <> ''
			WITH f, 'P' + f.cedsId AS derivedId
			MATCH (p:CedsProperty {cedsId: derivedId})
			CREATE (f)-[:MAPS_TO {source: 'spec-annotation', confidence: 1.0, reviewed: true}]->(p)
			RETURN count(*) AS created
		`);
		specMapped = specResult.records[0].get('created').toNumber();

		xLog.status(`[bridgeBuilder] Created ${specMapped} MAPS_TO edges from spec annotations (${matchableCount} matchable)`);

		// =================================================================
		// Phase 2: MAPS_TO from embedding similarity (inferred)
		// =================================================================
		if (voyageApiKey) {
			xLog.status('[bridgeBuilder] Phase 2: Inferring MAPS_TO edges from embedding similarity...');

			// Get SIF fields that have embeddings but NO spec-annotation MAPS_TO
			const unannotatedResult = await session.run(`
				MATCH (obj:SifObject)-[:HAS_FIELD]->(f:SifField)
				WHERE f.embedding IS NOT NULL
				AND NOT EXISTS { MATCH (f)-[:MAPS_TO {source: 'spec-annotation'}]->() }
				RETURN f.xpath AS xpath, obj.name AS objectName, f.name AS fieldName, f.embedding AS embedding
			`);

			const unannotatedFields = unannotatedResult.records.map(r => ({
				xpath: r.get('xpath'),
				objectName: r.get('objectName'),
				fieldName: r.get('fieldName'),
				embedding: r.get('embedding'),
			}));

			xLog.status(`[bridgeBuilder] Found ${unannotatedFields.length} unannotated SIF fields with embeddings`);

			// For each unannotated field, find top 3 CEDS property matches
			let inferredCount = 0;
			const SIMILARITY_THRESHOLD = 0.6;
			const TOP_K = 3;

			for (let i = 0; i < unannotatedFields.length; i += batchSize) {
				const batch = unannotatedFields.slice(i, i + batchSize);

				for (const field of batch) {
					const vecResult = await session.run(`
						CALL db.index.vector.queryNodes('ceds14_vector', $topK, $embedding)
						YIELD node, score
						WHERE score > $threshold AND node:CedsProperty
						RETURN node.cedsId AS cedsId, score AS similarity
					`, {
						topK: neo4j.int(TOP_K + 5), // fetch extra to filter by CedsProperty
						embedding: field.embedding,
						threshold: SIMILARITY_THRESHOLD,
					});

					const matches = vecResult.records
						.map(r => ({ cedsId: r.get('cedsId'), similarity: r.get('similarity') }))
						.slice(0, TOP_K);

					if (matches.length > 0) {
						await session.run(`
							UNWIND $matches AS m
							MATCH (f:SifField {xpath: $xpath})
							MATCH (p:CedsProperty {cedsId: m.cedsId})
							CREATE (f)-[:MAPS_TO {source: 'embedding-inferred', confidence: m.similarity, reviewed: false}]->(p)
						`, { xpath: field.xpath, matches });
						inferredCount += matches.length;
					}
				}

				if (i + batchSize < unannotatedFields.length && (i / batchSize) % 10 === 0) {
					xLog.status(`[bridgeBuilder] Inferred mappings: ${inferredCount} so far (${i + batchSize}/${unannotatedFields.length} fields processed)...`);
				}
			}

			xLog.status(`[bridgeBuilder] Created ${inferredCount} inferred MAPS_TO edges`);
		} else {
			xLog.status('[bridgeBuilder] Phase 2: Skipped (no voyageApiKey — run with API key to infer mappings)');
		}

		// =================================================================
		// Phase 3: ALIGNS_WITH — codeset comparison
		// =================================================================
		xLog.status('[bridgeBuilder] Phase 3: Creating ALIGNS_WITH edges for codesets...');

		// Find SIF fields with both a cedsId AND a codeset, where the CEDS property also has an option set
		const codesetResult = await session.run(`
			MATCH (f:SifField)-[:MAPS_TO {source: 'spec-annotation'}]->(p:CedsProperty)
			MATCH (f)-[:CONSTRAINED_BY]->(sifCs:SifCodeset)
			MATCH (p)-[:HAS_OPTION_SET]->(cedsOs:CedsOptionSet)
			RETURN DISTINCT sifCs.fingerprint AS sifFingerprint, sifCs.values AS sifValues,
				cedsOs.cedsId AS cedsOsCedsId
		`);

		let alignedCount = 0;
		for (const rec of codesetResult.records) {
			const sifFingerprint = rec.get('sifFingerprint');
			const sifValues = rec.get('sifValues');
			const cedsOsCedsId = rec.get('cedsOsCedsId');

			// Get CEDS option values
			const cedsValuesResult = await session.run(`
				MATCH (os:CedsOptionSet {cedsId: $cedsId})-[:HAS_VALUE]->(ov:CedsOptionValue)
				RETURN collect(ov.label) AS cedsValues
			`, { cedsId: cedsOsCedsId });

			if (cedsValuesResult.records.length === 0) continue;
			const cedsValues = cedsValuesResult.records[0].get('cedsValues');

			// Compare value sets
			const sifSet = new Set(sifValues.map(v => v.toLowerCase()));
			const cedsSet = new Set(cedsValues.map(v => v.toLowerCase()));

			const sifOnly = sifValues.filter(v => !cedsSet.has(v.toLowerCase()));
			const cedsOnly = cedsValues.filter(v => !sifSet.has(v.toLowerCase()));
			const overlap = sifValues.filter(v => cedsSet.has(v.toLowerCase()));

			let alignmentType;
			if (sifOnly.length === 0 && cedsOnly.length === 0) alignmentType = 'exact';
			else if (sifOnly.length === 0) alignmentType = 'subset';
			else if (cedsOnly.length === 0) alignmentType = 'superset';
			else if (overlap.length > 0) alignmentType = 'partial';
			else alignmentType = 'disjoint';

			const coveragePercent = cedsValues.length > 0
				? Math.round((overlap.length / cedsValues.length) * 100)
				: 0;

			await session.run(`
				MATCH (sifCs:SifCodeset {fingerprint: $fingerprint})
				MATCH (cedsOs:CedsOptionSet {cedsId: $cedsId})
				CREATE (sifCs)-[:ALIGNS_WITH {
					alignmentType: $alignmentType,
					coveragePercent: $coveragePercent,
					sifOnlyCount: $sifOnlyCount,
					cedsOnlyCount: $cedsOnlyCount,
					overlapCount: $overlapCount
				}]->(cedsOs)
			`, {
				fingerprint: sifFingerprint,
				cedsId: cedsOsCedsId,
				alignmentType,
				coveragePercent: neo4j.int(coveragePercent),
				sifOnlyCount: neo4j.int(sifOnly.length),
				cedsOnlyCount: neo4j.int(cedsOnly.length),
				overlapCount: neo4j.int(overlap.length),
			});
			alignedCount++;
		}

		xLog.status(`[bridgeBuilder] Created ${alignedCount} ALIGNS_WITH edges`);

		// =================================================================
		// Phase 4: STRUCTURALLY_MAPS_TO — class-level inference
		// =================================================================
		xLog.status('[bridgeBuilder] Phase 4: Inferring STRUCTURALLY_MAPS_TO edges...');

		// For each SIF complex type, find which CEDS classes its fields map to most
		const structuralResult = await session.run(`
			MATCH (f:SifField)-[:MEMBER_OF]->(ct:SifComplexType)
			MATCH (f)-[:MAPS_TO]->(p:CedsProperty)
			MATCH (c:CedsClass)-[:HAS_PROPERTY]->(p)
			RETURN ct.name AS complexTypeName, c.cedsId AS classCedsId, c.label AS classLabel,
				count(f) AS mappedFieldCount
			ORDER BY ct.name, mappedFieldCount DESC
		`);

		// Group by complex type, take top CEDS class
		const ctMappings = new Map();
		for (const rec of structuralResult.records) {
			const ctName = rec.get('complexTypeName');
			if (!ctMappings.has(ctName)) {
				ctMappings.set(ctName, {
					classCedsId: rec.get('classCedsId'),
					classLabel: rec.get('classLabel'),
					mappedFieldCount: rec.get('mappedFieldCount').toNumber(),
				});
			}
		}

		let structuralCount = 0;
		for (const [ctName, mapping] of ctMappings) {
			if (mapping.mappedFieldCount >= 2) { // require at least 2 mapped fields
				await session.run(`
					MATCH (ct:SifComplexType {name: $ctName})
					MATCH (c:CedsClass {cedsId: $classCedsId})
					CREATE (ct)-[:STRUCTURALLY_MAPS_TO {
						mappedFieldCount: $count,
						cedsClassLabel: $classLabel
					}]->(c)
				`, {
					ctName,
					classCedsId: mapping.classCedsId,
					count: neo4j.int(mapping.mappedFieldCount),
					classLabel: mapping.classLabel,
				});
				structuralCount++;
			}
		}

		xLog.status(`[bridgeBuilder] Created ${structuralCount} STRUCTURALLY_MAPS_TO edges`);
		xLog.status('[bridgeBuilder] === BRIDGE BUILDING COMPLETE ===');

	} finally {
		await session.close();
		await driver.close();
	}
};

module.exports = { buildBridges };
