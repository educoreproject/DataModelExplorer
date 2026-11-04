'use strict';
// standards-query-card-uri-live.test.js — mappings given a hub card's uri answers who maps to that card, in summary and full (cardUriAnswers-110426). Before, a card uri matched the card node,
// no arm reached its mappers, and it answered no rows with CTDL neverOffered: a reader took that for "nobody maps here". Runs against the real golden; skips by name when no graph is reachable.

const { openHarness } = require('./lib/rosettaLiveHarness');

const SUMMARY_BYTE_BOUND = 20000;
const anonymous = { kind: 'anonymous', userRefId: '', role: '' };
const CEDS_CARD_URI = 'https://w3id.org/EDUcore/CEDStandards/hub/14.0.0.0/ab39501d8fb28c316fc72ba39c1658cc369796ffd35ec2a4a446e5eb0e0c013d'; // Military Discharge Date
const LARGEST_CTDL_CARD_URI = 'https://w3id.org/EDUcore/CTDL/hub/Release_20260927/8f519f13a9ae98e10fd7effb7e228e52c6dca043f68419f630cb782d32ac1e71'; // Framework URL: the card the most elements map to
const ABSENT_CARD_URI = `https://w3id.org/EDUcore/CEDStandards/hub/14.0.0.0/${'0'.repeat(64)}`;

let failedCount = 0;
let passedCount = 0;
const ok = (testName, condition, detailText) => {
	if (condition) { passedCount += 1; console.log(`  PASS: ${testName}`); return; }
	failedCount += 1;
	console.log(`  FAIL: ${testName}${detailText ? ` — ${detailText}` : ''}`);
};

openHarness({}, (harnessError, harness) => {
	if (harnessError === 'noGraph') {
		console.log('  SKIP: standards-query-card-uri-live: no graph is reachable');
		process.exit(0);
	}
	if (harnessError) {
		console.log(`  FAIL: harness: ${harnessError}`);
		process.exit(1);
	}
	const ask = (input, done) => harness.core.runOperation({ operationName: 'mappings', input, principal: anonymous }, (answerError, answered) => done(answerError, { httpStatus: answered.httpStatus, bodyText: answered.bodyText, body: JSON.parse(answered.bodyText) }));
	ask({ element: CEDS_CARD_URI, rowDetail: 'full' }, (fullError, fullAnswered) => {
		const full = fullAnswered.body.answer;
		ok('full: a card uri answers 200', fullAnswered.httpStatus === 200, fullError || JSON.stringify(fullAnswered.body).slice(0, 300));
		ok('full: it names the elements that map to the card', full.totalRowCount === 4 && full.mappingRowList.length === 4 && full.mappingRowList.every((oneRow) => oneRow.direction === 'incoming'), `${full.totalRowCount} rows`);
		ok('full: each row carries the element\'s uri, name and standard, and its relation', full.mappingRowList.every((oneRow) => oneRow.fromUri && oneRow.fromName && oneRow.fromSource && /_MATCH$/.test(oneRow.mappingType)));
		ok('full: the rows are the four elements the store lists for this card', JSON.stringify(full.mappingRowList.map((oneRow) => oneRow.fromSource).sort()) === JSON.stringify(['JEDx', 'LIF', 'LIF', 'PESC-AcademicEportfolio-1.0.0']), JSON.stringify(full.mappingRowList.map((oneRow) => oneRow.fromSource)));
		ok('full: no hub reads as neverOffered: a card is not offered to a hub', Object.values(full.mappingStatusByHub).every((oneStatus) => oneStatus === 'notApplicable'), JSON.stringify(full.mappingStatusByHub));
		ok('full: it says what the rows are and how they stand against the card\'s own counts', /the elements that map to it/.test(full.cardInputNote) && /distinctElementCount/.test(full.cardInputNote) && /mappedElementCount/.test(full.cardInputNote));
		ask({ element: CEDS_CARD_URI }, (summaryError, summaryAnswered) => {
			const summary = summaryAnswered.body.answer;
			const shownRowList = summary.standardCountList.flatMap((oneStandard) => oneStandard.shownRowList);
			ok('summary: a card uri answers 200 and says it is a summary', summaryAnswered.httpStatus === 200 && summary.rowDetail === 'summary', summaryError);
			ok('summary: it names the same four elements', summary.totalRowCount === 4 && shownRowList.length === 4 && shownRowList.every((oneRow) => oneRow.fromName && oneRow.fromUri), `${shownRowList.length} shown`);
			ok('summary: it keeps the note and the statuses', /the elements that map to it/.test(summary.cardInputNote) && Object.values(summary.mappingStatusByHub).every((oneStatus) => oneStatus === 'notApplicable'));
			ask({ element: LARGEST_CTDL_CARD_URI }, (largestError, largestAnswered) => {
				const largest = largestAnswered.body.answer;
				const summaryByteCount = Buffer.byteLength(largestAnswered.bodyText);
				ok(`summary: the card most elements map to answers within ${SUMMARY_BYTE_BOUND} bytes`, summaryByteCount <= SUMMARY_BYTE_BOUND, `${summaryByteCount} bytes`);
				ok('summary: it rolls a SIF field\'s places up into its declaration, so its rows are fewer than the store\'s 1014 places', largest.totalRowCount > 0 && largest.totalRowCount < 1014, `${largest.totalRowCount} rows`);
				ask({ element: ABSENT_CARD_URI }, (absentError, absentAnswered) => {
					ok('a card uri nothing holds is refused by name, as any unmatched element is', absentAnswered.body.answer.refusalName === 'nothingMatched', JSON.stringify(absentAnswered.body).slice(0, 200));
					ask({ element: 'Military Discharge Date' }, (nameError, nameAnswered) => {
						ok('a name that matches a card carries no card note: that answer is not about one card', nameAnswered.httpStatus === 200 && nameAnswered.body.answer.cardInputNote === undefined);
						harness.close(() => {
							console.log(`standards-query-card-uri-live: ${passedCount} passed, ${failedCount} failed`);
							process.exit(failedCount === 0 ? 0 : 1);
						});
					});
				});
			});
		});
	});
});
