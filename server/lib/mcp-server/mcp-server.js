#!/usr/bin/env node
'use strict';
// @concept: [[ModelContextProtocol]]
// @concept: [[StreamableHTTP]]
// @concept: [[DualInterfaceArchitecture]]

// ============================================================================
// mcp-server.js — MCP Server for AI agent access to the EDUcore knowledge graph
//
// Exposes getSchema and cypherQuery tools via Streamable HTTP transport.
// Both tools delegate to the shared dme-cypher-query access point.
// Mounted on the existing Express app alongside REST endpoints and WebSocket.
// ============================================================================

const { randomUUID } = require('node:crypto');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { isInitializeRequest } = require('@modelcontextprotocol/sdk/types.js');
const z = require('zod');

const moduleFunction = ({ expressApp, accessPointsDotD }) => {
	const { xLog, getConfig } = process.global;

	const mcpConfig = getConfig('mcp-server') || {};

	if (!mcpConfig.enabled || mcpConfig.enabled === 'false') {
		xLog.status('MCP server: disabled by configuration');
		return;
	}

	const mcpPath = mcpConfig.mcpPath || '/mcp';

	// ================================================================================
	// MCP SERVER FACTORY
	//
	// Creates a new McpServer instance with tool registrations.
	// Called once per session (each connecting client gets its own server instance).

	const createMcpServer = () => {
		const server = new McpServer(
			{
				name: 'educore-standards',
				version: '1.0.0',
			},
			{
				capabilities: {},
				instructions: [
					'You are connected to the EDUcore Education Standards Knowledge Graph.',
					'This graph contains structured representations of CEDS v14 and SIF',
					'education data standards with cross-standard mappings.',
					'',
					'Use getSchema to see the full graph structure, node labels,',
					'relationships, and example queries.',
					'',
					'Use cypherQuery to execute read-only Cypher queries against the graph.',
					'Always use parameterized queries ($param syntax) when filtering by',
					'user-provided values.',
				].join('\n'),
			},
		);

		// --- Tool: getSchema ---
		server.registerTool(
			'getSchema',
			{
				description:
					'Returns the knowledge graph schema: node labels, relationships, properties, and example Cypher queries.',
				inputSchema: {},
			},
			async () => {
				const result = await new Promise((resolve, reject) => {
					accessPointsDotD['dme-cypher-query'](
						{ action: 'schema' },
						(err, result) => {
							if (err) {
								reject(err);
								return;
							}
							resolve(result);
						},
					);
				});

				const schemaText =
					result && result[0] && result[0].schema
						? result[0].schema
						: JSON.stringify(result, null, 2);

				return {
					content: [{ type: 'text', text: schemaText }],
				};
			},
		);

		// --- Tool: cypherQuery ---
		server.registerTool(
			'cypherQuery',
			{
				description:
					'Execute a read-only Cypher query against the education standards knowledge graph. Returns results as JSON.',
				inputSchema: {
					query: z.string().describe('A Cypher query string'),
					params: z
						.record(z.string(), z.any())
						.optional()
						.describe(
							'Named parameters for the query (e.g., { nodeId: "001234" })',
						),
				},
			},
			async ({ query, params }) => {
				const queryData = {
					action: 'query',
					query,
					params: params || {},
				};

				const result = await new Promise((resolve, reject) => {
					accessPointsDotD['dme-cypher-query'](
						queryData,
						(err, result) => {
							if (err) {
								reject(err);
								return;
							}
							resolve(result);
						},
					);
				}).catch((err) => {
					return { _error: err.toString ? err.toString() : String(err) };
				});

				if (result && result._error) {
					return {
						content: [{ type: 'text', text: result._error }],
						isError: true,
					};
				}

				return {
					content: [
						{ type: 'text', text: JSON.stringify(result, null, 2) },
					],
				};
			},
		);

		return server;
	};

	// ================================================================================
	// TRANSPORT SESSION MANAGEMENT

	const transports = {};

	// --- POST handler ---
	const mcpPostHandler = async (req, res) => {
		const sessionId = req.headers['mcp-session-id'];

		let transport;

		if (sessionId && transports[sessionId]) {
			transport = transports[sessionId];
		} else if (!sessionId && isInitializeRequest(req.body)) {
			transport = new StreamableHTTPServerTransport({
				sessionIdGenerator: () => randomUUID(),
				onsessioninitialized: (sid) => {
					transports[sid] = transport;
				},
			});

			transport.onclose = () => {
				const sid = transport.sessionId;
				if (sid && transports[sid]) {
					delete transports[sid];
				}
			};

			const server = createMcpServer();
			await server.connect(transport);
			await transport.handleRequest(req, res, req.body);
			return;
		} else {
			res.status(400).json({
				jsonrpc: '2.0',
				error: {
					code: -32000,
					message: 'Bad Request: No valid session ID provided',
				},
				id: null,
			});
			return;
		}

		await transport.handleRequest(req, res, req.body);
	};

	// --- GET handler (SSE streams) ---
	const mcpGetHandler = async (req, res) => {
		const sessionId = req.headers['mcp-session-id'];
		if (!sessionId || !transports[sessionId]) {
			res.status(400).send('Invalid or missing session ID');
			return;
		}
		await transports[sessionId].handleRequest(req, res);
	};

	// --- DELETE handler (session termination) ---
	const mcpDeleteHandler = async (req, res) => {
		const sessionId = req.headers['mcp-session-id'];
		if (!sessionId || !transports[sessionId]) {
			res.status(400).send('Invalid or missing session ID');
			return;
		}
		await transports[sessionId].handleRequest(req, res);
	};

	// ================================================================================
	// MOUNT ON EXPRESS

	expressApp.post(mcpPath, mcpPostHandler);
	expressApp.get(mcpPath, mcpGetHandler);
	expressApp.delete(mcpPath, mcpDeleteHandler);

	xLog.status(`MCP server: mounted at ${mcpPath} (Streamable HTTP)`);
};

module.exports = moduleFunction;
