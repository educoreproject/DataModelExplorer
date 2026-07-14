#!/usr/bin/env node
'use strict';
// @concept: [[ModelContextProtocol]]
// @concept: [[StreamableHTTP]]
// @concept: [[DualInterfaceArchitecture]]
// @concept: [[SecurityFirstPattern]]

// ============================================================================
// mcp-server.js — MCP Server for AI agent access to the EDUcore knowledge graph
//
// Exposes getSchema and cypherQuery tools via Streamable HTTP transport.
// Both tools delegate to the shared dme-cypher-query access point.
// Mounted on the existing Express app alongside REST endpoints and WebSocket.
//
// ACCESS (dmeMcpOAuth Phase 3.1): the mount is guarded by a COMPOSED gate —
// a request is allowed if EITHER of two independent paths admits it:
//   1. the SEC-2 loopback-secret path (x-dme-internal-secret + loopback origin
//      + no forwarding header) — local .mcp.json clients, unchanged; or
//   2. a valid OAuth bearer token (oauth-bearer-gate.js): the audience-bound
//      RS256 verifier PLUS per-request revocation checks (user.disabled,
//      iat >= max(user, grant).accessRevokedAfter, AccessToken/Grant rows
//      still present in the store).
// A request failing both paths gets 401 with
// WWW-Authenticate: Bearer resource_metadata="…/.well-known/oauth-protected-resource".
//
// IDENTITY THREADING (Phase 3.2): the admitting path attaches xReq.mcpAuth;
// each MCP session keeps a live auth-context holder (updated on every gated
// request), and every tool invocation writes an `mcp_tool_call` audit event
// (user, client, tool — never query payloads or secrets).
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

	// oauth-server.js mounts AFTER this module and stashes its exports on the
	// app; read LAZILY per request so mount order never matters.
	const getOauthContext = () => expressApp.get && expressApp.get('oauthServer');

	// ================================================================================
	// TOOL-CALL AUDIT (Phase 3.2)
	//
	// One row per tool invocation: WHO (sub/username), WHAT client, WHICH tool.
	// NEVER the query text, params, or results — those may carry user data.
	// When the AS (and its audit writer) is absent, the event still lands in the
	// server log via xLog so loopback-only deployments keep a trace.

	const logToolCall = (toolName, mcpAuth) => {
		const auth = mcpAuth || { mode: 'unknown', sub: '', username: '', clientId: '' };
		const oauthContext = getOauthContext();
		if (oauthContext && oauthContext.audit) {
			oauthContext.audit.write({
				event: 'mcp_tool_call',
				sub: auth.sub || '',
				username: auth.username || '',
				clientId: auth.clientId || '',
				detail: { tool: toolName, mode: auth.mode },
			});
			return;
		}
		xLog.status(`MCP tool call: ${toolName} (${auth.mode}:${auth.username || 'anonymous'})`);
	};

	// ================================================================================
	// MCP SERVER FACTORY
	//
	// Creates a new McpServer instance with tool registrations.
	// Called once per session (each connecting client gets its own server instance).
	// getAuth() returns the session's CURRENT auth context (refreshed per request).

	const createMcpServer = (getAuth) => {
		const server = new McpServer(
			{
				name: 'educore-standards',
				version: '1.0.0',
			},
			{
				capabilities: {},
				instructions: [
					'You are connected to the EDUcore Education Standards Knowledge Graph.',
					'It contains structured, cross-mapped representations of many',
					'education data standards, including: CEDS, SIF, Ed-Fi, PESC, CTDL,',
					'CLR, Open Badges, Ed-API (Edu-API), CASE, LIF, JEDx, SOC, CIP,',
					'SEDM, DCTAP, EdMatrix, and MedBiquitous - plus an EDUcore use-case',
					'library and cross-standard mappings (MAPS_TO / STRUCTURALLY_MAPS_TO).',
					'',
					'Use getSchema for the authoritative, current list of standards and',
					'the full graph structure (node labels, relationships, example',
					'queries) - new standards may be added over time.',
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
				logToolCall('getSchema', getAuth());
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
				logToolCall('cypherQuery', getAuth());
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
	//
	// authContexts[sessionId] is a HOLDER ({ current }) so the closure handed to
	// createMcpServer always reads the latest gated request's identity — a
	// session's later requests re-authenticate at the gate and refresh it.

	const transports = {};
	const authContexts = {};

	const refreshSessionAuth = (sessionId, mcpAuth) => {
		if (sessionId && authContexts[sessionId] && mcpAuth) {
			authContexts[sessionId].current = mcpAuth;
		}
	};

	// --- POST handler ---
	const mcpPostHandler = async (req, res) => {
		const sessionId = req.headers['mcp-session-id'];

		let transport;

		if (sessionId && transports[sessionId]) {
			refreshSessionAuth(sessionId, req.mcpAuth);
			transport = transports[sessionId];
		} else if (!sessionId && isInitializeRequest(req.body)) {
			const authHolder = { current: req.mcpAuth };
			transport = new StreamableHTTPServerTransport({
				sessionIdGenerator: () => randomUUID(),
				onsessioninitialized: (sid) => {
					transports[sid] = transport;
					authContexts[sid] = authHolder;
				},
			});

			transport.onclose = () => {
				const sid = transport.sessionId;
				if (sid && transports[sid]) {
					delete transports[sid];
					delete authContexts[sid];
				}
			};

			const server = createMcpServer(() => authHolder.current);
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
		refreshSessionAuth(sessionId, req.mcpAuth);
		await transports[sessionId].handleRequest(req, res);
	};

	// --- DELETE handler (session termination) ---
	const mcpDeleteHandler = async (req, res) => {
		const sessionId = req.headers['mcp-session-id'];
		if (!sessionId || !transports[sessionId]) {
			res.status(400).send('Invalid or missing session ID');
			return;
		}
		refreshSessionAuth(sessionId, req.mcpAuth);
		await transports[sessionId].handleRequest(req, res);
	};

	// ================================================================================
	// COMPOSED GATE (SEC-2 loopback + Phase-3 OAuth bearer)
	//
	// Path 1 — SEC-2 (2026-07-13, DME/Slack plan v3 task 1.9, DAWN_RIVER ruling):
	// x-dme-internal-secret header + loopback origin + no forwarding header
	// (dme-internal-auth.js). Local MCP clients (.mcp.json →
	// http://localhost:<apiPort>/mcp) add the header; anything arriving through
	// nginx carries forwarding headers and falls through to path 2.
	//
	// Path 2 — OAuth bearer (dmeMcpOAuth Phase 3.1, oauth-bearer-gate.js):
	// audience-bound RS256 verify + per-request revocation checks. Fails closed
	// when the Authorization Server is not mounted.

	const { resolveInternalAuth } = require('../dme-internal-auth');
	const makeBearerGate = require('../oauth-bearer-gate');
	const { checkBearer, rejectWith } = makeBearerGate({ getOauthContext });

	const composedGate = (handler) => (req, res) => {
		const { internalAuthSecret } =
			getConfig('dmeUserGraphInternalAuth') || {};
		const authDecision = resolveInternalAuth({
			xReq: req,
			configuredSecret: internalAuthSecret,
		});
		if (authDecision.internal) {
			req.mcpAuth = {
				mode: 'loopback',
				sub: '',
				username: 'loopback-internal',
				role: 'internal',
				clientId: '',
			};
			handler(req, res);
			return;
		}

		checkBearer(req, (rejectReason, { mcpAuth } = {}) => {
			if (rejectReason || !mcpAuth) {
				xLog.error(`MCP gate reject (loopback: ${authDecision.reason}; bearer: ${rejectReason})`);
				const oauthContext = getOauthContext();
				if (oauthContext && oauthContext.audit) {
					oauthContext.audit.write({
						event: 'mcp_auth_rejected',
						ip: req.ip || '',
						detail: { reason: String(rejectReason || 'no bearer verdict') },
					});
				}
				rejectWith(res);
				return;
			}
			req.mcpAuth = mcpAuth;
			handler(req, res);
		});
	};

	// ================================================================================
	// MOUNT ON EXPRESS

	expressApp.post(mcpPath, composedGate(mcpPostHandler));
	expressApp.get(mcpPath, composedGate(mcpGetHandler));
	expressApp.delete(mcpPath, composedGate(mcpDeleteHandler));

	xLog.status(`MCP server: mounted at ${mcpPath} (Streamable HTTP; loopback OR OAuth bearer)`);
};

module.exports = moduleFunction;
