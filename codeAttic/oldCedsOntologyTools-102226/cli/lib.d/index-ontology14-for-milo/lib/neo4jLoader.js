'use strict';

// neo4jLoader.js — Load parsed CEDS Ontology entities into Neo4j
// Creates nodes with :CEDS label, relationships, constraints, indexes, and root node.

const runBatched = async (session, cypher, items, batchSize) => {
	for (let i = 0; i < items.length; i += batchSize) {
		const batch = items.slice(i, i + batchSize);
		await session.run(cypher, { batch });
	}
};

const loadToNeo4j = async ({ entities, version, counts, neo4jBoltUri, neo4jUser, neo4jPassword }) => {
	const neo4j = require('neo4j-driver');
	const { xLog } = process.global;

	if (!neo4jBoltUri || !neo4jUser || !neo4jPassword) {
		throw new Error('Missing Neo4j config (neo4jBoltUri, neo4jUser, neo4jPassword)');
	}

	xLog.status(`[neo4jLoader] Connecting to Neo4j at ${neo4jBoltUri}...`);
	const driver = neo4j.driver(neo4jBoltUri, neo4j.auth.basic(neo4jUser, neo4jPassword));

	try {
		await driver.verifyConnectivity();
		xLog.status('[neo4jLoader] Connected to Neo4j.');
	} catch (err) {
		throw new Error(`Cannot connect to Neo4j: ${err.message}`);
	}

	const session = driver.session();

	try {
		// Constraints
		xLog.status('[neo4jLoader] Creating constraints...');
		const constraints = [
			'CREATE CONSTRAINT IF NOT EXISTS FOR (n:CedsClass) REQUIRE n.cedsId IS UNIQUE',
			'CREATE CONSTRAINT IF NOT EXISTS FOR (n:CedsProperty) REQUIRE n.cedsId IS UNIQUE',
			'CREATE CONSTRAINT IF NOT EXISTS FOR (n:CedsOptionSet) REQUIRE n.cedsId IS UNIQUE',
			'CREATE CONSTRAINT IF NOT EXISTS FOR (n:CedsOptionValue) REQUIRE n.cedsId IS UNIQUE',
			'CREATE CONSTRAINT IF NOT EXISTS FOR (n:CedsOntology) REQUIRE n.name IS UNIQUE',
		];
		for (const c of constraints) {
			await session.run(c);
		}

		// Indexes on uri
		xLog.status('[neo4jLoader] Creating indexes...');
		const indexes = [
			'CREATE INDEX IF NOT EXISTS FOR (n:CedsClass) ON (n.uri)',
			'CREATE INDEX IF NOT EXISTS FOR (n:CedsProperty) ON (n.uri)',
			'CREATE INDEX IF NOT EXISTS FOR (n:CedsOptionSet) ON (n.uri)',
			'CREATE INDEX IF NOT EXISTS FOR (n:CedsOptionValue) ON (n.uri)',
		];
		for (const idx of indexes) {
			await session.run(idx);
		}
		await session.run('CALL db.awaitIndexes(300)');

		// Filter out null cedsId entities
		const { classes: rawClasses, properties: rawProperties, optionSets: rawOptionSets, optionValues: rawOptionValues } = entities;
		const classes = rawClasses.filter(c => c.cedsId);
		const properties = rawProperties.filter(p => p.cedsId);
		const optionSets = rawOptionSets.filter(os => os.cedsId);
		const optionValues = rawOptionValues.filter(ov => ov.cedsId);

		const skipped = (rawClasses.length - classes.length) + (rawProperties.length - properties.length) +
			(rawOptionSets.length - optionSets.length) + (rawOptionValues.length - optionValues.length);
		if (skipped > 0) {
			xLog.status(`[neo4jLoader] Skipped ${skipped} entities with null cedsId`);
		}

		// Load CedsClass nodes
		xLog.status(`[neo4jLoader] Loading ${classes.length} CedsClass nodes...`);
		await runBatched(session, `
			UNWIND $batch AS item
			MERGE (n:CedsClass:CEDS {cedsId: item.cedsId})
			SET n.label = item.label, n.description = item.description, n.notation = item.notation, n.uri = item.uri
		`, classes, 500);

		// Load CedsProperty nodes
		xLog.status(`[neo4jLoader] Loading ${properties.length} CedsProperty nodes...`);
		await runBatched(session, `
			UNWIND $batch AS item
			MERGE (n:CedsProperty:CEDS {cedsId: item.cedsId})
			SET n.label = item.label, n.description = item.description, n.notation = item.notation, n.uri = item.uri,
			    n.dataType = item.dataType, n.textFormat = item.textFormat, n.maxLength = item.maxLength
		`, properties, 500);

		// Load CedsOptionSet nodes
		xLog.status(`[neo4jLoader] Loading ${optionSets.length} CedsOptionSet nodes...`);
		await runBatched(session, `
			UNWIND $batch AS item
			MERGE (n:CedsOptionSet:CEDS {cedsId: item.cedsId})
			SET n.label = item.label, n.description = item.description, n.notation = item.notation, n.uri = item.uri
		`, optionSets, 500);

		// Load CedsOptionValue nodes
		xLog.status(`[neo4jLoader] Loading ${optionValues.length} CedsOptionValue nodes...`);
		await runBatched(session, `
			UNWIND $batch AS item
			MERGE (n:CedsOptionValue:CEDS {cedsId: item.cedsId})
			SET n.label = item.label, n.description = item.description, n.notation = item.notation, n.uri = item.uri
		`, optionValues, 500);

		// HAS_PROPERTY relationships (CedsClass -> CedsProperty via domainRefs)
		const hasPropertyBatch = [];
		for (const prop of properties) {
			if (prop.domainRefs && prop.domainRefs.length) {
				for (const classUri of prop.domainRefs) {
					hasPropertyBatch.push({ propCedsId: prop.cedsId, classUri });
				}
			}
		}
		xLog.status(`[neo4jLoader] Creating ${hasPropertyBatch.length} HAS_PROPERTY relationships...`);
		await runBatched(session, `
			UNWIND $batch AS item
			MATCH (p:CedsProperty:CEDS {cedsId: item.propCedsId})
			MATCH (c:CEDS {uri: item.classUri})
			MERGE (c)-[:HAS_PROPERTY]->(p)
		`, hasPropertyBatch, 1000);

		// HAS_OPTION_SET relationships (CedsProperty -> CedsOptionSet via rangeRefs)
		const optionSetUriSet = new Set(optionSets.map(os => os.uri));
		const hasOptionSetBatch = [];
		for (const prop of properties) {
			if (prop.rangeRefs && prop.rangeRefs.length) {
				for (const rangeUri of prop.rangeRefs) {
					if (optionSetUriSet.has(rangeUri)) {
						hasOptionSetBatch.push({ propCedsId: prop.cedsId, optionSetUri: rangeUri });
					}
				}
			}
		}
		xLog.status(`[neo4jLoader] Creating ${hasOptionSetBatch.length} HAS_OPTION_SET relationships...`);
		await runBatched(session, `
			UNWIND $batch AS item
			MATCH (p:CedsProperty:CEDS {cedsId: item.propCedsId})
			MATCH (os:CedsOptionSet:CEDS {uri: item.optionSetUri})
			MERGE (p)-[:HAS_OPTION_SET]->(os)
		`, hasOptionSetBatch, 1000);

		// HAS_VALUE relationships (CedsOptionSet -> CedsOptionValue via inSchemeRef)
		const hasValueBatch = [];
		for (const ov of optionValues) {
			if (ov.inSchemeRef) {
				hasValueBatch.push({ valueCedsId: ov.cedsId, schemeUri: ov.inSchemeRef });
			}
		}
		xLog.status(`[neo4jLoader] Creating ${hasValueBatch.length} HAS_VALUE relationships...`);
		await runBatched(session, `
			UNWIND $batch AS item
			MATCH (ov:CedsOptionValue:CEDS {cedsId: item.valueCedsId})
			MATCH (os:CedsOptionSet:CEDS {uri: item.schemeUri})
			MERGE (os)-[:HAS_VALUE]->(ov)
		`, hasValueBatch, 1000);

		// SUBCLASS_OF relationships (CedsClass -> CedsClass via parentRef)
		const subclassBatch = [];
		for (const cls of classes) {
			if (cls.parentRef) {
				subclassBatch.push({ childCedsId: cls.cedsId, parentUri: cls.parentRef });
			}
		}
		xLog.status(`[neo4jLoader] Creating ${subclassBatch.length} SUBCLASS_OF relationships...`);
		await runBatched(session, `
			UNWIND $batch AS item
			MATCH (child:CedsClass:CEDS {cedsId: item.childCedsId})
			MATCH (parent:CedsClass:CEDS {uri: item.parentUri})
			MERGE (child)-[:SUBCLASS_OF]->(parent)
		`, subclassBatch, 1000);

		// Root node: CedsOntology
		xLog.status('[neo4jLoader] Creating CedsOntology root node...');
		await session.run(`
			MERGE (root:CedsOntology:CEDS {name: 'CEDS'})
			SET root.version = $version, root.importDate = datetime(), root.sourceUri = 'https://w3id.org/CEDStandards/terms/',
			    root.classCount = $classCount, root.propertyCount = $propertyCount,
			    root.optionSetCount = $optionSetCount, root.optionValueCount = $optionValueCount
		`, {
			version,
			classCount: neo4j.int(counts.classes),
			propertyCount: neo4j.int(counts.properties),
			optionSetCount: neo4j.int(counts.optionSets),
			optionValueCount: neo4j.int(counts.optionValues),
		});

		// PART_OF relationships: all CEDS nodes -> CedsOntology root
		xLog.status('[neo4jLoader] Creating PART_OF relationships to root...');
		await session.run(`
			MATCH (n:CEDS) WHERE NOT n:CedsOntology
			MATCH (root:CedsOntology)
			MERGE (n)-[:PART_OF]->(root)
		`);

		xLog.status('[neo4jLoader] === NEO4J LOAD COMPLETE ===');

	} finally {
		await session.close();
		await driver.close();
	}
};

module.exports = { loadToNeo4j };
