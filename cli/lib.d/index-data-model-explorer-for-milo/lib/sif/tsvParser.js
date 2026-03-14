'use strict';

// tsvParser.js — Parse SIF TSV and load into Neo4j for DataModelExplorer
// Derived from sif-spec-graph/parseSifSpecTsv.js
// Key difference: clears only :SifModel nodes (not full graph) for per-standard reload
// Exports both parse functions AND loadGraphIntoNeo4j

const fs = require('fs');
const path = require('path');

// =====================================================================
// TSV PARSING
// =====================================================================

const TABLE_HEADER_PATTERN = /^(.+):\s*Table\s+\d+$/;

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
			continue;
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
			depth: Math.max(0, xpathParts.length - 3),
			isAttribute: fieldName.startsWith('@'),
			pathSegments: xpathParts.length > 3 ? xpathParts.slice(3, -1) : [],
		};

		currentObject.fields.push(fieldDef);

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

const loadResolutionMap = (resolutionMapPath) => {
	const manualResolutions = {};

	if (!fs.existsSync(resolutionMapPath)) {
		console.error(`Warning: Resolution map not found at ${resolutionMapPath}`);
		return manualResolutions;
	}

	const content = fs.readFileSync(resolutionMapPath, 'utf8');
	const lines = content.split('\n');

	for (let i = 1; i < lines.length; i++) {
		const cols = lines[i].split('\t');
		const refIdProperty = (cols[0] || '').trim();
		const resolvedTable = (cols[2] || '').trim();
		if (refIdProperty && resolvedTable) {
			manualResolutions[refIdProperty] = resolvedTable;
		}
	}

	return manualResolutions;
};

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

			if (manualResolutions[cleanName]) {
				const resolved = manualResolutions[cleanName];
				if (resolved === 'UNRESOLVABLE_GENERIC_REF') continue;
				allEdges.push({
					sourceTable: sifObject.tableName,
					targetTable: resolved,
					via: cleanName,
					mandatory: refField.mandatory,
				});
				continue;
			}

			const baseName = cleanName.replace(/RefId$/, '');
			const naiveTarget = baseName + 's';

			if (tableNameSet.has(naiveTarget)) {
				allEdges.push({ sourceTable: sifObject.tableName, targetTable: naiveTarget, via: cleanName, mandatory: refField.mandatory });
				continue;
			}

			if (tableNameLowerMap[naiveTarget.toLowerCase()]) {
				allEdges.push({ sourceTable: sifObject.tableName, targetTable: tableNameLowerMap[naiveTarget.toLowerCase()], via: cleanName, mandatory: refField.mandatory });
				continue;
			}

			let found = false;
			for (const suffix of ['Infos', 'Personals', 'Items']) {
				const candidate = baseName + suffix;
				if (tableNameLowerMap[candidate.toLowerCase()]) {
					allEdges.push({ sourceTable: sifObject.tableName, targetTable: tableNameLowerMap[candidate.toLowerCase()], via: cleanName, mandatory: refField.mandatory });
					found = true;
					break;
				}
			}
			if (found) continue;

			unresolvedCount++;
		}
	}

	return allEdges;
};

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

	return uniqueEdges;
};

// =====================================================================
// IN-MEMORY DATA STRUCTURE BUILDERS
// =====================================================================

const buildTypeRegistry = (sifObjectList) => {
	const typeMap = new Map();
	for (const obj of sifObjectList) {
		for (const field of obj.fields) {
			const typeName = field.type;
			if (!typeName || typeMap.has(typeName)) continue;
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

const buildCodesetRegistry = (sifObjectList) => {
	const codesetMap = new Map();
	const fieldCodesetMap = new Map();

	for (const obj of sifObjectList) {
		for (const field of obj.fields) {
			let formatStr = field.format;
			if (!formatStr) continue;
			formatStr = formatStr.replace(/^"(.*)"$/, '$1');
			if (!formatStr.trim()) continue;
			const values = formatStr.split(', ').map(v => v.trim()).filter(v => v);
			if (values.length === 0) continue;
			const sorted = [...values].sort();
			const fingerprint = sorted.join('|');
			if (!codesetMap.has(fingerprint)) {
				codesetMap.set(fingerprint, { values: sorted, valueCount: sorted.length, fingerprint });
			}
			fieldCodesetMap.set(field.xpath, fingerprint);
		}
	}

	return { codesetMap, fieldCodesetMap };
};

const buildComplexTypeRegistry = (sifObjectList) => {
	const complexTypeMap = new Map();
	const parentChildPairs = new Set();
	const fieldComplexTypeMap = new Map();
	const objectComplexTypesMap = new Map();

	for (const obj of sifObjectList) {
		if (!objectComplexTypesMap.has(obj.tableName)) {
			objectComplexTypesMap.set(obj.tableName, new Set());
		}
		for (const field of obj.fields) {
			const segments = field.pathSegments;
			if (!segments || segments.length === 0) continue;
			for (let i = 0; i < segments.length; i++) {
				const segName = segments[i];
				if (!complexTypeMap.has(segName)) {
					complexTypeMap.set(segName, { name: segName, objects: new Set(), fieldCount: 0 });
				}
				const ct = complexTypeMap.get(segName);
				ct.objects.add(obj.tableName);
				objectComplexTypesMap.get(obj.tableName).add(segName);
				if (i > 0) { parentChildPairs.add(`${segments[i - 1]}|${segName}`); }
			}
			const innermostSegment = segments[segments.length - 1];
			fieldComplexTypeMap.set(field.xpath, innermostSegment);
			complexTypeMap.get(innermostSegment).fieldCount++;
		}
	}

	for (const [, ct] of complexTypeMap) { ct.objectCount = ct.objects.size; }
	return { complexTypeMap, parentChildPairs, fieldComplexTypeMap, objectComplexTypesMap };
};

const buildXmlElementTree = (sifObjectList) => {
	const elementMap = new Map();
	const childElementPairs = new Set();
	const objectRootElements = new Map();
	const leafFieldLinks = [];

	for (const obj of sifObjectList) {
		if (!objectRootElements.has(obj.tableName)) {
			objectRootElements.set(obj.tableName, new Set());
		}
		for (const field of obj.fields) {
			const xpathParts = field.xpath.split('/');
			if (xpathParts.length <= 3) continue;
			const elementParts = xpathParts.slice(3);
			for (let i = 0; i < elementParts.length; i++) {
				const relativePath = elementParts.slice(0, i + 1).join('/');
				const elementName = elementParts[i];
				const depth = i + 1;
				if (!elementMap.has(relativePath)) {
					elementMap.set(relativePath, { name: elementName, path: relativePath, depth, objectNames: new Set(), children: new Set(), isLeaf: true });
				}
				const el = elementMap.get(relativePath);
				el.objectNames.add(obj.tableName);
				if (i > 0) {
					const parentPath = elementParts.slice(0, i).join('/');
					childElementPairs.add(`${parentPath}|${relativePath}`);
					const parentEl = elementMap.get(parentPath);
					if (parentEl) { parentEl.isLeaf = false; parentEl.children.add(relativePath); }
				}
				if (i === 0) { objectRootElements.get(obj.tableName).add(relativePath); }
			}
			const leafPath = elementParts.join('/');
			leafFieldLinks.push({ elementPath: leafPath, fieldXpath: field.xpath });
		}
	}

	for (const [, el] of elementMap) { el.isShared = el.objectNames.size > 1; }
	return { elementMap, childElementPairs, objectRootElements, leafFieldLinks };
};

// =====================================================================
// BATCH HELPER
// =====================================================================

const batchArray = (arr, size) => {
	const batches = [];
	for (let i = 0; i < arr.length; i += size) {
		batches.push(arr.slice(i, i + size));
	}
	return batches;
};

// =====================================================================
// NEO4J LOADING — clears only :SifModel nodes
// =====================================================================

const loadGraphIntoNeo4j = async (sifObjectList, edgeList, neo4jConfig) => {
	const neo4j = require('neo4j-driver');
	const { xLog } = process.global;

	const driver = neo4j.driver(
		neo4jConfig.neo4jBoltUri,
		neo4j.auth.basic(neo4jConfig.neo4jUser, neo4jConfig.neo4jPassword),
		{ encrypted: false }
	);

	const session = driver.session();
	const counts = {};

	try {
		// Build in-memory data structures
		xLog.status('[sif/tsvParser] Building in-memory data structures...');
		const typeRegistry = buildTypeRegistry(sifObjectList);
		const { codesetMap, fieldCodesetMap } = buildCodesetRegistry(sifObjectList);
		const { complexTypeMap, parentChildPairs: ctParentChildPairs, fieldComplexTypeMap, objectComplexTypesMap } = buildComplexTypeRegistry(sifObjectList);
		const { elementMap, childElementPairs, objectRootElements, leafFieldLinks } = buildXmlElementTree(sifObjectList);

		const primitiveTypes = [...typeRegistry.values()].filter(t => t.category === 'primitive');
		const simpleTypes = [...typeRegistry.values()].filter(t => t.category === 'simple');

		// Clear only SifModel nodes (preserve CEDS and bridge data)
		xLog.status('[sif/tsvParser] Clearing existing SifModel nodes...');
		await session.run('MATCH (n:SifModel) DETACH DELETE n');

		// Create type nodes
		xLog.status(`[sif/tsvParser] Creating ${primitiveTypes.length} SifPrimitiveType nodes...`);
		await session.run(
			`UNWIND $types AS t CREATE (n:SifPrimitiveType:SifModel {name: t.name, category: 'primitive'})`,
			{ types: primitiveTypes.map(t => ({ name: t.name })) }
		);

		xLog.status(`[sif/tsvParser] Creating ${simpleTypes.length} SifSimpleType nodes...`);
		await session.run(
			`UNWIND $types AS t CREATE (n:SifSimpleType:SifModel {name: t.name, category: 'simple'})`,
			{ types: simpleTypes.map(t => ({ name: t.name })) }
		);

		// Codeset nodes
		const codesetList = [...codesetMap.values()];
		xLog.status(`[sif/tsvParser] Creating ${codesetList.length} SifCodeset nodes...`);
		await session.run(
			`UNWIND $codesets AS cs CREATE (n:SifCodeset:SifModel {values: cs.values, valueCount: cs.valueCount, fingerprint: cs.fingerprint})`,
			{ codesets: codesetList }
		);

		// ComplexType nodes
		const complexTypeList = [...complexTypeMap.values()].map(ct => ({ name: ct.name, objectCount: ct.objectCount, fieldCount: ct.fieldCount }));
		xLog.status(`[sif/tsvParser] Creating ${complexTypeList.length} SifComplexType nodes...`);
		await session.run(
			`UNWIND $types AS ct CREATE (n:SifComplexType:SifModel {name: ct.name, objectCount: ct.objectCount, fieldCount: ct.fieldCount})`,
			{ types: complexTypeList }
		);

		// CONTAINS edges between complex types
		const containsEdges = [...ctParentChildPairs].map(pair => {
			const [parent, child] = pair.split('|');
			return { parentName: parent, childName: child };
		});
		if (containsEdges.length > 0) {
			await session.run(
				`UNWIND $edges AS e MATCH (parent:SifComplexType {name: e.parentName}) MATCH (child:SifComplexType {name: e.childName}) CREATE (parent)-[:CONTAINS]->(child)`,
				{ edges: containsEdges }
			);
		}

		// SifObject nodes
		const objectData = sifObjectList.map(obj => ({
			name: obj.name, tableName: obj.tableName,
			fieldCount: obj.fields.length,
			mandatoryFieldCount: obj.fields.filter(f => f.mandatory).length,
		}));
		xLog.status(`[sif/tsvParser] Creating ${objectData.length} SifObject nodes...`);
		await session.run(
			`UNWIND $objects AS obj CREATE (s:SifObject:SifModel {name: obj.name, tableName: obj.tableName, fieldCount: obj.fieldCount, mandatoryFieldCount: obj.mandatoryFieldCount})`,
			{ objects: objectData }
		);

		// REFERENCES edges
		xLog.status(`[sif/tsvParser] Creating ${edgeList.length} REFERENCES edges...`);
		await session.run(
			`UNWIND $refs AS ref MATCH (src:SifObject {tableName: ref.sourceTable}) MATCH (tgt:SifObject {tableName: ref.targetTable}) CREATE (src)-[:REFERENCES {via: ref.via, mandatory: ref.mandatory}]->(tgt)`,
			{ refs: edgeList }
		);

		// USES_COMPLEX_TYPE edges
		const usesCtEdges = [];
		for (const [tableName, ctNames] of objectComplexTypesMap) {
			for (const ctName of ctNames) {
				usesCtEdges.push({ tableName, complexTypeName: ctName });
			}
		}
		if (usesCtEdges.length > 0) {
			for (const batch of batchArray(usesCtEdges, 1000)) {
				await session.run(
					`UNWIND $edges AS e MATCH (obj:SifObject {tableName: e.tableName}) MATCH (ct:SifComplexType {name: e.complexTypeName}) CREATE (obj)-[:USES_COMPLEX_TYPE]->(ct)`,
					{ edges: batch }
				);
			}
		}

		// SifField nodes (batched)
		const allFieldData = [];
		for (const obj of sifObjectList) {
			for (const field of obj.fields) {
				allFieldData.push({
					objectTableName: obj.tableName, name: field.name, xpath: field.xpath,
					mandatory: field.mandatory, characteristics: field.characteristics,
					description: field.description, cedsId: field.cedsId,
					depth: field.depth, isAttribute: field.isAttribute, pathSegments: field.pathSegments,
				});
			}
		}

		xLog.status(`[sif/tsvParser] Creating ${allFieldData.length} SifField nodes (batched)...`);
		const fieldBatches = batchArray(allFieldData, 1000);
		for (let i = 0; i < fieldBatches.length; i++) {
			xLog.status(`  Batch ${i + 1}/${fieldBatches.length} (${fieldBatches[i].length} fields)...`);
			await session.run(
				`UNWIND $fields AS f
				 MATCH (obj:SifObject {tableName: f.objectTableName})
				 CREATE (field:SifField:SifModel {
				   name: f.name, xpath: f.xpath, mandatory: f.mandatory,
				   characteristics: f.characteristics, description: f.description,
				   cedsId: f.cedsId, depth: f.depth, isAttribute: f.isAttribute, pathSegments: f.pathSegments
				 })
				 CREATE (obj)-[:HAS_FIELD]->(field)`,
				{ fields: fieldBatches[i] }
			);
		}

		// HAS_TYPE edges
		const hasTypeData = [];
		for (const obj of sifObjectList) {
			for (const field of obj.fields) {
				if (!field.type) continue;
				const typeInfo = typeRegistry.get(field.type);
				if (!typeInfo) continue;
				hasTypeData.push({ fieldXpath: field.xpath, typeName: field.type, typeLabel: typeInfo.label });
			}
		}

		const hasTypePrimitive = hasTypeData.filter(d => d.typeLabel === 'SifPrimitiveType');
		const hasTypeSimple = hasTypeData.filter(d => d.typeLabel === 'SifSimpleType');

		xLog.status(`[sif/tsvParser] Creating ${hasTypeData.length} HAS_TYPE edges...`);
		for (const batch of batchArray(hasTypePrimitive, 1000)) {
			await session.run(
				`UNWIND $edges AS e MATCH (field:SifField {xpath: e.fieldXpath}) MATCH (t:SifPrimitiveType {name: e.typeName}) CREATE (field)-[:HAS_TYPE]->(t)`,
				{ edges: batch.map(d => ({ fieldXpath: d.fieldXpath, typeName: d.typeName })) }
			);
		}
		for (const batch of batchArray(hasTypeSimple, 1000)) {
			await session.run(
				`UNWIND $edges AS e MATCH (field:SifField {xpath: e.fieldXpath}) MATCH (t:SifSimpleType {name: e.typeName}) CREATE (field)-[:HAS_TYPE]->(t)`,
				{ edges: batch.map(d => ({ fieldXpath: d.fieldXpath, typeName: d.typeName })) }
			);
		}

		// CONSTRAINED_BY edges
		const constrainedByData = [];
		for (const obj of sifObjectList) {
			for (const field of obj.fields) {
				const fingerprint = fieldCodesetMap.get(field.xpath);
				if (!fingerprint) continue;
				constrainedByData.push({ fieldXpath: field.xpath, fingerprint });
			}
		}
		if (constrainedByData.length > 0) {
			xLog.status(`[sif/tsvParser] Creating ${constrainedByData.length} CONSTRAINED_BY edges...`);
			for (const batch of batchArray(constrainedByData, 1000)) {
				await session.run(
					`UNWIND $edges AS e MATCH (field:SifField {xpath: e.fieldXpath}) MATCH (cs:SifCodeset {fingerprint: e.fingerprint}) CREATE (field)-[:CONSTRAINED_BY]->(cs)`,
					{ edges: batch }
				);
			}
		}

		// MEMBER_OF edges
		const memberOfData = [];
		for (const obj of sifObjectList) {
			for (const field of obj.fields) {
				const ctName = fieldComplexTypeMap.get(field.xpath);
				if (!ctName) continue;
				memberOfData.push({ fieldXpath: field.xpath, complexTypeName: ctName });
			}
		}
		if (memberOfData.length > 0) {
			xLog.status(`[sif/tsvParser] Creating ${memberOfData.length} MEMBER_OF edges...`);
			for (const batch of batchArray(memberOfData, 1000)) {
				await session.run(
					`UNWIND $edges AS e MATCH (field:SifField {xpath: e.fieldXpath}) MATCH (ct:SifComplexType {name: e.complexTypeName}) CREATE (field)-[:MEMBER_OF]->(ct)`,
					{ edges: batch }
				);
			}
		}

		// XML Element Tree
		const elementData = [...elementMap.values()].map(el => ({ name: el.name, path: el.path, depth: el.depth, isShared: el.isShared, isLeaf: el.isLeaf }));
		xLog.status(`[sif/tsvParser] Creating ${elementData.length} SifXmlElement nodes...`);
		for (const batch of batchArray(elementData, 1000)) {
			await session.run(
				`UNWIND $elements AS el CREATE (n:SifXmlElement:SifModel {name: el.name, path: el.path, depth: el.depth, isShared: el.isShared, isLeaf: el.isLeaf})`,
				{ elements: batch }
			);
		}

		// CHILD_ELEMENT, HAS_ROOT_ELEMENT, REALIZED_BY, TYPED_AS edges
		const childElementData = [...childElementPairs].map(pair => { const [p, c] = pair.split('|'); return { parentPath: p, childPath: c }; });
		if (childElementData.length > 0) {
			for (const batch of batchArray(childElementData, 1000)) {
				await session.run(
					`UNWIND $edges AS e MATCH (parent:SifXmlElement {path: e.parentPath}) MATCH (child:SifXmlElement {path: e.childPath}) CREATE (parent)-[:CHILD_ELEMENT]->(child)`,
					{ edges: batch }
				);
			}
		}

		const rootElementData = [];
		for (const [tableName, elementPaths] of objectRootElements) {
			for (const elementPath of elementPaths) { rootElementData.push({ tableName, elementPath }); }
		}
		if (rootElementData.length > 0) {
			for (const batch of batchArray(rootElementData, 1000)) {
				await session.run(
					`UNWIND $links AS link MATCH (obj:SifObject {tableName: link.tableName}) MATCH (el:SifXmlElement {path: link.elementPath}) CREATE (obj)-[:HAS_ROOT_ELEMENT]->(el)`,
					{ links: batch }
				);
			}
		}

		const realizedByData = leafFieldLinks.filter(link => { const el = elementMap.get(link.elementPath); return el && el.isLeaf; });
		if (realizedByData.length > 0) {
			for (const batch of batchArray(realizedByData, 1000)) {
				await session.run(
					`UNWIND $links AS link MATCH (el:SifXmlElement {path: link.elementPath}) MATCH (field:SifField {xpath: link.fieldXpath}) CREATE (el)-[:REALIZED_BY]->(field)`,
					{ links: batch }
				);
			}
		}

		const typedAsData = [];
		for (const [elPath, el] of elementMap) {
			if (el.isLeaf) continue;
			if (complexTypeMap.has(el.name)) { typedAsData.push({ elementPath: elPath, complexTypeName: el.name }); }
		}
		if (typedAsData.length > 0) {
			for (const batch of batchArray(typedAsData, 1000)) {
				await session.run(
					`UNWIND $links AS link MATCH (el:SifXmlElement {path: link.elementPath}) MATCH (ct:SifComplexType {name: link.complexTypeName}) CREATE (el)-[:TYPED_AS]->(ct)`,
					{ links: batch }
				);
			}
		}

		// Indexes
		xLog.status('[sif/tsvParser] Creating indexes...');
		const indexStatements = [
			'CREATE INDEX sifobject_name IF NOT EXISTS FOR (s:SifObject) ON (s.name)',
			'CREATE INDEX sifobject_tablename IF NOT EXISTS FOR (s:SifObject) ON (s.tableName)',
			'CREATE INDEX siffield_xpath IF NOT EXISTS FOR (f:SifField) ON (f.xpath)',
			'CREATE INDEX siffield_name IF NOT EXISTS FOR (f:SifField) ON (f.name)',
			'CREATE INDEX siffield_cedsid IF NOT EXISTS FOR (f:SifField) ON (f.cedsId)',
			'CREATE INDEX sifxmlelement_path IF NOT EXISTS FOR (e:SifXmlElement) ON (e.path)',
			'CREATE INDEX sifcomplextype_name IF NOT EXISTS FOR (c:SifComplexType) ON (c.name)',
			'CREATE TEXT INDEX sifcodeset_fingerprint IF NOT EXISTS FOR (c:SifCodeset) ON (c.fingerprint)',
			'CREATE INDEX sifsimpletype_name IF NOT EXISTS FOR (t:SifSimpleType) ON (t.name)',
			'CREATE INDEX sifprimitivetype_name IF NOT EXISTS FOR (t:SifPrimitiveType) ON (t.name)',
			'CREATE INDEX sifmodel_label IF NOT EXISTS FOR (n:SifModel) ON (n.name)',
		];
		for (const stmt of indexStatements) { await session.run(stmt); }

		// BM25 full-text index for SIF
		xLog.status('[sif/tsvParser] Creating BM25 full-text index...');
		await session.run(`
			CREATE FULLTEXT INDEX dme_sif_fulltext IF NOT EXISTS
			FOR (n:SifObject|SifField|SifComplexType)
			ON EACH [n.name, n.description, n.tableName]
		`);
		await session.run('CALL db.awaitIndexes(300)');

		xLog.status('[sif/tsvParser] === SIF LOAD COMPLETE ===');
		return counts;

	} finally {
		await session.close();
		await driver.close();
	}
};

module.exports = { parseTsvFile, loadResolutionMap, resolveRefIdTargets, deduplicateEdges, loadGraphIntoNeo4j };
