'use strict';

const Anthropic = require('@anthropic-ai/sdk').default;
const sqlString = require('sqlstring-sqlite');

// ============================================================================
// askmilo-utility — public Anthropic relay (prompt in, response out).
//
// Mounted DIRECTLY on expressApp with NO auth gate (the public page
// /explore/access-guide legitimately calls it anonymously). To bound the
// cost, TWO shared DAILY spend buckets gate the endpoint, both config-driven:
//   - publicDailyLimitUsd   — shared cap for ANONYMOUS callers
//   - loggedInDailyLimitUsd — shared cap for AUTHENTICATED callers
// Caller class comes from the global hasValidToken middleware's authclaims.
// Spend accrues in a sqlite ledger (askmiloUtilitySpend) keyed by
// (localDay, bucket); the ledger idiom mirrors the DME/Slack spend ledger
// (data-mapping/mappers/dme-slack.js + dme-slack-dispatch.js).
// ============================================================================

const SPEND_TABLE_NAME = 'askmiloUtilitySpend';

const moduleFunction = ({ expressApp, sqlDb }) => {
	const { xLog, getConfig } = process.global;

	// API key from config with environment variable fallback
	const config = getConfig('askmilo-utility') || {};
	const apiKey = config.anthropicApiKey || process.env.ANTHROPIC_API_KEY;

	if (!apiKey) {
		xLog.error('askmilo-utility: No Anthropic API key found in config or environment');
		return;
	}

	const anthropic = new Anthropic({ apiKey });

	// Model shorthand map (matches askMilo convention)
	const modelMap = {
		opus: 'claude-opus-4-6',
		sonnet: 'claude-sonnet-4-6',
		haiku: 'claude-haiku-4-5-20251001',
	};

	// ========================================================================
	// SPEND POLICY (caller classification)
	//
	// The global hasValidToken middleware populates authclaims even for
	// directly-mounted routes: an anonymous caller (no Authorization header)
	// yields { noToken: true, user: { role: 'public' } }; a valid website
	// token yields its JWT payload, carrying the real role ('user', 'admin',
	// ...). Classify by ROLE: 'public' → PUBLIC bucket, any real role →
	// LOGGED-IN. authclaims.noToken is deliberately NOT used — it is baked
	// into issued login tokens too (refreshauthtoken carries it forward from
	// the pre-login anonymous claims), so it would misclassify every
	// logged-in caller as public. Missing/absent role is treated as public
	// (the conservative, cheaper cap).
	//
	// The seam for a future per-user cap lives in the logged-in branch: read
	// a per-user claim there and return a per-user bucket + limit. Nothing
	// per-user is built now.

	const roleIsPublic = (callerRole) =>
		callerRole === undefined ||
		callerRole === 'public' ||
		(Array.isArray(callerRole) &&
			callerRole.length > 0 &&
			callerRole.every((oneRole) => oneRole === 'public'));

	const resolveSpendPolicy = (authclaims) => {
		const publicDailyLimitUsd = parseFloat(config.publicDailyLimitUsd) || 0.25;
		const loggedInDailyLimitUsd = parseFloat(config.loggedInDailyLimitUsd) || 5.0;

		const callerRole = authclaims && authclaims.user ? authclaims.user.role : undefined;
		const isPublicCaller = !authclaims || !authclaims.user || roleIsPublic(callerRole);

		if (isPublicCaller) {
			return { bucket: 'public', limitUsd: publicDailyLimitUsd, label: 'public' };
		}

		// FUTURE per-user seam: e.g. a token claim could yield
		//   { bucket: `user:${userId}`, limitUsd: perUserDailyLimitUsd, label: 'per-user' }
		// and slot in here without touching the public path.
		return { bucket: 'loggedIn', limitUsd: loggedInDailyLimitUsd, label: 'logged-in' };
	};

	// ========================================================================
	// COST ACCOUNTING (config-driven per-model pricing)
	//
	// modelPricing is a config map keyed by full model id, each entry giving
	// USD per million tokens: { inputPerMtok, outputPerMtok }. A 'default'
	// entry covers any model absent from the map. cost = input*inPrice +
	// output*outPrice, prices divided by 1e6.

	const computeCostUsd = ({ resolvedModel, inputTokens, outputTokens }) => {
		const modelPricing = config.modelPricing || {};
		const pricing = modelPricing[resolvedModel] || modelPricing.default || {};
		const inputPerMtok = parseFloat(pricing.inputPerMtok) || 0;
		const outputPerMtok = parseFloat(pricing.outputPerMtok) || 0;
		const inputCount = Number(inputTokens) || 0;
		const outputCount = Number(outputTokens) || 0;
		return (inputCount * inputPerMtok + outputCount * outputPerMtok) / 1000000;
	};

	// ========================================================================
	// SPEND LEDGER (sqlDb abstraction; table askmiloUtilitySpend)
	//
	// One row per successful relay: bucket, costUsd, model, inputTokens,
	// outputTokens, localDay, chargedAtIso. localDay (YYYY-MM-DD in the
	// configured timezone) is stamped AT WRITE TIME so "today's spend" is a
	// same-string comparison — midnight reset needs no job.

	// YYYY-MM-DD in the configured reset timezone ('en-CA' formats ISO-style)
	const currentLocalDay = () => {
		const timeZone = config.timezone || 'America/Chicago';
		return new Intl.DateTimeFormat('en-CA', {
			timeZone,
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
		}).format(new Date());
	};

	// A fresh ledger legitimately has no table/columns yet (the sqlite layer
	// adds columns at first saveObject) — that state means $0 spent today.
	// Any OTHER read failure rejects so the caller fails CLOSED.
	const isFreshLedgerError = (err) => /no such (table|column)/i.test(String(err));

	const todayBucketSpendSql = ({ bucket, localDay }) =>
		`SELECT COALESCE(SUM(costUsd), 0) AS totalUsd FROM ${SPEND_TABLE_NAME} ` +
		`WHERE bucket = ${sqlString.escape(bucket)} AND localDay = ${sqlString.escape(localDay)}`;

	const readBucketSpendTodayUsd = (bucket) =>
		new Promise((resolve, reject) => {
			const localDay = currentLocalDay();
			sqlDb.getTable(SPEND_TABLE_NAME, (tableErr, tableRef) => {
				if (tableErr) {
					reject(`spend table unavailable: ${tableErr}`);
					return;
				}
				tableRef.getData(
					todayBucketSpendSql({ bucket, localDay }),
					{ suppressStatementLog: true, noTableNameOk: true },
					(readErr, rows) => {
						if (readErr && isFreshLedgerError(readErr)) {
							resolve(0);
							return;
						}
						if (readErr) {
							reject(`spend read failed: ${readErr}`);
							return;
						}
						resolve(parseFloat((rows[0] || {}).totalUsd || 0));
					},
				);
			});
		});

	const recordSpend = ({ bucket, costUsd, resolvedModel, inputTokens, outputTokens }) =>
		new Promise((resolve, reject) => {
			sqlDb.getTable(SPEND_TABLE_NAME, (tableErr, tableRef) => {
				if (tableErr) {
					reject(`spend table unavailable: ${tableErr}`);
					return;
				}
				tableRef.saveObject(
					{
						bucket,
						costUsd,
						model: resolvedModel,
						inputTokens,
						outputTokens,
						localDay: currentLocalDay(),
						chargedAtIso: new Date().toISOString(),
					},
					{ suppressStatementLog: true, noTableNameOk: true },
					(saveErr) => (saveErr ? reject(saveErr) : resolve()),
				);
			});
		});

	// ========================================================================
	// ENDPOINT — POST /api/askmilo-utility
	// Body: { prompt: string, model?: string, maxTokens?: number }
	// Returns: { response: string }
	expressApp.post('/api/askmilo-utility', async (xReq, xRes) => {
		const { prompt, model = 'haiku' } = xReq.body || {};

		if (!prompt) {
			xRes.status(400).send('Missing required field: prompt');
			return;
		}

		const resolvedModel = modelMap[model] || model;
		const policy = resolveSpendPolicy(xReq.appValueGetter('authclaims'));

		// ENFORCE the cap BEFORE spending money. Fail CLOSED on ledger error.
		let todaySpendUsd;
		try {
			todaySpendUsd = await readBucketSpendTodayUsd(policy.bucket);
		} catch (ledgerErr) {
			xLog.error(`askmilo-utility spend-read failed (${policy.bucket}): ${ledgerErr}`);
			xRes.status(500).send('Spend ledger unavailable; request refused.');
			return;
		}

		if (todaySpendUsd >= policy.limitUsd) {
			xLog.status(
				`askmilo-utility ${policy.label} cap reached ` +
					`($${todaySpendUsd.toFixed(4)} >= $${policy.limitUsd}) — refused without calling Anthropic`,
			);
			const capMessage =
				policy.bucket === 'public'
					? 'Daily usage limit reached, please try again later.'
					: `Daily logged-in usage limit ($${policy.limitUsd}) reached for today. ` +
						`Talk to TQ if you need more headroom — it is a config setting he can raise.`;
			xRes.status(429).send(capMessage);
			return;
		}

		try {
			const maxTokens = xReq.body.maxTokens || 4096;

			const message = await anthropic.messages.create({
				model: resolvedModel,
				max_tokens: maxTokens,
				messages: [{ role: 'user', content: prompt }],
			});

			// RECORD actual cost from the SDK usage before replying so the cap
			// reflects it. A ledger-write failure must not lose the answer.
			const usage = message.usage || {};
			const inputTokens = usage.input_tokens || 0;
			const outputTokens = usage.output_tokens || 0;
			const costUsd = computeCostUsd({ resolvedModel, inputTokens, outputTokens });

			try {
				await recordSpend({
					bucket: policy.bucket,
					costUsd,
					resolvedModel,
					inputTokens,
					outputTokens,
				});
			} catch (ledgerErr) {
				xLog.error(`askmilo-utility ledger-write failed (${policy.bucket}): ${ledgerErr}`);
			}

			const responseText = message.content
				.filter((block) => block.type === 'text')
				.map((block) => block.text)
				.join('');

			xRes.json({ response: responseText });
		} catch (err) {
			xLog.error(`askmilo-utility error (${resolvedModel}): ${err.message}`);
			xRes.status(500).send(`AI request failed: ${err.message}`);
		}
	});

	xLog.status('askmilo-utility endpoint registered at POST /api/askmilo-utility (spend-capped)');
};

module.exports = moduleFunction;
