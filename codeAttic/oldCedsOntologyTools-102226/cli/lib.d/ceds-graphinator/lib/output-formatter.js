#!/usr/bin/env node
'use strict';

// =============================================================================
// output-formatter.js — Unified output formatting for CEDS pipeline tools
//
// Every tool returns a result object { action, success, data, error }.
// This module wraps that object in the appropriate output format based on
// --json or --format flags.
// =============================================================================

/**
 * formatJson — Wrap result in JSON envelope with metadata.
 */
const formatJson = (result) => {
	const envelope = {
		action: result.action || 'unknown',
		success: result.success !== false,
		timestamp: new Date().toISOString(),
	};

	if (result.success === false) {
		envelope.error = result.error || 'Unknown error';
	} else {
		envelope.data = result.data;
	}

	return JSON.stringify(envelope, null, 2);
};

/**
 * formatTable — Simple aligned-column table output.
 * Expects result.data.rows (array of objects) and result.data.columns (array of strings).
 */
const formatTable = (result) => {
	const { rows, columns } = result.data || {};
	if (!rows || !columns || rows.length === 0) {
		return result.data?.message || '(no data)';
	}

	// Calculate column widths
	const widths = columns.map((col) =>
		Math.max(
			col.length,
			...rows.map((row) => String(row[col] || '').length),
		),
	);

	// Header
	const header = columns
		.map((col, i) => col.padEnd(widths[i]))
		.join('  ');
	const separator = widths.map((w) => '-'.repeat(w)).join('  ');

	// Rows
	const body = rows
		.map((row) =>
			columns
				.map((col, i) => String(row[col] || '').padEnd(widths[i]))
				.join('  '),
		)
		.join('\n');

	return `${header}\n${separator}\n${body}`;
};

/**
 * formatMarkdown — Markdown table output.
 */
const formatMarkdown = (result) => {
	const { rows, columns } = result.data || {};
	if (!rows || !columns || rows.length === 0) {
		return result.data?.message || '(no data)';
	}

	const header = `| ${columns.join(' | ')} |`;
	const separator = `| ${columns.map(() => '---').join(' | ')} |`;
	const body = rows
		.map((row) => `| ${columns.map((col) => String(row[col] || '')).join(' | ')} |`)
		.join('\n');

	return `${header}\n${separator}\n${body}`;
};

/**
 * formatOutput — Dispatch to the appropriate formatter.
 *
 * @param {object} result — { action, success, data, error, formatText }
 *   formatText is an optional function provided by the tool for custom text rendering
 * @param {string} format — 'json' | 'text' | 'table' | 'markdown'
 * @returns {string} — formatted output
 */
const formatOutput = (result, format) => {
	switch (format) {
		case 'json':
			return formatJson(result);
		case 'table':
			return formatTable(result);
		case 'markdown':
			return formatMarkdown(result);
		case 'text':
		default:
			// If tool provides its own text formatter, use it
			if (typeof result.formatText === 'function') {
				return result.formatText(result.data);
			}
			// Fallback: JSON pretty-print
			return formatJson(result);
	}
};

/**
 * resolveFormat — Determine output format from command line parameters.
 * Checks --format first, then --json flag, defaults to 'text'.
 */
const resolveFormat = (commandLineParameters) => {
	const formatValue =
		commandLineParameters.values &&
		commandLineParameters.values.format &&
		commandLineParameters.values.format[0];
	if (formatValue && ['json', 'text', 'table', 'markdown'].includes(formatValue)) {
		return formatValue;
	}
	if (commandLineParameters.switches && commandLineParameters.switches.json) {
		return 'json';
	}
	return 'text';
};

module.exports = {
	formatOutput,
	formatJson,
	formatTable,
	formatMarkdown,
	resolveFormat,
};
