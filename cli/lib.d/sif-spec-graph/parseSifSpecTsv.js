#!/usr/bin/env node
'use strict';

// parseSifSpecTsv.js — Parse SIF Implementation Specification TSV into Neo4j graph
//
// Reads a TSV file containing SIF object type definitions, resolves RefId
// foreign keys using a resolution map, and loads the result as a full graph:
//   - SifObject nodes (one per table)
//   - SifField nodes (one per field, with HAS_FIELD edges)
//   - SifPrimitiveType / SifSimpleType nodes (with HAS_TYPE / BASED_ON edges)
//   - SifCodeset nodes (deduplicated, with CONSTRAINED_BY edges)
//   - SifComplexType nodes (derived from XPath, with MEMBER_OF / CONTAINS edges)
//   - SifXmlElement tree (with CHILD_ELEMENT / HAS_ROOT_ELEMENT / REALIZED_BY / TYPED_AS edges)
//   - REFERENCES edges (derived from RefId properties)
//   - Every node carries both its specific label AND :SifModel
//
// Usage:
//   node parseSifSpecTsv.js [--tsvPath="/path/to/spec.tsv"] [--resolutionMapPath=...] [--containerName=...]
//
// Reads Neo4j connection details from sifSpecGraphSearch.ini in the project configs.

const fs = require('fs');
const os = require('os');
const path = require('path');
const neo4j = require('neo4j-driver');

// =====================================================================
// TSV PARSING
// =====================================================================

const TABLE_HEADER_PATTERN = /^(.+):\s*Table\s+\d+$/;

// ---------------------------------------------------------------------
// parseTsvFile — Read TSV and produce structured table objects with derived properties

const parseTsvFile = (tsvPath) => {
	const content = fs.readFileSync(tsvPath, 'utf8');
	const lines = content.split('\n');

	const sifObjectList = [];
	let currentObject = null;
	let expectColumnHeaders = false;

	for (const rawLine of lines) {
		const line = rawLine.trimEnd();
		if (!line) continue;

		const tableMatch = line.match(TABLE_HEADER_PATTERN);
		if (tableMatch) {
			if (currentObject) {
				sifObjectList.push(currentObject);
			}
			const tableName = tableMatch[1].trim();
			const singularName = tableName.replace(/s$/, '');
			currentObject = {
				tableName,
				name: singularName,
				fields: [],
				refIdFields: [],
			};
			expectColumnHeaders = true;
			continue;
		}

		if (expectColumnHeaders) {
			expectColumnHeaders = false;
			continue; // skip the Name/Mandatory/Characteristics/Type/... header row
		}

		if (!currentObject) continue;

		const columns = line.split('\t');
		const fieldName = (columns[0] || '').trim();
		if (!fieldName) continue;

		const xpath = (columns[5] || '').trim();
		const xpathParts = xpath.split('/');

		const fieldDef = {
			name: fieldName,
			mandatory: (columns[1] || '').trim() === '*',
			characteristics: (columns[2] || '').trim(),
			type: (columns[3] || '').trim(),
			description: (columns[4] || '').trim(),
			xpath,
			cedsId: (columns[6] || '').trim(),
			format: (columns[7] || '').trim(),
			// Derived properties
			depth: Math.max(0, xpathParts.length - 3), // subtract empty, collection, object
			isAttribute: fieldName.startsWith('@'),
			pathSegments: xpathParts.length > 3 ? xpathParts.slice(3, -1) : [], // intermediate segments only
		};

		currentObject.fields.push(fieldDef);

		// Detect RefId fields (excluding @RefId which is the primary key)
		if (fieldName !== '@RefId' && fieldName !== 'Name' && fieldName.endsWith('RefId')) {
			currentObject.refIdFields.push(fieldDef);
		}
	}

	if (currentObject) {
		sifObjectList.push(currentObject);
	}

	return sifObjectList;
};

// =====================================================================
// REFID RESOLUTION
// =====================================================================

// ---------------------------------------------------------------------
// loadResolutionMap — Read the manual resolution TSV

const loadResolutionMap = (resolutionMapPath) => {
	const manualResolutions = {};

	if (!fs.existsSync(resolutionMapPath)) {
		console.error(`Warning: Resolution map not found at ${resolutionMapPath}`);
		return manualResolutions;
	}

	const content = fs.readFileSync(resolutionMapPath, 'utf8');
	const lines = content.split('\n');

	for (let i = 1; i < lines.length; i++) { // skip header
		const cols = lines[i].split('\t');
		const refIdProperty = (cols[0] || '').trim();
		const resolvedTable = (cols[2] || '').trim();
		if (refIdProperty && resolvedTable) {
			manualResolutions[refIdProperty] = resolvedTable;
		}
	}

	return manualResolutions;
};

// ---------------------------------------------------------------------
// resolveRefIdTargets — For each RefId field, determine the target table

const resolveRefIdTargets = (sifObjectList, manualResolutions) => {
	const tableNameSet = new Set(sifObjectList.map(obj => obj.tableName));
	const tableNameLowerMap = {};
	for (const obj of sifObjectList) {
		tableNameLowerMap[obj.tableName.toLowerCase()] = obj.tableName;
	}

	const allEdges = [];
	let unresolvedCount = 0;

	for (const sifObject of sifObjectList) {
		for (const refField of sifObject.refIdFields) {
			const cleanName = refField.name.replace(/^@/, '');

			// Check manual resolution first
			if (manualResolutions[cleanName]) {
				const resolved = manualResolutions[cleanName];
				if (resolved === 'UNRESOLVABLE_GENERIC_REF') {
					console.error(`  Skipping generic ref: ${sifObject.tableName}.${cleanName}`);
					continue;
				}
				allEdges.push({
					sourceTable: sifObject.tableName,
					targetTable: resolved,
					via: cleanName,
					mandatory: refField.mandatory,
				});
				continue;
			}

			// Try naive resolution: strip RefId, pluralize
			const baseName = cleanName.replace(/RefId$/, '');
			const naiveTarget = baseName + 's';

			if (tableNameSet.has(naiveTarget)) {
				allEdges.push({
					sourceTable: sifObject.tableName,
					targetTable: naiveTarget,
					via: cleanName,
					mandatory: refField.mandatory,
				});
				continue;
			}

			// Try case-insensitive
			if (tableNameLowerMap[naiveTarget.toLowerCase()]) {
				allEdges.push({
					sourceTable: sifObject.tableName,
					targetTable: tableNameLowerMap[naiveTarget.toLowerCase()],
					via: cleanName,
					mandatory: refField.mandatory,
				});
				continue;
			}

			// Try common suffixes
			let found = false;
			for (const suffix of ['Infos', 'Personals', 'Items']) {
				const candidate = baseName + suffix;
				if (tableNameLowerMap[candidate.toLowerCase()]) {
					allEdges.push({
						sourceTable: sifObject.tableName,
						targetTable: tableNameLowerMap[candidate.toLowerCase()],
						via: cleanName,
						mandatory: refField.mandatory,
					});
					found = true;
					break;
				}
			}
			if (found) continue;

			// If still not resolved
			console.error(`  UNRESOLVED: ${sifObject.tableName}.${cleanName} -> ${naiveTarget}?`);
			unresolvedCount++;
		}
	}

	console.error(`Resolved ${allEdges.length} edges, ${unresolvedCount} unresolved`);
	return allEdges;
};

// =====================================================================
// DEDUPLICATION
// =====================================================================

// Some tables have duplicate RefId fields at different XPath depths.
// Deduplicate edges by (source, target, via) tuple.

const deduplicateEdges = (edgeList) => {
	const seen = new Set();
	const uniqueEdges = [];

	for (const edge of edgeList) {
		const edgeKey = `${edge.sourceTable}|${edge.targetTable}|${edge.via}`;
		if (!seen.has(edgeKey)) {
			seen.add(edgeKey);
			uniqueEdges.push(edge);
		}
	}

	console.error(`Deduplicated: ${edgeList.length} -> ${uniqueEdges.length} unique edges`);
	return uniqueEdges;
};

// =====================================================================
// IN-MEMORY DATA STRUCTURE BUILDERS
// =====================================================================

// ---------------------------------------------------------------------
// buildTypeRegistry — Classify all field types as SifSimpleType or SifPrimitiveType

const buildTypeRegistry = (sifObjectList) => {
	const typeMap = new Map(); // name -> { name, category, label }

	for (const obj of sifObjectList) {
		for (const field of obj.fields) {
			const typeName = field.type;
			if (!typeName || typeMap.has(typeName)) continue;

			// Types ending in "Type" are SifSimpleType, everything else is SifPrimitiveType
			const isSimple = typeName.endsWith('Type');
			typeMap.set(typeName, {
				name: typeName,
				category: isSimple ? 'simple' : 'primitive',
				label: isSimple ? 'SifSimpleType' : 'SifPrimitiveType',
			});
		}
	}

	return typeMap;
};

// ---------------------------------------------------------------------
// buildCodesetRegistry — Deduplicate codeset values from the Format column

const buildCodesetRegistry = (sifObjectList) => {
	const codesetMap = new Map(); // fingerprint -> { values, valueCount, fingerprint }
	const fieldCodesetMap = new Map(); // fieldXpath -> fingerprint

	for (const obj of sifObjectList) {
		for (const field of obj.fields) {
			let formatStr = field.format;
			if (!formatStr) continue;

			// Strip surrounding quotes
			formatStr = formatStr.replace(/^"(.*)"$/, '$1');
			if (!formatStr.trim()) continue;

			// Split on ", " (comma-space)
			const values = formatStr.split(', ').map(v => v.trim()).filter(v => v);
			if (values.length === 0) continue;

			// Compute fingerprint from sorted values
			const sorted = [...values].sort();
			const fingerprint = sorted.join('|');

			if (!codesetMap.has(fingerprint)) {
				codesetMap.set(fingerprint, {
					values: sorted,
					valueCount: sorted.length,
					fingerprint,
				});
			}

			fieldCodesetMap.set(field.xpath, fingerprint);
		}
	}

	return { codesetMap, fieldCodesetMap };
};

// ---------------------------------------------------------------------
// buildComplexTypeRegistry — Derive complex types from XPath intermediate segments

const buildComplexTypeRegistry = (sifObjectList) => {
	// complexTypeMap: segmentName -> { name, objects: Set, fields: [], children: Set }
	const complexTypeMap = new Map();
	// parentChildPairs: Set of "parent|child" strings
	const parentChildPairs = new Set();
	// fieldComplexType: fieldXpath -> complexTypeName (innermost intermediate segment)
	const fieldComplexTypeMap = new Map();
	// objectComplexTypes: tableName -> Set of complex type names
	const objectComplexTypesMap = new Map();

	for (const obj of sifObjectList) {
		if (!objectComplexTypesMap.has(obj.tableName)) {
			objectComplexTypesMap.set(obj.tableName, new Set());
		}

		for (const field of obj.fields) {
			const segments = field.pathSegments;
			if (!segments || segments.length === 0) continue;

			// Each segment in pathSegments is an intermediate complex type
			for (let i = 0; i < segments.length; i++) {
				const segName = segments[i];

				if (!complexTypeMap.has(segName)) {
					complexTypeMap.set(segName, {
						name: segName,
						objects: new Set(),
						fieldCount: 0,
					});
				}

				const ct = complexTypeMap.get(segName);
				ct.objects.add(obj.tableName);
				objectComplexTypesMap.get(obj.tableName).add(segName);

				// Build parent→child from consecutive segments
				if (i > 0) {
					parentChildPairs.add(`${segments[i - 1]}|${segName}`);
				}
			}

			// The innermost intermediate segment is the field's complex type
			const innermostSegment = segments[segments.length - 1];
			fieldComplexTypeMap.set(field.xpath, innermostSegment);

			// Count this field for the innermost complex type
			const ct = complexTypeMap.get(innermostSegment);
			ct.fieldCount++;
		}
	}

	// Set objectCount on each complex type
	for (const [, ct] of complexTypeMap) {
		ct.objectCount = ct.objects.size;
	}

	return { complexTypeMap, parentChildPairs, fieldComplexTypeMap, objectComplexTypesMap };
};

// ---------------------------------------------------------------------
// buildXmlElementTree — Build the shared XML element tree from all XPaths

const buildXmlElementTree = (sifObjectList) => {
	// elementMap: relativePath -> { name, path, depth, objectNames: Set, children: Set, isLeaf }
	const elementMap = new Map();
	// parentChildPairs: Set of "parentPath|childPath"
	const childElementPairs = new Set();
	// objectRootElements: tableName -> Set of root element paths
	const objectRootElements = new Map();
	// leafFieldLinks: { elementPath, fieldXpath }[]
	const leafFieldLinks = [];

	for (const obj of sifObjectList) {
		if (!objectRootElements.has(obj.tableName)) {
			objectRootElements.set(obj.tableName, new Set());
		}

		for (const field of obj.fields) {
			const xpathParts = field.xpath.split('/');
			// Parts: ['', Collection, Object, ...segments..., fieldName]
			// Elements start at index 3 (after empty, collection, object)
			if (xpathParts.length <= 3) continue;

			const elementParts = xpathParts.slice(3); // everything after /Collection/Object/
			// Build the chain of elements
			for (let i = 0; i < elementParts.length; i++) {
				const relativePath = elementParts.slice(0, i + 1).join('/');
				const elementName = elementParts[i];
				const depth = i + 1;

				if (!elementMap.has(relativePath)) {
					elementMap.set(relativePath, {
						name: elementName,
						path: relativePath,
						depth,
						objectNames: new Set(),
						children: new Set(),
						isLeaf: true, // will be set to false if children are found
					});
				}

				const el = elementMap.get(relativePath);
				el.objectNames.add(obj.tableName);

				// Link parent→child
				if (i > 0) {
					const parentPath = elementParts.slice(0, i).join('/');
					childElementPairs.add(`${parentPath}|${relativePath}`);
					// Parent is not a leaf
					const parentEl = elementMap.get(parentPath);
					if (parentEl) {
						parentEl.isLeaf = false;
						parentEl.children.add(relativePath);
					}
				}

				// Top-level elements (depth 1) are root elements for this object
				if (i === 0) {
					objectRootElements.get(obj.tableName).add(relativePath);
				}
			}

			// The full path (all parts) is the leaf element — link to field
			const leafPath = elementParts.join('/');
			leafFieldLinks.push({
				elementPath: leafPath,
				fieldXpath: field.xpath,
			});
		}
	}

	// Compute isShared
	for (const [, el] of elementMap) {
		el.isShared = el.objectNames.size > 1;
	}

	return { elementMap, childElementPairs, objectRootElements, leafFieldLinks };
};

// =====================================================================
// NEO4J LOADING
// =====================================================================

// ---------------------------------------------------------------------
// findNeo4jConfig — Read connection details from sifSpecGraphSearch.ini

const findNeo4jConfig = () => {
	const findProjectRoot = ({ rootFolderName = 'system', closest = true } = {}) =>
		__dirname.replace(new RegExp(`^(.*${closest ? '' : '?'}\\/${rootFolderName}).*$`), "$1");
	const projectRoot = findProjectRoot();

	const hostname = os.hostname();
	const configName = (hostname === 'qMini.local' || hostname === 'qbook.local') ? 'instanceSpecific/qbook' : '';
	const configDirPath = `${projectRoot}/configs/${configName}/`;
	const configFileName = 'sifSpecGraphSearch.ini';

	const configFilePath = path.join(configDirPath, configFileName);
	if (!fs.existsSync(configFilePath)) {
		throw new Error(`Config not found at ${configFilePath}`);
	}

	const configFileProcessor = require('qtools-config-file-processor');
	const config = configFileProcessor.getConfig(configFileName, configDirPath);
	const section = config && config['sifSpecGraphSearch'];

	if (!section) {
		throw new Error(`No [sifSpecGraphSearch] section in ${configFilePath}`);
	}

	return {
		neo4jBoltUri: section.neo4jBoltUri,
		neo4jUser: section.neo4jUser || 'neo4j',
		neo4jPassword: section.neo4jPassword,
	};
};

// ---------------------------------------------------------------------
// Helper: batch an array into chunks

const batchArray = (arr, size) => {
	const batches = [];
	for (let i = 0; i < arr.length; i += size) {
		batches.push(arr.slice(i, i + size));
	}
	return batches;
};

// ---------------------------------------------------------------------
// loadGraphIntoNeo4j — Full multi-phase graph construction

const loadGraphIntoNeo4j = async (sifObjectList, edgeList, neo4jConfig) => {
	const driver = neo4j.driver(
		neo4jConfig.neo4jBoltUri,
		neo4j.auth.basic(neo4jConfig.neo4jUser, neo4jConfig.neo4jPassword),
		{ encrypted: false }
	);

	const session = driver.session();
	const counts = {};

	try {
		// =========================================================
		// Step 2: Build in-memory data structures
		// =========================================================
		console.error('Building in-memory data structures...');

		const typeRegistry = buildTypeRegistry(sifObjectList);
		const { codesetMap, fieldCodesetMap } = buildCodesetRegistry(sifObjectList);
		const { complexTypeMap, parentChildPairs: ctParentChildPairs, fieldComplexTypeMap, objectComplexTypesMap } = buildComplexTypeRegistry(sifObjectList);
		const { elementMap, childElementPairs, objectRootElements, leafFieldLinks } = buildXmlElementTree(sifObjectList);

		const primitiveTypes = [...typeRegistry.values()].filter(t => t.category === 'primitive');
		const simpleTypes = [...typeRegistry.values()].filter(t => t.category === 'simple');

		console.error(`  Types: ${primitiveTypes.length} primitive, ${simpleTypes.length} simple`);
		console.error(`  Codesets: ${codesetMap.size} unique`);
		console.error(`  Complex types: ${complexTypeMap.size}`);
		console.error(`  XML elements: ${elementMap.size}`);

		// =========================================================
		// Step 3: Neo4j Loading — Phase 1 (Core Graph)
		// =========================================================

		// 3a. Clear graph
		console.error('\nClearing existing graph data...');
		await session.run('MATCH (n) DETACH DELETE n');

		// 3b. Create SifPrimitiveType nodes
		console.error(`Creating ${primitiveTypes.length} SifPrimitiveType nodes...`);
		await session.run(
			`UNWIND $types AS t
			 CREATE (n:SifPrimitiveType:SifModel {name: t.name, category: 'primitive'})`,
			{ types: primitiveTypes.map(t => ({ name: t.name })) }
		);
		counts.SifPrimitiveType = primitiveTypes.length;

		// 3c. Create SifSimpleType nodes
		console.error(`Creating ${simpleTypes.length} SifSimpleType nodes...`);
		await session.run(
			`UNWIND $types AS t
			 CREATE (n:SifSimpleType:SifModel {name: t.name, category: 'simple'})`,
			{ types: simpleTypes.map(t => ({ name: t.name })) }
		);
		counts.SifSimpleType = simpleTypes.length;

		// BASED_ON: skip for now — the TSV doesn't declare base types explicitly.
		// Can be added later with manual mapping or heuristics.

		// 3d. Create SifCodeset nodes
		const codesetList = [...codesetMap.values()];
		console.error(`Creating ${codesetList.length} SifCodeset nodes...`);
		await session.run(
			`UNWIND $codesets AS cs
			 CREATE (n:SifCodeset:SifModel {
			   values: cs.values,
			   valueCount: cs.valueCount,
			   fingerprint: cs.fingerprint
			 })`,
			{ codesets: codesetList }
		);
		counts.SifCodeset = codesetList.length;

		// 3e. Create SifComplexType nodes
		const complexTypeList = [...complexTypeMap.values()].map(ct => ({
			name: ct.name,
			objectCount: ct.objectCount,
			fieldCount: ct.fieldCount,
		}));
		console.error(`Creating ${complexTypeList.length} SifComplexType nodes...`);
		await session.run(
			`UNWIND $types AS ct
			 CREATE (n:SifComplexType:SifModel {
			   name: ct.name,
			   objectCount: ct.objectCount,
			   fieldCount: ct.fieldCount
			 })`,
			{ types: complexTypeList }
		);
		counts.SifComplexType = complexTypeList.length;

		// CONTAINS relationships between complex types
		const containsEdges = [...ctParentChildPairs].map(pair => {
			const [parent, child] = pair.split('|');
			return { parentName: parent, childName: child };
		});
		if (containsEdges.length > 0) {
			console.error(`Creating ${containsEdges.length} CONTAINS edges (complex types)...`);
			await session.run(
				`UNWIND $edges AS e
				 MATCH (parent:SifComplexType {name: e.parentName})
				 MATCH (child:SifComplexType {name: e.childName})
				 CREATE (parent)-[:CONTAINS]->(child)`,
				{ edges: containsEdges }
			);
		}
		counts.CONTAINS = containsEdges.length;

		// 3f. Create SifObject nodes
		const objectData = sifObjectList.map(obj => ({
			name: obj.name,
			tableName: obj.tableName,
			fieldCount: obj.fields.length,
			mandatoryFieldCount: obj.fields.filter(f => f.mandatory).length,
		}));
		console.error(`Creating ${objectData.length} SifObject nodes...`);
		await session.run(
			`UNWIND $objects AS obj
			 CREATE (s:SifObject:SifModel {
			   name: obj.name,
			   tableName: obj.tableName,
			   fieldCount: obj.fieldCount,
			   mandatoryFieldCount: obj.mandatoryFieldCount
			 })`,
			{ objects: objectData }
		);
		counts.SifObject = objectData.length;

		// REFERENCES edges
		console.error(`Creating ${edgeList.length} REFERENCES edges...`);
		await session.run(
			`UNWIND $refs AS ref
			 MATCH (src:SifObject {tableName: ref.sourceTable})
			 MATCH (tgt:SifObject {tableName: ref.targetTable})
			 CREATE (src)-[:REFERENCES {via: ref.via, mandatory: ref.mandatory}]->(tgt)`,
			{ refs: edgeList }
		);
		counts.REFERENCES = edgeList.length;

		// USES_COMPLEX_TYPE edges
		const usesCtEdges = [];
		for (const [tableName, ctNames] of objectComplexTypesMap) {
			for (const ctName of ctNames) {
				usesCtEdges.push({ tableName, complexTypeName: ctName });
			}
		}
		if (usesCtEdges.length > 0) {
			console.error(`Creating ${usesCtEdges.length} USES_COMPLEX_TYPE edges...`);
			for (const batch of batchArray(usesCtEdges, 1000)) {
				await session.run(
					`UNWIND $edges AS e
					 MATCH (obj:SifObject {tableName: e.tableName})
					 MATCH (ct:SifComplexType {name: e.complexTypeName})
					 CREATE (obj)-[:USES_COMPLEX_TYPE]->(ct)`,
					{ edges: batch }
				);
			}
		}
		counts.USES_COMPLEX_TYPE = usesCtEdges.length;

		// 3g. Create SifField nodes (batched at ~1000)
		const allFieldData = [];
		for (const obj of sifObjectList) {
			for (const field of obj.fields) {
				allFieldData.push({
					objectTableName: obj.tableName,
					name: field.name,
					xpath: field.xpath,
					mandatory: field.mandatory,
					characteristics: field.characteristics,
					description: field.description,
					cedsId: field.cedsId,
					depth: field.depth,
					isAttribute: field.isAttribute,
					pathSegments: field.pathSegments,
				});
			}
		}

		console.error(`Creating ${allFieldData.length} SifField nodes (batched)...`);
		const fieldBatches = batchArray(allFieldData, 1000);
		for (let i = 0; i < fieldBatches.length; i++) {
			console.error(`  Batch ${i + 1}/${fieldBatches.length} (${fieldBatches[i].length} fields)...`);
			await session.run(
				`UNWIND $fields AS f
				 MATCH (obj:SifObject {tableName: f.objectTableName})
				 CREATE (field:SifField:SifModel {
				   name: f.name,
				   xpath: f.xpath,
				   mandatory: f.mandatory,
				   characteristics: f.characteristics,
				   description: f.description,
				   cedsId: f.cedsId,
				   depth: f.depth,
				   isAttribute: f.isAttribute,
				   pathSegments: f.pathSegments
				 })
				 CREATE (obj)-[:HAS_FIELD]->(field)`,
				{ fields: fieldBatches[i] }
			);
		}
		counts.SifField = allFieldData.length;
		counts.HAS_FIELD = allFieldData.length;

		// HAS_TYPE edges: match each field to its type node
		const hasTypeData = [];
		for (const obj of sifObjectList) {
			for (const field of obj.fields) {
				if (!field.type) continue;
				const typeInfo = typeRegistry.get(field.type);
				if (!typeInfo) continue;
				hasTypeData.push({
					fieldXpath: field.xpath,
					typeName: field.type,
					typeLabel: typeInfo.label,
				});
			}
		}

		// Split by type label for proper MATCH
		const hasTypePrimitive = hasTypeData.filter(d => d.typeLabel === 'SifPrimitiveType');
		const hasTypeSimple = hasTypeData.filter(d => d.typeLabel === 'SifSimpleType');

		console.error(`Creating ${hasTypeData.length} HAS_TYPE edges...`);
		for (const batch of batchArray(hasTypePrimitive, 1000)) {
			await session.run(
				`UNWIND $edges AS e
				 MATCH (field:SifField {xpath: e.fieldXpath})
				 MATCH (t:SifPrimitiveType {name: e.typeName})
				 CREATE (field)-[:HAS_TYPE]->(t)`,
				{ edges: batch.map(d => ({ fieldXpath: d.fieldXpath, typeName: d.typeName })) }
			);
		}
		for (const batch of batchArray(hasTypeSimple, 1000)) {
			await session.run(
				`UNWIND $edges AS e
				 MATCH (field:SifField {xpath: e.fieldXpath})
				 MATCH (t:SifSimpleType {name: e.typeName})
				 CREATE (field)-[:HAS_TYPE]->(t)`,
				{ edges: batch.map(d => ({ fieldXpath: d.fieldXpath, typeName: d.typeName })) }
			);
		}
		counts.HAS_TYPE = hasTypeData.length;

		// CONSTRAINED_BY edges: match each field to its codeset by fingerprint
		const constrainedByData = [];
		for (const obj of sifObjectList) {
			for (const field of obj.fields) {
				const fingerprint = fieldCodesetMap.get(field.xpath);
				if (!fingerprint) continue;
				constrainedByData.push({
					fieldXpath: field.xpath,
					fingerprint,
				});
			}
		}

		if (constrainedByData.length > 0) {
			console.error(`Creating ${constrainedByData.length} CONSTRAINED_BY edges...`);
			for (const batch of batchArray(constrainedByData, 1000)) {
				await session.run(
					`UNWIND $edges AS e
					 MATCH (field:SifField {xpath: e.fieldXpath})
					 MATCH (cs:SifCodeset {fingerprint: e.fingerprint})
					 CREATE (field)-[:CONSTRAINED_BY]->(cs)`,
					{ edges: batch }
				);
			}
		}
		counts.CONSTRAINED_BY = constrainedByData.length;

		// MEMBER_OF edges: match each field to its complex type
		const memberOfData = [];
		for (const obj of sifObjectList) {
			for (const field of obj.fields) {
				const ctName = fieldComplexTypeMap.get(field.xpath);
				if (!ctName) continue;
				memberOfData.push({
					fieldXpath: field.xpath,
					complexTypeName: ctName,
				});
			}
		}

		if (memberOfData.length > 0) {
			console.error(`Creating ${memberOfData.length} MEMBER_OF edges...`);
			for (const batch of batchArray(memberOfData, 1000)) {
				await session.run(
					`UNWIND $edges AS e
					 MATCH (field:SifField {xpath: e.fieldXpath})
					 MATCH (ct:SifComplexType {name: e.complexTypeName})
					 CREATE (field)-[:MEMBER_OF]->(ct)`,
					{ edges: batch }
				);
			}
		}
		counts.MEMBER_OF = memberOfData.length;

		// =========================================================
		// Step 4: Neo4j Loading — Phase 2 (XML Element Tree)
		// =========================================================

		// 4a. Create SifXmlElement nodes
		const elementData = [...elementMap.values()].map(el => ({
			name: el.name,
			path: el.path,
			depth: el.depth,
			isShared: el.isShared,
			isLeaf: el.isLeaf,
		}));

		console.error(`\nCreating ${elementData.length} SifXmlElement nodes...`);
		for (const batch of batchArray(elementData, 1000)) {
			await session.run(
				`UNWIND $elements AS el
				 CREATE (n:SifXmlElement:SifModel {
				   name: el.name,
				   path: el.path,
				   depth: el.depth,
				   isShared: el.isShared,
				   isLeaf: el.isLeaf
				 })`,
				{ elements: batch }
			);
		}
		counts.SifXmlElement = elementData.length;

		// 4b. Create CHILD_ELEMENT relationships
		const childElementData = [...childElementPairs].map(pair => {
			const [parentPath, childPath] = pair.split('|');
			return { parentPath, childPath };
		});

		if (childElementData.length > 0) {
			console.error(`Creating ${childElementData.length} CHILD_ELEMENT edges...`);
			for (const batch of batchArray(childElementData, 1000)) {
				await session.run(
					`UNWIND $edges AS e
					 MATCH (parent:SifXmlElement {path: e.parentPath})
					 MATCH (child:SifXmlElement {path: e.childPath})
					 CREATE (parent)-[:CHILD_ELEMENT]->(child)`,
					{ edges: batch }
				);
			}
		}
		counts.CHILD_ELEMENT = childElementData.length;

		// 4c. Create HAS_ROOT_ELEMENT relationships
		const rootElementData = [];
		for (const [tableName, elementPaths] of objectRootElements) {
			for (const elementPath of elementPaths) {
				rootElementData.push({ tableName, elementPath });
			}
		}

		if (rootElementData.length > 0) {
			console.error(`Creating ${rootElementData.length} HAS_ROOT_ELEMENT edges...`);
			for (const batch of batchArray(rootElementData, 1000)) {
				await session.run(
					`UNWIND $links AS link
					 MATCH (obj:SifObject {tableName: link.tableName})
					 MATCH (el:SifXmlElement {path: link.elementPath})
					 CREATE (obj)-[:HAS_ROOT_ELEMENT]->(el)`,
					{ links: batch }
				);
			}
		}
		counts.HAS_ROOT_ELEMENT = rootElementData.length;

		// 4d. Create REALIZED_BY relationships (leaf element → field)
		// Only link leaf elements to their corresponding fields
		const realizedByData = leafFieldLinks.filter(link => {
			const el = elementMap.get(link.elementPath);
			return el && el.isLeaf;
		});

		if (realizedByData.length > 0) {
			console.error(`Creating ${realizedByData.length} REALIZED_BY edges...`);
			for (const batch of batchArray(realizedByData, 1000)) {
				await session.run(
					`UNWIND $links AS link
					 MATCH (el:SifXmlElement {path: link.elementPath})
					 MATCH (field:SifField {xpath: link.fieldXpath})
					 CREATE (el)-[:REALIZED_BY]->(field)`,
					{ links: batch }
				);
			}
		}
		counts.REALIZED_BY = realizedByData.length;

		// 4e. Create TYPED_AS relationships (non-leaf element → complex type)
		const typedAsData = [];
		for (const [elPath, el] of elementMap) {
			if (el.isLeaf) continue;
			// The element's name corresponds to a complex type if one exists
			if (complexTypeMap.has(el.name)) {
				typedAsData.push({
					elementPath: elPath,
					complexTypeName: el.name,
				});
			}
		}

		if (typedAsData.length > 0) {
			console.error(`Creating ${typedAsData.length} TYPED_AS edges...`);
			for (const batch of batchArray(typedAsData, 1000)) {
				await session.run(
					`UNWIND $links AS link
					 MATCH (el:SifXmlElement {path: link.elementPath})
					 MATCH (ct:SifComplexType {name: link.complexTypeName})
					 CREATE (el)-[:TYPED_AS]->(ct)`,
					{ links: batch }
				);
			}
		}
		counts.TYPED_AS = typedAsData.length;

		// =========================================================
		// Step 5: Create Indexes
		// =========================================================
		console.error('\nCreating indexes...');
		const indexStatements = [
			'CREATE INDEX sifobject_name IF NOT EXISTS FOR (s:SifObject) ON (s.name)',
			'CREATE INDEX sifobject_tablename IF NOT EXISTS FOR (s:SifObject) ON (s.tableName)',
			'CREATE INDEX siffield_xpath IF NOT EXISTS FOR (f:SifField) ON (f.xpath)',
			'CREATE INDEX siffield_name IF NOT EXISTS FOR (f:SifField) ON (f.name)',
			'CREATE INDEX siffield_cedsid IF NOT EXISTS FOR (f:SifField) ON (f.cedsId)',
			'CREATE INDEX sifxmlelement_path IF NOT EXISTS FOR (e:SifXmlElement) ON (e.path)',
			'CREATE INDEX sifcomplextype_name IF NOT EXISTS FOR (c:SifComplexType) ON (c.name)',
			'CREATE INDEX sifcodeset_fingerprint IF NOT EXISTS FOR (c:SifCodeset) ON (c.fingerprint)',
			'CREATE INDEX sifsimpletype_name IF NOT EXISTS FOR (t:SifSimpleType) ON (t.name)',
			'CREATE INDEX sifprimitivetype_name IF NOT EXISTS FOR (t:SifPrimitiveType) ON (t.name)',
			'CREATE INDEX sifmodel_label IF NOT EXISTS FOR (n:SifModel) ON (n.name)',
		];

		for (const stmt of indexStatements) {
			await session.run(stmt);
		}
		console.error(`  Created ${indexStatements.length} indexes`);

		// =========================================================
		// Step 6: Verification
		// =========================================================
		console.error('\n--- Verification Counts ---');

		// Node counts
		const nodeCountQueries = [
			['SifObject', 'MATCH (n:SifObject) RETURN count(n) AS cnt'],
			['SifField', 'MATCH (n:SifField) RETURN count(n) AS cnt'],
			['SifComplexType', 'MATCH (n:SifComplexType) RETURN count(n) AS cnt'],
			['SifSimpleType', 'MATCH (n:SifSimpleType) RETURN count(n) AS cnt'],
			['SifPrimitiveType', 'MATCH (n:SifPrimitiveType) RETURN count(n) AS cnt'],
			['SifCodeset', 'MATCH (n:SifCodeset) RETURN count(n) AS cnt'],
			['SifXmlElement', 'MATCH (n:SifXmlElement) RETURN count(n) AS cnt'],
		];

		const verifiedCounts = {};
		for (const [label, query] of nodeCountQueries) {
			const result = await session.run(query);
			const cnt = result.records[0].get('cnt').toNumber();
			console.error(`${label} nodes: ${cnt}`);
			verifiedCounts[label] = cnt;
		}

		// Edge counts
		const edgeCountQueries = [
			['HAS_FIELD', 'MATCH ()-[r:HAS_FIELD]->() RETURN count(r) AS cnt'],
			['REFERENCES', 'MATCH ()-[r:REFERENCES]->() RETURN count(r) AS cnt'],
			['HAS_TYPE', 'MATCH ()-[r:HAS_TYPE]->() RETURN count(r) AS cnt'],
			['CONSTRAINED_BY', 'MATCH ()-[r:CONSTRAINED_BY]->() RETURN count(r) AS cnt'],
			['MEMBER_OF', 'MATCH ()-[r:MEMBER_OF]->() RETURN count(r) AS cnt'],
			['CONTAINS', 'MATCH ()-[r:CONTAINS]->() RETURN count(r) AS cnt'],
			['USES_COMPLEX_TYPE', 'MATCH ()-[r:USES_COMPLEX_TYPE]->() RETURN count(r) AS cnt'],
			['CHILD_ELEMENT', 'MATCH ()-[r:CHILD_ELEMENT]->() RETURN count(r) AS cnt'],
			['HAS_ROOT_ELEMENT', 'MATCH ()-[r:HAS_ROOT_ELEMENT]->() RETURN count(r) AS cnt'],
			['REALIZED_BY', 'MATCH ()-[r:REALIZED_BY]->() RETURN count(r) AS cnt'],
			['TYPED_AS', 'MATCH ()-[r:TYPED_AS]->() RETURN count(r) AS cnt'],
		];

		for (const [label, query] of edgeCountQueries) {
			const result = await session.run(query);
			const cnt = result.records[0].get('cnt').toNumber();
			console.error(`${label} edges: ${cnt}`);
			verifiedCounts[label] = cnt;
		}

		return verifiedCounts;
	} finally {
		await session.close();
		await driver.close();
	}
};

// =====================================================================
// CLI ENTRY POINT
// =====================================================================

if (require.main === module) {
	const args = process.argv.slice(2);
	const flags = {};

	for (const arg of args) {
		if (arg.startsWith('--')) {
			const [key, ...valueParts] = arg.slice(2).split('=');
			flags[key] = valueParts.join('=') || true;
		}
	}

	const tsvPath = flags.tsvPath || path.join(__dirname, 'assets', 'ImplementationSpecification_031326.tsv');
	const resolutionMapPath = flags.resolutionMapPath || path.join(__dirname, 'assets', 'refIdResolutionMap.tsv');
	const containerName = flags.containerName || 'SifSpecGraph';

	if (!fs.existsSync(tsvPath)) {
		console.error(`TSV file not found: ${tsvPath}`);
		process.exit(1);
	}

	console.error(`Parsing: ${tsvPath}`);
	const sifObjectList = parseTsvFile(tsvPath);
	console.error(`Parsed ${sifObjectList.length} SIF object types`);

	const totalFields = sifObjectList.reduce((sum, obj) => sum + obj.fields.length, 0);
	console.error(`Total fields: ${totalFields}`);

	console.error(`\nLoading resolution map: ${resolutionMapPath}`);
	const manualResolutions = loadResolutionMap(resolutionMapPath);
	console.error(`Loaded ${Object.keys(manualResolutions).length} manual resolutions`);

	console.error(`\nResolving RefId targets...`);
	const rawEdges = resolveRefIdTargets(sifObjectList, manualResolutions);
	const edgeList = deduplicateEdges(rawEdges);

	console.error(`\nConnecting to Neo4j...`);
	let neo4jConfig;
	try {
		// Prefer direct CLI flags for connection details
		if (flags.neo4jBoltUri && flags.neo4jPassword) {
			neo4jConfig = {
				neo4jBoltUri: flags.neo4jBoltUri,
				neo4jUser: flags.neo4jUser || 'neo4j',
				neo4jPassword: flags.neo4jPassword,
			};
		} else {
			neo4jConfig = findNeo4jConfig(containerName);
		}
	} catch (err) {
		console.error(`\nCannot find Neo4j config: ${err.message}`);
		process.exit(1);
	}

	console.error(`  URI: ${neo4jConfig.neo4jBoltUri}`);

	loadGraphIntoNeo4j(sifObjectList, edgeList, neo4jConfig)
		.then((verifiedCounts) => {
			// Output summary as JSON to stdout
			console.log(JSON.stringify({
				status: 'success',
				counts: verifiedCounts,
				sourceFile: tsvPath,
			}, null, 2));
		})
		.catch((err) => {
			console.error(`\nFailed to load graph: ${err.message}`);
			console.error(err.stack);
			process.exit(1);
		});
}

module.exports = { parseTsvFile, loadResolutionMap, resolveRefIdTargets, deduplicateEdges };
