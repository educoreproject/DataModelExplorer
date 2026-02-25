#!/usr/bin/env node
'use strict';

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

const os = require('os');
const path = require('path');
const fs = require('fs');
const commandLineParser = require('qtools-parse-command-line');
const commandLineParameters = commandLineParser.getParameters();
const configFileProcessor = require('qtools-config-file-processor');

// ----------------------------------------------------------------------
// FIGURE OUT CONFIG (following bb2 pattern)

const findProjectRoot = ({ rootFolderName = 'system', closest = true } = {}) =>
	__dirname.replace(
		new RegExp(`^(.*${closest ? '' : '?'}\/${rootFolderName}).*$`),
		'$1',
	);
const projectRoot = findProjectRoot();

const configName =
	os.hostname() == 'qMini.local' ? 'instanceSpecific/qbook' : '';
const configDirPath = `${projectRoot}/configs/${configName}/`;
const config = configFileProcessor.getConfig('ceds1.ini', configDirPath, {
	resolve: false,
});

const getConfig = (name) => {
	if (name == 'allConfigs') {
		return config;
	}
	return config[name];
};

// Neo4j connection from config
const cedsConfig = getConfig('ceds1') || {};
const NEO4J_URI = cedsConfig.neo4jBoltUri || 'bolt://localhost:7692';
const NEO4J_USER = cedsConfig.neo4jUser || 'neo4j';
const NEO4J_PASS = cedsConfig.neo4jPassword || 'cedsOntologyPassword';
const OPENAI_API_KEY = cedsConfig.openaiApiKey || process.env.OPENAI_API_KEY || '';

// Parse action from process.argv (single-dash convention: -lookup, -stats, etc.)
const detectAction = () => {
	const actionNames = ['help', 'stats', 'lookup', 'explore', 'optionSet', 'property', 'path', 'search', 'compare', 'dataSpec', 'shared', 'listClasses', 'listOptionSets', 'listProperties'];
	for (const arg of process.argv.slice(2)) {
		const match = arg.match(/^-(\w+)$/);
		if (match && actionNames.includes(match[1])) {
			return match[1];
		}
	}
	return 'help';
};

// Get a parameter value: --limit=N
const getParam = (name, defaultValue) => {
	const vals = commandLineParameters.values && commandLineParameters.values[name];
	if (vals && vals.length > 0) return vals[0];
	return defaultValue;
};

// ============================================================
// ACTIONS
// ============================================================

const actions = {};

// -help: Show usage
actions.help = async (session, params) => {
	console.log(`
ceds1 - CEDS Ontology Navigator (v13)

USAGE:
  ceds1 -lookup "search term"         Search classes, properties, option sets by name
  ceds1 -explore "ClassName"          Show a class with its properties and relationships
  ceds1 -optionSet "OptionSetName"    List all values in an option set/enumeration
  ceds1 -property "PropertyName"      Show details for a specific property
  ceds1 -path "ClassA" "ClassB"       Find semantic path between two classes
  ceds1 -compare "ClassA" "ClassB"     Compare properties of two classes
  ceds1 -dataSpec "ClassName"          Full data specification with resolved types
  ceds1 -shared                        Show option sets shared across 3+ classes
  ceds1 -search "natural language"    Semantic vector search across all descriptions
  ceds1 -stats                        Show ontology statistics
  ceds1 -help                         Show this help

OPTIONS:
  --limit=N                           Max results (default: 20)
  --verbose                           Show additional detail

EXAMPLES:
  ceds1 -lookup "student"
  ceds1 -explore "K12 Student"
  ceds1 -optionSet "Sex"
  ceds1 -search "assessment scores for english language learners"
  ceds1 -stats
`);
};

// -stats: Ontology statistics
actions.stats = async (session, params) => {
	const result = await session.run(`
		MATCH (n)
		WITH labels(n) AS lbls, count(n) AS cnt
		WITH
			CASE
				WHEN 'Class' IN lbls AND 'ConceptScheme' IN lbls THEN 'OptionSet (Class+ConceptScheme)'
				WHEN 'Class' IN lbls THEN 'Class'
				WHEN 'Property' IN lbls THEN 'Property'
				WHEN 'NamedIndividual' IN lbls THEN 'NamedIndividual (enum value)'
				ELSE 'Other'
			END AS nodeType,
			cnt
		RETURN nodeType, sum(cnt) AS count
		ORDER BY count DESC
	`);

	const embeddedResult = await session.run(`
		MATCH (n) WHERE n.embedding IS NOT NULL
		RETURN count(n) AS embeddedCount
	`);

	const relResult = await session.run(`
		MATCH ()-[r]->()
		RETURN type(r) AS relType, count(r) AS count
		ORDER BY count DESC
	`);

	console.log('\n=== CEDS Ontology v13 Statistics ===\n');
	console.log('NODE TYPES:');
	result.records.forEach(r => {
		console.log(`  ${r.get('nodeType').padEnd(40)} ${r.get('count').toString()}`);
	});

	console.log(`\n  Vector embeddings:${' '.repeat(21)}${embeddedResult.records[0].get('embeddedCount').toString()}`);

	console.log('\nRELATIONSHIP TYPES:');
	relResult.records.forEach(r => {
		console.log(`  ${r.get('relType').padEnd(40)} ${r.get('count').toString()}`);
	});
	console.log('');
};

// -lookup: Text search across all node types
actions.lookup = async (session, params) => {
	const searchTerm = params.fileList[0];
	if (!searchTerm) {
		console.error('Usage: ceds1 -lookup "search term"');
		return;
	}

	const limit = parseInt(getParam('limit', '20'));
	const pattern = `(?i).*${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.*`;

	const result = await session.run(`
		MATCH (n)
		WHERE any(lbl IN coalesce(n.label, []) WHERE lbl =~ $pattern)
		   OR n.notation =~ $pattern
		   OR any(id IN coalesce(n.identifier, []) WHERE id =~ $pattern)
		WITH n,
			CASE
				WHEN 'Class' IN labels(n) AND 'ConceptScheme' IN labels(n) THEN 'OptionSet'
				WHEN 'Class' IN labels(n) THEN 'Class'
				WHEN 'Property' IN labels(n) THEN 'Property'
				WHEN 'NamedIndividual' IN labels(n) THEN 'EnumValue'
				ELSE 'Other'
			END AS nodeType
		RETURN nodeType,
			n.label AS label,
			n.notation AS notation,
			n.uri AS uri,
			CASE WHEN n.description IS NOT NULL AND n.description <> '' THEN n.description ELSE n.comment END AS description
		ORDER BY
			CASE nodeType WHEN 'Class' THEN 1 WHEN 'OptionSet' THEN 2 WHEN 'Property' THEN 3 WHEN 'EnumValue' THEN 4 ELSE 5 END,
			n.label
		LIMIT $limit
	`, { pattern, limit: neo4j.int(limit) });

	if (result.records.length === 0) {
		console.log(`\nNo results for "${searchTerm}".`);
		return;
	}

	console.log(`\n=== Lookup: "${searchTerm}" (${result.records.length} results) ===\n`);

	let currentType = '';
	result.records.forEach(r => {
		const type = r.get('nodeType');
		if (type !== currentType) {
			currentType = type;
			console.log(`--- ${type} ---`);
		}
		const label = formatLabel(r.get('label'));
		const notation = formatLabel(r.get('notation'));
		const desc = r.get('description') || '';
		const truncDesc = desc.length > 120 ? desc.substring(0, 117) + '...' : desc;

		console.log(`  ${label}`);
		if (notation && notation !== label) console.log(`    notation: ${notation}`);
		if (truncDesc) console.log(`    ${truncDesc}`);
		console.log('');
	});
};

// -explore: Deep dive into a class
actions.explore = async (session, params) => {
	const className = params.fileList[0];
	if (!className) {
		console.error('Usage: ceds1 -explore "ClassName"');
		return;
	}

	const pattern = `(?i).*${className.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.*`;

	// Find the class
	const classResult = await session.run(`
		MATCH (c)
		WHERE (c:Class OR (c:Class AND c:ConceptScheme))
		AND (any(lbl IN coalesce(c.label, []) WHERE lbl =~ $pattern)
		     OR c.notation =~ $pattern)
		RETURN c.uri AS uri, c.label AS label, c.notation AS notation,
			COALESCE(c.description, c.comment) AS description,
			labels(c) AS nodeLabels
		LIMIT 5
	`, { pattern });

	if (classResult.records.length === 0) {
		console.log(`\nNo class found matching "${className}".`);
		return;
	}

	// Use first match
	const cls = classResult.records[0];
	const classUri = cls.get('uri');
	const classLabel = formatLabel(cls.get('label'));
	const isOptionSet = cls.get('nodeLabels').includes('ConceptScheme');

	console.log(`\n=== ${isOptionSet ? 'Option Set' : 'Class'}: ${classLabel} ===`);
	console.log(`URI: ${classUri}`);
	if (cls.get('description')) {
		console.log(`\n${cls.get('description')}`);
	}

	// Get parent classes
	const parentResult = await session.run(`
		MATCH (c {uri: $uri})-[:subClassOf]->(parent)
		RETURN parent.label AS label, parent.uri AS uri
	`, { uri: classUri });

	if (parentResult.records.length > 0) {
		console.log('\nPARENT CLASSES:');
		parentResult.records.forEach(r => {
			console.log(`  ${formatLabel(r.get('label'))}`);
		});
	}

	// Get child classes
	const childResult = await session.run(`
		MATCH (child)-[:subClassOf]->(c {uri: $uri})
		RETURN child.label AS label, child.uri AS uri
		ORDER BY child.label
		LIMIT 30
	`, { uri: classUri });

	if (childResult.records.length > 0) {
		console.log(`\nCHILD CLASSES (${childResult.records.length}):`);
		childResult.records.forEach(r => {
			console.log(`  ${formatLabel(r.get('label'))}`);
		});
	}

	// Get properties whose domain includes this class
	const propResult = await session.run(`
		MATCH (p:Property)-[:domainIncludes]->(c {uri: $uri})
		OPTIONAL MATCH (p)-[:rangeIncludes]->(range)
		RETURN p.label AS label, p.notation AS notation,
			COALESCE(p.description, '') AS description,
			collect(DISTINCT range.label) AS rangeLabels,
			collect(DISTINCT CASE WHEN range:ConceptScheme THEN range.uri ELSE null END) AS optionSetUris
		ORDER BY p.label
	`, { uri: classUri });

	if (propResult.records.length > 0) {
		console.log(`\nPROPERTIES (${propResult.records.length}):`);
		propResult.records.forEach(r => {
			const propLabel = formatLabel(r.get('label'));
			const desc = r.get('description');
			const ranges = r.get('rangeLabels').filter(Boolean).map(formatLabel);
			const truncDesc = desc && desc.length > 100 ? desc.substring(0, 97) + '...' : desc;

			console.log(`  ${propLabel}`);
			if (ranges.length > 0) console.log(`    range: ${ranges.join(', ')}`);
			if (truncDesc) console.log(`    ${truncDesc}`);
		});
	}

	// If it's an option set, show enum values
	if (isOptionSet) {
		const enumResult = await session.run(`
			MATCH (v:NamedIndividual)-[:inScheme]->(c {uri: $uri})
			RETURN v.label AS label, v.notation AS notation,
				COALESCE(v.description, v.definition, '') AS description
			ORDER BY v.label
			LIMIT 50
		`, { uri: classUri });

		if (enumResult.records.length > 0) {
			console.log(`\nENUM VALUES (${enumResult.records.length}):`);
			enumResult.records.forEach(r => {
				const label = formatLabel(r.get('label'));
				const desc = r.get('description');
				const truncDesc = desc && desc.length > 80 ? desc.substring(0, 77) + '...' : desc;
				console.log(`  ${label}`);
				if (truncDesc) console.log(`    ${truncDesc}`);
			});
		}
	}

	console.log('');
};

// -optionSet: List option set values
actions.optionSet = async (session, params) => {
	const name = params.fileList[0];
	if (!name) {
		console.error('Usage: ceds1 -optionSet "OptionSetName"');
		return;
	}

	const pattern = `(?i).*${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.*`;
	const limit = parseInt(getParam('limit', '100'));

	const result = await session.run(`
		MATCH (cs:ConceptScheme)
		WHERE any(lbl IN coalesce(cs.label, []) WHERE lbl =~ $pattern)
		   OR cs.notation =~ $pattern
		WITH cs LIMIT 1
		OPTIONAL MATCH (v:NamedIndividual)-[:inScheme]->(cs)
		RETURN cs.label AS setLabel, cs.uri AS setUri,
			COALESCE(cs.description, cs.comment, '') AS setDescription,
			v.label AS valueLabel, v.notation AS valueNotation,
			COALESCE(v.description, v.definition, '') AS valueDescription
		ORDER BY v.label
		LIMIT $limit
	`, { pattern, limit: neo4j.int(limit) });

	if (result.records.length === 0) {
		console.log(`\nNo option set found matching "${name}".`);
		return;
	}

	const setLabel = formatLabel(result.records[0].get('setLabel'));
	const setDesc = result.records[0].get('setDescription');

	console.log(`\n=== Option Set: ${setLabel} ===`);
	if (setDesc) console.log(`${setDesc}`);
	console.log(`\nVALUES (${result.records.length}):`);

	result.records.forEach(r => {
		const label = formatLabel(r.get('valueLabel'));
		const notation = formatLabel(r.get('valueNotation'));
		const desc = r.get('valueDescription');
		if (label) {
			console.log(`  ${label}${notation && notation !== label ? ` (${notation})` : ''}`);
			if (desc) console.log(`    ${desc}`);
		}
	});
	console.log('');
};

// -property: Show property details
actions.property = async (session, params) => {
	const name = params.fileList[0];
	if (!name) {
		console.error('Usage: ceds1 -property "PropertyName"');
		return;
	}

	const pattern = `(?i).*${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.*`;

	const result = await session.run(`
		MATCH (p:Property)
		WHERE any(lbl IN coalesce(p.label, []) WHERE lbl =~ $pattern)
		   OR p.notation =~ $pattern
		WITH p LIMIT 5
		OPTIONAL MATCH (p)-[:domainIncludes]->(domain)
		OPTIONAL MATCH (p)-[:rangeIncludes]->(range)
		RETURN p.label AS label, p.notation AS notation, p.uri AS uri,
			COALESCE(p.description, '') AS description,
			p.textFormat AS textFormat,
			collect(DISTINCT {label: domain.label, uri: domain.uri}) AS domains,
			collect(DISTINCT {label: range.label, uri: range.uri, isOptionSet: range:ConceptScheme}) AS ranges
		ORDER BY p.label
	`, { pattern });

	if (result.records.length === 0) {
		console.log(`\nNo property found matching "${name}".`);
		return;
	}

	result.records.forEach(r => {
		const label = formatLabel(r.get('label'));
		console.log(`\n=== Property: ${label} ===`);
		console.log(`URI: ${r.get('uri')}`);
		if (r.get('notation')) console.log(`Notation: ${r.get('notation')}`);
		if (r.get('description')) console.log(`\n${r.get('description')}`);
		if (r.get('textFormat')) console.log(`\nFormat: ${r.get('textFormat')}`);

		const domains = r.get('domains').filter(d => d.label);
		if (domains.length > 0) {
			console.log('\nUSED BY CLASSES:');
			domains.forEach(d => console.log(`  ${formatLabel(d.label)}`));
		}

		const ranges = r.get('ranges').filter(rng => rng.label);
		if (ranges.length > 0) {
			console.log('\nRANGE:');
			ranges.forEach(rng => {
				const typeLabel = rng.isOptionSet ? ' [Option Set]' : '';
				console.log(`  ${formatLabel(rng.label)}${typeLabel}`);
			});
		}
	});
	console.log('');
};

// -path: Find semantic path between two classes
actions.path = async (session, params) => {
	const classA = params.fileList[0];
	const classB = params.fileList[1];
	if (!classA || !classB) {
		console.error('Usage: ceds1 -path "ClassA" "ClassB"');
		return;
	}

	const patternA = `(?i).*${classA.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.*`;
	const patternB = `(?i).*${classB.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.*`;

	// Resolve the two class nodes first
	const resolveResult = await session.run(`
		MATCH (a:Class)
		WHERE any(lbl IN coalesce(a.label, []) WHERE lbl =~ $patternA)
		WITH a LIMIT 1
		MATCH (b:Class)
		WHERE any(lbl IN coalesce(b.label, []) WHERE lbl =~ $patternB)
		WITH a, b LIMIT 1
		RETURN a.label AS labelA, b.label AS labelB
	`, { patternA, patternB });

	if (resolveResult.records.length === 0) {
		console.log(`\nNo classes found matching "${classA}" and/or "${classB}".`);
		return;
	}

	const labelA = formatLabel(resolveResult.records[0].get('labelA'));
	const labelB = formatLabel(resolveResult.records[0].get('labelB'));

	console.log(`\n=== Path: ${labelA} <-> ${labelB} ===`);

	// Section 1: Direct connecting properties (domain=A range=B, or domain=B range=A)
	const directResult = await session.run(`
		MATCH (a:Class), (b:Class)
		WHERE any(lbl IN coalesce(a.label, []) WHERE lbl =~ $patternA)
		AND any(lbl IN coalesce(b.label, []) WHERE lbl =~ $patternB)
		WITH a, b LIMIT 1
		OPTIONAL MATCH (p1:Property)-[:domainIncludes]->(a)
		WHERE (p1)-[:rangeIncludes]->(b)
		WITH a, b, collect(DISTINCT p1.label) AS aToBProps
		OPTIONAL MATCH (p2:Property)-[:domainIncludes]->(b)
		WHERE (p2)-[:rangeIncludes]->(a)
		RETURN aToBProps, collect(DISTINCT p2.label) AS bToAProps
	`, { patternA, patternB });

	if (directResult.records.length > 0) {
		const aToBProps = directResult.records[0].get('aToBProps').filter(Boolean).map(formatLabel);
		const bToAProps = directResult.records[0].get('bToAProps').filter(Boolean).map(formatLabel);
		if (aToBProps.length > 0 || bToAProps.length > 0) {
			console.log('\nDIRECT CONNECTIONS:');
			aToBProps.forEach(p => console.log(`  ${labelA} -[${p}]-> ${labelB}`));
			bToAProps.forEach(p => console.log(`  ${labelB} -[${p}]-> ${labelA}`));
		}
	}

	// Section 2: Shared properties (both classes have these in their domain)
	const sharedResult = await session.run(`
		MATCH (a:Class), (b:Class)
		WHERE any(lbl IN coalesce(a.label, []) WHERE lbl =~ $patternA)
		AND any(lbl IN coalesce(b.label, []) WHERE lbl =~ $patternB)
		WITH a, b LIMIT 1
		MATCH (p:Property)-[:domainIncludes]->(a)
		WHERE (p)-[:domainIncludes]->(b)
		RETURN p.label AS propLabel
		ORDER BY p.label
	`, { patternA, patternB });

	if (sharedResult.records.length > 0) {
		const sharedProps = sharedResult.records.map(r => formatLabel(r.get('propLabel')));
		console.log(`\nSHARED PROPERTIES (both classes have these): ${sharedProps.length}`);
		sharedProps.forEach(p => console.log(`  ${p}`));
	}

	// Section 3: Semantic bridge paths (connected through shared types via domainIncludes/rangeIncludes)
	const bridgeResult = await session.run(`
		MATCH (a:Class), (b:Class)
		WHERE any(lbl IN coalesce(a.label, []) WHERE lbl =~ $patternA)
		AND any(lbl IN coalesce(b.label, []) WHERE lbl =~ $patternB)
		WITH a, b LIMIT 1
		MATCH (a)<-[:domainIncludes]-(p1:Property)-[:rangeIncludes]->(mid)<-[:rangeIncludes]-(p2:Property)-[:domainIncludes]->(b)
		WHERE a <> b AND p1 <> p2
		RETURN p1.label AS propA, mid.label AS bridge, mid.uri AS bridgeUri, p2.label AS propB,
			labels(mid) AS bridgeLabels
		LIMIT 10
	`, { patternA, patternB });

	if (bridgeResult.records.length > 0) {
		console.log('\nSEMANTIC BRIDGES (connected through shared types):');
		bridgeResult.records.forEach(r => {
			const propA = formatLabel(r.get('propA'));
			let bridge = formatLabel(r.get('bridge'));
			if (!bridge) {
				// Fall back to URI fragment for datatypes like xsd:date
				const uri = r.get('bridgeUri') || '';
				bridge = uri.replace(/^.*[#\/]/, '') || uri;
			}
			const propB = formatLabel(r.get('propB'));
			const bridgeLabels = r.get('bridgeLabels') || [];
			const typeTag = bridgeLabels.includes('ConceptScheme') ? ' [OptionSet]' : '';
			console.log(`  ${labelA} <-[${propA}]-> ${bridge}${typeTag} <-[${propB}]-> ${labelB}`);
		});
	}

	// Check if all sections were empty
	const hasDirectConnections = directResult.records.length > 0 &&
		(directResult.records[0].get('aToBProps').filter(Boolean).length > 0 ||
		 directResult.records[0].get('bToAProps').filter(Boolean).length > 0);
	const hasSharedProps = sharedResult.records.length > 0;
	const hasBridges = bridgeResult.records.length > 0;

	if (!hasDirectConnections && !hasSharedProps && !hasBridges) {
		console.log('\nNo path found between these two classes.');
		console.log('They have no direct connections, shared properties, or semantic bridges.');
	}

	console.log('');
};

// -compare: Subgraph comparison — shared vs unique properties between two classes
actions.compare = async (session, params) => {
	const classA = params.fileList[0];
	const classB = params.fileList[1];
	if (!classA || !classB) {
		console.error('Usage: ceds1 -compare "ClassA" "ClassB"');
		return;
	}

	const patternA = `(?i).*${classA.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.*`;
	const patternB = `(?i).*${classB.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.*`;

	// Resolve the two class nodes first
	const resolveResult = await session.run(`
		MATCH (a:Class)
		WHERE any(lbl IN coalesce(a.label, []) WHERE lbl =~ $patternA)
		WITH a LIMIT 1
		MATCH (b:Class)
		WHERE any(lbl IN coalesce(b.label, []) WHERE lbl =~ $patternB)
		WITH a, b LIMIT 1
		RETURN a.label AS labelA, b.label AS labelB
	`, { patternA, patternB });

	if (resolveResult.records.length === 0) {
		console.log(`\nNo classes found matching "${classA}" and/or "${classB}".`);
		return;
	}

	const labelA = formatLabel(resolveResult.records[0].get('labelA'));
	const labelB = formatLabel(resolveResult.records[0].get('labelB'));

	// Query 1: Shared properties (in both classes' domains)
	const sharedResult = await session.run(`
		MATCH (a:Class), (b:Class)
		WHERE any(lbl IN coalesce(a.label, []) WHERE lbl =~ $patternA)
		AND any(lbl IN coalesce(b.label, []) WHERE lbl =~ $patternB)
		WITH a, b LIMIT 1
		MATCH (p:Property)-[:domainIncludes]->(a)
		WHERE (p)-[:domainIncludes]->(b)
		OPTIONAL MATCH (p)-[:rangeIncludes]->(range)
		RETURN p.label AS propLabel, collect(DISTINCT range.label) AS rangeLabels
		ORDER BY p.label
	`, { patternA, patternB });

	const sharedProps = sharedResult.records.map(r => ({
		label: formatLabel(r.get('propLabel')),
		ranges: r.get('rangeLabels').filter(Boolean).map(formatLabel),
	}));

	// Query 2: Unique to A
	const uniqueAResult = await session.run(`
		MATCH (a:Class), (b:Class)
		WHERE any(lbl IN coalesce(a.label, []) WHERE lbl =~ $patternA)
		AND any(lbl IN coalesce(b.label, []) WHERE lbl =~ $patternB)
		WITH a, b LIMIT 1
		MATCH (p:Property)-[:domainIncludes]->(a)
		WHERE NOT (p)-[:domainIncludes]->(b)
		OPTIONAL MATCH (p)-[:rangeIncludes]->(range)
		RETURN p.label AS propLabel, collect(DISTINCT range.label) AS rangeLabels
		ORDER BY p.label
	`, { patternA, patternB });

	const uniqueAProps = uniqueAResult.records.map(r => ({
		label: formatLabel(r.get('propLabel')),
		ranges: r.get('rangeLabels').filter(Boolean).map(formatLabel),
	}));

	// Query 3: Unique to B
	const uniqueBResult = await session.run(`
		MATCH (a:Class), (b:Class)
		WHERE any(lbl IN coalesce(a.label, []) WHERE lbl =~ $patternA)
		AND any(lbl IN coalesce(b.label, []) WHERE lbl =~ $patternB)
		WITH a, b LIMIT 1
		MATCH (p:Property)-[:domainIncludes]->(b)
		WHERE NOT (p)-[:domainIncludes]->(a)
		OPTIONAL MATCH (p)-[:rangeIncludes]->(range)
		RETURN p.label AS propLabel, collect(DISTINCT range.label) AS rangeLabels
		ORDER BY p.label
	`, { patternA, patternB });

	const uniqueBProps = uniqueBResult.records.map(r => ({
		label: formatLabel(r.get('propLabel')),
		ranges: r.get('rangeLabels').filter(Boolean).map(formatLabel),
	}));

	// Output
	console.log(`\n=== Compare: ${labelA} vs. ${labelB} ===`);

	console.log(`\nSHARED PROPERTIES (both classes have these): ${sharedProps.length}`);
	sharedProps.forEach(p => {
		const rangeStr = p.ranges.length > 0 ? ` -> [${p.ranges.join(', ')}]` : '';
		console.log(`  ${p.label}${rangeStr}`);
	});

	console.log(`\nUNIQUE TO ${labelA}: ${uniqueAProps.length}`);
	uniqueAProps.forEach(p => {
		const rangeStr = p.ranges.length > 0 ? ` -> [${p.ranges.join(', ')}]` : '';
		console.log(`  ${p.label}${rangeStr}`);
	});

	console.log(`\nUNIQUE TO ${labelB}: ${uniqueBProps.length}`);
	uniqueBProps.forEach(p => {
		const rangeStr = p.ranges.length > 0 ? ` -> [${p.ranges.join(', ')}]` : '';
		console.log(`  ${p.label}${rangeStr}`);
	});

	const totalA = sharedProps.length + uniqueAProps.length;
	const totalB = sharedProps.length + uniqueBProps.length;
	const overlapPct = totalA + totalB > 0
		? ((sharedProps.length * 2 / (totalA + totalB)) * 100).toFixed(1)
		: '0.0';

	console.log('\nSUMMARY:');
	console.log(`  ${labelA}:`.padEnd(40) + `${totalA} properties (${sharedProps.length} shared + ${uniqueAProps.length} unique)`);
	console.log(`  ${labelB}:`.padEnd(40) + `${totalB} properties (${sharedProps.length} shared + ${uniqueBProps.length} unique)`);
	console.log(`  Overlap:`.padEnd(40) + `${overlapPct}%`);
	console.log('');
};

// -dataSpec: Full data specification for a class — every property with resolved types
actions.dataSpec = async (session, params) => {
	const className = params.fileList[0];
	if (!className) {
		console.error('Usage: ceds1 -dataSpec "ClassName"');
		return;
	}

	const pattern = `(?i).*${className.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.*`;

	const result = await session.run(`
		MATCH (c:Class)
		WHERE any(lbl IN coalesce(c.label, []) WHERE lbl =~ $pattern)
		WITH c LIMIT 1
		MATCH (p:Property)-[:domainIncludes]->(c)
		OPTIONAL MATCH (p)-[:rangeIncludes]->(range)
		OPTIONAL MATCH (enumVal:NamedIndividual)-[:inScheme]->(range)
		WHERE range:ConceptScheme
		WITH c, p, range,
			CASE
				WHEN range:ConceptScheme THEN 'OptionSet'
				WHEN range:Class THEN 'ClassRef'
				ELSE 'DataType'
			END AS rangeType,
			count(DISTINCT enumVal) AS valueCount
		RETURN c.label AS classLabel,
			p.label AS propLabel,
			p.description AS propDesc,
			range.label AS rangeLabel,
			range.uri AS rangeUri,
			rangeType,
			valueCount
		ORDER BY p.label
	`, { pattern });

	if (result.records.length === 0) {
		console.log(`\nNo class or properties found matching "${className}".`);
		return;
	}

	const classLabel = formatLabel(result.records[0].get('classLabel'));
	let optionSetCount = 0;
	let classRefCount = 0;
	let dataTypeCount = 0;

	console.log(`\n=== Data Specification: ${classLabel} ===`);
	console.log(`Properties: ${result.records.length}`);

	result.records.forEach(r => {
		const propLabel = formatLabel(r.get('propLabel'));
		let rangeLabel = formatLabel(r.get('rangeLabel'));
		if (!rangeLabel) {
			const uri = r.get('rangeUri') || '';
			rangeLabel = uri.replace(/^.*[#\/]/, '') || 'unknown';
		}
		const rangeType = r.get('rangeType');
		const valueCount = r.get('valueCount').toNumber ? r.get('valueCount').toNumber() : Number(r.get('valueCount'));

		console.log(`\n  ${propLabel}`);

		if (rangeType === 'OptionSet') {
			console.log(`    Type: ${rangeLabel} (OptionSet — ${valueCount} values)`);
			optionSetCount++;
		} else if (rangeType === 'ClassRef') {
			console.log(`    Type: ${rangeLabel} (ClassRef)`);
			console.log(`    A reference to another entity`);
			classRefCount++;
		} else {
			console.log(`    Type: ${rangeLabel} (DataType)`);
			dataTypeCount++;
		}
	});

	console.log('\nSUMMARY:');
	console.log(`  Total properties:`.padEnd(30) + `${result.records.length}`);
	console.log(`  With option sets:`.padEnd(30) + `${optionSetCount}`);
	console.log(`  With class refs:`.padEnd(30) + `${classRefCount}`);
	console.log(`  With data types:`.padEnd(30) + `${dataTypeCount}`);
	console.log('');
};

// -shared: Cross-domain vocabulary analysis — option sets shared across 3+ classes
actions.shared = async (session, params) => {
	const result = await session.run(`
		MATCH (p:Property)-[:rangeIncludes]->(os:ConceptScheme)
		MATCH (p)-[:domainIncludes]->(c:Class)
		WHERE NOT c:ConceptScheme
		WITH os, collect(DISTINCT c.label) AS classLabels, count(DISTINCT c) AS classCount
		WHERE classCount >= 3
		OPTIONAL MATCH (v:NamedIndividual)-[:inScheme]->(os)
		RETURN os.label AS optionSetLabel,
			classCount,
			size(collect(DISTINCT v)) AS valueCount,
			classLabels
		ORDER BY classCount DESC
		LIMIT 30
	`);

	if (result.records.length === 0) {
		console.log('\nNo option sets found shared across 3+ classes.');
		return;
	}

	console.log('\n=== Shared Vocabularies (Option Sets used by 3+ classes) ===');

	let maxClassCount = 0;
	result.records.forEach(r => {
		const osLabel = formatLabel(r.get('optionSetLabel'));
		const classCount = r.get('classCount').toNumber ? r.get('classCount').toNumber() : Number(r.get('classCount'));
		const valueCount = r.get('valueCount').toNumber ? r.get('valueCount').toNumber() : Number(r.get('valueCount'));
		const classLabels = r.get('classLabels').map(lbl => formatLabel(lbl));
		if (classCount > maxClassCount) maxClassCount = classCount;

		console.log(`\n  ${osLabel} (${classCount} classes, ${valueCount} values)`);
		console.log(`    Used by: ${classLabels.slice(0, 6).join(', ')}${classLabels.length > 6 ? ', ...' : ''}`);
	});

	const mostConnected = formatLabel(result.records[0].get('optionSetLabel'));
	console.log('\nSUMMARY:');
	console.log(`  Option sets shared across 3+ classes: ${result.records.length}`);
	console.log(`  Most connected: ${mostConnected} (${maxClassCount} classes)`);
	console.log('');
};

// -search: Semantic vector search
actions.search = async (session, params) => {
	const searchText = params.fileList[0];
	if (!searchText) {
		console.error('Usage: ceds1 -search "natural language query"');
		return;
	}

	const limit = parseInt(getParam('limit', '15'));

	// Generate embedding for search text
	let queryEmbedding;
	try {
		const OpenAI = (await import('openai')).default;
		const openaiOptions = {};
		if (OPENAI_API_KEY) openaiOptions.apiKey = OPENAI_API_KEY;
		const openai = new OpenAI(openaiOptions);
		const response = await openai.embeddings.create({
			model: 'text-embedding-3-small',
			input: searchText,
		});
		queryEmbedding = response.data[0].embedding;
	} catch (err) {
		console.error(`Failed to generate search embedding: ${err.message}`);
		console.error('Make sure openaiApiKey is set in ceds1.ini or OPENAI_API_KEY env var.');
		return;
	}

	const result = await session.run(`
		CALL db.index.vector.queryNodes('ceds_vector_index', $limit, $embedding)
		YIELD node, score
		RETURN
			CASE
				WHEN 'Class' IN labels(node) AND 'ConceptScheme' IN labels(node) THEN 'OptionSet'
				WHEN 'Class' IN labels(node) THEN 'Class'
				WHEN 'Property' IN labels(node) THEN 'Property'
				WHEN 'NamedIndividual' IN labels(node) THEN 'EnumValue'
				ELSE 'Other'
			END AS nodeType,
			node.label AS label,
			node.notation AS notation,
			COALESCE(node.description, node.comment, node.definition, '') AS description,
			score
		ORDER BY score DESC
	`, { limit: neo4j.int(limit), embedding: queryEmbedding });

	if (result.records.length === 0) {
		console.log('\nNo results found. Vector index may not be populated yet.');
		return;
	}

	console.log(`\n=== Semantic Search: "${searchText}" (${result.records.length} results) ===\n`);

	result.records.forEach((r, i) => {
		const type = r.get('nodeType');
		const label = formatLabel(r.get('label'));
		const score = r.get('score').toFixed(4);
		const desc = r.get('description');
		const truncDesc = desc && desc.length > 120 ? desc.substring(0, 117) + '...' : desc;

		console.log(`${(i + 1).toString().padStart(2)}. [${type.padEnd(9)}] ${label}  (score: ${score})`);
		if (truncDesc) console.log(`    ${truncDesc}`);
	});
	console.log('');
};

// -listClasses: Return JSON array of all class names (for autocomplete)
actions.listClasses = async (session, params) => {
	const result = await session.run(`
		MATCH (c:Class)
		WHERE NOT c:ConceptScheme
		RETURN c.label AS label, c.notation AS notation
		ORDER BY c.label
	`);
	const items = result.records.map(r => ({
		label: formatLabel(r.get('label')),
		notation: r.get('notation') || ''
	}));
	console.log(JSON.stringify(items));
};

// -listOptionSets: Return JSON array of all option set names (for autocomplete)
actions.listOptionSets = async (session, params) => {
	const result = await session.run(`
		MATCH (cs:ConceptScheme)
		RETURN cs.label AS label, cs.notation AS notation
		ORDER BY cs.label
	`);
	const items = result.records.map(r => ({
		label: formatLabel(r.get('label')),
		notation: r.get('notation') || ''
	}));
	console.log(JSON.stringify(items));
};

// -listProperties: Return JSON array of all property names (for autocomplete)
actions.listProperties = async (session, params) => {
	const result = await session.run(`
		MATCH (p:Property)
		WITH DISTINCT p.label AS label
		RETURN label, '' AS notation
		ORDER BY label
	`);
	const items = result.records.map(r => ({
		label: formatLabel(r.get('label')),
		notation: r.get('notation') || ''
	}));
	console.log(JSON.stringify(items));
};

// ============================================================
// UTILITIES
// ============================================================

function formatLabel(label) {
	if (Array.isArray(label)) return label[0] || '';
	return label || '';
}

// ============================================================
// MAIN
// ============================================================

let neo4j;

async function main() {
	// -------------------------------------------------------------------
	// JSON stdin support: accept JSON input for web/server invocation
	// Falls back to normal CLI argv parsing when no JSON is provided.
	// Expected JSON format:
	//   { "action": "lookup", "args": ["student"], "options": { "limit": ["20"] }, "json": true }
	// -------------------------------------------------------------------
	let actionOverride = null;
	let jsonOutputMode = false;

	try {
		const stdinText = !process.stdin.isTTY ? fs.readFileSync(0, 'utf8') : '';
		if (stdinText.trim()) {
			const jsonInput = JSON.parse(stdinText);
			actionOverride = jsonInput.action || null;
			// Mutate in place so getParam() (which reads commandLineParameters.values)
			// picks up JSON-supplied options like limit.
			commandLineParameters.fileList = jsonInput.args || [];
			commandLineParameters.values = {
				...commandLineParameters.values,
				...(jsonInput.options || {}),
			};
			jsonOutputMode = !!jsonInput.json;
		}
	} catch (err) {
		// No valid JSON on stdin — normal CLI mode
	}

	// -------------------------------------------------------------------
	// Detect action: prefer actionOverride from JSON, then fall back to argv
	// -------------------------------------------------------------------
	const actionName = actionOverride || detectAction();

	// -------------------------------------------------------------------
	// JSON output mode: capture console.log output, emit as JSON at the end
	// -------------------------------------------------------------------
	let capturedOutput = '';
	const originalConsoleLog = console.log;
	const originalConsoleError = console.error;

	if (jsonOutputMode) {
		console.log = (...args) => {
			capturedOutput += args.join(' ') + '\n';
		};
		console.error = (...args) => {
			capturedOutput += args.join(' ') + '\n';
		};
	}

	neo4j = (await import('neo4j-driver')).default;
	const driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASS));
	const session = driver.session();

	try {
		if (actions[actionName]) {
			await actions[actionName](session, commandLineParameters);
		} else {
			console.error(`Unknown action: ${actionName}`);
			await actions.help(session, commandLineParameters);
		}
	} catch (err) {
		console.error(`Error: ${err.message}`);
		if (err.message.includes('Could not perform discovery') || err.message.includes('Connection refused')) {
			console.error('\nIs the CEDS Neo4j container running?');
			console.error('  docker start CEDS');
		}
	} finally {
		await session.close();
		await driver.close();
	}

	// Emit JSON output if in JSON mode
	if (jsonOutputMode) {
		console.log = originalConsoleLog;
		console.error = originalConsoleError;
		process.stdout.write(JSON.stringify({ output: capturedOutput }));
	}
}

main();
