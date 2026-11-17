'use strict';
// data-model-diagram.test.js — the Standards Explorer's data model map (BD 2026-11-17), the parts that need no graph: the renderer on
// CASE 1.1 as the graph held it (fixtures/dataModelDiagramFixture.js), and the standard-data-model mapper's shaping.
//   1. THE WHOLE STANDARD: its main classes chosen from the graph (supporting types, envelopes and reference types left out), drawn as
//      entity tables joined by labelled crow's-foot links, a class above the classes it holds, its words escaped
//   2. ONE CLASS: its properties listed (required first, the referring class named, the mapped ones marked), its neighbours on the
//      right (it refers to) and left (refer to it), the marked property highlighted, a crowded side cut with a note
//   3. THE MAPPER: every named query builds; a family and a release id read back to their family; counts arrive as numbers
// Run: node server/test/data-model-diagram.test.js

const { renderStandardDataModel, renderClassDataModel } = require('../data-model/lib/data-model-diagram/render-data-model-diagram');
const fixture = require('./fixtures/dataModelDiagramFixture');

let passedCount = 0;
let failedCount = 0;
const ok = (testName, condition, detailText) => {
	if (condition) { passedCount += 1; console.log(`  PASS: ${testName}`); return; }
	failedCount += 1;
	console.log(`  FAIL: ${testName}${detailText ? ` — ${String(detailText).slice(0, 500)}` : ''}`);
};

const countOf = (text, pattern) => (text.match(pattern) || []).length;

// ================================================================================
console.log('1. the whole standard (CASE 1.1): its main classes as entity tables');
{
	const diagram = renderStandardDataModel({ standard: fixture.standard, classList: fixture.classList, propertyList: fixture.propertyList });
	const entityNameList = diagram.summary.entityNameList;
	ok('answers an SVG with its size', diagram.svgText.startsWith('<svg') && diagram.width > 0 && diagram.height > 0);
	ok('the big picture starts at CFPackage', entityNameList[0] === 'CFPackage', entityNameList.join(', '));
	ok("it holds the package's document, definitions, rubrics, associations and items", ['CFPckgDocument', 'CFDefinition', 'CFRubric', 'CFPckgAssociation', 'CFPckgItem'].every((entityName) => entityNameList.includes(entityName)), entityNameList.join(', '));
	ok('and what the definitions and rubrics hold', ['CFItemType', 'CFConcept', 'CFAssociationGrouping', 'CFLicense', 'CFSubject', 'CFRubricCriterion', 'CFRubricCriterionLevel'].every((entityName) => entityNameList.includes(entityName)), entityNameList.join(', '));
	ok('supporting types are no entity: no extension point, no link type, no Set envelope, no status wrapper', !entityNameList.some((entityName) => /Extension|^Link|Set$|^imsx_/.test(entityName)), entityNameList.join(', '));
	ok('13 main classes of 39', entityNameList.length === 13 && /13 main classes of 39 classes/.test(diagram.summary.summaryText), diagram.summary.summaryText);
	ok('the IMS DType ending is dropped from a table name', diagram.svgText.includes('>CFPackage</text>') && !diagram.svgText.includes('>CFPackageDType</text>'));
	const tableTopOf = (entityName) => Number((diagram.svgText.match(new RegExp(`y="([0-9.]+)"[^>]*>${entityName}</text>`)) || [])[1]);
	ok('a class sits above the classes it holds', tableTopOf('CFPackage') < tableTopOf('CFDefinition') && tableTopOf('CFDefinition') < tableTopOf('CFConcept') && tableTopOf('CFRubricCriterion') < tableTopOf('CFRubricCriterionLevel'));
	ok('every link between two entities is labelled with its property', ['CFDocument', 'CFDefinitions', 'CFRubrics', 'CFAssociations', 'CFItems', 'CFConcepts', 'CFRubricCriteria', 'CFRubricCriterionLevels'].every((propertyName) => diagram.svgText.includes(`paint-order="stroke">${propertyName}</text>`)));
	ok("a list is drawn with a crow's foot (CFItems, CFRubrics and the definitions' five lists among them)", countOf(diagram.svgText, /<path d="M[0-9.]+ [0-9.]+ L[0-9.]+ [0-9.]+ L[0-9.]+ [0-9.]+ M/g) >= 9);
	ok('the identifier is marked PK, a link to an entity FK', /PK<\/text>/.test(diagram.svgText) && /FK<\/text>/.test(diagram.svgText));
	ok('a table shows at most 7 properties and counts the rest', /\+ 12 more properties/.test(diagram.svgText));
	ok('the SVG names itself for a screen reader', /<title id="dm-diagram-title">CASE 1\.1: data model<\/title>/.test(diagram.svgText));

	const hostileDiagram = renderStandardDataModel({ standard: { name: '<script>', version: '1' }, classList: [{ stableId: 'x', name: 'A & <b>' }], propertyList: [{ classStableId: 'x', name: '<i>', dataType: 'string', isRequired: true }] });
	ok('a name from the graph is escaped, never markup', !/<script>|<b>|<i>/.test(hostileDiagram.svgText) && /A &amp; &lt;b&gt;/.test(hostileDiagram.svgText));
	ok('a standard whose classes refer to nothing still shows its classes, and says so', /do not refer to one another/.test(hostileDiagram.svgText) && hostileDiagram.summary.entityCount === 1);

	// OneRoster's shape: entities joined only through reference types (OrgGUIDRef), and Set / Single envelopes
	const rosterProperty = (className, name, dataType, isRequired, referencedClassName) => ({ classStableId: `or:${className}`, name, dataType, isRequired, referencedClassStableId: referencedClassName ? `or:${referencedClassName}` : null, referencedClassName: referencedClassName || null, isMapped: false });
	const guidRefPropertyList = (className) => ['sourcedId', 'type', 'href'].map((name) => rosterProperty(className, name, 'string', true));
	const rosterPropertyList = [
		...guidRefPropertyList('OrgGUIDRef'), ...guidRefPropertyList('UserGUIDRef'), ...guidRefPropertyList('ClassGUIDRef'),
		rosterProperty('Org', 'sourcedId', 'string', true), rosterProperty('Org', 'name', 'string', true), rosterProperty('Org', 'parent', null, false, 'OrgGUIDRef'),
		rosterProperty('User', 'sourcedId', 'string', true), rosterProperty('User', 'primaryOrg', null, false, 'OrgGUIDRef'),
		rosterProperty('Class', 'sourcedId', 'string', true), rosterProperty('Class', 'school', null, true, 'OrgGUIDRef'), rosterProperty('Class', 'teacher', null, false, 'UserGUIDRef'),
		rosterProperty('Enrollment', 'sourcedId', 'string', true), rosterProperty('Enrollment', 'class', null, true, 'ClassGUIDRef'), rosterProperty('Enrollment', 'user', null, true, 'UserGUIDRef'),
		rosterProperty('UserSet', 'users', 'array', false, 'User'), rosterProperty('SingleUser', 'user', null, true, 'User'),
	];
	const rosterClassList = [...new Set(rosterPropertyList.map((oneProperty) => oneProperty.classStableId))].map((stableId) => ({ stableId, name: stableId.slice(3) }));
	const rosterDiagram = renderStandardDataModel({ standard: { name: 'OneRoster' }, classList: rosterClassList, propertyList: rosterPropertyList });
	ok('a reference type named for an entity is read as a link to it (Enrollment holds Class and User)', rosterDiagram.summary.entityNameList[0] === 'Enrollment' && ['Class', 'User', 'Org'].every((entityName) => rosterDiagram.summary.entityNameList.includes(entityName)), rosterDiagram.summary.entityNameList.join(', '));
	ok('and is no entity of its own, nor is an envelope', !rosterDiagram.summary.entityNameList.some((entityName) => /GUIDRef|Set$|^Single/.test(entityName)), rosterDiagram.summary.entityNameList.join(', '));
	ok('a link across or back up is dashed and never cuts sideways through a table (no side curves)', /stroke-dasharray="5 4"/.test(rosterDiagram.svgText) && !/ C[0-9]/.test(rosterDiagram.svgText.split('<!-- entities -->')[0]));
}

// ================================================================================
console.log('\n2. one class (CFDocumentDType)');
{
	const { focusClass, propertyList, neighbourList } = fixture.documentClass;
	const diagram = renderClassDataModel({ standard: fixture.standard, focusClass, propertyList, neighbourList, highlightPropertyName: 'licenseURI' });
	ok('answers an SVG', diagram.svgText.startsWith('<svg'));
	ok('every property is listed', propertyList.every((oneProperty) => diagram.svgText.includes(`>${oneProperty.name}${oneProperty.isRequired ? ' *' : ''}</text>`)));
	const rowIndexOf = (propertyText) => diagram.svgText.indexOf(`>${propertyText}</text>`);
	ok('required properties come first (creator * before adoptionStatus)', rowIndexOf('creator *') < rowIndexOf('adoptionStatus'));
	ok('a property that refers names its class', diagram.svgText.includes('→ LinkURIDType') && diagram.svgText.includes('→ CFDocumentExtensionDType'));
	ok('mapped properties are marked (9 filled dots)', countOf(diagram.svgText, /<circle [^>]*fill="#0F6E56"/g) === 9, countOf(diagram.svgText, /<circle [^>]*fill="#0F6E56"/g));
	ok('the marked property is highlighted', countOf(diagram.svgText, /fill="#FAEEDA"/g) === 1);
	ok('the classes it refers to are on the right, the one referring to it on the left', /It refers to/.test(diagram.svgText) && /via licenseURI, subjectURI, CFPackageURI/.test(diagram.svgText) && /refers to it via CFDocuments/.test(diagram.svgText));
	ok('the summary says what the class is', /21 properties \(9 mapped to a hub\) · refers to 2 classes · referred to by 1 class/.test(diagram.summary.summaryText), diagram.summary.summaryText);
	const crowdedNeighbourList = Array.from({ length: 30 }, (unused, neighbourIndex) => ({ stableId: `n${neighbourIndex}`, name: `Neighbour${neighbourIndex}`, source: 'CASE', direction: 'refersTo', propertyNameList: [`p${neighbourIndex}`], isOtherStandard: false }));
	const crowdedDiagram = renderClassDataModel({ standard: fixture.standard, focusClass, propertyList, neighbourList: crowdedNeighbourList });
	ok('a crowded side draws its first 14 and says how many more there are', /and 16 more classes not drawn/.test(crowdedDiagram.svgText) && crowdedDiagram.summary.shownNeighbourCount === 14);
	const otherDiagram = renderClassDataModel({ standard: fixture.standard, focusClass, propertyList: [], neighbourList: [{ stableId: 'o', name: 'Elsewhere', source: 'OtherStandard', direction: 'referredBy', propertyNameList: ['link'], isOtherStandard: true }] });
	ok('a neighbour in another standard is dashed and names its standard', /stroke-dasharray="4 3"/.test(otherDiagram.svgText) && /OtherStandard · refers to it via link/.test(otherDiagram.svgText));
	ok('a class with no properties says so', /The graph holds no properties for this class\./.test(otherDiagram.svgText));
}

// ================================================================================
console.log('\n3. the mapper');
{
	const mapper = require('../data-model/data-mapping/mappers/standard-data-model')({ baseMappingProcess: null });
	const queryNameList = ['focusNode', 'standardListOfFamily', 'standardOfSource', 'standardClassList', 'standardLinkCount', 'standardPropertyList', 'classOfStableId', 'classPropertyList', 'classNeighbourList'];
	const builtList = queryNameList.map((queryName) => mapper.getCypher(queryName, { focusStableId: 'x', standardFamily: 'CASE', source: 'CASE', classStableId: 'case:CFDocumentDType' }));
	ok('every named query builds, parameterised (no value written into the Cypher)', builtList.every((oneBundle) => typeof oneBundle.cypher === 'string' && !/CASE'|case:CFDocumentDType/.test(oneBundle.cypher)));
	let refusalText = '';
	try { mapper.getCypher('noSuchQuery'); } catch (queryError) { refusalText = queryError.message; }
	ok('an unknown query is refused by name', /no query named 'noSuchQuery'/.test(refusalText));
	ok('a family id reads back to its family', JSON.stringify(mapper.familyOfSyntheticId('family:CASE')) === JSON.stringify({ standardFamily: 'CASE', releaseLabel: null }));
	ok('a release id reads back to its family and release', JSON.stringify(mapper.familyOfSyntheticId('release:PESC-CollegeTranscript/1.8.0')) === JSON.stringify({ standardFamily: 'PESC-CollegeTranscript', releaseLabel: '1.8.0' }));
	ok('any other id is no family', mapper.familyOfSyntheticId('case:root') === null);
	ok('a Neo4j Integer arrives as a number', mapper.mapClassRecordList([{ propertyCount: { toNumber: () => 7 }, mappedPropertyCount: 3 }])[0].propertyCount === 7);
	ok('a neighbour in another standard is marked so', mapper.mapNeighbourRecordList([{ source: 'A' }, { source: 'B' }], 'A').map((oneNeighbour) => oneNeighbour.isOtherStandard).join() === 'false,true');
}

console.log(`\ndata-model-diagram: ${passedCount} passed, ${failedCount} failed`);
process.exitCode = failedCount ? 1 : 0;
