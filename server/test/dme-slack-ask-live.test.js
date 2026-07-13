'use strict';
// askMilo relay LIVE gate (DME/Slack plan v3, task 1.7).
// Spends a small amount of real Anthropic budget by design — the plan's named
// fixture requires a genuine answer.
//
// Proves: getDefaults health check; the named fixture question answers with a
// CEDS hub tuple (CEDS routing carried over from the DataModelExplorer prompt
// config); tool suppression visible in askMilo's own provider report
// (DmeUserRead/DmeUserWrite absent); actual cost parsed from stderr;
// per-user concurrency busy signal; a timed-out run leaves NO orphan pid.
//
// Run: node server/test/dme-slack-ask-live.test.js   (needs golden + API key)

const path = require('path');

process.global = {
	getConfig: () => ({}),
	xLog: {
		status: () => {},
		error: (m) => console.error('xLog.error:', m),
		verbose: () => {},
		result: () => {},
	},
	rawConfig: {},
	commandLineParameters: { switches: {}, values: {} },
	configurationSourceFilePath:
		'/Users/tqwhite/Documents/webdev/educore/system/configs/instanceSpecific/qbook/startApiServer.ini',
};

const relay = require('../data-model/lib/slack-instance/ask-milo-relay')({
	unused: true,
});

const results = [];
const ok = (name, cond, detail) => {
	results.push([name, !!cond]);
	console.log(`  ${cond ? 'PASS' : 'FAIL'}: ${name}${detail ? ` — ${detail}` : ''}`);
};

const FIXTURE_QUESTION =
	'What CEDS element corresponds to the SIF StudentPersonal birth date? Name the CEDS hub tuple (domain and property) it resolves to.';

console.log('\n=== askMilo relay LIVE gate ===\n');

// ---- 1. health check ----
relay.checkAskMilo((healthErr, healthResult) => {
	ok(
		'checkAskMilo: getDefaults healthy',
		!healthErr && healthResult.healthy && typeof healthResult.defaults === 'object',
		healthErr || `defaults keys: ${Object.keys(healthResult.defaults || {}).slice(0, 5).join(',')}`,
	);

	// ---- 2 + 3. fixture ask (verbose for the suppression proof) with an
	// immediate second ask that must bounce off the per-user concurrency cap
	const askStartedAt = Date.now();

	relay.askQuestion(
		{
			question: FIXTURE_QUESTION,
			slackUserId: 'U0LIVEGATE',
			timeoutSeconds: 240,
			maxConcurrent: 2,
			maxPerUser: 1,
			verbose: true,
			askModel: 'opus',
			askPromptName: 'DataModelExplorerSlack',
		},
		(askErr, askResult) => {
			ok('fixture ask completes', !askErr && !askResult.timedOut && !askResult.failed, askErr || `exit=${askResult.exitCode} ${Math.round(askResult.durationMs / 1000)}s`);

			const answer = askResult.answerText || '';
			const mentionsCeds = /CEDS/i.test(answer);
			const mentionsBirth = /birth\s?date/i.test(answer);
			const hubTupleEvidence =
				/person birth/i.test(answer) || /P0004\d\d/.test(answer) || /hub/i.test(answer) || /domain/i.test(answer);
			ok(
				'RUBRIC: answer cites a CEDS hub tuple for birth date',
				mentionsCeds && mentionsBirth && hubTupleEvidence,
				`CEDS=${mentionsCeds} birth=${mentionsBirth} tuple=${hubTupleEvidence}`,
			);
			console.log('\n  --- answer excerpt (transcript fixture) ---');
			console.log(
				answer
					.slice(0, 700)
					.split('\n')
					.map((line) => `  | ${line}`)
					.join('\n'),
			);
			console.log('  --- end excerpt ---\n');

			// TQ directive 2026-07-13: Slack-formatted prompt must take —
			// re: line in *single asterisks*, no markdown-web artifacts
			const answerBody = answer.replace(/^=+[\s\S]*?PROMPT:.*$/m, ''); // skip askMilo's own banner
			ok(
				'Slack prompt took: re: line wrapped in single asterisks',
				/^\*re:.*\*/m.test(answer),
			);
			ok(
				'Slack prompt took: zero ** bold artifacts',
				!answerBody.includes('**'),
			);
			ok(
				'Slack prompt took: no # heading lines',
				!/^#{1,6}\s/m.test(answerBody),
			);

			const providers = askResult.providerReport || '';
			ok(
				'tool suppression: DmeUserRead/DmeUserWrite absent from provider registry',
				!!providers && !/DmeUser/i.test(providers) && /DataModelExplorer/i.test(providers),
				providers || 'no provider line captured',
			);

			ok(
				'actual cost parsed from askMilo stderr',
				typeof askResult.actualCostUsd === 'number' && askResult.actualCostUsd > 0,
				`$${askResult.actualCostUsd}`,
			);

			// TQ ruling 2026-07-13: the model must actually TAKE — askMilo's own
			// stderr summary names the model it ran
			const modelLine = (askResult.stderrTail || '').match(/Model:\s*(\S+)/);
			ok(
				'askModel=opus actually took (askMilo reports an opus model)',
				modelLine && /opus/i.test(modelLine[1]),
				modelLine ? modelLine[1] : 'no Model line in stderr tail',
			);

			// ---- 4. timeout kill: no orphan pid ----
			relay.askQuestion(
				{
					question: FIXTURE_QUESTION,
					slackUserId: 'U0KILLGATE',
					timeoutSeconds: 3,
					maxConcurrent: 2,
					maxPerUser: 1,
				},
				(killErr, killResult) => {
					ok('short-timeout run reports timedOut', !killErr && killResult.timedOut === true, `pid=${killResult.childPid}`);

					const pid = killResult.childPid;
					const deadline = Date.now() + 12000;
					const pollGone = () => {
						let alive = true;
						try {
							process.kill(pid, 0);
						} catch (e) {
							alive = false;
						}
						if (!alive) {
							ok('timed-out subprocess is dead (no orphan pid)', true);
							finish();
							return;
						}
						if (Date.now() > deadline) {
							ok('timed-out subprocess is dead (no orphan pid)', false, `pid ${pid} still alive`);
							finish();
							return;
						}
						setTimeout(pollGone, 500);
					};
					pollGone();
				},
			);

			const finish = () => {
				const failed = results.filter(([, pass]) => !pass).length;
				console.log(`\n=== Results: ${results.length - failed} passed, ${failed} failed ===\n`);
				process.exit(failed > 0 ? 1 : 0);
			};
		},
	);

	// fired immediately after the fixture ask starts — must bounce
	setTimeout(() => {
		relay.askQuestion(
			{
				question: 'second concurrent question',
				slackUserId: 'U0LIVEGATE',
				timeoutSeconds: 240,
				maxConcurrent: 2,
				maxPerUser: 1,
			},
			(busyErr, busyResult) => {
				const quickMs = Date.now() - askStartedAt;
				ok(
					'second ask from same user bounces at per-user cap (no spawn)',
					!busyErr && busyResult.busy === true && busyResult.busyReason === 'user',
					`${quickMs}ms after first`,
				);
			},
		);
	}, 500);
});
