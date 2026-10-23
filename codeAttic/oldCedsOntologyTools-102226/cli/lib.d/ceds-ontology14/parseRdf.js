'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const xml2js = require('xml2js');
const configFileProcessor = require('qtools-config-file-processor');

const moduleName = path.basename(__filename).replace(/\.js$/, '');

const isLoadMode = process.argv.includes('--load');
const isIndexMode = process.argv.includes('--index');
const isEmbedMode = process.argv.includes('--embed');

const CEDS_URI_PREFIX = 'https://w3id.org/CEDStandards/terms/';
const CONCEPT_SCHEME_URI = 'http://www.w3.org/2004/02/skos/core#ConceptScheme';
const XSD_PREFIX = 'http://www.w3.org/2001/XMLSchema#';

// ============================================================
// Helpers
// ============================================================

const getText = (element, tagName) => {
	const values = element[tagName];
	if (!values || !values.length) { return undefined; }
	const val = values[0];
	if (typeof val === 'string') { return val; }
	if (typeof val === 'object' && val['_']) { return val['_']; }
	return undefined;
};

const getAttr = (element, attrName) => {
	const attrs = element['$'];
	if (!attrs) { return undefined; }
	return attrs[attrName];
};

const getResourceRefs = (element, tagName) => {
	const values = element[tagName];
	if (!values || !values.length) { return []; }
	return values
		.map(val => {
			if (typeof val === 'object' && val['$']) {
				return val['$']['rdf:resource'];
			}
			return undefined;
		})
		.filter(Boolean);
};

const isCedsUri = (uri) => uri && uri.startsWith(CEDS_URI_PREFIX);
const isW3Uri = (uri) => uri && uri.startsWith('http://www.w3.org/');

const hasConceptSchemeType = (element) => {
	const types = element['rdf:type'];
	if (!types || !types.length) { return false; }
	return types.some(t => {
		if (typeof t === 'object' && t['$']) {
			return t['$']['rdf:resource'] === CONCEPT_SCHEME_URI;
		}
		return false;
	});
};

// ============================================================
// Entity extractors
// ============================================================

const extractBaseProperties = (element) => {
	const uri = getAttr(element, 'rdf:about');
	return {
		cedsId: getText(element, 'dc:identifier'),
		label: getText(element, 'rdfs:label'),
		description: getText(element, 'dc:description'),
		notation: getText(element, 'skos:notation'),
		uri
	};
};

const extractClass = (element) => {
	const base = extractBaseProperties(element);

	// Find parentRef from rdfs:subClassOf — only simple resource refs (not owl:Restriction blocks)
	const subClassOf = element['rdfs:subClassOf'];
	let parentRef;
	if (subClassOf && subClassOf.length) {
		for (const sc of subClassOf) {
			if (typeof sc === 'object' && sc['$'] && sc['$']['rdf:resource']) {
				const ref = sc['$']['rdf:resource'];
				if (isCedsUri(ref)) {
					parentRef = ref;
					break;
				}
			}
		}
	}

	return { ...base, parentRef };
};

const extractProperty = (element) => {
	const base = extractBaseProperties(element);

	const allRangeRefs = getResourceRefs(element, 'schema:rangeIncludes');
	const domainRefs = getResourceRefs(element, 'schema:domainIncludes').filter(isCedsUri);
	const rangeRefs = allRangeRefs.filter(isCedsUri);

	// Extract dataType from XSD range refs
	const xsdRefs = allRangeRefs.filter(r => r.startsWith(XSD_PREFIX));
	const dataType = xsdRefs.length > 0
		? xsdRefs[0].replace(XSD_PREFIX, '')
		: undefined;

	const textFormat = getText(element, 'textFormat');
	const maxLength = getText(element, 'maxLength');

	const result = { ...base, domainRefs, rangeRefs };
	if (dataType) { result.dataType = dataType; }
	if (textFormat) { result.textFormat = textFormat; }
	if (maxLength) { result.maxLength = maxLength; }

	return result;
};

const extractOptionValue = (element) => {
	const base = extractBaseProperties(element);

	const inSchemeRefs = getResourceRefs(element, 'skos:inScheme');
	const inSchemeRef = inSchemeRefs.length > 0 ? inSchemeRefs[0] : undefined;

	return { ...base, inSchemeRef };
};

// ============================================================
// Neo4j Load Mode
// ============================================================

const getLocalConfig = () => {
	const findProjectRoot = ({ rootFolderName = 'system', closest = true } = {}) =>
		__dirname.replace(new RegExp(`^(.*${closest ? '' : '?'}\\/${rootFolderName}).*$`), "$1");
	const projectRoot = findProjectRoot();

	const configName = os.hostname() == 'qMini.local' ? 'instanceSpecific/qbook' : '';
	const configDirPath = `${projectRoot}/configs/${configName}/`;

	const config = configFileProcessor.getConfig('cedsOntology14Search.ini', configDirPath, { resolve: false });
	const localConfig = config['cedsOntology14Search'] || {};
	return localConfig;
};

const runBatched = async (session, cypher, items, batchSize) => {
	for (let i = 0; i < items.length; i += batchSize) {
		const batch = items.slice(i, i + batchSize);
		await session.run(cypher, { batch });
	}
};

const loadToNeo4j = async (result) => {
	const neo4j = require('neo4j-driver');
	const localConfig = getLocalConfig();

	const { neo4jBoltUri, neo4jUser, neo4jPassword } = localConfig;
	if (!neo4jBoltUri || !neo4jUser || !neo4jPassword) {
		process.stderr.write(`${moduleName}: ERROR — Missing Neo4j config (neo4jBoltUri, neo4jUser, neo4jPassword)\n`);
		process.exit(1);
	}

	process.stderr.write(`${moduleName}: Connecting to Neo4j at ${neo4jBoltUri}...\n`);
	const driver = neo4j.driver(neo4jBoltUri, neo4j.auth.basic(neo4jUser, neo4jPassword), { encrypted: false });

	try {
		await driver.verifyConnectivity();
		process.stderr.write(`${moduleName}: Connected to Neo4j.\n`);
	} catch (err) {
		process.stderr.write(`${moduleName}: ERROR — Cannot connect to Neo4j: ${err.message}\n`);
		process.exit(1);
	}

	const session = driver.session();

	try {
		// --------------------------------------------------------
		// Constraints
		// --------------------------------------------------------
		process.stderr.write(`${moduleName}: Creating constraints...\n`);
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

		// --------------------------------------------------------
		// Indexes on uri
		// --------------------------------------------------------
		process.stderr.write(`${moduleName}: Creating indexes...\n`);
		const indexes = [
			'CREATE INDEX IF NOT EXISTS FOR (n:CedsClass) ON (n.uri)',
			'CREATE INDEX IF NOT EXISTS FOR (n:CedsProperty) ON (n.uri)',
			'CREATE INDEX IF NOT EXISTS FOR (n:CedsOptionSet) ON (n.uri)',
			'CREATE INDEX IF NOT EXISTS FOR (n:CedsOptionValue) ON (n.uri)',
		];
		for (const idx of indexes) {
			await session.run(idx);
		}

		// Wait for indexes to come online
		await session.run('CALL db.awaitIndexes(300)');

		// --------------------------------------------------------
		// Load CedsClass nodes (filter out any with null cedsId)
		// --------------------------------------------------------
		const { classes: rawClasses, properties: rawProperties, optionSets: rawOptionSets, optionValues: rawOptionValues } = result.entities;
		const classes = rawClasses.filter(c => c.cedsId);
		const properties = rawProperties.filter(p => p.cedsId);
		const optionSets = rawOptionSets.filter(os => os.cedsId);
		const optionValues = rawOptionValues.filter(ov => ov.cedsId);

		const skipped = (rawClasses.length - classes.length) + (rawProperties.length - properties.length) +
			(rawOptionSets.length - optionSets.length) + (rawOptionValues.length - optionValues.length);
		if (skipped > 0) {
			process.stderr.write(`${moduleName}: Skipped ${skipped} entities with null cedsId\n`);
		}

		process.stderr.write(`${moduleName}: Loading ${classes.length} CedsClass nodes...\n`);
		await runBatched(session, `
			UNWIND $batch AS item
			MERGE (n:CedsClass:CEDS {cedsId: item.cedsId})
			SET n.label = item.label, n.description = item.description, n.notation = item.notation, n.uri = item.uri
		`, classes, 500);

		// --------------------------------------------------------
		// Load CedsProperty nodes
		// --------------------------------------------------------
		process.stderr.write(`${moduleName}: Loading ${properties.length} CedsProperty nodes...\n`);
		await runBatched(session, `
			UNWIND $batch AS item
			MERGE (n:CedsProperty:CEDS {cedsId: item.cedsId})
			SET n.label = item.label, n.description = item.description, n.notation = item.notation, n.uri = item.uri,
			    n.dataType = item.dataType, n.textFormat = item.textFormat, n.maxLength = item.maxLength
		`, properties, 500);

		// --------------------------------------------------------
		// Load CedsOptionSet nodes
		// --------------------------------------------------------
		process.stderr.write(`${moduleName}: Loading ${optionSets.length} CedsOptionSet nodes...\n`);
		await runBatched(session, `
			UNWIND $batch AS item
			MERGE (n:CedsOptionSet:CEDS {cedsId: item.cedsId})
			SET n.label = item.label, n.description = item.description, n.notation = item.notation, n.uri = item.uri
		`, optionSets, 500);

		// --------------------------------------------------------
		// Load CedsOptionValue nodes
		// --------------------------------------------------------
		process.stderr.write(`${moduleName}: Loading ${optionValues.length} CedsOptionValue nodes...\n`);
		await runBatched(session, `
			UNWIND $batch AS item
			MERGE (n:CedsOptionValue:CEDS {cedsId: item.cedsId})
			SET n.label = item.label, n.description = item.description, n.notation = item.notation, n.uri = item.uri
		`, optionValues, 500);

		// --------------------------------------------------------
		// Relationships: HAS_PROPERTY (CedsClass -> CedsProperty via domainRefs)
		// --------------------------------------------------------
		const hasPropertyBatch = [];
		for (const prop of properties) {
			if (prop.domainRefs && prop.domainRefs.length) {
				for (const classUri of prop.domainRefs) {
					hasPropertyBatch.push({ propCedsId: prop.cedsId, classUri });
				}
			}
		}
		process.stderr.write(`${moduleName}: Creating ${hasPropertyBatch.length} HAS_PROPERTY relationships...\n`);
		await runBatched(session, `
			UNWIND $batch AS item
			MATCH (p:CedsProperty:CEDS {cedsId: item.propCedsId})
			MATCH (c:CEDS {uri: item.classUri})
			MERGE (c)-[:HAS_PROPERTY]->(p)
		`, hasPropertyBatch, 1000);

		// --------------------------------------------------------
		// Relationships: HAS_OPTION_SET (CedsProperty -> CedsOptionSet via rangeRefs)
		// --------------------------------------------------------
		// Build a set of optionSet URIs for fast lookup
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
		process.stderr.write(`${moduleName}: Creating ${hasOptionSetBatch.length} HAS_OPTION_SET relationships...\n`);
		await runBatched(session, `
			UNWIND $batch AS item
			MATCH (p:CedsProperty:CEDS {cedsId: item.propCedsId})
			MATCH (os:CedsOptionSet:CEDS {uri: item.optionSetUri})
			MERGE (p)-[:HAS_OPTION_SET]->(os)
		`, hasOptionSetBatch, 1000);

		// --------------------------------------------------------
		// Relationships: HAS_VALUE (CedsOptionSet -> CedsOptionValue via inSchemeRef)
		// --------------------------------------------------------
		const hasValueBatch = [];
		for (const ov of optionValues) {
			if (ov.inSchemeRef) {
				hasValueBatch.push({ valueCedsId: ov.cedsId, schemeUri: ov.inSchemeRef });
			}
		}
		process.stderr.write(`${moduleName}: Creating ${hasValueBatch.length} HAS_VALUE relationships...\n`);
		await runBatched(session, `
			UNWIND $batch AS item
			MATCH (ov:CedsOptionValue:CEDS {cedsId: item.valueCedsId})
			MATCH (os:CedsOptionSet:CEDS {uri: item.schemeUri})
			MERGE (os)-[:HAS_VALUE]->(ov)
		`, hasValueBatch, 1000);

		// --------------------------------------------------------
		// Relationships: SUBCLASS_OF (CedsClass -> CedsClass via parentRef)
		// --------------------------------------------------------
		const subclassBatch = [];
		for (const cls of classes) {
			if (cls.parentRef) {
				subclassBatch.push({ childCedsId: cls.cedsId, parentUri: cls.parentRef });
			}
		}
		process.stderr.write(`${moduleName}: Creating ${subclassBatch.length} SUBCLASS_OF relationships...\n`);
		await runBatched(session, `
			UNWIND $batch AS item
			MATCH (child:CedsClass:CEDS {cedsId: item.childCedsId})
			MATCH (parent:CedsClass:CEDS {uri: item.parentUri})
			MERGE (child)-[:SUBCLASS_OF]->(parent)
		`, subclassBatch, 1000);

		// --------------------------------------------------------
		// Root node: CedsOntology
		// --------------------------------------------------------
		process.stderr.write(`${moduleName}: Creating CedsOntology root node...\n`);
		await session.run(`
			MERGE (root:CedsOntology:CEDS {name: 'CEDS'})
			SET root.version = $version, root.importDate = datetime(), root.sourceUri = 'https://w3id.org/CEDStandards/terms/',
			    root.classCount = $classCount, root.propertyCount = $propertyCount,
			    root.optionSetCount = $optionSetCount, root.optionValueCount = $optionValueCount
		`, {
			version: result.version,
			classCount: neo4j.int(result.counts.classes),
			propertyCount: neo4j.int(result.counts.properties),
			optionSetCount: neo4j.int(result.counts.optionSets),
			optionValueCount: neo4j.int(result.counts.optionValues),
		});

		// --------------------------------------------------------
		// PART_OF relationships: all CEDS nodes -> CedsOntology root
		// --------------------------------------------------------
		process.stderr.write(`${moduleName}: Creating PART_OF relationships to root...\n`);
		await session.run(`
			MATCH (n:CEDS) WHERE NOT n:CedsOntology
			MATCH (root:CedsOntology)
			MERGE (n)-[:PART_OF]->(root)
		`);

		process.stderr.write(`${moduleName}: === NEO4J LOAD COMPLETE ===\n`);

	} finally {
		await session.close();
		await driver.close();
	}
};

// ============================================================
// Stage 4a: BM25 Full-Text Index (--index mode)
// ============================================================

const createFullTextIndex = async () => {
	const neo4j = require('neo4j-driver');
	const localConfig = getLocalConfig();
	const { neo4jBoltUri, neo4jUser, neo4jPassword } = localConfig;

	process.stderr.write(`${moduleName}: --index mode: creating BM25 full-text index...\n`);
	const driver = neo4j.driver(neo4jBoltUri, neo4j.auth.basic(neo4jUser, neo4jPassword), { encrypted: false });

	try {
		await driver.verifyConnectivity();
		process.stderr.write(`${moduleName}: Connected to Neo4j.\n`);
	} catch (err) {
		process.stderr.write(`${moduleName}: ERROR — Cannot connect to Neo4j: ${err.message}\n`);
		process.exit(1);
	}

	const session = driver.session();

	try {
		// Create full-text index
		process.stderr.write(`${moduleName}: Creating fulltext index ceds14_fulltext...\n`);
		await session.run(`
			CREATE FULLTEXT INDEX ceds14_fulltext IF NOT EXISTS
			FOR (n:CedsClass|CedsProperty|CedsOptionSet|CedsOptionValue)
			ON EACH [n.label, n.description, n.notation]
		`);

		// Wait for index to come online
		await session.run('CALL db.awaitIndexes(300)');

		// Verify
		const verifyResult = await session.run(`SHOW INDEXES WHERE name = 'ceds14_fulltext'`);
		if (verifyResult.records.length > 0) {
			const state = verifyResult.records[0].get('state');
			process.stderr.write(`${moduleName}: Index ceds14_fulltext state: ${state}\n`);
			process.stderr.write(`${moduleName}: === FULL-TEXT INDEX CREATED SUCCESSFULLY ===\n`);
		} else {
			process.stderr.write(`${moduleName}: WARNING — Index ceds14_fulltext not found after creation\n`);
		}
	} finally {
		await session.close();
		await driver.close();
	}
};

// ============================================================
// Stage 4b: Vector Embeddings (--embed mode)
// ============================================================

const embedBatch = (texts, apiKey) => new Promise((resolve, reject) => {
	const body = JSON.stringify({
		model: 'voyage-3',
		input: texts,
		input_type: 'document'
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
			resolve(parsed.data.map(d => d.embedding));
		});
	});
	req.on('error', reject);
	req.write(body);
	req.end();
});

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const createEmbeddings = async () => {
	const neo4j = require('neo4j-driver');
	const localConfig = getLocalConfig();
	const { neo4jBoltUri, neo4jUser, neo4jPassword, voyageApiKey } = localConfig;

	if (!voyageApiKey) {
		process.stderr.write(`${moduleName}: ERROR — Missing voyageApiKey in config\n`);
		process.exit(1);
	}

	process.stderr.write(`${moduleName}: --embed mode: creating vector embeddings...\n`);
	const driver = neo4j.driver(neo4jBoltUri, neo4j.auth.basic(neo4jUser, neo4jPassword), { encrypted: false });

	try {
		await driver.verifyConnectivity();
		process.stderr.write(`${moduleName}: Connected to Neo4j.\n`);
	} catch (err) {
		process.stderr.write(`${moduleName}: ERROR — Cannot connect to Neo4j: ${err.message}\n`);
		process.exit(1);
	}

	const session = driver.session();

	try {
		// Query all CEDS nodes without embeddings
		process.stderr.write(`${moduleName}: Querying nodes without embeddings...\n`);
		const result = await session.run(`
			MATCH (n:CEDS) WHERE n.embedding IS NULL AND NOT n:CedsOntology
			RETURN n.cedsId AS cedsId, labels(n) AS labels, n.label AS label, n.description AS description
		`);

		const nodes = result.records.map(r => ({
			cedsId: r.get('cedsId'),
			label: r.get('label'),
			description: r.get('description')
		}));

		process.stderr.write(`${moduleName}: Found ${nodes.length} nodes needing embeddings.\n`);

		if (nodes.length === 0) {
			process.stderr.write(`${moduleName}: All nodes already have embeddings. Nothing to do.\n`);
			// Still create the vector index
		} else {
			// Process in batches of 128
			const batchSize = 128;
			let processed = 0;

			for (let i = 0; i < nodes.length; i += batchSize) {
				const batch = nodes.slice(i, i + batchSize);
				const texts = batch.map(n => {
					const desc = n.description || '';
					return desc ? `${n.label} — ${desc}` : n.label;
				});

				// Embed the batch
				const embeddings = await embedBatch(texts, voyageApiKey);

				// Write embeddings back to Neo4j
				const writeBack = batch.map((n, idx) => ({
					cedsId: n.cedsId,
					embedding: embeddings[idx]
				}));

				await session.run(`
					UNWIND $batch AS item
					MATCH (n:CEDS {cedsId: item.cedsId})
					SET n.embedding = item.embedding
				`, { batch: writeBack });

				processed += batch.length;

				if (processed % 1000 < batchSize) {
					process.stderr.write(`${moduleName}: Embedded ${processed}/${nodes.length} nodes...\n`);
				}

				// Small delay between API calls
				if (i + batchSize < nodes.length) {
					await delay(100);
				}
			}

			process.stderr.write(`${moduleName}: All ${processed} embeddings written.\n`);
		}

		// Create vector index
		process.stderr.write(`${moduleName}: Creating vector index ceds14_vector...\n`);
		await session.run(`
			CREATE VECTOR INDEX ceds14_vector IF NOT EXISTS
			FOR (n:CEDS)
			ON (n.embedding)
			OPTIONS {indexConfig: {\`vector.dimensions\`: 1024, \`vector.similarity_function\`: 'cosine'}}
		`);

		// Wait for index
		await session.run('CALL db.awaitIndexes(300)');

		// Verify
		const verifyResult = await session.run(`SHOW INDEXES WHERE name = 'ceds14_vector'`);
		if (verifyResult.records.length > 0) {
			const state = verifyResult.records[0].get('state');
			process.stderr.write(`${moduleName}: Index ceds14_vector state: ${state}\n`);
			process.stderr.write(`${moduleName}: === VECTOR EMBEDDINGS AND INDEX COMPLETE ===\n`);
		} else {
			process.stderr.write(`${moduleName}: WARNING — Index ceds14_vector not found after creation\n`);
		}
	} finally {
		await session.close();
		await driver.close();
	}
};

// ============================================================
// Main
// ============================================================

const main = async () => {
	// Handle --index and --embed modes (no RDF parsing needed)
	if (isIndexMode) {
		await createFullTextIndex();
		return;
	}

	if (isEmbedMode) {
		await createEmbeddings();
		return;
	}

	const rdfPath = process.argv.find(a => !a.startsWith('-') && a !== process.argv[0] && a !== process.argv[1])
		|| path.join(__dirname, 'assets', 'CEDS-Ontology.rdf');

	if (!fs.existsSync(rdfPath)) {
		process.stderr.write(`${moduleName}: ERROR — RDF file not found: ${rdfPath}\n`);
		process.exit(1);
	}

	process.stderr.write(`${moduleName}: Reading ${rdfPath}...\n`);
	const xml = fs.readFileSync(rdfPath, 'utf8');

	process.stderr.write(`${moduleName}: Parsing XML (${(xml.length / 1024 / 1024).toFixed(1)} MB)...\n`);
	const parsed = await xml2js.parseStringPromise(xml);

	const root = parsed['rdf:RDF'];

	// Extract version
	const ontologyElements = root['owl:Ontology'] || [];
	const version = ontologyElements.length > 0
		? getText(ontologyElements[0], 'owl:versionInfo') || 'unknown'
		: 'unknown';

	process.stderr.write(`${moduleName}: Ontology version: ${version}\n`);

	// --------------------------------------------------------
	// Collect raw elements
	// --------------------------------------------------------
	const rdfsClasses = (root['rdfs:Class'] || []).filter(el => isCedsUri(getAttr(el, 'rdf:about')));
	const owlClasses = (root['owl:Class'] || []).filter(el => isCedsUri(getAttr(el, 'rdf:about')));
	const rdfProperties = (root['rdf:Property'] || []).filter(el => isCedsUri(getAttr(el, 'rdf:about')));
	const namedIndividuals = (root['owl:NamedIndividual'] || []).filter(el => isCedsUri(getAttr(el, 'rdf:about')));

	process.stderr.write(`${moduleName}: Raw counts — rdfs:Class=${rdfsClasses.length}, owl:Class=${owlClasses.length}, rdf:Property=${rdfProperties.length}, owl:NamedIndividual=${namedIndividuals.length}\n`);

	// --------------------------------------------------------
	// Classify classes vs option sets
	// --------------------------------------------------------

	// Pure classes: rdfs:Class WITHOUT ConceptScheme type, plus owl:Class WITHOUT ConceptScheme type
	// OptionSets: anything (rdfs:Class OR owl:Class) WITH ConceptScheme type

	const classes = [];
	const optionSets = [];

	for (const el of rdfsClasses) {
		if (hasConceptSchemeType(el)) {
			optionSets.push(extractClass(el));
		} else {
			classes.push(extractClass(el));
		}
	}

	for (const el of owlClasses) {
		if (hasConceptSchemeType(el)) {
			optionSets.push(extractClass(el));
		} else {
			classes.push(extractClass(el));
		}
	}

	// Properties
	const properties = rdfProperties.map(extractProperty);

	// Option values
	const optionValues = namedIndividuals.map(extractOptionValue);

	// --------------------------------------------------------
	// Build result object
	// --------------------------------------------------------
	const result = {
		version,
		counts: {
			classes: classes.length,
			properties: properties.length,
			optionSets: optionSets.length,
			optionValues: optionValues.length
		},
		entities: {
			classes,
			properties,
			optionSets,
			optionValues
		}
	};

	// --------------------------------------------------------
	// Branch: --load mode vs JSON output mode
	// --------------------------------------------------------
	if (isLoadMode) {
		process.stderr.write(`${moduleName}: --load mode: loading to Neo4j...\n`);
		await loadToNeo4j(result);
		return;
	}

	// --------------------------------------------------------
	// Output (JSON mode)
	// --------------------------------------------------------
	process.stdout.write(JSON.stringify(result, null, '\t'));

	// --------------------------------------------------------
	// Validation Gate 2
	// --------------------------------------------------------
	process.stderr.write(`\n${moduleName}: === VALIDATION GATE 2 ===\n`);
	process.stderr.write(`${moduleName}: Classes: ${classes.length} (expected ~380-420)\n`);
	process.stderr.write(`${moduleName}: Properties: ${properties.length} (expected ~2300-2400)\n`);
	process.stderr.write(`${moduleName}: OptionSets: ${optionSets.length} (expected ~960-1000)\n`);
	process.stderr.write(`${moduleName}: OptionValues: ${optionValues.length} (expected ~19000-20000)\n`);

	const classesOk = classes.length >= 380 && classes.length <= 420;
	const propertiesOk = properties.length >= 2300 && properties.length <= 2400;
	const optionSetsOk = optionSets.length >= 960 && optionSets.length <= 1000;
	const optionValuesOk = optionValues.length >= 19000 && optionValues.length <= 20000;

	process.stderr.write(`${moduleName}: Classes range check: ${classesOk ? 'PASS' : 'FAIL'}\n`);
	process.stderr.write(`${moduleName}: Properties range check: ${propertiesOk ? 'PASS' : 'FAIL'}\n`);
	process.stderr.write(`${moduleName}: OptionSets range check: ${optionSetsOk ? 'PASS' : 'FAIL'}\n`);
	process.stderr.write(`${moduleName}: OptionValues range check: ${optionValuesOk ? 'PASS' : 'FAIL'}\n`);

	// Spot checks
	const p600559 = properties.find(p => p.cedsId === 'P600559');
	const p600559Ok = p600559 && p600559.label === 'Membership Entry Date' && p600559.dataType === 'date';
	process.stderr.write(`${moduleName}: Spot check P600559 "Membership Entry Date" (date): ${p600559Ok ? 'PASS' : 'FAIL'}\n`);
	if (p600559) {
		process.stderr.write(`${moduleName}:   found: label="${p600559.label}", dataType="${p600559.dataType}"\n`);
	}

	const c200257 = classes.find(c => c.cedsId === 'C200257');
	const c200257Ok = c200257 && c200257.label === 'Membership';
	process.stderr.write(`${moduleName}: Spot check C200257 "Membership": ${c200257Ok ? 'PASS' : 'FAIL'}\n`);
	if (c200257) {
		process.stderr.write(`${moduleName}:   found: label="${c200257.label}"\n`);
	}

	const allPassed = classesOk && propertiesOk && optionSetsOk && optionValuesOk && p600559Ok && c200257Ok;
	process.stderr.write(`${moduleName}: === OVERALL: ${allPassed ? 'ALL CHECKS PASSED' : 'SOME CHECKS FAILED'} ===\n`);

	if (!allPassed) {
		process.exit(1);
	}
};

main().catch(err => {
	process.stderr.write(`${moduleName}: FATAL — ${err.message}\n${err.stack}\n`);
	process.exit(1);
});
