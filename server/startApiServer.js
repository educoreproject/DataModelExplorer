#!/usr/bin/env node
'use strict';
// @concept: [[PipelinePattern]]
// @concept: [[DependencyInjection]]
// @concept: [[DynamicModuleLoading]]

/**
 * SYSTEM ORCHESTRATION PIPELINE
 * 
 * This module orchestrates the entire application startup through a sequential
 * pipeline that ensures dependencies are loaded in the correct order:
 * 1. Data layer (database, access points, mappers) 
 * 2. Authentication middleware (token validation/refresh)
 * 3. Host-specific configuration
 * 4. Dynamic endpoint loading
 * 
 * ARCHITECTURE DECISIONS:
 * - Uses qtools-asynchronous-pipe-plus instead of async/await for shared state
 *   accumulation, clear error propagation, and sequential dependency loading
 * - Configuration-driven: Everything controlled by INI files for environment flexibility
 * - Uses qtSelectProperties() to pass only needed data between pipeline stages
 * - Graceful error handling with detailed logging and clean exit strategies
 */

// Suppress punycode deprecation warning
// process.noDeprecation = true;

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, ''); //this just seems to come in handy a lot

const qt = require('qtools-functional-library');

const { pipeRunner, taskListPlus, mergeArgs, forwardArgs } = new require(
	'qtools-asynchronous-pipe-plus',
)();

const os = require('os');
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const querystring = require('querystring');

// --------------------------------------------------------------------------------
// OTHER MODULES
//START OF moduleFunction() ============================================================

const moduleFunction =
	({ moduleName }) =>
	(err, { rawConfig, commandLineParameters, getConfig }) => {
		// ======================================================================================
		// CONFIGURATION INITIALIZATION
		// 
		// EXPLANATION: Sets up the global configuration system that all modules use.
		// The configuration is loaded from INI files and processed with token substitution.
		// 
		// TO ADD NEW CONFIGURATION: Add to systemParameters.ini under [startApiServer] section,
		// then destructure from getConfig(moduleName) around line 65.

		process.global.getConfig = getConfig;
		process.global.commandLineParameters = commandLineParameters;
		process.global.rawConfig = rawConfig; //this should only be used for debugging, use getConfig(moduleName)
		process.global.configurationSourceFilePath=getConfig('_meta').configurationSourceFilePath

		const { xLog } = process.global;

		xLog.status(
			`Using config: ${getConfig('_meta').configurationSourceFilePath}`,
		);
		const {
			apiPort,
			staticDirectoryPath,
			staticPathPrefix,
			allowQueryStringInLog,
			suppressPictureRequestLogging,
		} = getConfig(moduleName);

		if (suppressPictureRequestLogging) {
			xLog.status(
				`image requests are NOT being logged, suppressPictureRequestLogging=${suppressPictureRequestLogging}`,
			);
		} else {
			xLog.status(
				`image requests are being logged, suppressPictureRequestLogging=${suppressPictureRequestLogging}`,
			);
		}

		// ======================================================================================
		// EXPRESS APPLICATION SETUP
		// 
		// EXPLANATION: Configures Express with logging middleware, body parsing, and static routes.
		// Request logging is configurable and can exclude image requests for cleaner logs.
		// 
		// TO ADD NEW EXPRESS MIDDLEWARE: Add it here before the DYNAMIC ENDPOINTS section.
		// TO ADD NEW STATIC ROUTES: Add after line 112 (static endpoints section).

		const expressApp = express();

		// dmeMcpOAuth Phase 2 (Gate-2 MED-1 fix): trust EXACTLY ONE proxy hop — the
		// single nginx in front (which appends the real client via
		// $proxy_add_x_forwarded_for). This makes req.ip resolve to the real client
		// instead of collapsing to nginx's 127.0.0.1, so the OAuth per-IP login
		// throttle, DCR rate-limit, and audit IP are per-real-client. NOT `true`
		// (which would trust a spoofable client-supplied XFF); with exactly 1,
		// Express takes the rightmost XFF entry — the address nginx itself appended,
		// which a client cannot forge. The /mcp loopback gate is unaffected: it keys
		// on xReq.socket.remoteAddress + a forwarding-header check, not req.ip.
		expressApp.set('trust proxy', 1);

		expressApp.use((xReq, xRes, next) => {
			if (suppressPictureRequestLogging && xReq.path.match(/\/api\/image\//)) {
				next();
				return;
			}
			const queryString =
				allowQueryStringInLog && Object.keys(xReq.query).length
					? '?' + querystring.stringify(xReq.query)
					: '';
			console.log(
				`Request: ${xReq.method.toUpperCase()} ${xReq.path}${queryString} via nginx/${xReq.headers['tq-config-id']} [startApiServer.js]`,
			);
			next();
		});

		// CORS for local dev cross-origin: the Nuxt UI on :7791 calls the API on :7790
		// when the educoreDevServer cookie is active. Bearer tokens, not cookies, carry
		// auth, so credentials is false. In production nginx serves UI and API from the
		// same origin, so this middleware is harmless — no prod origin is allowed.
		expressApp.use(cors({
			origin: [
				'http://localhost:7791',
				'http://localhost:7790',
			],
			credentials: false,
			allowedHeaders: ['Authorization', 'Content-Type', 'from'],
			// Custom response headers carry auth state back to the client (see
			// loginStore.login reading response.headers.authtoken). Without
			// exposedHeaders, the browser silently hides them cross-origin, the
			// store captures undefined, and every subsequent call sends
			// "Authorization: Bearer undefined".
			exposedHeaders: ['authtoken', 'authclaims', 'authsecondsexpirationseconds'],
			methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
		}));

		// rawBodyCapture retains the exact request bytes on xReq.rawBody — the
		// Slack signing-secret HMAC (v0 scheme) must be computed over the raw
		// bytes, which body-parser otherwise discards. The urlencoded parser is
		// mounted because Slack slash commands arrive
		// application/x-www-form-urlencoded; both parsers are content-type gated,
		// so existing JSON endpoints are untouched.
		const rawBodyCapture = (xReq, xRes, buf) => {
			xReq.rawBody = buf;
		};
		expressApp.use(bodyParser.json({ extended: true, verify: rawBodyCapture })); //https://stackabuse.com/get-http-post-body-in-express-js/
		expressApp.use(
			bodyParser.urlencoded({ extended: true, verify: rawBodyCapture }),
		);

		// --------------------------------------------------------------------------------
		//STATIC ENDPOINTS

		expressApp.use(/\/api\/ping/, (xReq, xRes, next) => {
			xLog.status(`xReq.path=${xReq.path} [startApiServer.js]`);
			next();
		});

		console.log(`staticDirectoryPath=${staticDirectoryPath}`);

		xLog.status(`using image directory ${staticDirectoryPath}`);
		expressApp.use(staticPathPrefix, express.static(staticDirectoryPath));

		// --------------------------------------------------------------------------------
		// SYSTEM INITIALIZATION PIPELINE
		// 
		// EXPLANATION: Sequential pipeline loads system components in dependency order.
		// Each stage receives accumulated args from previous stages and adds its outputs.
		// Uses qtools-asynchronous-pipe-plus for shared state and error propagation.
		// 
		// TO ADD NEW PIPELINE STAGES: Add new taskList.push() items before line 200 (INIT AND EXECUTE).
		// TO DEBUG PIPELINE: Add xLog.debug(args, { label: 'Stage Name' }) at start of stages.

		const taskList = new taskListPlus();

		// --------------------------------------------------------------------------------
		// PIPELINE STAGE 1: DATA MODEL INITIALIZATION
		// 
		// EXPLANATION: Loads database, access points, and data mappers. This must be first
		// because all other stages depend on the data layer being available.
		// 
		// OUTPUTS: accessPointsDotD, dataModelLogInfoList

		taskList.push((args, next) => {
			const localCallback = (
				err,
				{ accessPointsDotD, dataModelLogInfoList, slackAccess, sqlDb },
			) => {
				if (err) {
					next(err, args); //next('skipRestOfPipe', args);
					return;
				}

				// dmeMcpOAuth Phase 2: forward sqlDb for the Authorization Server mount.
				next('', { ...args, accessPointsDotD, dataModelLogInfoList, slackAccess, sqlDb });
			};

			require('./data-model')(
				args.qtSelectProperties(['expressApp']),
				localCallback,
			);
		});

		// --------------------------------------------------------------------------------
		// PIPELINE STAGE 2: AUTHENTICATION MIDDLEWARE SETUP
		// 
		// EXPLANATION: Sets up token validation and refresh middleware. Must come after
		// data model because it needs user access points. Adds middleware to Express
		// that validates tokens on each request and refreshes them when needed.
		// 
		// INPUTS: expressApp, accessPointsDotD
		// OUTPUTS: accessTokenHeaderTools
		// TO ADD NEW MIDDLEWARE: Add expressApp.use() calls in this stage.

		taskList.push((args, next) => {
			const { expressApp, accessPointsDotD } = args;
			accessPointsDotD.qtListProperties();
			const appValueManager = require('./lib/app-value-manager');
			const userByUsername = accessPointsDotD['user-by-username'];
			const accessTokenHeaderTools = require('./lib/access-token-header-tools')(
				{
					expressApp,
					userByUsername,
				},
			);

			expressApp.use((xReq, xRes, next) => {
				appValueManager({ targetObject: xReq });
				next();
			});

			// dmeMcpOAuth Phase 3 (DAWN_RIVER-authorized 2026-07-14): the OAuth-owned
			// surfaces authenticate with their own machinery — the RS256 bearer gate
			// on /mcp and the OIDC provider on /oauth/* and the oauth well-knowns —
			// and every one of them fails closed. hasValidToken would 401 any
			// non-HS256 Authorization header before those gates could run, and
			// refreshauthtoken would stamp website auth headers on their responses.
			// POSITIVE ALLOWLIST of exact paths (plus the /oauth/ prefix) — nothing
			// broader. Website endpoints are unaffected: an RS256 token presented at
			// /api/* still 401s (HS256 pin + audience firewall intact).
			const OAUTH_OWNED_EXACT_PATHS = [
				'/mcp',
				'/.well-known/openid-configuration',
				'/.well-known/oauth-authorization-server',
				'/.well-known/oauth-protected-resource',
			];
			const isOauthOwnedPath = (path) =>
				OAUTH_OWNED_EXACT_PATHS.includes(path) || path.startsWith('/oauth/');

			expressApp.use((xReq, xRes, next) => {
				if (isOauthOwnedPath(xReq.path)) {
					next();
					return;
				}
				const localCallback = (err) => {
					if (err) {
						xRes.status(401).send(`Bad Request ${err.toString()}`);
						return; //this next is not asyncPipe
					}
					next(); // this next is expressApp.next()
				};
				accessTokenHeaderTools.hasValidToken(xReq, localCallback);
			});

			expressApp.use((xReq, xRes, next) => {
				if (isOauthOwnedPath(xReq.path)) {
					next();
					return;
				}
				accessTokenHeaderTools.refreshauthtoken({ xReq, xRes }, next); //updated by endpoint, if needed, eg, login
			});

			next('', { ...args, accessTokenHeaderTools });
		});

		// --------------------------------------------------------------------------------
		// PIPELINE STAGE 3: HOST PARAMETERS INITIALIZATION
		// 
		// EXPLANATION: Loads host-specific configuration parameters. This provides
		// environment-specific settings that may be needed by endpoints.
		// 
		// INPUTS: accessPointsDotD
		// OUTPUTS: result (host parameters)

		taskList.push((args, next) => {
			const { accessPointsDotD } = args;

			const localCallback = (err, result) => {
				if (err) {
					next(err, args); //next('skipRestOfPipe', args);
					return;
				}

				next('', { ...args, result });
			};

			accessPointsDotD['host-params'](localCallback);
		});

		// --------------------------------------------------------------------------------
		// PIPELINE STAGE 4: DYNAMIC ENDPOINT LOADING
		// 
		// EXPLANATION: Loads all endpoints from qtDotLib.d/ directory. This is the final
		// stage because endpoints may depend on all previous components. Uses dynamic
		// loading to automatically discover and register API routes.
		// 
		// INPUTS: expressApp, accessTokenHeaderTools, accessPointsDotD
		// OUTPUTS: endpointsDotD

		taskList.push((args, next) => {
			const localCallback = (err, endpointsDotD) => {
				if (err) {
					next(err, args); //next('skipRestOfPipe', args);
					return;
				}

				next('', { ...args, endpointsDotD });
			};

			require('./endpoints-dot-d')(
				args.qtSelectProperties([
					'expressApp',
					'accessTokenHeaderTools',
					'accessPointsDotD',
					'slackAccess',
				]),
				localCallback,
			);
		});

		// --------------------------------------------------------------------------------
		// PIPELINE EXECUTION
		// 
		// EXPLANATION: Executes the entire initialization pipeline. If any stage fails,
		// the server exits gracefully with detailed error information. On success,
		// displays startup information and starts listening on the configured port.

		const initialData = { expressApp };
		pipeRunner(taskList.getList(), initialData, (err, args) => {
			const { endpointsDotD, accessPointsDotD, dataModelLogInfoList, sqlDb } = args;

			if (err) {
				xLog.error(
					xLog.color.magentaBright(`
=================================================
FAILED TO START SERVER

${err.toString()}

=================================================

`),
				);
				process.exit(1);
			}
			xLog.status(dataModelLogInfoList.join('\n'));
			xLog.status(endpointsDotD.qtdProcessLog()); //console.dir(xpressApp._router.stack) for the real details

			xLog.status(accessPointsDotD.toString());
			
			xLog.status(`askMilo is called as a CLI\n    It deployed by rsync following a symLink .../system/code/server/data-model/lib/ask-milo-multitool\n    deployPrograms installs it in the PATH`)

			// MCP server for AI agent access to the knowledge graph
			require('./lib/mcp-server/mcp-server')({ expressApp, accessPointsDotD });

			// dmeMcpOAuth Phase 2: the EDUcore OIDC/OAuth 2.1 Authorization Server.
			// Mounts /oauth/* + the root well-known docs on this same Express app
			// (nginx routes those paths here). Additive — the /mcp loopback path and
			// every existing route are untouched.
			require('./lib/oauth-server')({ expressApp, accessPointsDotD, sqlDb });

			// askMilo utility endpoint (public AI relay — prompt in, response out).
			// sqlDb is injected for the spend-cap ledger (askmiloUtilitySpend);
			// registered here (inside the pipeline callback) so sqlDb is in scope.
			require('./lib/askmilo-utility')({ expressApp, sqlDb });

			xLog.status(xLog.color.magentaBright(`\nMagic happens on ${apiPort}`));

			// Multi-tenant DME: build the golden snapshot + warm clone pool ONCE at startup so
			// user opens claim a pre-booted clone instead of paying the cold cp+boot. Background
			// and non-blocking. Docker/disk-aware: adopts an existing snapshot + idle warm
			// containers across restarts; only a cold machine pays the full build.
			try {
				const dmeCfg = (typeof getConfig === 'function' && getConfig('dataModelExplorerSearch')) || {};
				const warmDepth = Number(dmeCfg.warmPoolDepth != null ? dmeCfg.warmPoolDepth : 2);
				if (warmDepth > 0) {
					const warmPool = require('./data-model/lib/user-graph/warm-pool');
					xLog.status(`[dmeOpenTrace] startup: priming DME warm pool to depth ${warmDepth} (background)...`);
					warmPool.reconcileAndPrime(warmDepth, (e, res) => {
						if (e) { xLog.error(`[dmeOpenTrace] startup: warm pool prime FAILED: ${e}`); return; }
						xLog.status(`[dmeOpenTrace] startup: warm pool priming started — adopted ${res.adopted}, target ${res.target}; filling in background (serialized, one boot at a time)`);
					});
				}
			} catch (e) {
				xLog.error(`[dmeOpenTrace] startup: warm pool init error: ${e.message}`);
			}

			//callback(err, {localResult1Value, localResult2});
		});

		// ======================================================================================
		// START SERVER

		const server = expressApp.listen(apiPort);

		server.on('error', (err) => {
			if (err.code === 'EADDRINUSE') {
				xLog.error(`Port ${apiPort} is already in use. Kill the other process or use a different port.`);
			} else {
				xLog.error(`Server error: ${err.message}`);
			}
			process.exit(1);
		});

		// WebSocket servers for streaming connections
		// Each handler uses noServer:true and returns its WebSocketServer instance.
		// Central upgrade routing prevents the ws library's per-instance path matching
		// from aborting connections meant for a different instance (causes "Invalid frame header").
		const wssExplorer = require('./lib/ws-graphinator')({ server });

		const wsRoutes = {
			'/ws/explorer': wssExplorer,
		};

		server.on('upgrade', (request, socket, head) => {
			const { pathname } = new URL(request.url, `http://${request.headers.host}`);
			const wss = wsRoutes[pathname];
			if (wss) {
				wss.handleUpgrade(request, socket, head, (ws) => {
					wss.emit('connection', ws, request);
				});
			} else {
				socket.destroy();
			}
		});
	};
//END OF moduleFunction() ============================================================

// prettier-ignore
{
// --------------------------------------------------------------------------------
// BOOTSTRAP INITIALIZATION
// 
// EXPLANATION: This section runs when the module is loaded. It sets up the
// basic global utilities and configuration system before the main module function
// executes. The configuration system handles command line parsing, INI file
// loading, and help text generation.

// --------------------------------------------------------------------------------
// FIND PROJECT ROOT
const findProjectRoot=({rootFolderName='system', closest=true}={})=>__dirname.replace(new RegExp(`^(.*${closest?'':'?'}\/${rootFolderName}).*$`), "$1");
const projectRoot=findProjectRoot(); // call with {closest:false} if there are nested rootFolderName directories and you want the top level one

// --------------------------------------------------------------------------------
// GLOBAL UTILITIES SETUP
// 
// EXPLANATION: Sets up process.global with essential utilities that all modules
// need. xLog provides consistent logging, projectRoot provides path resolution.
process.global = {};
process.global.xLog = require('./lib/x-log');
process.global.xLog.logToStdOut();
process.global.projectRoot = projectRoot;

// --------------------------------------------------------------------------------
// CONFIGURATION SYSTEM BOOTSTRAP
// 
// EXPLANATION: Loads configuration from INI files, processes command line args,
// and calls the main module function. Handles --help and exits gracefully on
// configuration errors.
const assembleConfigurationShowHelpMaybeExit = require('./lib/assemble-configuration-show-help-maybe-exit');

assembleConfigurationShowHelpMaybeExit({ configName:moduleName, applicationControls:['-flagCity', '--flagValue'] }, moduleFunction({ moduleName }));

}

module.exports = moduleFunction({ moduleName });