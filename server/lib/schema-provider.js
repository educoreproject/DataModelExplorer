#!/usr/bin/env node
'use strict';

// ============================================================================
// schema-provider.js — DME knowledge graph schema description
//
// Returns a structured text description of the education standards knowledge
// graph schema, including node labels, relationships, properties, and
// example Cypher queries. Derived from the dme-lookup mapper.
//
// Usage:
//   const getSchemaDescription = require('./lib/schema-provider');
//   const schemaText = getSchemaDescription();
// ============================================================================

const getSchemaDescription = () => {
	return `# EDUcore Education Standards Knowledge Graph Schema

## Standards Available

- **CEDS v14** — Common Education Data Standards (version 14)
- **SIF** — Schools Interoperability Framework

## Node Labels

### SIF (Schools Interoperability Framework)

- **SifObject** — Top-level SIF data objects (e.g., StudentPersonal, SchoolInfo). Key properties: \`name\`, \`fieldCount\`.
- **SifXmlElement** — XML elements within SIF objects, forming a hierarchy. Key properties: \`name\`, \`path\`, \`depth\`, \`isLeaf\`.
- **SifField** — Concrete data fields within SIF elements (leaf-level data). Key properties: \`name\`, \`description\`, \`xpath\`, \`mandatory\`, \`cedsId\`, \`depth\`.
- **SifCodeset** — Enumerated value constraints on SIF fields. Key properties: \`values\`, \`valueCount\`.

### CEDS (Common Education Data Standards)

- **CedsClass** — CEDS data categories (e.g., Assessment, Enrollment). Key properties: \`cedsId\`, \`label\`, \`description\`.
- **CedsProperty** — Properties within CEDS classes (e.g., AssessmentTitle). Key properties: \`cedsId\`, \`label\`, \`description\`, \`notation\`.
- **CedsOptionSet** — Option set containers for CEDS properties. Key properties: \`cedsId\`, \`label\`.
- **CedsOptionValue** — Individual option values within option sets. Key properties: \`cedsId\`, \`label\`, \`description\`.

## Relationship Types

| Relationship | Source | Target | Description |
|---|---|---|---|
| HAS_ROOT_ELEMENT | SifObject | SifXmlElement | Object contains root XML elements |
| CHILD_ELEMENT | SifXmlElement | SifXmlElement | Parent-child element hierarchy |
| REALIZED_BY | SifXmlElement | SifField | Element maps to a concrete data field |
| HAS_TYPE | SifField | (type node) | Field has a data type |
| CONSTRAINED_BY | SifField | SifCodeset | Field is constrained by a codeset |
| MAPS_TO | SifField | CedsProperty | Cross-standard mapping (SIF to CEDS) |
| HAS_PROPERTY | CedsClass | CedsProperty | Class contains a property |
| HAS_OPTION_SET | CedsProperty | CedsOptionSet | Property has an option set |
| HAS_VALUE | CedsOptionSet | CedsOptionValue | Option set contains values |

## Example Cypher Queries

### List all CEDS classes
\`\`\`cypher
MATCH (c:CedsClass) RETURN c.label AS name, c.cedsId AS id ORDER BY c.label
\`\`\`

### List all SIF objects
\`\`\`cypher
MATCH (o:SifObject) RETURN o.name AS name ORDER BY o.name
\`\`\`

### Get properties of a CEDS class
\`\`\`cypher
MATCH (c:CedsClass {label: "Assessment"})-[:HAS_PROPERTY]->(p:CedsProperty)
RETURN p.label AS property, p.cedsId AS id, p.description AS description
ORDER BY p.label
\`\`\`

### Find cross-standard mappings (SIF fields mapped to CEDS properties)
\`\`\`cypher
MATCH (f:SifField)-[:MAPS_TO]->(p:CedsProperty)<-[:HAS_PROPERTY]-(c:CedsClass)
RETURN f.name AS sifField, p.label AS cedsProperty, c.label AS cedsClass
ORDER BY c.label, p.label LIMIT 20
\`\`\`

### Get the XML element hierarchy of a SIF object
\`\`\`cypher
MATCH (o:SifObject {name: "StudentPersonal"})-[:HAS_ROOT_ELEMENT]->(re:SifXmlElement)
OPTIONAL MATCH (re)-[:CHILD_ELEMENT*]->(child:SifXmlElement)
RETURN re.name AS rootElement, collect(child.name) AS children
\`\`\`

### Find option values for a CEDS property
\`\`\`cypher
MATCH (p:CedsProperty {label: "Sex"})-[:HAS_OPTION_SET]->(os:CedsOptionSet)-[:HAS_VALUE]->(ov:CedsOptionValue)
RETURN ov.label AS optionValue, ov.description AS description
ORDER BY ov.label
\`\`\`

### Search for a CEDS property by name
\`\`\`cypher
MATCH (p:CedsProperty)
WHERE toLower(p.label) CONTAINS toLower("assessment")
RETURN p.label AS name, p.cedsId AS id, p.description AS description
ORDER BY p.label LIMIT 10
\`\`\`

### Get SIF field details with cross-standard mappings
\`\`\`cypher
MATCH (el:SifXmlElement)-[:REALIZED_BY]->(f:SifField)
OPTIONAL MATCH (f)-[:MAPS_TO]->(cp:CedsProperty)<-[:HAS_PROPERTY]-(cc:CedsClass)
WHERE f.name = "LastName"
RETURN f.name AS field, f.description AS description,
  collect(DISTINCT {cedsProperty: cp.label, cedsClass: cc.label}) AS mappings
\`\`\`
`;
};

module.exports = getSchemaDescription;
