#!/usr/bin/env node
'use strict';

// =============================================================================
// common-queries.js — Shared Cypher fragments for CEDS pipeline tools
//
// Used across multiple tool groups (classifier, namer, surfacer, materializer).
// Each fragment is either a string (Cypher snippet) or a function returning one.
// =============================================================================

/**
 * resolveClass — Match a class by name pattern (case-insensitive).
 * Returns a Cypher fragment that binds variable `c`.
 * @param {string} classNameParam — the Neo4j parameter name holding the regex
 */
const resolveClass = (classNameParam) => `
  MATCH (c:Class)
  WHERE NOT c:ConceptScheme
  AND (any(lbl IN COALESCE(c.label, []) WHERE lbl =~ $${classNameParam})
       OR c.notation =~ $${classNameParam})
  WITH c LIMIT 1
`;

/**
 * buildPattern — Build a case-insensitive regex from a search term.
 * Escapes special regex chars for safe use in Neo4j =~ operator.
 */
const buildPattern = (searchTerm) =>
	`(?i).*${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.*`;

/**
 * classProperties — Get all properties for a resolved class `c`.
 * Expects `c` to be already bound in the query.
 */
const classProperties = `
  MATCH (p:Property)-[:domainIncludes]->(c)
  OPTIONAL MATCH (p)-[:rangeIncludes]->(range)
  RETURN p.label AS propLabel, p.notation AS propNotation,
         p.uri AS propUri, p.description AS propDesc,
         range.label AS rangeLabel, range.uri AS rangeUri,
         range:ConceptScheme AS isOptionSet,
         range:Class AS isClassRef,
         p.textFormat AS textFormat
  ORDER BY p.label
`;

/**
 * isHub — Cypher CASE expression that checks whether class `c` is a known hub.
 * Returns a boolean field `isHub`.
 */
const isHub = `
  CASE
    WHEN any(lbl IN COALESCE(c.label, []) WHERE lbl IN ['Person', 'Membership', 'Organization']) THEN true
    ELSE false
  END AS isHub
`;

/** Hub class labels for reference */
const hubLabels = ['Person', 'Membership', 'Organization'];

/**
 * optionSetValues — Get all values for an option set by URI.
 * Expects parameter $optionSetUri to be bound.
 */
const optionSetValues = `
  MATCH (v:NamedIndividual)-[:inScheme]->(os:ConceptScheme)
  WHERE os.uri = $optionSetUri
  RETURN v.label AS label, v.notation AS notation,
         COALESCE(v.description, v.definition, '') AS description
  ORDER BY v.label
`;

module.exports = {
	resolveClass,
	buildPattern,
	classProperties,
	isHub,
	hubLabels,
	optionSetValues,
};
