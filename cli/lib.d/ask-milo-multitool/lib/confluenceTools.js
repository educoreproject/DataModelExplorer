'use strict';

// confluenceTools.js - Anthropic tool definitions for Confluence integration
// Exports tool definition arrays for the direct API driver path.
// CJS module.

// For direct driver: raw Anthropic tool definitions
const getToolDefinitions = () => [
	{
		name: 'confluence_search',
		description: 'Search Confluence documentation. Returns page titles, IDs, and excerpts. Use this to find relevant pages before reading their full content.',
		input_schema: {
			type: 'object',
			properties: {
				query: { type: 'string', description: 'Search text. Automatically wrapped in CQL for the configured space.' },
				cql: { type: 'string', description: 'Raw CQL for advanced searches. Overrides query if provided.' },
				limit: { type: 'integer', description: 'Max results (default 10, max 25)', default: 10 },
			},
			required: ['query'],
		},
	},
	{
		name: 'confluence_read_page',
		description: 'Read the full content of a Confluence page by ID. Returns title and body as clean markdown. Use page IDs from search results.',
		input_schema: {
			type: 'object',
			properties: {
				page_id: { type: 'string', description: 'Confluence page ID from search results' },
			},
			required: ['page_id'],
		},
	},
];

// Tool name list for filtering
const getToolNames = () => ['confluence_search', 'confluence_read_page'];

module.exports = { getToolDefinitions, getToolNames };
