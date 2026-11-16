'use strict';
// rosetta-report-legible.test.js — WORKORDER-rosettaReportLegible-111026 gate 1 (and TQ's addendum 2b, and his correction to item 3). No server, no graph, no model.
// The browser modules run here as they are: html/components/rosetta/rosettaReportBlocks.js is imported from its own file, and html/stores/rosettaStore.js runs in the
// real Pinia with its imports pointed at doubles (axios records every request and answers by route; the login store gives no token).
//   1. THE REPORT, FIELD BY FIELD: each block carries the meaning's name, its slots with hub ids and URIs, the meaning's URI and its Meanings link, the strength and
//      the relation in words, the judge's rationale as plain text, and the expressed-in count read from the Meanings answer.
//   2. NO PROPOSAL: an abstained, not-judged or no-candidate unit says why, in words.
//   3. PROGRESS: shown while the job's status is open, with its state; absent once it ends; a cancelled or stopped job says so.
//   4. COMPLETION (addendum 2b): when a job ends done the report is marked unseen, the page has words for it, and opening the Report tab clears the mark.
//   5. THE BUTTON (TQ's correction): JSON keeps the first wording; text the page read for review reads "Submit the Request"; Undo returns the first wording.
//   6. THE EXPRESSED-IN READ: one Meanings request per distinct proposed meaning, by the walk's own meaning id, at most rosettaPageSettings' limit a page; the tuple's
//      slot list is the Meanings panel's own (explorerVocabulary.meaningTupleSlotListOf), whose output equals MeaningSection's at the pinned base, byte for byte.
//   ⟪review round 1⟫ B1 a reason name with no text is said, never thrown; S1 the open tab is remembered; S2 a failed status check stops claiming progress and can be
//      retried; S3 a failed count is asked again; S4 the AI reading text and a job being sent are said apart; N2 an HTML error is said by its status; N3 the link
//      only where something maps; N7 only https becomes a link.
// ROSETTA_LEGIBLE_HTML_PATH=<another tree's html dir> runs the same gates there (the pinned base, to watch them fail).
// Run: /Users/tqwhite/.local/node/bin/node server/test/rosetta-report-legible.test.js

const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const { execFileSync } = require('child_process');

const htmlPath = process.env.ROSETTA_LEGIBLE_HTML_PATH || path.join(__dirname, '..', '..', 'html');
const blocksFilePath = path.join(htmlPath, 'components', 'rosetta', 'rosettaReportBlocks.js');
const storeFilePath = path.join(htmlPath, 'stores', 'rosettaStore.js');
const NEIGHBOURHOOD_URL = '/api/standards-neighbourhood';
const ROSETTA_ROUTE_BASE_PATH = '/api/standards/v1/rosetta/';

let passedCount = 0;
let failedCount = 0;
const ok = (testName, condition, detailText) => {
	if (condition) { passedCount += 1; console.log(`  PASS: ${testName}`); return; }
	failedCount += 1;
	console.log(`  FAIL: ${testName}${detailText ? ` — ${String(detailText).slice(0, 600)}` : ''}`);
};
const finish = () => {
	console.log(`\nrosetta-report-legible: ${passedCount} passed, ${failedCount} failed`);
	process.exit(failedCount === 0 ? 0 : 1);
};

if (!fs.existsSync(blocksFilePath)) {
	ok('the report blocks module exists (html/components/rosetta/rosettaReportBlocks.js)', false, `${blocksFilePath} is absent`);
	finish();
}

const scratchDirPath = fs.mkdtempSync(path.join(os.tmpdir(), 'rosettaReportLegible-'));
const writeModule = (fileName, sourceText) => {
	const filePath = path.join(scratchDirPath, fileName);
	fs.writeFileSync(filePath, sourceText);
	return pathToFileURL(filePath).href;
};
const rewriteOnce = (sourceText, findText, replaceText) => {
	const matchCount = sourceText.split(findText).length - 1;
	if (matchCount !== 1) {
		throw new Error(`rosetta-report-legible.test: '${findText}' occurs ${matchCount} times in rosettaStore.js; the test rewrites it exactly once`);
	}
	return sourceText.replace(findText, () => replaceText);
};

const blocksUrl = pathToFileURL(blocksFilePath).href;
const settingsUrl = pathToFileURL(path.join(htmlPath, 'components', 'rosetta', 'rosettaPageSettings.js')).href;
const explorerUrl = pathToFileURL(path.join(htmlPath, 'components', 'standardsExplorer', 'explorerVocabulary.js')).href;
// the branch base, pinned: the Meanings panel's slot list as it was computed before it was shared
const MEANING_SECTION_BASE_COMMIT = '4b869fe';
const vocabularyUrl = pathToFileURL(path.join(htmlPath, 'components', 'rosetta', 'rosettaVocabulary.js')).href;
const ladderUrl = pathToFileURL(path.join(htmlPath, 'stores', 'rosettaFreeText.js')).href;
const piniaUrl = pathToFileURL(path.join(htmlPath, 'node_modules', 'pinia', 'dist', 'pinia.mjs')).href;
const axiosDoubleUrl = writeModule('axiosDouble.mjs', 'export default { post: (url, body, options) => globalThis.legibleAxiosDouble.answer("post", url, body), get: (url, options) => globalThis.legibleAxiosDouble.answer("get", url, options) };\n');
const loginDoubleUrl = writeModule('loginStoreDouble.mjs', 'export const useLoginStore = () => ({ getAuthTokenProperty: {} });\n');
const storeUrl = (() => {
	let storeText = fs.readFileSync(storeFilePath, 'utf8');
	storeText = rewriteOnce(storeText, "import axios from 'axios';", `import { defineStore } from '${piniaUrl}';\nimport axios from '${axiosDoubleUrl}';`);
	storeText = rewriteOnce(storeText, "from '@/stores/loginStore';", `from '${loginDoubleUrl}';`);
	storeText = rewriteOnce(storeText, "from '@/stores/rosettaFreeText';", `from '${ladderUrl}';`);
	storeText = rewriteOnce(storeText, "from '@/components/rosetta/rosettaVocabulary';", `from '${vocabularyUrl}';`);
	storeText = rewriteOnce(storeText, "from '@/components/rosetta/rosettaReportBlocks';", `from '${blocksUrl}';`);
	return writeModule('rosettaStore.mjs', storeText);
})();

// the double answers by route (the Rosetta route less its base, or the Meanings answer's own URL); every request is kept
globalThis.legibleAxiosDouble = {
	requestList: [],
	answerByRoute: {},
	answer(methodName, url, body) {
		this.requestList.push({ methodName, url, body });
		const routeName = url.startsWith(ROSETTA_ROUTE_BASE_PATH) ? url.slice(ROSETTA_ROUTE_BASE_PATH.length) : url;
		const scripted = this.answerByRoute[routeName];
		if (!scripted) {
			return Promise.reject(new Error(`the double has no answer for ${url}`));
		}
		const data = typeof scripted.data === 'function' ? scripted.data(body) : scripted.data;
		if (scripted.refusalWithStatus) {
			return Promise.reject({ response: scripted.refusalWithStatus, message: 'refused' });
		}
		return scripted.refusal ? Promise.reject({ response: { data: scripted.refusal }, message: 'refused' }) : Promise.resolve({ data });
	},
	reset(answerByRoute) {
		this.requestList = [];
		this.answerByRoute = answerByRoute;
	},
};

// ---- the fixture: an audit fetch answer as the service gives it (shape from runs/rosettaMeanings/live/signedIn_fetch.json), three fields against two hubs
const HOSTILE_RATIONALE = 'It matches <img src=x onerror="alert(1)"> & "accessibility" <b>features</b>.';
const ACCESSIBILITY_MEANING_URI = 'https://w3id.org/EDUcore/CEDStandards/hub/14.0.0.0/aaaa000000000000000000000000000000000000000000000000000000000001';
const STAFF_MEANING_URI = 'https://w3id.org/EDUcore/CEDStandards/hub/14.0.0.0/bbbb000000000000000000000000000000000000000000000000000000000002';
const reportFixture = {
	jobRefId: 'job-legible-1',
	status: 'done',
	job: { hubList: ['CEDS', 'CTDL'] },
	fieldList: [
		{
			requestName: 'accessibilityFeature',
			requestDefinition: 'a feature that makes content usable by people with disabilities',
			resultList: [
				{
					hub: 'CEDS',
					status: 'proposed',
					proposal: {
						uri: ACCESSIBILITY_MEANING_URI,
						label: 'Accessibility Feature',
						tuple: {
							domain: { kind: 'class', nativeId: { cedsId: 'C200291' }, label: 'Learning Resource', uri: 'https://w3id.org/EDUcore/CEDS/14.0.0.0/ceds:C200291' },
							property: { kind: 'property', nativeId: { cedsId: 'P001572' }, label: 'Learning Resource Accessibility Feature', uri: 'https://w3id.org/EDUcore/CEDS/14.0.0.0/ceds:P001572' },
						},
						predicate: 'closeMatch',
						category: 'strong',
						confidence: 0.9,
					},
					judgesRationale: HOSTILE_RATIONALE,
				},
				{ hub: 'CTDL', status: 'abstained', judgesRationale: 'None of the CTDL meanings shown names an accessibility feature of content.' },
			],
		},
		{
			requestName: 'staffID',
			requestDefinition: 'the identifier a district gives a staff member',
			resultList: [
				{
					hub: 'CEDS',
					status: 'proposed',
					proposal: {
						uri: STAFF_MEANING_URI,
						label: 'Staff Member Identifier',
						tuple: {
							domain: { kind: 'class', nativeId: { cedsId: 'C200110' }, label: 'K12 Staff', uri: 'https://w3id.org/EDUcore/CEDS/14.0.0.0/ceds:C200110' },
							property: { kind: 'property', nativeIdAbsentName: 'hubElementCarriesNoNativeIdentifier', label: 'Staff Member Identifier', uriAbsentReason: 'notInManifestStore' },
						},
						predicate: 'broadMatch',
						category: 'moderate',
						confidence: 0.7,
					},
					judgesRationale: 'A staff identifier, of which a district-assigned one is one kind.',
				},
				{ hub: 'CTDL', status: 'noCandidate' },
			],
		},
		{
			requestName: 'favoriteColour',
			resultList: [
				{ hub: 'CEDS', status: 'notJudged', notJudgedReason: 'jobStillOpen' },
				{ hub: 'CTDL', status: 'proposed', proposal: { uri: ACCESSIBILITY_MEANING_URI, label: 'Accessibility Feature', tupleAbsentName: 'hubCardNotFound', category: 'weakButReal', confidence: 0.5 }, judgesRationale: 'Loosely.' },
			],
		},
	],
	counts: { byHub: { CEDS: { proposedStrong: 1, proposedModerate: 1, notJudged: 1 }, CTDL: { abstained: 1, noCandidate: 1, proposedWeak: 1 } } },
	draftNote: 'a draft',
};
// the Meanings answer for a meaning, as standards-neighbourhood answers it (node.expressionCount)
const neighbourhoodAnswerOf = (requestBody) => [{ node: { stableId: requestBody.stableId, kind: 'meaning', expressionCount: requestBody.stableId.endsWith('1') ? 7 : 0 }, ancestorList: [], childGroupList: [], mappingList: [] }];

Promise.all([import(blocksUrl), import(vocabularyUrl), import(piniaUrl), import(storeUrl), import(settingsUrl), import(explorerUrl)]).then(([blocks, vocabulary, pinia, { useRosettaStore }, settings, explorer]) => {
	const words = vocabulary.rosettaPageWords;
	const expressionByMeaningUri = { [ACCESSIBILITY_MEANING_URI]: { expressionCount: 7 }, [STAFF_MEANING_URI]: { expressionCount: 0 } };
	const fieldBlockList = blocks.fieldBlockListOf({ report: reportFixture, expressionByMeaningUri });

	// ---- 1. the report, field by field
	console.log('- 1. a proposal says what happened');
	const accessibilityBlock = fieldBlockList[0];
	const cedsBlock = accessibilityBlock.hubBlockList[0];
	ok('one block per field, in the order sent, each with its own name and definition', fieldBlockList.length === 3 && accessibilityBlock.requestName === 'accessibilityFeature' && accessibilityBlock.definitionText === 'a feature that makes content usable by people with disabilities');
	ok('a field sent with no description says so', fieldBlockList[2].definitionText === words.reportFieldDefinitionAbsentText);
	ok('one hub block per hub, naming its hub', accessibilityBlock.hubBlockList.map((oneBlock) => oneBlock.hubName).join() === 'CEDS,CTDL' && cedsBlock.hubHeadingText === 'Against CEDS');
	ok('the meaning\'s name', cedsBlock.hasProposal === true && cedsBlock.meaningName === 'Accessibility Feature');
	ok('the meaning\'s own EDUcore URI', cedsBlock.meaningUri === ACCESSIBILITY_MEANING_URI);
	ok('an Open in Meanings link at that meaning (the Meanings explorer\'s own link)', cedsBlock.meaningsLink.path === '/explore/meanings' && cedsBlock.meaningsLink.query.path === `meanings:all,meaning:${ACCESSIBILITY_MEANING_URI}`, JSON.stringify(cedsBlock.meaningsLink));
	ok('the meaning\'s hub ids together: CEDS C200291 · P001572', cedsBlock.hubIdsText === 'CEDS C200291 · P001572', cedsBlock.hubIdsText);
	const [domainSlot, propertySlot] = cedsBlock.slotList;
	ok('each slot in the service\'s order, named in words', cedsBlock.slotList.map((oneSlot) => oneSlot.slotLabel).join() === 'Domain,Property');
	ok('each slot carries its hub label', domainSlot.label === 'Learning Resource' && propertySlot.label === 'Learning Resource Accessibility Feature');
	ok('each slot carries its hub id', domainSlot.detailText === 'class · CEDS id C200291' && propertySlot.detailText === 'property · CEDS id P001572', `${domainSlot.detailText} | ${propertySlot.detailText}`);
	ok('each slot carries its EDUcore URI', domainSlot.uri === 'https://w3id.org/EDUcore/CEDS/14.0.0.0/ceds:C200291' && propertySlot.uri === 'https://w3id.org/EDUcore/CEDS/14.0.0.0/ceds:P001572');
	ok('the strength in words, with what it means', cedsBlock.strengthWords === 'Strong' && cedsBlock.strengthExplanation === words.strengthByCategory.strong.explanation);
	ok('the relation in words, and which way', cedsBlock.relationText === words.relationByPredicate.closeMatch);
	ok('a broad match says the meaning is the broader', fieldBlockList[1].hubBlockList[0].relationText.startsWith('Broad match: this meaning is broader than your field'));
	ok('the judge\'s rationale as it came, plain text (the page shows it by {{ }}, which escapes it)', cedsBlock.rationaleText === HOSTILE_RATIONALE);
	ok('how it links into the graph: the count of other standards\' elements, from the Meanings answer', cedsBlock.expressedText === '7 elements of other standards already map to this meaning.', cedsBlock.expressedText);
	ok('a meaning nothing maps to says so', fieldBlockList[1].hubBlockList[0].expressedText === words.reportExpressedNoneText);
	ok('N3: the See them link stands only where something maps', cedsBlock.showsExpressedLink === true && fieldBlockList[1].hubBlockList[0].showsExpressedLink === false);
	ok('S3: a failed read offers a retry; a count does not', (() => {
		const failedBlock = blocks.fieldBlockListOf({ report: reportFixture, expressionByMeaningUri: { [ACCESSIBILITY_MEANING_URI]: { unreadReason: 'x' } } })[0].hubBlockList[0];
		return failedBlock.expressedReadFailed === true && failedBlock.showsExpressedLink === false && cedsBlock.expressedReadFailed === false;
	})());
	ok('N7: only an https URI becomes a link', cedsBlock.meaningHref === ACCESSIBILITY_MEANING_URI && blocks.fieldBlockListOf({ report: { ...reportFixture, fieldList: [{ requestName: 'x', resultList: [{ hub: 'CEDS', proposal: { uri: 'javascript:alert(1)', label: 'L', tuple: { domain: { kind: 'class', label: 'D', uri: 'javascript:alert(2)' } }, category: 'strong' } }] }] }, expressionByMeaningUri: {} })[0].hubBlockList[0].meaningHref === '' && blocks.fieldBlockListOf({ report: { ...reportFixture, fieldList: [{ requestName: 'x', resultList: [{ hub: 'CEDS', proposal: { uri: 'javascript:alert(1)', label: 'L', tuple: { domain: { kind: 'class', label: 'D', uri: 'javascript:alert(2)' } }, category: 'strong' } }] }] }, expressionByMeaningUri: {} })[0].hubBlockList[0].slotList[0].href === '');

	ok('a meaning whose read has not come back says it is reading', blocks.fieldBlockListOf({ report: reportFixture, expressionByMeaningUri: {} })[0].hubBlockList[0].expressedText === words.reportExpressedReadingText);
	ok('a meaning whose read failed says why, by the reason', blocks.fieldBlockListOf({ report: reportFixture, expressionByMeaningUri: { [ACCESSIBILITY_MEANING_URI]: { unreadReason: 'the server is down' } } })[0].hubBlockList[0].expressedText === 'How it links into the graph could not be read: the server is down');
	const staffPropertySlot = fieldBlockList[1].hubBlockList[0].slotList[1];
	ok('a slot with no URI and no id says so in words, never blank and never by the server name (explorerTidy review S4)', !staffPropertySlot.uri && staffPropertySlot.uriAbsentText === 'no URI (not in a published EDUcore release yet)' && staffPropertySlot.detailText === 'property', JSON.stringify(staffPropertySlot));
	ok('a proposal with no tuple names why', fieldBlockList[2].hubBlockList[1].tupleAbsentText === 'Its parts could not be named. The live graph does not hold this card.' && fieldBlockList[2].hubBlockList[1].slotList.length === 0);
	ok('the hub ids of a tuple with no ids say nothing rather than a bare hub name', fieldBlockList[2].hubBlockList[1].hubIdsText === '');

	// ---- 2. no proposal says why
	console.log('- 2. an abstention or refusal says why');
	const abstainedBlock = accessibilityBlock.hubBlockList[1];
	ok('an abstained unit: no meaning, the reason in words, and the judge\'s own words', abstainedBlock.hasProposal === false && abstainedBlock.statusText === words.noProposalTextByStatus.abstained && abstainedBlock.rationaleText === 'None of the CTDL meanings shown names an accessibility feature of content.');
	ok('no candidate: its reason in words', fieldBlockList[1].hubBlockList[1].statusText === words.noProposalTextByStatus.noCandidate && fieldBlockList[1].hubBlockList[1].rationaleText === '');
	// ⟪rosettaLoginPolish #5⟫ notJudgedReason is a machine name: never shown; the job's own stop is said in the job's words instead
	ok('not judged: its reason in words, and never the service\'s reason name', fieldBlockList[2].hubBlockList[0].statusText === words.noProposalTextByStatus.notJudged && fieldBlockList[2].hubBlockList[0].notJudgedReasonText === '');
	ok('not judged because the job stopped: the job\'s reason, in its words', blocks.fieldBlockListOf({ report: { ...reportFixture, job: { ...reportFixture.job, stopReasonName: 'cancelledByOwner', stopReasonText: 'Whoever sent it, or holds its link, asked for it to stop.' }, fieldList: [{ requestName: 'x', resultList: [{ hub: 'CEDS', status: 'notJudged', notJudgedReason: 'cancelledByOwner' }] }] }, expressionByMeaningUri: {} })[0].hubBlockList[0].notJudgedReasonText === 'The job ended first. Whoever sent it, or holds its link, asked for it to stop.');
	ok('a status the vocabulary does not know is said to have no words, never by its name, never silently', blocks.fieldBlockListOf({ report: { ...reportFixture, fieldList: [{ requestName: 'x', resultList: [{ hub: 'CEDS', status: 'somethingNew' }] }] }, expressionByMeaningUri: {} })[0].hubBlockList[0].statusText === words.noProposalOtherText);
	ok('a strength and a relation the vocabulary does not know are said by their names', (() => {
		const oddBlock = blocks.fieldBlockListOf({ report: { ...reportFixture, fieldList: [{ requestName: 'x', resultList: [{ hub: 'CEDS', proposal: { uri: STAFF_MEANING_URI, label: 'L', tuple: {}, category: 'superb', predicate: 'sortOfMatch' } }] }] }, expressionByMeaningUri: {} })[0].hubBlockList[0];
		return oddBlock.strengthWords === 'superb' && oddBlock.strengthExplanation === 'The judge named this strength superb.' && oddBlock.relationText === 'The judge named this relation sortOfMatch.';
	})());
	ok('a proposal with no relation says none was asked', fieldBlockList[2].hubBlockList[1].relationText === words.relationAbsentText);
	ok('the summary counts, per hub, in words', JSON.stringify(blocks.countLineListOf(reportFixture.counts)) === JSON.stringify(['CEDS: strong 1, moderate 1, not judged 1', 'CTDL: no meaning found 1, nothing close enough 1, weak but real 1']), JSON.stringify(blocks.countLineListOf(reportFixture.counts)));
	ok('the Meanings answers a page asks are capped by the page settings; the rest say the limit', (() => {
		const uriList = Array.from({ length: settings.rosettaPageSettings.meaningReadsPerPageLimit + 3 }, (unusedItem, uriIndex) => `u${uriIndex}`);
		const plan = blocks.meaningReadPlanOf(uriList);
		return plan.readMeaningUriList.length === settings.rosettaPageSettings.meaningReadsPerPageLimit && plan.unreadMeaningUriList.length === 3 && plan.overLimitReason.includes(String(settings.rosettaPageSettings.meaningReadsPerPageLimit));
	})());
	// ⟪ROMANTIC_PARASOL⟫ the slot list is the Meanings panel's own, extracted: its output is the base's MeaningSection computation's, byte for byte
	ok('the shared slot list answers what MeaningSection computed at the pinned base, byte for byte', (() => {
		const baseSectionText = execFileSync('git', ['show', `${MEANING_SECTION_BASE_COMMIT}:html/components/standardsExplorer/MeaningSection.vue`], { cwd: path.join(__dirname, '..', '..'), encoding: 'utf8' });
		const baseHubIdText = baseSectionText.match(/const hubIdTextOf = (\(slotPart\) => [^\n]*);\n/)[1];
		const baseSlotListText = baseSectionText.match(/const tupleSlotList = computed\(\(\) =>\n([\s\S]*?)\n\);/)[1];
		const baseSlotListOf = new Function('props', 'sectionWords', 'wordingOf', `const hubIdTextOf = ${baseHubIdText}; return ${baseSlotListText.trim().replace(/,$/, '')};`);
		const tupleList = reportFixture.fieldList.flatMap((oneField) => oneField.resultList.filter((oneResult) => oneResult.proposal && oneResult.proposal.tuple).map((oneResult) => oneResult.proposal.tuple));
		return tupleList.length === 2 && tupleList.every((tuple) => JSON.stringify(explorer.meaningTupleSlotListOf({ tuple, hubName: 'CEDS' })) === JSON.stringify(baseSlotListOf({ meaningNode: { tuple, hubName: 'CEDS' } }, explorer.meaningsVocabulary.meaningSection, explorer.wordingOf)));
	})());
	ok('the distinct meanings a page proposes, each once', JSON.stringify(blocks.proposedMeaningUriListOf(reportFixture)) === JSON.stringify([ACCESSIBILITY_MEANING_URI, STAFF_MEANING_URI]));

	// ---- 3. progress
	console.log('- 3. progress while a job is open');
	ok('sending, before any status: shown, sending', JSON.stringify(blocks.progressOf({ jobStatus: null, busyStepName: 'submittingJob' })) === JSON.stringify({ isShown: true, progressText: words.progressSendingText, endedText: '', checkFailedText: '' }));
	ok('queued with a place: shown, with the place', blocks.progressOf({ jobStatus: { status: 'queued', position: 2 }, busyStepName: '' }).progressText === 'Waiting in the queue: place 2');
	ok('running with units: shown, n of m', JSON.stringify(blocks.progressOf({ jobStatus: { status: 'running', unitsFinished: 3, unitsTotal: 12 }, busyStepName: '' })) === JSON.stringify({ isShown: true, progressText: 'Judging: 3 of 12 finished (one is one field against one hub)', endedText: '', checkFailedText: '' }));
	ok('cancelling: shown, cancelling', blocks.progressOf({ jobStatus: { status: 'cancelling' }, busyStepName: '' }).progressText === words.progressCancellingText);
	ok('done: absent, and nothing ended badly', JSON.stringify(blocks.progressOf({ jobStatus: { status: 'done', unitsFinished: 12, unitsTotal: 12 }, busyStepName: '' })) === JSON.stringify({ isShown: false, progressText: '', endedText: '', checkFailedText: '' }));
	ok('cancelled: absent, and it says so', JSON.stringify(blocks.progressOf({ jobStatus: { status: 'cancelled' }, busyStepName: '' })) === JSON.stringify({ isShown: false, progressText: '', endedText: words.endedTextByStatus.cancelled, checkFailedText: '' }));
	// ⟪rosettaLoginPolish #5⟫ the reason's text, and never its name
	ok('stopped with a reason: absent, and it says so with the reason, not its name', blocks.progressOf({ jobStatus: { status: 'vendorStopped', stopReasonName: 'judgeNoAnswer', stopReasonText: 'The judge\'s vendor did not answer.' }, busyStepName: '' }).endedText === `${words.endedTextByStatus.vendorStopped} The judge's vendor did not answer.`);
	// ⟪review B1⟫ the server cancels a queued job with a reason name and no reason text: it is said, never thrown
	ok('B1: cancelled with a reason name and no reason text: absent, said in words, never thrown', (() => {
		const cancelledProgress = blocks.progressOf({ jobStatus: { status: 'cancelled', stopReasonName: 'cancelledByOwner', stopReasonText: null }, busyStepName: '' });
		return cancelledProgress.isShown === false && cancelledProgress.endedText === `${words.endedTextByStatus.cancelled} ${words.stopReasonWordsByName.cancelledByOwner}`;
	})());
	ok('B1: a reason name the vocabulary does not know, with no text, is said to have no words, never by its name', blocks.progressOf({ jobStatus: { status: 'stopped', stopReasonName: 'somethingNew', stopReasonText: null }, busyStepName: '' }).endedText === `${words.endedTextByStatus.stopped} ${words.stopReasonUnwordedText}`);
	// ⟪review S4⟫ the AI reading pasted text is not a job being sent
	ok('S4: while the AI reads pasted text, the indicator says so', JSON.stringify(blocks.progressOf({ jobStatus: null, busyStepName: 'interpreting' })) === JSON.stringify({ isShown: true, progressText: words.progressInterpretingText, endedText: '', checkFailedText: '' }));
	ok('S4: a job being sent is shown right away, even with a finished job before it', blocks.progressOf({ jobStatus: { status: 'done' }, busyStepName: 'submittingJob' }).progressText === words.progressSendingText);
	// ⟪review S2⟫ a status check that failed stops claiming progress and says so
	ok('S2: a failed status check: no progress claimed, the failure said', JSON.stringify(blocks.progressOf({ jobStatus: { status: 'running', unitsFinished: 1, unitsTotal: 4 }, busyStepName: '', isStatusCheckFailed: true })) === JSON.stringify({ isShown: false, progressText: '', endedText: '', checkFailedText: words.statusCheckFailedText }));
	ok('S2: a job opened by its link whose first status check fails says so too', blocks.progressOf({ jobStatus: null, busyStepName: '', isStatusCheckFailed: true }).checkFailedText === words.statusCheckFailedText);
	ok('no job at all: nothing shown', JSON.stringify(blocks.progressOf({ jobStatus: null, busyStepName: '' })) === JSON.stringify({ isShown: false, progressText: '', endedText: '', checkFailedText: '' }));

	// ---- 5. the button's words (pure half)
	console.log('- 5. the button');
	ok('no review: the first wording', blocks.askButtonWordsOf({ review: null }) === words.askDraftButton && words.askDraftButton === 'Ask for a judged draft');
	ok('a review shown: Submit the Request', blocks.askButtonWordsOf({ review: { readingKind: 'aiInterpretation' } }) === 'Submit the Request');

	// ---- the real store
	pinia.setActivePinia(pinia.createPinia());
	const store = useRosettaStore();
	const SUBMITTED_STATUS = { jobRefId: 'job-legible-1', status: 'queued', estimateUsd: 0.1, unitsFinished: 0, unitsTotal: 6, position: 1 };
	const RUNNING_STATUS = { ...SUBMITTED_STATUS, status: 'running', unitsFinished: 2, position: undefined };
	const DONE_STATUS = { ...SUBMITTED_STATUS, status: 'done', unitsFinished: 6, position: undefined };
	globalThis.legibleAxiosDouble.reset({
		jobs: { data: { answer: SUBMITTED_STATUS } },
		'jobs/status': { data: { answer: RUNNING_STATUS } },
		'jobs/fetch': { data: { answer: reportFixture } },
		'jobs/prompts': { data: { answer: { promptList: [], page: 1, pageCount: 1 } } },
		[NEIGHBOURHOOD_URL]: { data: neighbourhoodAnswerOf },
		interpret: { data: { fieldList: [{ name: 'accessibilityFeature', definition: 'a feature' }], droppedFieldCount: 0, unusedLineCount: 0 } },
	});

	// 5, through the store: JSON → first wording; lines and free text → Submit the Request; Undo → first wording
	store.pastedText = '[{"name":"accessibilityFeature","definition":"a feature that makes content usable by people with disabilities"}]';
	ok('JSON pasted: the first wording', blocks.askButtonWordsOf({ review: store.review }) === words.askDraftButton);
	store.pastedText = 'accessibilityFeature: a feature that makes content usable';
	return store.submitJob().then((linesOutcome) => {
		ok('plain lines read for review: Submit the Request', linesOutcome === 'review' && blocks.askButtonWordsOf({ review: store.review }) === 'Submit the Request');
		store.undoReview();
		ok('Undo: the first wording again', store.review === null && blocks.askButtonWordsOf({ review: store.review }) === words.askDraftButton);
		store.pastedText = 'We keep the accessibility features of each resource, and the staff member\'s district number.';
		const interpretPromise = store.submitJob();
		ok('S4: while the AI reads the text, the store says interpreting', store.busyStepName === 'interpreting', store.busyStepName);
		return interpretPromise;
	}).then((freeTextOutcome) => {
		ok('free text the AI interpreted: Submit the Request', freeTextOutcome === 'review' && blocks.askButtonWordsOf({ review: store.review }) === 'Submit the Request');
		store.undoReview();
		ok('Undo from the interpretation: the first wording again', blocks.askButtonWordsOf({ review: store.review }) === words.askDraftButton);

		// 3 and 4, through the store
		store.pastedText = '[{"name":"accessibilityFeature","definition":"a feature that makes content usable by people with disabilities"}]';
		globalThis.legibleAxiosDouble.requestList = [];
		return store.submitJob();
	}).then((sentOutcome) => {
		store.stopPolling();
		ok('a submitted job: sent', sentOutcome === 'sent');
		ok('while its status is open, the progress indicator is shown with its state', store.jobStatus.status === 'running' && blocks.progressOf({ jobStatus: store.jobStatus, busyStepName: store.busyStepName, isStatusCheckFailed: store.isStatusCheckFailed }).progressText === 'Judging: 2 of 6 finished (one is one field against one hub)', JSON.stringify(store.jobStatus));
		ok('no report is marked unseen while the job runs', store.reportUnseen === false);
		globalThis.legibleAxiosDouble.answerByRoute['jobs/status'] = { data: { answer: DONE_STATUS } };
		return store.pollJob();
	}).then(() => {
		ok('once it ends done, the indicator is absent', blocks.progressOf({ jobStatus: store.jobStatus, busyStepName: store.busyStepName, isStatusCheckFailed: store.isStatusCheckFailed }).isShown === false);
		ok('addendum 2b: a finished job marks its report unseen (the page shows the message and the tab\'s badge from this)', store.reportUnseen === true && store.report !== null);
		const neighbourhoodRequestList = globalThis.legibleAxiosDouble.requestList.filter((oneRequest) => oneRequest.url === NEIGHBOURHOOD_URL);
		ok('6: one Meanings request per distinct proposed meaning, by the walk\'s own meaning id', neighbourhoodRequestList.length === 2 && JSON.stringify(neighbourhoodRequestList.map((oneRequest) => oneRequest.body)) === JSON.stringify([{ action: 'node', stableId: `meaning:${ACCESSIBILITY_MEANING_URI}` }, { action: 'node', stableId: `meaning:${STAFF_MEANING_URI}` }]), JSON.stringify(neighbourhoodRequestList));
		ok('6: the counts the Meanings answer gave are what the blocks show', JSON.stringify(store.expressionByMeaningUri) === JSON.stringify({ [ACCESSIBILITY_MEANING_URI]: { expressionCount: 7 }, [STAFF_MEANING_URI]: { expressionCount: 0 } }), JSON.stringify(store.expressionByMeaningUri));
		store.markReportSeen();
		ok('addendum 2b: opening the Report tab clears the mark', store.reportUnseen === false);
		store.rememberTab(blocks.TAB_NAME.report);
		ok('review S1: the store remembers the open tab for a return to the page', store.shownTabName === 'report');
		return store.showReportPage(1);
	}).then(() => {
		const neighbourhoodRequestCount = globalThis.legibleAxiosDouble.requestList.filter((oneRequest) => oneRequest.url === NEIGHBOURHOOD_URL).length;
		ok('6: a meaning already read is not asked again on another page', neighbourhoodRequestCount === 2, `${neighbourhoodRequestCount}`);
		ok('turning a page does not mark the report unseen again', store.reportUnseen === false);
		// a cancelled job clears the indicator and says so
		globalThis.legibleAxiosDouble.answerByRoute['jobs/status'] = { data: { answer: { ...SUBMITTED_STATUS, status: 'cancelled', position: undefined } } };
		return store.openJob('job-legible-2');
	}).then(() => {
		const cancelledProgress = blocks.progressOf({ jobStatus: store.jobStatus, busyStepName: store.busyStepName, isStatusCheckFailed: store.isStatusCheckFailed });
		ok('a cancelled job: the indicator absent, and it says so', cancelledProgress.isShown === false && cancelledProgress.endedText === words.endedTextByStatus.cancelled);
		// ⟪review S2⟫ a status check that fails stops polling, says so, and can be tried again
		globalThis.legibleAxiosDouble.answerByRoute['jobs/status'] = { refusal: { answer: { refusalName: 'requestFailed', reason: 'network' } } };
		store.jobStatus = { ...RUNNING_STATUS };
		return store.pollJob();
	}).then(() => {
		ok('S2: a failed status check is marked; the indicator stops claiming progress', store.isStatusCheckFailed === true && blocks.progressOf({ jobStatus: store.jobStatus, busyStepName: store.busyStepName, isStatusCheckFailed: store.isStatusCheckFailed }).checkFailedText === words.statusCheckFailedText);
		globalThis.legibleAxiosDouble.answerByRoute['jobs/status'] = { data: { answer: DONE_STATUS } };
		return store.retryStatusCheck();
	}).then(() => {
		ok('S2: trying again clears the mark and carries on to the report', store.isStatusCheckFailed === false && store.jobStatus.status === 'done' && store.report !== null);
		// a Meanings read that fails names its reason
		globalThis.legibleAxiosDouble.answerByRoute[NEIGHBOURHOOD_URL] = { refusal: 'no meaning in this graph has stableId x' };
		store.expressionByMeaningUri = {};
		return store.readExpressions();
	}).then(() => {
		ok('a failed Meanings read is kept with its reason, never as a zero', store.expressionByMeaningUri[ACCESSIBILITY_MEANING_URI] && store.expressionByMeaningUri[ACCESSIBILITY_MEANING_URI].unreadReason === 'no meaning in this graph has stableId x', JSON.stringify(store.expressionByMeaningUri));
		// ⟪review S3⟫ a failed read is asked again; a count is not
		globalThis.legibleAxiosDouble.answerByRoute[NEIGHBOURHOOD_URL] = { data: neighbourhoodAnswerOf };
		globalThis.legibleAxiosDouble.requestList = [];
		return store.readExpressions();
	}).then(() => {
		ok('S3: trying again reads the failed meanings and shows their counts', globalThis.legibleAxiosDouble.requestList.length === 2 && store.expressionByMeaningUri[ACCESSIBILITY_MEANING_URI].expressionCount === 7, JSON.stringify(store.expressionByMeaningUri));
		globalThis.legibleAxiosDouble.requestList = [];
		return store.readExpressions();
	}).then(() => {
		ok('S3: a meaning already counted is not asked again', globalThis.legibleAxiosDouble.requestList.length === 0);
		// ⟪review N2⟫ an HTML error page is said by its status, never shown as text
		globalThis.legibleAxiosDouble.answerByRoute[NEIGHBOURHOOD_URL] = { refusalWithStatus: { status: 502, statusText: 'Bad Gateway', data: '<!DOCTYPE html><html><body>nginx</body></html>' } };
		store.expressionByMeaningUri = {};
		return store.readExpressions();
	}).then(() => {
		ok('N2: an HTML error page is said by its HTTP status', store.expressionByMeaningUri[ACCESSIBILITY_MEANING_URI].unreadReason === 'the Meanings answer came back 502 Bad Gateway', JSON.stringify(store.expressionByMeaningUri[ACCESSIBILITY_MEANING_URI]));
		fs.rmSync(scratchDirPath, { recursive: true, force: true });
		finish();
	});
}).catch((unexpectedError) => {
	ok('the test ran to its end', false, unexpectedError && unexpectedError.stack);
	finish();
});
