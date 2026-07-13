#!/usr/bin/env node
'use strict';
// @concept: [[DataModelExplorer]]
// @concept: [[SlackIntegration]]
// @concept: [[AccessPointPattern]]

// ============================================================================
// dme-slack-dispatch — command routing for the DME/Slack Q&A bridge
// (plan v3, tasks 1.6/1.7/1.8/1.10)
//
// The endpoints ACK Slack within 3 seconds and hand the request here
// post-response; this access point does the real work and delivers the answer
// out-of-band through the slack-instance driver (response_url first,
// chat.postMessage as the recovery path).
//
// Routing: '/dme help' | '/dme health' | '/dme ask <question>' | '/dme <term>'.
// Gates, in order: allowlist (runs on EVERY request, allowAll ships live);
// for ask only — spend caps (per-user then global, fixture messages VERBATIM)
// and concurrency. Element lookups are uncapped local graph reads.
//
// Graph access is in-process: accessPointsDotD['dme-cypher-query'] — the same
// validated, LIMIT-capped, READ-mode seam the HTTP endpoint uses.
// ============================================================================

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const qt = require('qtools-functional-library');
const makeRefId = require('../../../lib/make-ref-id');
const { pipeRunner, taskListPlus, mergeArgs, forwardArgs } = new require(
	'qtools-asynchronous-pipe-plus',
)();

// ---- fixture texts (plan A5/A6/A8 — acceptance-tested VERBATIM) ----
// Amounts per TQ ruling 2026-07-13: $5/user/day, $50/day global.
const FIXTURE_LIMIT_USER = `You've hit your personal daily limit for /dme ask ($5 per person per day). It resets at midnight (US Central). If you need more headroom, talk to TQ — the limit is a config setting he can raise.`;
const FIXTURE_LIMIT_GLOBAL = `The team's shared daily budget for /dme ask ($50/day for everyone combined) is used up for today. It resets at midnight (US Central). If this keeps happening, talk to TQ about raising the team budget.`;
const FIXTURE_NOT_ALLOWED = `Sorry — /dme isn't enabled for you yet. Ask TQ if you think it should be.`;
const FIXTURE_GRAPH_DOWN = `The data-model graph is temporarily unavailable (probably maintenance). Try again in a few minutes.`;
const FIXTURE_CONCURRENCY = `I'm at my limit of simultaneous AI queries — try again in a minute.`;

// The command name is echoed from the incoming payload (/tqdme on the DME-dev
// app, /dme on the DME app — TQ registered different names so the two apps can
// share one workspace). Never hardcode it in anything the user reads.
const buildHelpText = (slashCommand) =>
	[
		`*The two forms:*`,
		`*\`${slashCommand} <question>\`* — ask the DME AI anything in natural language (the default; takes a minute or two).`,
		`*\`${slashCommand} lookup <term>\`* — literal element lookup by name (free, instant).`,
		'',
		`Questions run the full graph AI ($5/person/day, $50/day team; lookups keep working when questions are capped). Lookup shows the CEDS hub tuple and cross-standard equivalents.`,
		`*\`${slashCommand} health\`* — bridge status: uptime, graph, askMilo, today’s spend.`,
		`*\`${slashCommand} help\`* — this message.`,
	].join('\n');

const SPEND_TABLE_NAME = 'dmeSlackSpend';

//START OF moduleFunction() ============================================================

const moduleFunction = function ({ dotD, passThroughParameters }) {
	// ================================================================================
	// INITIALIZATION AND DEPENDENCY INJECTION

	const { xLog, getConfig, rawConfig, commandLineParameters } = process.global;

	const { sqlDb, dataMapping, neo4jDb, slackAccess, accessPointsDotD } =
		passThroughParameters;

	const slackConfig = getConfig('dmeSlack') || {};
	const dmeSlackMapper = dataMapping['dme-slack'];
	const askMiloRelay = require('../../lib/slack-instance/ask-milo-relay')({
		unused: true,
	});

	const startedAtMs = Date.now();

	// ================================================================================
	// SMALL PURE HELPERS

	// ROUTER (inverted per TQ ruling 2026-07-13 "no one is going to ask cheap
	// questions"): bare text is an AI QUESTION (the askMilo default path — the
	// spend caps gate exactly this); `lookup <term>` runs the literal element
	// search; help/health reserved. `ask` survives as a SILENT alias
	// (undocumented) so early muscle memory doesn't error.
	const parseCommandText = (rawText) => {
		const text = String(rawText || '').trim();
		if (!text || /^help$/i.test(text)) {
			return { kind: 'help' };
		}
		if (/^health$/i.test(text)) {
			return { kind: 'health' };
		}
		const lookupMatch = text.match(/^lookup\s+(.+)$/is);
		if (lookupMatch) {
			return { kind: 'lookup', term: lookupMatch[1].trim() };
		}
		if (/^lookup$/i.test(text)) {
			return { kind: 'help' };
		}
		const askAliasMatch = text.match(/^ask\s+(.+)$/is);
		if (askAliasMatch) {
			return { kind: 'ask', question: askAliasMatch[1].trim() };
		}
		return { kind: 'ask', question: text };
	};

	// YYYY-MM-DD in the configured reset timezone ('en-CA' formats ISO-style)
	const currentLocalDay = () => {
		const timeZone = slackConfig.spendResetTimezone || 'America/Chicago';
		return new Intl.DateTimeFormat('en-CA', {
			timeZone,
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
		}).format(new Date());
	};

	const formatUptime = () => {
		const totalSeconds = Math.floor((Date.now() - startedAtMs) / 1000);
		const days = Math.floor(totalSeconds / 86400);
		const hours = Math.floor((totalSeconds % 86400) / 3600);
		const minutes = Math.floor((totalSeconds % 3600) / 60);
		return `${days}d ${hours}h ${minutes}m`;
	};

	// The gate runs on EVERY request (TQ ruling: allowAll ships live; flipping
	// to an allowlist is config-only, so nothing may assume allow-all).
	const commaList = (value) =>
		String(value || '')
			.split(',')
			.map((item) => item.trim())
			.filter(Boolean);

	const accessGate = ({ slackUserId, channelId }) => {
		const accessPolicy = slackConfig.accessPolicy || 'allowAll';
		if (accessPolicy === 'allowAll') {
			return { allowed: true };
		}
		const allowedUsers = commaList(slackConfig.allowedUserIds);
		const allowedChannels = commaList(slackConfig.allowedChannelIds);
		if (allowedUsers.includes(slackUserId)) {
			return { allowed: true };
		}
		if (channelId && allowedChannels.includes(channelId)) {
			return { allowed: true };
		}
		return { allowed: false };
	};

	// ----------------------------------------------------------------------
	// delivery — response_url first; chat.postMessage when it is absent or
	// fails (expired response_url). Errors log with the refId, never a secret.

	const deliver = ({ responseUrl, channelId, message, refId }, callback) => {
		if (!slackAccess) {
			xLog.error(`dme-slack DELIVER-FAIL (${refId}) slackAccess is null`);
			callback('slackAccess unavailable');
			return;
		}

		if (responseUrl) {
			slackAccess.postResponse(responseUrl, message, (err) => {
				if (!err) {
					callback('');
					return;
				}
				if (channelId) {
					xLog.error(
						`dme-slack (${refId}) response_url delivery failed — trying chat.postMessage`,
					);
					slackAccess.postMessage(channelId, message, callback);
					return;
				}
				callback(err);
			});
			return;
		}

		if (channelId) {
			slackAccess.postMessage(channelId, message, callback);
			return;
		}

		callback('no responseUrl or channelId to deliver to');
	};

	const ephemeral = (text) => ({ response_type: 'ephemeral', text });
	const inChannel = (blocks, altText) => ({
		response_type: 'in_channel',
		text: altText,
		blocks,
	});

	// ================================================================================
	// SPEND LEDGER (task 1.8)

	// A fresh ledger legitimately has no table/columns yet (the sqlite layer
	// adds columns at first saveObject) — that state means $0 spent today.
	// Any OTHER read failure fails CLOSED: the ask is refused, never admitted
	// with unknown spend.
	const isFreshLedgerError = (err) => /no such (table|column)/i.test(String(err));

	const readSpendTotals = ({ slackUserId }, callback) => {
		const localDay = currentLocalDay();

		sqlDb.getTable(SPEND_TABLE_NAME, (err, tableRef) => {
			if (err) {
				callback(`spend table unavailable: ${err}`);
				return;
			}

			const userSql = dmeSlackMapper.getSql('todayUserSpend', {
				tableName: SPEND_TABLE_NAME,
				slackUserId,
				localDay,
			});
			tableRef.getData(
				userSql,
				{ suppressStatementLog: true, noTableNameOk: true },
				(userErr, userRows) => {
					if (userErr && isFreshLedgerError(userErr)) {
						callback('', { userTotalUsd: 0, globalTotalUsd: 0, localDay });
						return;
					}
					if (userErr) {
						callback(`user spend read failed: ${userErr}`);
						return;
					}
					const globalSql = dmeSlackMapper.getSql('todayGlobalSpend', {
						tableName: SPEND_TABLE_NAME,
						localDay,
					});
					tableRef.getData(
						globalSql,
						{ suppressStatementLog: true, noTableNameOk: true },
						(globalErr, globalRows) => {
							if (globalErr) {
								callback(`global spend read failed: ${globalErr}`);
								return;
							}
							callback('', {
								userTotalUsd: parseFloat(
									(userRows[0] || {}).totalUsd || 0,
								),
								globalTotalUsd: parseFloat(
									(globalRows[0] || {}).totalUsd || 0,
								),
								localDay,
							});
						},
					);
				},
			);
		});
	};

	const recordSpend = ({ slackUserId, costUsd, requestRefId }, callback) => {
		sqlDb.getTable(SPEND_TABLE_NAME, (err, tableRef) => {
			if (err) {
				callback(`spend table unavailable: ${err}`);
				return;
			}
			tableRef.saveObject(
				{
					slackUserId,
					costUsd,
					requestRefId,
					localDay: currentLocalDay(),
					askedAtIso: new Date().toISOString(),
				},
				{ suppressStatementLog: true, noTableNameOk: true },
				(saveErr) => callback(saveErr || ''),
			);
		});
	};

	// ================================================================================
	// COMMAND IMPLEMENTATIONS

	// ----- /dme help
	const runHelp = (inputData, callback) => {
		deliver(
			{ ...inputData, message: ephemeral(buildHelpText(inputData.slashCommand)) },
			(err) => callback(err, { handled: 'help' }),
		);
	};

	// ----- /dme <term> (task 1.6 — uncapped local graph reads)
	const runLookup = (inputData, callback) => {
		const { term, refId, slashCommand } = inputData;
		// trailing punctuation is conversational, not part of the element name
		const searchTerm = String(term).replace(/[?!.]+\s*$/, '').trim();
		const taskList = new taskListPlus();

		taskList.push((args, next) => {
			const spec = dmeSlackMapper.getCypher('elementSearch', { term: searchTerm });
			accessPointsDotD['dme-cypher-query'](
				{ action: 'query', query: spec.cypher, params: spec.params },
				(err, rows) => {
					if (err) {
						next(err, args);
						return;
					}
					next('', { ...args, searchRows: rows.filter((r) => !r._truncated) });
				},
			);
		});

		taskList.push((args, next) => {
			const { searchRows } = args;
			if (!searchRows.length) {
				next('skipRestOfPipe', { ...args, noResults: true });
				return;
			}

			const cardTargets = searchRows.slice(
				0,
				dmeSlackMapper.limits.lookupCardLimit,
			);
			const cards = [];
			let remaining = cardTargets.length;
			let firstError = '';

			cardTargets.forEach((target) => {
				const spec = dmeSlackMapper.getCypher('elementCard', {
					name: target.name,
					source: target.source,
				});
				accessPointsDotD['dme-cypher-query'](
					{ action: 'query', query: spec.cypher, params: spec.params },
					(err, rows) => {
						if (err && !firstError) {
							firstError = err;
						}
						const card = rows && rows[0];
						if (card && card.name) {
							cards.push(card);
						}
						remaining -= 1;
						if (remaining === 0) {
							if (!cards.length && firstError) {
								next(firstError, args);
								return;
							}
							// preserve searchRows order
							cards.sort(
								(a, b) =>
									cardTargets.findIndex(
										(t) => t.name === a.name && t.source === a.source,
									) -
									cardTargets.findIndex(
										(t) => t.name === b.name && t.source === b.source,
									),
							);
							next('', { ...args, cards });
						}
					},
				);
			});
		});

		taskList.push((args, next) => {
			const { cards, searchRows } = args;
			const blocks = dmeSlackMapper.buildLookupBlocks({
				term,
				cards,
				totalMatches: searchRows.length,
				dmeBaseUrl: slackConfig.dmeBaseUrl,
				slashCommand,
				questionHint: `Want an explanation instead? Just type: \`${slashCommand} ${term}\` (no 'lookup') for an AI answer.`,
			});
			deliver(
				{
					...inputData,
					message: inChannel(blocks, `${slashCommand} matches for ${term}`),
				},
				(err) => next(err, args),
			);
		});

		pipeRunner(taskList.getList(), { inputData }, (err, args) => {
			if (args && args.noResults) {
				deliver(
					{
						...inputData,
						message: ephemeral(
							[
								`No elements matched "${term}".`,
								`For an AI answer just type: \`${slashCommand} ${term}\` (no 'lookup') — or try a broader lookup term.`,
							].join('\n'),
						),
					},
					() => callback('', { handled: 'lookup', noResults: true }),
				);
				return;
			}
			if (err && err !== 'skipRestOfPipe') {
				const graphDown = /Neo4j database is not available/i.test(String(err));
				xLog.error(`dme-slack LOOKUP-FAIL (${refId}) ${err}`);
				deliver(
					{
						...inputData,
						message: ephemeral(
							graphDown
								? FIXTURE_GRAPH_DOWN
								: `Sorry — the lookup failed (ref ${refId}). TQ can check the server log with that ref.`,
						),
					},
					() => callback(err, {}),
				);
				return;
			}
			callback('', { handled: 'lookup' });
		});
	};

	// ----- /dme ask <question> (tasks 1.7 + 1.8)
	const runAsk = (inputData, callback) => {
		const { question, slackUserId, refId } = inputData;
		const taskList = new taskListPlus();

		const userCapUsd = parseFloat(slackConfig.userDailyCapUsd) || 5;
		const globalCapUsd = parseFloat(slackConfig.globalDailyCapUsd) || 50;
		const estimateUsd = parseFloat(slackConfig.askCostEstimateUsd) || 0.25;

		// STAGE 1: spend caps — per-user check, then global, BEFORE spawning
		taskList.push((args, next) => {
			readSpendTotals({ slackUserId }, (err, totals) => {
				if (err) {
					next(err, args);
					return;
				}
				if (totals.userTotalUsd + estimateUsd > userCapUsd) {
					next('skipRestOfPipe', { ...args, limitMessage: FIXTURE_LIMIT_USER, limitKind: 'user' });
					return;
				}
				if (totals.globalTotalUsd + estimateUsd > globalCapUsd) {
					next('skipRestOfPipe', { ...args, limitMessage: FIXTURE_LIMIT_GLOBAL, limitKind: 'global' });
					return;
				}
				xLog.status(
					`dme-slack (${refId}) ask admitted — today user=$${totals.userTotalUsd.toFixed(2)} global=$${totals.globalTotalUsd.toFixed(2)}`,
				);
				next('', { ...args, totals });
			});
		});

		// STAGE 2: interim progress message (single, config-driven delay)
		taskList.push((args, next) => {
			const interimSeconds =
				parseInt(slackConfig.interimMessageSeconds, 10) || 20;
			const interimTimer = setTimeout(() => {
				deliver(
					{
						...inputData,
						message: ephemeral(
							'Still thinking… (askMilo is searching the graph)',
						),
					},
					() => {},
				);
			}, interimSeconds * 1000);
			next('', { ...args, interimTimer });
		});

		// STAGE 3: spawn askMilo through the relay (concurrency inside)
		taskList.push((args, next) => {
			askMiloRelay.askQuestion(
				{
					question,
					slackUserId,
					timeoutSeconds: parseInt(slackConfig.askTimeoutSeconds, 10) || 180,
					maxConcurrent: parseInt(slackConfig.askMaxConcurrent, 10) || 2,
					maxPerUser: 1,
					// opus default = parity with the web explorer (TQ ruling)
					askModel: slackConfig.askModel || 'opus',
					// the Slack-formatted prompt twin (TQ directive 2026-07-13)
					askPromptName: slackConfig.askPromptName || 'DataModelExplorerSlack',
				},
				(err, runResult) => {
					clearTimeout(args.interimTimer);
					if (err) {
						next(err, args);
						return;
					}
					next('', { ...args, runResult });
				},
			);
		});

		// STAGE 4: ledger + reply
		taskList.push((args, next) => {
			const { runResult } = args;

			if (runResult.busy) {
				deliver(
					{ ...inputData, message: ephemeral(FIXTURE_CONCURRENCY) },
					() => next('skipRestOfPipe', { ...args, busy: true }),
				);
				return;
			}

			const chargedUsd =
				typeof runResult.actualCostUsd === 'number' &&
				!Number.isNaN(runResult.actualCostUsd)
					? runResult.actualCostUsd
					: estimateUsd;

			const finishReply = () => {
				if (runResult.timedOut || runResult.failed) {
					xLog.error(
						`dme-slack ASK-FAIL (${refId}) ${runResult.timedOut ? 'timeout' : `exit=${runResult.exitCode}`} duration=${runResult.durationMs}ms`,
					);
					deliver(
						{
							...inputData,
							message: ephemeral(
								`Sorry — the AI query failed (ref ${refId}). TQ can check the server log with that ref.`,
							),
						},
						() => next('', { ...args, failed: true }),
					);
					return;
				}

				const blocks = dmeSlackMapper.buildAskAnswerBlocks({
					question,
					answerText: runResult.answerText,
					dmeBaseUrl: slackConfig.dmeBaseUrl,
				});
				deliver(
					{
						...inputData,
						message: inChannel(blocks, `/dme ask answer (ref ${refId})`),
					},
					(deliverErr) => next(deliverErr, { ...args, answered: true, chargedUsd }),
				);
			};

			// every run that reached the spawn is charged (timeout/failure spent
			// real tokens too when actual cost was reported)
			recordSpend(
				{ slackUserId, costUsd: chargedUsd, requestRefId: refId },
				(ledgerErr) => {
					if (ledgerErr) {
						xLog.error(`dme-slack (${refId}) ledger write failed: ${ledgerErr}`);
					}
					finishReply();
				},
			);
		});

		pipeRunner(taskList.getList(), { inputData }, (err, args) => {
			if (args && args.limitMessage) {
				xLog.status(
					`dme-slack (${refId}) ask REFUSED at ${args.limitKind} limit`,
				);
				deliver(
					{ ...inputData, message: ephemeral(args.limitMessage) },
					() => callback('', { handled: 'ask', limited: args.limitKind }),
				);
				return;
			}
			if (err && err !== 'skipRestOfPipe') {
				if (args && args.interimTimer) {
					clearTimeout(args.interimTimer);
				}
				xLog.error(`dme-slack ASK-FAIL (${refId}) ${err}`);
				deliver(
					{
						...inputData,
						message: ephemeral(
							`Sorry — the AI query failed (ref ${refId}). TQ can check the server log with that ref.`,
						),
					},
					() => callback(err, {}),
				);
				return;
			}
			callback('', { handled: 'ask' });
		});
	};

	// ----- /dme health (task 1.10)
	const runHealth = (inputData, callback) => {
		const { refId } = inputData;
		const taskList = new taskListPlus();

		taskList.push((args, next) => {
			const spec = dmeSlackMapper.getCypher('graphIdentity');
			accessPointsDotD['dme-cypher-query'](
				{ action: 'query', query: spec.cypher, params: spec.params },
				(err, rows) => {
					const nodeCount = !err && rows[0] ? rows[0].forgedNodeCount : null;
					next('', { ...args, graphOk: !err, nodeCount });
				},
			);
		});

		taskList.push((args, next) => {
			askMiloRelay.checkAskMilo((err, checkResult) => {
				next('', { ...args, askMiloOk: !err && !!checkResult.healthy });
			});
		});

		taskList.push((args, next) => {
			readSpendTotals({ slackUserId: inputData.slackUserId }, (err, totals) => {
				next('', { ...args, totals: err ? null : totals });
			});
		});

		taskList.push((args, next) => {
			const { graphOk, nodeCount, askMiloOk, totals } = args;
			const goldenName = (getConfig('dataModelExplorerSearch') || {})
				.goldenContainerName;
			const running = askMiloRelay.getRunningCounts();

			const lines = [
				'*DME/Slack bridge health*',
				`• Server uptime (bridge): ${formatUptime()}`,
				`• Golden graph: \`${goldenName || 'unresolved'}\` — ${graphOk ? `${nodeCount} forged nodes` : ':warning: unreachable'}`,
				`• askMilo: ${askMiloOk ? 'responsive' : ':warning: check failed'} (running now: ${running.global})`,
				totals
					? `• Today's /dme ask spend (${totals.localDay}): you $${totals.userTotalUsd.toFixed(2)} · team $${totals.globalTotalUsd.toFixed(2)} of $${parseFloat(slackConfig.globalDailyCapUsd) || 50}`
					: '• Spend ledger: :warning: unavailable',
			];

			deliver(
				{
					...inputData,
					message: ephemeral(lines.join('\n')),
				},
				(err) => next(err, args),
			);
		});

		pipeRunner(taskList.getList(), { inputData }, (err) => {
			if (err) {
				xLog.error(`dme-slack HEALTH-FAIL (${refId}) ${err}`);
			}
			callback(err || '', { handled: 'health' });
		});
	};

	// ================================================================================
	// SERVICE FUNCTION — the dispatch itself

	const serviceFunction = (inputData, callback) => {
		const refId = makeRefId(12);
		const { slackUserId, channelId } = inputData;

		const gate = accessGate({ slackUserId, channelId });
		if (!gate.allowed) {
			xLog.status(`dme-slack (${refId}) user ${slackUserId} not allowlisted`);
			deliver(
				{ ...inputData, refId, message: ephemeral(FIXTURE_NOT_ALLOWED) },
				() => callback('', { handled: 'denied' }),
			);
			return;
		}

		const command = parseCommandText(inputData.commandText);
		const enriched = {
			...inputData,
			...command,
			refId,
			slashCommand: inputData.slashCommand || '/dme',
		};

		// PII discipline: truncated preview at debug level only, never full text
		xLog.verbose(
			`dme-slack (${refId}) kind=${command.kind} preview=${String(inputData.commandText || '').slice(0, 80)}`,
		);

		if (command.kind === 'help') {
			runHelp(enriched, callback);
			return;
		}
		if (command.kind === 'health') {
			runHealth(enriched, callback);
			return;
		}
		if (command.kind === 'ask') {
			runAsk(enriched, callback);
			return;
		}
		runLookup(enriched, callback);
	};

	// ================================================================================
	// ACCESS POINT REGISTRATION

	const addEndpoint = ({ name, serviceFunction, dotD }) => {
		dotD.logList.push(name);
		dotD.library.add(name, serviceFunction);
	};

	addEndpoint({ name: moduleName, serviceFunction, dotD });

	return {};
};

//END OF moduleFunction() ============================================================

module.exports = moduleFunction;
