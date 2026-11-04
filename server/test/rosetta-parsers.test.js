'use strict';
// rosetta-parsers.test.js — the three submission forms, pure and with no graph (design 4.3, 4.8; gates G3.3 and G3.4). A remote $ref or @context is listed and never fetched: this file fails every DNS lookup and socket while the parsers run, and says if anything tried one.

const dns = require('dns');
const net = require('net');
const { parseFieldList } = require('../lib/standards-query/rosetta/parsers/fieldListParser');
const { parseJsonSchema } = require('../lib/standards-query/rosetta/parsers/jsonSchemaParser');
const { parseJsonLdContext } = require('../lib/standards-query/rosetta/parsers/jsonLdContextParser');

let passedCount = 0;
let failedCount = 0;
const ok = (testName, condition, detailText) => {
	if (condition) { passedCount += 1; console.log(`  PASS: ${testName}`); return; }
	failedCount += 1;
	console.log(`  FAIL: ${testName}${detailText ? ` — ${detailText}` : ''}`);
};

const networkAttemptList = [];
dns.lookup = (hostName, ...restArgument) => { networkAttemptList.push(`dns ${hostName}`); restArgument[restArgument.length - 1](new Error('this test fails every lookup')); };
const realConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function failingConnect(...connectArgument) { networkAttemptList.push(`socket ${JSON.stringify(connectArgument[0])}`); return realConnect.apply(this, connectArgument); };

const LIMITS = { maxFieldListLength: 200, maxFieldNameChars: 200, maxFieldDefinitionChars: 2000, maxFieldPathChars: 500, maxDocumentDepth: 32, maxRefExpansions: 1000 };
const fieldNamesOf = (parsed) => parsed.fieldList.map((oneField) => oneField.name);

const CLASSROOM_FIELD_LIST = [{ name: 'id', definition: 'Identifier assigned by Classroom.', type: 'string' }, { name: 'name', definition: 'Name of the course.', type: 'string' }, { name: 'section', definition: 'Section of the course.', type: 'string' }, { name: 'room', type: 'string' }];

// ---- the same fields in all three forms (G3.3)
const asList = parseFieldList({ submittedDocument: CLASSROOM_FIELD_LIST, parserLimitValues: LIMITS });
const asSchema = parseJsonSchema({ submittedDocument: { type: 'object', properties: CLASSROOM_FIELD_LIST.reduce((soFar, { name, definition, type }) => ({ ...soFar, [name]: { type, ...(definition ? { description: definition } : {}) } }), {}) }, parserLimitValues: LIMITS });
const asContext = parseJsonLdContext({ submittedDocument: { '@context': { '@vocab': 'https://example.org/', ...CLASSROOM_FIELD_LIST.reduce((soFar, { name, definition }) => ({ ...soFar, [name]: { '@id': `https://example.org/${name}`, ...(definition ? { 'rdfs:comment': definition } : {}) } }), {}) } }, parserLimitValues: LIMITS });
ok('formats: all three yield the same names', JSON.stringify(fieldNamesOf(asList)) === JSON.stringify(fieldNamesOf(asSchema)) && JSON.stringify(fieldNamesOf(asList)) === JSON.stringify(fieldNamesOf(asContext)));
const textOf = (parsed) => JSON.stringify(parsed.fieldList.map(({ name, definition, definitionAbsent }) => ({ name, definition, definitionAbsent })));
ok('formats: all three yield the same definitions, and say which is absent', textOf(asList) === textOf(asSchema) && textOf(asList) === textOf(asContext) && asList.fieldList[3].definitionAbsent === true);
ok('schema: path is the pointer, type is kept', asSchema.fieldList[1].path === '/name' && asSchema.fieldList[1].type === 'string');
ok('context: path is the mapped IRI, recorded', asContext.fieldList[0].path === 'https://example.org/id');

// ---- JSON Schema walking
const nestedSchema = {
	$defs: { address: { type: 'object', description: 'An address.', properties: { city: { type: 'string', title: 'City' } } }, kind: { type: 'string', enum: ['a', 'b'], description: 'Which kind.' } },
	properties: {
		home: { $ref: '#/$defs/address' },
		kind: { $ref: '#/$defs/kind' },
		tagList: { type: 'array', items: { type: 'object', properties: { tag: { type: 'string' } } } },
		remote: { $ref: 'https://example.org/remote.json#/thing', description: 'Told beside the reference.' },
		ghost: { $ref: '#/$defs/absent' },
		either: { anyOf: [{ type: 'string' }] },
		'a/b': { type: 'string' },
	},
	allOf: [{ properties: { fromAllOf: { type: 'string' } }, allOf: [{ properties: { tooDeep: { type: 'string' } } }] }],
};
const nested = parseJsonSchema({ submittedDocument: nestedSchema, parserLimitValues: LIMITS });
ok('schema: walks $ref, nested objects, items and one level of allOf', ['home', 'city', 'kind', 'tagList', 'tag', 'remote', 'ghost', 'either', 'a/b', 'fromAllOf'].every((fieldName) => fieldNamesOf(nested).includes(fieldName)) && !fieldNamesOf(nested).includes('tooDeep'), fieldNamesOf(nested).join());
ok('schema: a $ref target describes its property', nested.fieldList.find((oneField) => oneField.name === 'home').definition === 'An address.');
ok('schema: an escaped pointer', nested.fieldList.find((oneField) => oneField.name === 'a/b').path === '/a~1b');
ok('schema: a field of enumerated values says the value tier is not offered', nested.fieldList.find((oneField) => oneField.name === 'kind').valueTierNotOffered === true);
ok('schema: a remote $ref is listed, its property still a field', nested.unresolvedRefList.some((oneRef) => oneRef.ref === 'https://example.org/remote.json#/thing' && oneRef.path === '/remote') && nested.fieldList.find((oneField) => oneField.name === 'remote').definition === 'Told beside the reference.');
ok('schema: a local $ref naming nothing is listed, not dropped', nested.unresolvedRefList.some((oneRef) => oneRef.ref === '#/$defs/absent'));
ok('schema: what is not walked is named', nested.notWalkedList.some((oneItem) => oneItem.path === '/either' && /anyOf/.test(oneItem.reason)) && nested.notWalkedList.some((oneItem) => /allOf past/.test(oneItem.reason)));

// ---- JSON-LD
const mixedContext = parseJsonLdContext({ submittedDocument: { '@context': ['https://schema.org/docs/jsonldcontext.json', { schema: 'https://schema.org/', name: 'schema:name', scoped: { '@id': 'schema:scoped', '@context': { inner: 'schema:inner' } } }, 7] }, parserLimitValues: LIMITS });
ok('context: a remote @context is listed and its terms are not fields', mixedContext.unresolvedContextList[0].context === 'https://schema.org/docs/jsonldcontext.json' && JSON.stringify(fieldNamesOf(mixedContext)) === '["name","scoped"]');
ok('context: a prefix and a scoped context are named as not walked', mixedContext.notWalkedList.some((oneItem) => oneItem.path === 'schema') && mixedContext.notWalkedList.some((oneItem) => oneItem.path === 'scoped') && mixedContext.notWalkedList.some((oneItem) => /not an object/.test(oneItem.reason)));
ok('context: a document with no @context is refused by name', parseJsonLdContext({ submittedDocument: { name: 'x' }, parserLimitValues: LIMITS }).refusal.refusalName === 'noFieldsFound');
ok('context: only a remote @context: no field, refused with the list', parseJsonLdContext({ submittedDocument: { '@context': 'https://schema.org/' }, parserLimitValues: LIMITS }).refusal.unresolvedContextList.length === 1);

// ---- caps (G3.4), each counted DURING the walk
const fieldEntryListOf = (entryCount) => Array.from({ length: entryCount }, (unused, entryIndex) => ({ name: `field${entryIndex}` }));
ok('cap: 200 fields pass', parseFieldList({ submittedDocument: fieldEntryListOf(200), parserLimitValues: LIMITS }).fieldList.length === 200);
ok('cap: 201 fields are refused maxFieldListLength', parseFieldList({ submittedDocument: fieldEntryListOf(201), parserLimitValues: LIMITS }).refusal.refusalName === 'maxFieldListLength');
ok('cap: 201 properties are refused maxFieldListLength', parseJsonSchema({ submittedDocument: { properties: Object.fromEntries(fieldEntryListOf(201).map(({ name }) => [name, { type: 'string' }])) }, parserLimitValues: LIMITS }).refusal.refusalName === 'maxFieldListLength');
ok('cap: 201 terms are refused maxFieldListLength', parseJsonLdContext({ submittedDocument: { '@context': Object.fromEntries(fieldEntryListOf(201).map(({ name }) => [name, `https://example.org/${name}`])) }, parserLimitValues: LIMITS }).refusal.refusalName === 'maxFieldListLength');
const nestedTo = (depthWanted) => { let oneLevel = { type: 'string' }; for (let levelIndex = 0; levelIndex < depthWanted; levelIndex += 1) { oneLevel = { [`l${levelIndex}`]: oneLevel }; } return oneLevel; };
ok('cap: depth 32 passes', !parseJsonSchema({ submittedDocument: { ...nestedTo(31), properties: { one: { type: 'string' } } }, parserLimitValues: LIMITS }).refusal);
ok('cap: depth 33 is refused depthExceeded', parseJsonSchema({ submittedDocument: nestedTo(33), parserLimitValues: LIMITS }).refusal.refusalName === 'depthExceeded');
ok('cap: depth 33 in a context is refused depthExceeded', parseJsonLdContext({ submittedDocument: { '@context': nestedTo(33) }, parserLimitValues: LIMITS }).refusal.refusalName === 'depthExceeded');
ok('cap: depth 33 in a field list is refused depthExceeded', parseFieldList({ submittedDocument: [nestedTo(33)], parserLimitValues: LIMITS }).refusal.refusalName === 'depthExceeded');
ok('cap: a deep document does not overflow the stack', parseJsonSchema({ submittedDocument: nestedTo(50000), parserLimitValues: LIMITS }).refusal.refusalName === 'depthExceeded');
ok('cap: a $ref cycle is refused by name', parseJsonSchema({ submittedDocument: { $defs: { loop: { properties: { again: { $ref: '#/$defs/loop' } } } }, properties: { start: { $ref: '#/$defs/loop' } } }, parserLimitValues: LIMITS }).refusal.refusalName === 'refCycle');
const fanOutSchema = { $defs: { leaf: { type: 'string' } }, properties: Object.fromEntries(Array.from({ length: 150 }, (unused, propertyIndex) => [`p${propertyIndex}`, { $ref: '#/$defs/leaf' }])) };
ok('cap: expansions over the cap are refused by name', parseJsonSchema({ submittedDocument: fanOutSchema, parserLimitValues: { ...LIMITS, maxRefExpansions: 100 } }).refusal.refusalName === 'refExpansionsExceeded');
ok('hostile: a malformed percent escape in a $ref is listed, and throws nothing', parseJsonSchema({ submittedDocument: { properties: { odd: { $ref: '#/$defs/%E0%A4%A' } } }, parserLimitValues: LIMITS }).unresolvedRefList[0].ref === '#/$defs/%E0%A4%A');
ok('hostile: a $ref into the prototype finds nothing', parseJsonSchema({ submittedDocument: { properties: { odd: { $ref: '#/__proto__' } } }, parserLimitValues: LIMITS }).unresolvedRefList.length === 1);
ok('hostile: a type that is no text is no type', parseJsonSchema({ submittedDocument: { properties: { odd: { type: { nested: 'x' } } } }, parserLimitValues: LIMITS }).fieldList[0].type === undefined);
ok('cap: a name over its cap is refused, not cut', parseFieldList({ submittedDocument: [{ name: 'n'.repeat(201) }], parserLimitValues: LIMITS }).refusal.refusalName === 'fieldTextTooLong');
ok('cap: a definition over its cap is refused, not cut', parseFieldList({ submittedDocument: [{ name: 'n', definition: 'd'.repeat(2001) }], parserLimitValues: LIMITS }).refusal.refusalName === 'fieldTextTooLong');

// ---- entries
ok('entry: no name is refused', parseFieldList({ submittedDocument: [{ definition: 'x' }], parserLimitValues: LIMITS }).refusal.refusalName === 'invalidFieldEntry');
ok('entry: a blank name is refused', parseFieldList({ submittedDocument: [{ name: '  ' }], parserLimitValues: LIMITS }).refusal.refusalName === 'invalidFieldEntry');
ok('entry: a misspelt property is refused, not read as no definition', parseFieldList({ submittedDocument: [{ name: 'n', defintion: 'x' }], parserLimitValues: LIMITS }).refusal.refusalName === 'invalidFieldEntry');
ok('entry: a definition that is not text is refused', parseFieldList({ submittedDocument: [{ name: 'n', definition: 7 }], parserLimitValues: LIMITS }).refusal.refusalName === 'invalidFieldEntry');
ok('entry: an empty list is refused', parseFieldList({ submittedDocument: [], parserLimitValues: LIMITS }).refusal.refusalName === 'noFieldsFound');
ok('schema: no properties is refused', parseJsonSchema({ submittedDocument: { type: 'string' }, parserLimitValues: LIMITS }).refusal.refusalName === 'noFieldsFound');
ok('entry: a property named __proto__ is a field, not a prototype', fieldNamesOf(parseJsonSchema({ submittedDocument: JSON.parse('{"properties":{"__proto__":{"type":"string"}}}'), parserLimitValues: LIMITS })).includes('__proto__') && {}.type === undefined);

ok('nothing above tried a lookup or a socket', networkAttemptList.length === 0, networkAttemptList.join());

console.log(`\nrosetta-parsers: ${passedCount} passed, ${failedCount} failed`);
process.exit(failedCount === 0 ? 0 : 1);
