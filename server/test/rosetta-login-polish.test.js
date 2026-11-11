'use strict';
// rosetta-login-polish.test.js — WORKORDER-rosettaLoginPolish-111126 gate 1, hermetic: no graph, no vendor, no network.
//   #4 SPEND. A judge call is written at its estimate before it goes and corrected to its bill when it answers (rosettaJobStore's MONEY rule), so the job's
//      spentUsd falls whenever a bill comes in under its estimate: that is the QA walk's $0.2087, $0.0879, $0.2613. The test replays such a run in a real store,
//      reads the status answer after every step, and holds that the figure the page SHOWS (spendLineOf) never falls, though spentUsd does.
//   #5 WORDS. Every reason and job stop a person may read is a sentence: a capital first, a full stop last, no camelCase token, no name in brackets. Read three
//      ways: every entry of rosettaReasonWords.json and the vendor faults; what the parsers, the cancel path and the page's own words actually say; and the
//      source, so no reason is written as a literal outside the vocabulary again.
//   #8 WHY. The no-proposal block labels its reason with the vocabulary's reportNoProposalReasonLabel.
// The checker is this file's own (not rosettaReasonWords.sentenceFaultOf), so the test reads the same on a tree that does not have that module: point it at
// another tree with ROSETTA_POLISH_CODE_ROOT to watch it fail there.
//   node server/test/rosetta-login-polish.test.js

const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');

const codeRootPath = process.env.ROSETTA_POLISH_CODE_ROOT || path.join(__dirname, '..', '..');
const rosettaDirPath = path.join(codeRootPath, 'server', 'lib', 'standards-query', 'rosetta');
const htmlPath = path.join(codeRootPath, 'html');

let passedCount = 0;
let failedCount = 0;
const ok = (testName, condition, detailText) => {
	if (condition) { passedCount += 1; console.log(`  PASS: ${testName}`); return; }
	failedCount += 1;
	console.log(`  FAIL: ${testName}${detailText ? ` — ${String(detailText).slice(0, 1500)}` : ''}`);
};
const requireOr = (modulePath) => (fs.existsSync(`${modulePath}.js`) || fs.existsSync(modulePath) ? require(modulePath) : null);

// THE RULE, written here once
const CAMEL_CASE_TOKEN_PATTERN = /\b[a-z]+[A-Z][A-Za-z0-9]*\b/;
const PARENTHESISED_NAME_PATTERN = /\(\s*[a-z][A-Za-z]*\s*\)/;
const sentenceFaultOf = (text) => {
	if (typeof text !== 'string' || text === '') return 'not text';
	if (!/^[A-Z]/.test(text)) return 'no capital first';
	if (!/\.$/.test(text)) return 'no full stop last';
	if (CAMEL_CASE_TOKEN_PATTERN.test(text)) return `names ${text.match(CAMEL_CASE_TOKEN_PATTERN)[0]}`;
	if (PARENTHESISED_NAME_PATTERN.test(text)) return `holds ${text.match(PARENTHESISED_NAME_PATTERN)[0]}`;
	return '';
};
const SLOT_PATTERN = /\{([A-Za-z]+)\}/g;
const faultListOf = (textByName) => Object.entries(textByName).map(([textName, text]) => [textName, sentenceFaultOf(String(text).replace(SLOT_PATTERN, 'X'))]).filter(([, faultText]) => faultText);

console.log('rosetta-login-polish: 0. the checker itself');
ok('the checker refuses the QA walk\'s cancel words', sentenceFaultOf('This job was cancelled. the owner cancelled this job (cancelledByOwner)') !== '');
ok('the checker refuses the QA walk\'s refusal words', sentenceFaultOf('maxFieldListLength: a submission may name 25 fields, and this one names more; send them in smaller submissions If you need more than this, write to x and say what you need.') !== '');
ok('the checker passes a plain sentence', sentenceFaultOf('A submission may name at most 25 fields, and this one names more. Send them in smaller submissions.') === '');

console.log('\n#5 words: the vocabularies');
const reasonWordsPath = path.join(rosettaDirPath, 'rosettaReasonWords.json');
const reasonWords = fs.existsSync(reasonWordsPath) ? JSON.parse(fs.readFileSync(reasonWordsPath, 'utf8')) : null;
ok('rosettaReasonWords.json holds the Rosetta reasons', reasonWords && Object.keys(reasonWords.reasonTextByName).length > 0);
if (reasonWords) {
	ok('every reason in rosettaReasonWords.json is a sentence', faultListOf(reasonWords.reasonTextByName).length === 0, JSON.stringify(faultListOf(reasonWords.reasonTextByName)));
}
const judgedSettings = JSON.parse(fs.readFileSync(path.join(rosettaDirPath, 'rosettaJudgedSettings.json'), 'utf8'));
// ⟪review S2⟫ ONE vocabulary: a vendor fault's words (a vendor-stopped job shows them) live in rosettaReasonWords.json under the fault's name, and the settings'
// rows carry the pattern and the policy only; no sentence is written twice
const vendorFaultRowList = [...judgedSettings.vendorFaultRowList, judgedSettings.unnamedVendorFault];
const vendorReasonByName = Object.fromEntries(vendorFaultRowList.map((oneRow) => [oneRow.faultName, reasonWords ? reasonWords.reasonTextByName[oneRow.faultName] : undefined]));
ok('every vendor fault has its words in rosettaReasonWords.json, by its fault name, as a sentence', Object.values(vendorReasonByName).every((text) => text !== undefined) && faultListOf(vendorReasonByName).length === 0, JSON.stringify(vendorReasonByName));
ok('and no vendor fault row in rosettaJudgedSettings.json carries words of its own', vendorFaultRowList.every((oneRow) => oneRow.reason === undefined), JSON.stringify(vendorFaultRowList.filter((oneRow) => oneRow.reason !== undefined).map((oneRow) => oneRow.faultName)));
const reasonTextList = reasonWords ? Object.values(reasonWords.reasonTextByName) : [];
ok('no sentence is written twice in the vocabulary', new Set(reasonTextList).size === reasonTextList.length, JSON.stringify(reasonTextList.filter((text, textIndex) => reasonTextList.indexOf(text) !== textIndex)));

console.log('\n#5 words: what the service actually says');
const reasonWordsModule = requireOr(path.join(rosettaDirPath, 'rosettaReasonWords'));
const { parseFieldList } = require(path.join(rosettaDirPath, 'parsers', 'fieldListParser'));
const { refusalWithSizeContact } = require(path.join(codeRootPath, 'server', 'lib', 'standards-query', 'sizeRefusalContact'));
const registry = require(path.join(codeRootPath, 'server', 'lib', 'standards-query', 'standardsQueryOperations.json'));
const PARSER_LIMIT_VALUES = { maxFieldListLength: 25, maxFieldNameChars: 200, maxFieldDefinitionChars: 2000, maxFieldPathChars: 500, maxDocumentDepth: 12, maxRefExpansions: 50, maxUnresolvedListLength: 50 };
const twentySixFieldList = Array.from({ length: 26 }, (unused, fieldIndex) => ({ name: `field${fieldIndex}`, definition: 'a field' }));
const twentySixRefusal = parseFieldList({ submittedDocument: twentySixFieldList, parserLimitValues: PARSER_LIMIT_VALUES }).refusal;
// the QA walk's 26-field refusal, as the API sends it: the parser's reason with the size contact sentence after it
const twentySixShown = refusalWithSizeContact({ registry, contactAddress: 'help@example.org', refusal: { refusedByName: 'rosettaSubmit', ...twentySixRefusal } });
ok('the 26-field refusal keeps its machine name, beside the words', twentySixShown.refusalName === 'maxFieldListLength');
ok('the 26-field refusal, contact sentence and all, is a sentence', sentenceFaultOf(twentySixShown.reason) === '', `${sentenceFaultOf(twentySixShown.reason)}: ${twentySixShown.reason}`);
ok('it says the number, and a full stop comes before "If you need more"', /25 fields/.test(twentySixShown.reason) && /\. If you need more/.test(twentySixShown.reason), twentySixShown.reason);
const parserRefusalList = [
	parseFieldList({ submittedDocument: [], parserLimitValues: PARSER_LIMIT_VALUES }).refusal,
	parseFieldList({ submittedDocument: [7], parserLimitValues: PARSER_LIMIT_VALUES }).refusal,
	parseFieldList({ submittedDocument: [{ name: 'a', colour: 'red' }], parserLimitValues: PARSER_LIMIT_VALUES }).refusal,
	// a person's own field name is said back to them; a capitalised one here, so the rule reads only the service's words
	parseFieldList({ submittedDocument: [{ name: 'Birth', definition: 'x'.repeat(2001) }], parserLimitValues: PARSER_LIMIT_VALUES }).refusal,
];
ok('the field-list parser\'s other refusals are sentences', parserRefusalList.every((oneRefusal) => oneRefusal && sentenceFaultOf(oneRefusal.reason) === ''), JSON.stringify(parserRefusalList.map((oneRefusal) => oneRefusal && oneRefusal.reason)));

// the source: a reason or stop text written as a quoted literal in a Rosetta module is a reason outside the vocabulary. The parsers' notWalked, unresolved and
// left-out notes are lists for a program, never a refusal or an end, and say so by where they are pushed (.add / .push)
const LITERAL_REASON_PATTERN = /\b(reason|stopReasonText)\s*:\s*(['`])/;
const NOTE_LINE_PATTERN = /\.(add|push)\(\{/;
const literalReasonLineList = [rosettaDirPath, path.join(rosettaDirPath, 'parsers')]
	.flatMap((dirPath) => fs.readdirSync(dirPath).filter((fileName) => fileName.endsWith('.js')).map((fileName) => path.join(dirPath, fileName)))
	.flatMap((filePath) => fs.readFileSync(filePath, 'utf8').split('\n').map((lineText, lineIndex) => ({ filePath, lineText, lineNumber: lineIndex + 1 })))
	.filter((oneLine) => !oneLine.lineText.trim().startsWith('//') && LITERAL_REASON_PATTERN.test(oneLine.lineText) && !NOTE_LINE_PATTERN.test(oneLine.lineText))
	.map((oneLine) => `${path.relative(codeRootPath, oneLine.filePath)}:${oneLine.lineNumber}`);
ok('no Rosetta module writes a refusal reason or a stop text as a literal', literalReasonLineList.length === 0, literalReasonLineList.join(', '));
// a stopped job's words, every one the runner and the engine can store: each is a reasonOf name, so each is checked above; this checks they are names it has
const STOP_REASON_CALL_PATTERN = /stopReasonText:\s*reasonOf\('([A-Za-z]+)'/g;
const stopWordNameList = ['rosettaJobRunner.js', 'rosettaJudgeEngine.js'].flatMap((fileName) => [...fs.readFileSync(path.join(rosettaDirPath, fileName), 'utf8').matchAll(STOP_REASON_CALL_PATTERN)].map((oneMatch) => oneMatch[1]));
ok('the runner and the engine take every stop text from the vocabulary, by a name it holds', stopWordNameList.length >= 15 && reasonWords && stopWordNameList.every((reasonName) => reasonWords.reasonTextByName[reasonName] !== undefined), `${stopWordNameList.length} found`);

console.log('\n#4 spend, and #5 the cancel path, in a real store');
const { createStrangerVectorStore } = require(path.join(rosettaDirPath, 'strangerVectorStore'));
const { createRosettaJobStore } = require(path.join(rosettaDirPath, 'rosettaJobStore'));
const { createRosettaJobService } = require(path.join(rosettaDirPath, 'rosettaJobService'));
const scratchDirPath = fs.mkdtempSync(path.join(os.tmpdir(), 'rosettaLoginPolish-'));
let currentMs = Date.parse('2026-11-11T12:00:00Z');
const nowMs = () => currentMs;
const xLog = { error() {}, status() {} };
const OWNER = Object.freeze({ kind: 'siteUser', userRefId: 'polishOwner' });
const SPEND_JOB_REF_ID = 'a'.repeat(32);
const CANCEL_JOB_REF_ID = 'b'.repeat(32);
const jobFor = (jobRefId) => ({ jobRefId, ownerPrincipalKind: OWNER.kind, ownerPrincipalRefId: OWNER.userRefId, formatName: 'fieldList', byteSize: 10, fieldList: [{ name: 'a' }, { name: 'b' }, { name: 'c' }, { name: 'd' }], hubNameList: ['CEDS', 'CTDL'], submissionNote: {}, expiresAtMs: currentMs + 86400000, estimateUsd: 0.4, answeredFrom: {}, judgeFacts: {}, embeddingTokensEstimate: 0 });
// the QA walk's shape: calls go out at a worst case near $0.06 and their bills come in near $0.02, overlapping. Each step is ['add', unitIndex, estimate] or ['bill', unitIndex, bill]
const SPEND_STEP_LIST = [['add', 0, 0.0612], ['add', 1, 0.0598], ['add', 2, 0.0605], ['bill', 0, 0.0211], ['add', 3, 0.0617], ['bill', 1, 0.0187], ['bill', 2, 0.0243], ['add', 4, 0.0603], ['bill', 3, 0.0198], ['bill', 4, 0.0222]];

const finish = () => {
	fs.rmSync(scratchDirPath, { recursive: true, force: true });
	console.log(`\nrosetta-login-polish: ${passedCount} passed, ${failedCount} failed`);
	process.exit(failedCount === 0 ? 0 : 1);
};

// #8 and the page's words: the browser modules as they are, by file URL; then the store work
const pageChecks = (afterPage) => {
	const blocksPath = path.join(htmlPath, 'components', 'rosetta', 'rosettaReportBlocks.js');
	const vocabularyPath = path.join(htmlPath, 'components', 'rosetta', 'rosettaVocabulary.js');
	Promise.all([import(pathToFileURL(blocksPath).href), import(pathToFileURL(vocabularyPath).href)]).then(([blocks, vocabulary]) => {
		const words = vocabulary.rosettaPageWords;
		console.log('\n#5 words: the page');
		const pageTextByName = {
			...Object.fromEntries(Object.entries(words.endedTextByStatus).map(([statusName, text]) => [`endedTextByStatus.${statusName}`, text])),
			...Object.fromEntries(Object.entries(words.stopReasonWordsByName).map(([reasonName, text]) => [`stopReasonWordsByName.${reasonName}`, text])),
			...Object.fromEntries(Object.entries(words.jobStatusWordsByStatus || {}).map(([statusName, text]) => [`jobStatusWordsByStatus.${statusName}`, text])),
			jobStatusOtherText: words.jobStatusOtherText,
			stopReasonUnwordedText: words.stopReasonUnwordedText,
			endedOtherText: words.endedOtherText,
			ladderNothingPastedText: words.ladderNothingPastedText,
			ladderJsonNullText: words.ladderJsonNullText,
			requestFailedTemplate: words.requestFailedTemplate,
		};
		ok('every end and refusal word the page owns is a sentence', faultListOf(pageTextByName).length === 0, JSON.stringify(faultListOf(pageTextByName)));
		const endedCaseList = [
			{ status: 'cancelled', stopReasonName: 'cancelledByOwner', stopReasonText: reasonWords ? reasonWords.reasonTextByName.cancelledByOwner : 'the owner cancelled this job' },
			{ status: 'cancelled', stopReasonName: 'cancelledByOwner', stopReasonText: null },
			{ status: 'stopped', stopReasonName: 'somethingNew', stopReasonText: null },
			{ status: 'somethingElse' },
			{ status: 'vendorStopped', stopReasonName: 'judgeNoAnswer', stopReasonText: vendorReasonByName.judgeNoAnswer },
		];
		const endedTextList = endedCaseList.map((jobStatus) => blocks.progressOf({ jobStatus, busyStepName: '', isStatusCheckFailed: false }).endedText);
		ok('every end the page says is sentences, with no status or reason name', endedTextList.every((endedText) => sentenceFaultOf(endedText) === '' && !/cancelledByOwner|somethingNew|somethingElse|judgeNoAnswer/.test(endedText)), JSON.stringify(endedTextList));
		ok('the Job tab\'s status line says the status in words, never its name', typeof blocks.jobStatusLineOf === 'function' && endedCaseList.every((jobStatus) => {
			const lineText = blocks.jobStatusLineOf(jobStatus);
			return sentenceFaultOf(lineText) === '' && !/cancelledByOwner|somethingNew|somethingElse|judgeNoAnswer|vendorStopped/.test(lineText);
		}));
		// the live run found one more: a unit the cancel left unjudged said "The service says: cancelledByOwner" in its block and "notJudged: cancelledByOwner" in the summary
		const cancelledReport = { job: { stopReasonName: 'cancelledByOwner', stopReasonText: reasonWords ? reasonWords.reasonTextByName.cancelledByOwner : 'the owner cancelled this job' }, fieldList: [{ requestName: 'x', resultList: [{ hub: 'CEDS', status: 'notJudged', notJudgedReason: 'cancelledByOwner' }, { hub: 'CTDL', status: 'notJudged', notJudgedReason: 'jobStillOpen' }, { hub: 'Other', status: 'judgeRefused', notJudgedReason: 'answerRefused' }] }] };
		// whyText is what the page shows (it joins the two with a space; the live run showed a template's own space condensed away)
		const unjudgedTextList = blocks.fieldBlockListOf({ report: cancelledReport, expressionByMeaningUri: {} })[0].hubBlockList.map((oneHubBlock) => oneHubBlock.whyText);
		ok('an unjudged unit\'s block says why in sentences, never by the reason\'s name', unjudgedTextList.every((oneText) => sentenceFaultOf(oneText) === '' && !/cancelledByOwner|jobStillOpen|answerRefused/.test(oneText)) && /asked for it to stop/.test(unjudgedTextList[0]), JSON.stringify(unjudgedTextList));
		const summaryCellList = typeof blocks.summaryResultTextOf === 'function' ? cancelledReport.fieldList[0].resultList.map(blocks.summaryResultTextOf) : [];
		ok('the summary table\'s cells say the same, never a status or reason name', summaryCellList.length === 3 && summaryCellList.every((oneText) => sentenceFaultOf(oneText) === '' && !/notJudged|judgeRefused|cancelledByOwner|answerRefused/.test(oneText)), JSON.stringify(summaryCellList));
		// ⟪review S4⟫ a cancel that lands while the last unit is out: the job ends done and keeps the stored cancel name and words; a finished job says Finished, only
		const doneAfterCancel = { status: 'done', stopReasonName: 'cancelledByOwner', stopReasonText: reasonWords ? reasonWords.reasonTextByName.cancelledByOwner : 'x' };
		ok('a finished job carries no cancel words, though a cancel was stored on it', typeof blocks.jobStatusLineOf === 'function' && blocks.jobStatusLineOf(doneAfterCancel) === words.jobStatusWordsByStatus.done, typeof blocks.jobStatusLineOf === 'function' ? blocks.jobStatusLineOf(doneAfterCancel) : 'no jobStatusLineOf');
		// ⟪review N4⟫ "still running" only while the job is open: a stopped job whose call row stayed inFlight says billed alone
		ok('a job that has ended never says a judge call is still running', typeof blocks.spendLineOf === 'function' && !/still running/.test(blocks.spendLineOf({ status: 'stopped', estimateUsd: 0.4, billedUsd: 0.1, inFlightUsd: 0.2, inFlightCallCount: 1 })) && /still running/.test(blocks.spendLineOf({ status: 'running', estimateUsd: 0.4, billedUsd: 0.1, inFlightUsd: 0.2, inFlightCallCount: 1 })));
		// ⟪review N1⟫ the summary cell's divider is the vocabulary's
		ok('the summary cell joins strength and meaning with the vocabulary\'s divider', typeof blocks.summaryResultTextOf === 'function' && words.summaryResultDivider !== undefined && blocks.summaryResultTextOf({ proposal: { category: 'strong', label: 'Birth Date' } }) === `${words.strengthByCategory.strong.words}${words.summaryResultDivider}Birth Date`);
		// an inline divider equal to the vocabulary's would read the same, so the source is read: no word or divider typed between two slots in a template
		const blocksSourceText = fs.readFileSync(blocksPath, 'utf8');
		ok('the blocks type no divider between two slots of a template', !/\}[^`$}]+\$\{/.test(blocksSourceText.split('\n').filter((lineText) => !lineText.trim().startsWith('//')).join('\n')), (blocksSourceText.match(/.*\}[^`$}]+\$\{.*/) || [''])[0].trim());
		const pageText = fs.readFileSync(path.join(htmlPath, 'pages', 'explore', 'rosetta.vue'), 'utf8');
		const templateText = pageText.slice(pageText.indexOf('<template>'), pageText.lastIndexOf('</template>'));
		ok('the refusal alert shows the reason and not the refusal\'s name', /\{\{ store\.refusal\.reason \}\}/.test(templateText) && !/refusal\.refusalName/.test(templateText));
		ok('the page prints no stop reason name and no raw status', !/stopReasonName/.test(templateText) && !/\{\{ store\.jobStatus\.status \}\}/.test(templateText));

		console.log('\n#8 the no-proposal block\'s Why');
		const noProposalMatch = templateText.match(/<dl v-else class="rosettaFacts" data-testid="rosetta-no-proposal">([\s\S]*?)<\/dl>/);
		ok('the no-proposal block has a Why label, from the vocabulary, before its reason', Boolean(noProposalMatch) && /<dt[^>]*>\{\{ rosettaPageWords\.reportNoProposalReasonLabel \}\}<\/dt>\s*<dd[^>]*data-testid="rosetta-no-proposal-reason">\{\{ oneHubBlock\.whyText \}\}<\/dd>/.test(noProposalMatch[1]), noProposalMatch ? noProposalMatch[1] : 'no block');
		ok('and it says Why', words.reportNoProposalReasonLabel === 'Why');
		ok('like a proposal block, it opens on the Meaning label', Boolean(noProposalMatch) && /^\s*<dt>\{\{ rosettaPageWords\.reportMeaningLabel \}\}<\/dt>/.test(noProposalMatch[1]));
		afterPage(blocks);
	}).catch((importError) => {
		ok('the page modules load', false, importError.stack);
		finish();
	});
};

pageChecks((blocks) => createStrangerVectorStore({ storeFilePath: path.join(scratchDirPath, 'rosettaJobs.sqlite'), maxRows: 10, retentionDays: 30, nowDate: () => new Date(currentMs), xLog }, (openError, vectorStore) => {
	ok('the store opens', !openError, openError);
	createRosettaJobStore({ storeHandle: vectorStore.storeHandle, nowMs, xLog }, (jobStoreError, jobStore) => {
		ok('the job store opens', !jobStoreError, jobStoreError);
		const jobService = createRosettaJobService({ jobStore, judgeEngine: null, judgeAbsentReason: 'none in this test', judgedValues: { jobServiceMaxInFlight: 4, anonymousJobServiceMaxInFlight: 4, jobServiceBusyRetrySeconds: 1 }, visitorSecret: 'polishSecret', parserLimitValues: PARSER_LIMIT_VALUES, hubRowListFor: () => [], judgedTokensSpentToday: (done) => done('', 0), tickRunner() {}, nowMs });
		jobStore.addJob(jobFor(SPEND_JOB_REF_ID), (addError) => {
			ok('a job to spend on', !addError, addError);
			const callRefIdByUnitIndex = {};
			const statusList = [];
			const runStep = (stepIndex) => {
				if (stepIndex >= SPEND_STEP_LIST.length) {
					afterSpend(statusList);
					return;
				}
				const [stepKind, unitIndex, usd] = SPEND_STEP_LIST[stepIndex];
				currentMs += 1000;
				const readStatus = () => jobService.status({ principal: OWNER, input: { jobRefId: SPEND_JOB_REF_ID } }, (statusError, statusReply) => {
					if (statusError) {
						ok(`status answers at step ${stepIndex}`, false, statusError);
						finish();
						return;
					}
					statusList.push(statusReply.answer);
					runStep(stepIndex + 1);
				});
				if (stepKind === 'add') {
					jobStore.addJudgeCall({ jobRefId: SPEND_JOB_REF_ID, ownerPrincipalRefId: OWNER.userRefId, fieldIndex: unitIndex % 4, hubName: unitIndex < 4 ? 'CEDS' : 'CTDL', estimateUsd: usd, wireModel: 'testModel' }, (callError, callRefId) => {
						callRefIdByUnitIndex[unitIndex] = callRefId;
						readStatus();
					});
					return;
				}
				jobStore.finishJudgeCall({ callRefId: callRefIdByUnitIndex[unitIndex], callStatus: 'answered', usd, inputTokens: 100, outputTokens: 10 }, () => readStatus());
			};
			runStep(0);
		});
		const afterSpend = (statusList) => {
			const spentList = statusList.map((oneStatus) => oneStatus.spentUsd);
			const isNeverFalling = (numberList) => numberList.every((oneNumber, numberIndex) => numberIndex === 0 || oneNumber >= numberList[numberIndex - 1]);
			ok('the fault reproduces: spentUsd falls when a bill comes in under its estimate (the QA walk\'s backwards money)', !isNeverFalling(spentList), JSON.stringify(spentList));
			ok('spentUsd is in the answer as it was (an answer shape changes only by added fields)', statusList.every((oneStatus) => typeof oneStatus.spentUsd === 'number'));
			const billedList = statusList.map((oneStatus) => oneStatus.billedUsd);
			ok('the status answer adds billedUsd, inFlightUsd and inFlightCallCount', statusList.every((oneStatus) => typeof oneStatus.billedUsd === 'number' && typeof oneStatus.inFlightUsd === 'number' && Number.isInteger(oneStatus.inFlightCallCount)), JSON.stringify(statusList[0]));
			ok('billedUsd never falls, across every correction', billedList.every((oneNumber) => typeof oneNumber === 'number') && isNeverFalling(billedList), JSON.stringify(billedList));
			ok('billed and in flight add up to spent, every time', statusList.every((oneStatus) => Math.abs(oneStatus.billedUsd + oneStatus.inFlightUsd - oneStatus.spentUsd) < 0.00015), JSON.stringify(statusList.map((oneStatus) => [oneStatus.billedUsd, oneStatus.inFlightUsd, oneStatus.spentUsd])));
			ok('at the end nothing is in flight and billed is the bills\' sum', statusList[statusList.length - 1].inFlightCallCount === 0 && Math.abs(statusList[statusList.length - 1].billedUsd - 0.1061) < 0.00005, JSON.stringify(statusList[statusList.length - 1]));
			// the figure a person sees: the first dollar figure after the estimate in spendLineOf's line, every step
			const shownLineList = typeof blocks.spendLineOf === 'function' ? statusList.map((oneStatus) => blocks.spendLineOf({ ...oneStatus, estimateUsd: 0.4 })) : [];
			const shownSpentList = shownLineList.map((lineText) => Number((lineText.match(/\$([0-9.]+)/g) || [])[1]?.slice(1)));
			ok('the spent figure the page shows never decreases, across every correction', shownLineList.length === statusList.length && shownSpentList.every((oneNumber) => Number.isFinite(oneNumber)) && isNeverFalling(shownSpentList), JSON.stringify(shownLineList));
			ok('while calls are out the page says "up to" what they may cost, apart', shownLineList.some((lineText) => /up to \$/.test(lineText)) && /up to/.test(shownLineList[0]) && !/up to/.test(shownLineList[shownLineList.length - 1]), JSON.stringify(shownLineList));
			ok('an answer without billedUsd (a service from before) shows the estimate alone, never a figure that can fall', typeof blocks.spendLineOf === 'function' && !/\$0\.2/.test(blocks.spendLineOf({ estimateUsd: 0.4, spentUsd: 0.2087 })));
			cancelChecks();
		};
		// #5 the cancel path: a queued job cancelled is stopped at once by the store, and its reason now has words too
		const cancelChecks = () => jobStore.addJob(jobFor(CANCEL_JOB_REF_ID), () => jobService.cancel({ principal: OWNER, input: { jobRefId: CANCEL_JOB_REF_ID } }, (cancelError, cancelReply) => {
			ok('a queued job cancels', !cancelError && cancelReply.answer.status === 'cancelled', cancelError || JSON.stringify(cancelReply));
			ok('the cancel note is a sentence', sentenceFaultOf(cancelReply.answer.cancelNote) === '', cancelReply.answer.cancelNote);
			jobService.status({ principal: OWNER, input: { jobRefId: CANCEL_JOB_REF_ID } }, (statusError, statusReply) => {
				const cancelledStatus = statusReply.answer;
				ok('the cancelled job keeps its reason name for a program', cancelledStatus.stopReasonName === 'cancelledByOwner');
				ok('and gives its reason in words, a sentence', sentenceFaultOf(cancelledStatus.stopReasonText) === '', cancelledStatus.stopReasonText);
				const endedText = blocks.progressOf({ jobStatus: cancelledStatus, busyStepName: '', isStatusCheckFailed: false }).endedText;
				ok('what the page says of it is sentences, with no name in brackets', sentenceFaultOf(endedText) === '' && !/\(/.test(endedText), endedText);
				jobService.cancel({ principal: OWNER, input: { jobRefId: CANCEL_JOB_REF_ID } }, (againError, againReply) => {
					ok('cancelling it again is refused by name, in a sentence that names no status', againReply.answer.refusalName === 'jobNotOpen' && sentenceFaultOf(againReply.answer.reason) === '' && againReply.answer.status === 'cancelled', JSON.stringify(againReply.answer));
					ok('the module that gives the words refuses a reason it does not hold, by name', reasonWordsModule !== null && (() => {
						try { reasonWordsModule.reasonOf('noSuchReason'); } catch (thrown) { return /no reason is named noSuchReason/.test(thrown.message); }
						return false;
					})());
					vectorStore.close(finish);
				});
			});
		}));
	});
}));
