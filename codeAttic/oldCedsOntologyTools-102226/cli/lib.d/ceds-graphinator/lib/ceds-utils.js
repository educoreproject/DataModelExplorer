#!/usr/bin/env node
'use strict';

// =============================================================================
// ceds-utils.js — Shared utilities for CEDS ontology tools
// =============================================================================

/**
 * formatLabel — handles array-valued labels from CEDS ontology.
 * Many CEDS nodes store labels as arrays; this extracts the first element.
 */
const formatLabel = (label) => {
	if (Array.isArray(label)) return label[0] || '';
	return label || '';
};

/**
 * regexEscape — escape special chars for Neo4j regex patterns.
 */
const regexEscape = (str) => {
	return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

module.exports = { formatLabel, regexEscape };
