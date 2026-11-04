'use strict';
// rosetta-retrieval-live.test.js — retrieval through the core on the real golden (standardsQueryService-110326 P3), with an embedder answering from the graph's own text nodes: free, offline, deterministic. Skipped by name when no graph is reachable.
// The standing hold-out (design 4.10): a fixed sample of LIF's published mappings submitted as name + definition; recall toward CEDS must hold 0.80 on the golden the instance serves. Agreement with the layer, not truth. runs/P3/runHoldOut.js measures the same with the real embedder.
// Also: the element target (G3.2), one set of pools from all three forms (G3.3), no judge and no Anthropic key (G3.5), the fuse by name and apart from search's, the store holding no text, summary and full, and what the usage counters take.

const fs = require('fs');
const https = require('https');
const path = require('path');
const { openHarness, holdOutSubjectsOf } = require('./lib/rosettaLiveHarness');

let passedCount = 0;
let failedCount = 0;
const ok = (testName, condition, detailText) => {
	if (condition) { passedCount += 1; console.log(`  PASS: ${testName}`); return; }
	failedCount += 1;
	console.log(`  FAIL: ${testName}${detailText ? ` — ${detailText}` : ''}`);
};
const finish = () => {
	console.log(`\nrosetta-retrieval-live: ${passedCount} passed, ${failedCount} failed`);
	process.exit(failedCount === 0 ? 0 : 1);
};

const HOLD_OUT_BOUND = 0.8;
const HOLD_OUT_SEED = '110426';
const HOLD_OUT_SIZE = 200;
const anonymous = { kind: 'anonymous', userRefId: '', role: '' };

openHarness({}, (harnessError, harness) => {
	if (harnessError === 'noGraph') {
		console.log('  SKIP: rosetta-retrieval-live: no graph is reachable');
		process.exit(0);
	}
	if (harnessError) {
		console.log(`  FAIL: harness: ${harnessError}`);
		process.exit(1);
	}
	const { core, rosettaRetrieval, goldenHandle, embedCallLog, usageCountList, rosettaStoreFilePath } = harness;
	const retrieve = (input, done) => core.runOperation({ operationName: 'rosettaRetrieval', input, principal: anonymous }, (unusedError, answer) => done({ ...answer, body: JSON.parse(answer.bodyText) }));
	const steps = [];
	const shared = {};

	// ---- the fixture
	steps.push((next) => holdOutSubjectsOf({ goldenHandle, standardName: 'LIF', hubName: 'CEDS', subjectCount: HOLD_OUT_SIZE, sampleSeed: HOLD_OUT_SEED }, (fixtureError, fixture) => {
		ok('hold-out: 200 subjects from the published layer', !fixtureError && fixture.subjectList.length === HOLD_OUT_SIZE, fixtureError);
		shared.subjectList = fixture.subjectList;
		shared.fieldList = fixture.subjectList.map(({ name, definition }) => ({ name, ...(definition ? { definition } : {}) }));
		next();
	}));

	// ---- the hold-out, standing
	steps.push((next) => retrieve({ fieldList: shared.fieldList, hubList: ['CEDS'], rowDetail: 'full' }, ({ httpStatus, body }) => {
		ok('hold-out: answers 200', httpStatus === 200, JSON.stringify(body.answer).slice(0, 300));
		const poolList = body.answer.fieldList.map((oneField) => oneField.byHub.CEDS);
		const hitCount = poolList.filter((onePool, poolIndex) => onePool.candidateList.some((oneCandidate) => shared.subjectList[poolIndex].trueCardStableIdList.includes(oneCandidate.uri))).length;
		const recall = hitCount / HOLD_OUT_SIZE;
		const sortedSizeList = poolList.map((onePool) => onePool.poolSize).sort((left, right) => left - right);
		console.log(`  hold-out toward CEDS: recall@pool ${hitCount}/${HOLD_OUT_SIZE} = ${recall.toFixed(3)}; pool min/median/max ${sortedSizeList[0]}/${sortedSizeList[HOLD_OUT_SIZE >> 1]}/${sortedSizeList[HOLD_OUT_SIZE - 1]}; empty ${sortedSizeList.filter((oneSize) => oneSize === 0).length}`);
		ok(`hold-out: recall toward CEDS holds ${HOLD_OUT_BOUND}`, recall >= HOLD_OUT_BOUND, recall.toFixed(3));
		ok('a pool holds no more than poolCap, ranked from 1', poolList.every((onePool) => onePool.poolSize <= 40 && onePool.candidateList.every((oneCandidate, candidateIndex) => oneCandidate.rank === candidateIndex + 1)));
		ok('every candidate has uri, label, a raw cosine and what admitted it', poolList.flatMap((onePool) => onePool.candidateList).every((oneCandidate) => oneCandidate.uri && oneCandidate.label && oneCandidate.cosine >= 0.3 && oneCandidate.cosine <= 1 && oneCandidate.admittedBy.length > 0));
		ok('a pool is property-tier cards: every candidate is a card of this hub', poolList.flatMap((onePool) => onePool.candidateList).every((oneCandidate) => /\/CEDStandards\/hub\/14\.0\.0\.0\//.test(oneCandidate.uri)));
		ok('the vote orders the pool: votes never rise as rank falls', poolList.every((onePool) => onePool.candidateList.every((oneCandidate, candidateIndex, candidateList) => candidateIndex === 0 || candidateList[candidateIndex - 1].ownVotes >= oneCandidate.ownVotes)));
		ok('a field with no definition says so', body.answer.fieldList.every((oneField, fieldIndex) => Boolean(oneField.definitionAbsent) === !shared.subjectList[fieldIndex].definition));
		next();
	}));

	// ---- a cosine is a raw cosine. Neo4j's index answers (1 + cos) / 2, so the best a pool reports is held against the best the hub's texts can give, worked out here by a scan and not by the index
	steps.push((next) => {
		const { name } = shared.fieldList.find((oneField) => oneField.name === 'dischargeDate') || shared.fieldList[0];
		goldenHandle.withReadSession((session, sessionDone) => session.run("MATCH (t:DmeEmbedText { text: $name }) WITH t.textEmbedding AS vector LIMIT 1 MATCH (hub:DmeEmbedText { _source: 'CEDS' }) WITH max(vector.similarity.cosine(hub.textEmbedding, vector)) AS bestSimilarity RETURN 2 * bestSimilarity - 1 AS bestRawCosine", { name }).then((queryResult) => sessionDone('', queryResult.records[0].get('bestRawCosine')), (queryError) => sessionDone(queryError.message)), (scanError, bestRawCosine) => {
			retrieve({ fieldList: [{ name }], hubList: ['CEDS'], rowDetail: 'full' }, ({ body }) => {
				const bestReported = Math.max(...body.answer.fieldList[0].byHub.CEDS.candidateList.map((oneCandidate) => oneCandidate.cosine));
				ok(`a reported cosine is raw: ${bestReported} is no more than the scan's ${bestRawCosine && bestRawCosine.toFixed(4)}`, !scanError && bestReported <= bestRawCosine + 0.005, scanError);
				next();
			});
		});
	});
	// ---- the window reaches the hub's own hits: a window of 40 across every standard left pools of a few (the G2 probe's), and recall alone does not show it
	steps.push((next) => retrieve({ fieldList: shared.fieldList.slice(0, 40), hubList: ['CTDL'], rowDetail: 'full' }, ({ body }) => {
		const sortedSizeList = body.answer.fieldList.map((oneField) => oneField.byHub.CTDL.poolSize).sort((left, right) => left - right);
		ok(`the window reaches the hub: median CTDL pool ${sortedSizeList[20]} of 40 fields is at the cap`, sortedSizeList[20] === 40, `${sortedSizeList[20]}`);
		next();
	}));

	// ---- the second submission spends nothing and answers the same (G3.5)
	steps.push((next) => {
		const shortList = shared.fieldList.slice(0, 5);
		const embedCallsBefore = embedCallLog.length;
		retrieve({ fieldList: shortList, hubList: ['CTDL'] }, (firstAnswer) => {
			const textsAlreadyEmbedded = embedCallLog.length === embedCallsBefore;
			retrieve({ fieldList: shortList, hubList: ['CTDL'] }, (secondAnswer) => {
				ok('resubmission: no embedding call', embedCallLog.length === embedCallsBefore && textsAlreadyEmbedded);
				ok('resubmission: the cache served every distinct text', rosettaRetrieval.stats().lastRequest.newTextCount === 0 && rosettaRetrieval.stats().lastRequest.embedCallCount === 0);
				ok('resubmission: the same bytes', firstAnswer.bodyText === secondAnswer.bodyText);
				next();
			});
		});
	});
	steps.push((next) => {
		const beforeLength = embedCallLog.length;
		const statsBefore = rosettaRetrieval.stats();
		retrieve({ fieldList: [{ name: 'creditsRequired' }, { name: 'dischargeDate' }, { name: 'endingRank' }], hubList: ['CEDS'] }, () => {
			const { lastRequest } = rosettaRetrieval.stats();
			ok('voyage calls equal the batches of distinct new texts', embedCallLog.length - beforeLength === lastRequest.embedCallCount && lastRequest.embedCallCount === Math.ceil(lastRequest.newTextCount / 20) && rosettaRetrieval.stats().textsEmbeddedTotal - statsBefore.textsEmbeddedTotal === lastRequest.newTextCount, JSON.stringify(lastRequest));
			next();
		});
	});

	// ---- no judge, no Anthropic key: whatever would reach one is watched for the length of a retrieval
	steps.push((next) => {
		const watchedList = [];
		const realReadFileSync = fs.readFileSync;
		const realReadFile = fs.readFile;
		const realRequest = https.request;
		const noteIfWatched = (pathText) => { if (/anthropic|jevOpus|judgeComponent/i.test(String(pathText))) { watchedList.push(String(pathText)); } };
		fs.readFileSync = (pathText, ...restArgument) => { noteIfWatched(pathText); return realReadFileSync(pathText, ...restArgument); };
		fs.readFile = (pathText, ...restArgument) => { noteIfWatched(pathText); return realReadFile(pathText, ...restArgument); };
		https.request = (...requestArgument) => { watchedList.push(`https ${JSON.stringify(requestArgument[0]).slice(0, 80)}`); return realRequest(...requestArgument); };
		const environmentKeyBefore = Object.keys(process.env).filter((variableName) => /ANTHROPIC/.test(variableName));
		retrieve({ fieldList: shared.fieldList.slice(5, 8) }, ({ httpStatus }) => {
			fs.readFileSync = realReadFileSync;
			fs.readFile = realReadFile;
			https.request = realRequest;
			ok('no judge: a retrieval read no Anthropic file, loaded no judge and made no https call of its own here', httpStatus === 200 && watchedList.length === 0, watchedList.join());
			const rosettaDirPath = path.join(__dirname, '..', 'lib', 'standards-query', 'rosetta');
			const sourceText = [...fs.readdirSync(rosettaDirPath).filter((oneName) => oneName.endsWith('.js')).map((oneName) => path.join(rosettaDirPath, oneName))].map((filePath) => realReadFileSync(filePath, 'utf8').split('\n').filter((oneLine) => !oneLine.trim().startsWith('//')).join('\n')).join('\n');
			ok('no judge: no code of rosetta names ANTHROPIC, judgeOne or a judge client', !/ANTHROPIC|anthropicAi|judgeOne|judgeComponent|llmClient/i.test(sourceText));
			ok('no judge: nothing here reads the Anthropic environment', environmentKeyBefore.length === 0 || !/process\.env/.test(sourceText));
			next();
		});
	});

	// ---- summary: every field and hub, its size, its top few, and what was left out by count (G3.8)
	steps.push((next) => {
		const twentyList = shared.fieldList.slice(0, 20);
		retrieve({ fieldList: twentyList, rowDetail: 'full' }, (fullAnswer) => {
			retrieve({ fieldList: twentyList }, (summaryAnswer) => {
				const summary = summaryAnswer.body.answer;
				const full = fullAnswer.body.answer;
				ok('summary is the default, and says so', summary.rowDetail === 'summary' && summary.leftOutOfSummary.howToAsk.includes('rowDetail=full'));
				ok('summary: every field and every hub is there', summary.fieldList.length === 20 && summary.fieldList.every((oneField) => Object.keys(oneField.byHub).join() === 'CEDS,CTDL'));
				const everyPoolPair = full.fieldList.flatMap((oneField, fieldIndex) => Object.keys(oneField.byHub).map((hubName) => ({ fullPool: oneField.byHub[hubName], summaryPool: summary.fieldList[fieldIndex].byHub[hubName] })));
				ok('summary: each pool keeps its size', everyPoolPair.every(({ fullPool, summaryPool }) => summaryPool.poolSize === fullPool.poolSize));
				ok('summary: each shown candidate has uri, label and cosine', everyPoolPair.flatMap(({ summaryPool }) => summaryPool.topCandidateList).every((oneCandidate) => oneCandidate.uri && oneCandidate.label && typeof oneCandidate.cosine === 'number'));
				ok('summary: each pool shows the best cosine among its few, always', everyPoolPair.every(({ fullPool, summaryPool }) => { const bestCandidate = fullPool.cosineRankOneOutsidePool || fullPool.candidateList.find((oneCandidate) => oneCandidate.rankByCosine === 1); return !bestCandidate || summaryPool.topCandidateList.some((oneCandidate) => oneCandidate.uri === bestCandidate.uri); }));
				const expectedLeftOut = everyPoolPair.reduce((soFar, { fullPool, summaryPool }) => soFar + fullPool.candidateList.length + (fullPool.cosineRankOneOutsidePool ? 1 : 0) - summaryPool.topCandidateList.length, 0);
				ok('summary: what it left out is counted, from the full answer', summary.leftOutOfSummary.candidatesNotShown === expectedLeftOut, `${summary.leftOutOfSummary.candidatesNotShown} / ${expectedLeftOut}`);
				ok('summary: the fields it dropped are named', ['ownVotes', 'cardTextCosine', 'rankByCosine', 'admittedBy', 'domain'].every((fieldName) => summary.leftOutOfSummary.candidateFieldNameList.includes(fieldName)));
				ok('full: carries every candidate the pools hold', everyPoolPair.every(({ fullPool }) => fullPool.candidateList.length === fullPool.poolSize));
				const summaryBytes = Buffer.byteLength(summaryAnswer.bodyText);
				ok('summary: 20 fields on two hubs, at or under 20 KB', summaryBytes <= 20000, `${summaryBytes}`);
				console.log(`  bytes, 20 fields, two hubs: summary ${summaryBytes}, full ${Buffer.byteLength(fullAnswer.bodyText)}`);
				ok('the answer names the graph, and nothing was judged', summaryAnswer.body.answeredFrom.operation === 'rosettaRetrieval' && /Nothing here is judged/.test(summary.nothingJudgedNote));
				ok('costEstimateByHub: fields with candidates at the measured rate', full.costEstimateByHub.CEDS.fieldsWithCandidates === full.poolCountByHub.CEDS.fieldsWithCandidates);
				next();
			});
		});
	});

	// ---- bytes at 100 and 200, said (the order asks for them); the advice appears past the readable size
	[100, 200].forEach((fieldCount) => steps.push((next) => retrieve({ fieldList: shared.fieldList.slice(0, fieldCount) }, ({ httpStatus, bodyText, body }) => {
		console.log(`  bytes, ${fieldCount} fields, two hubs, summary: ${Buffer.byteLength(bodyText)}`);
		ok(`summary: ${fieldCount} fields answer, and say how to read them all`, httpStatus === 200 && /about 20 fields at a time/.test(body.answer.leftOutOfSummary.sizeAdvice) && body.answer.leftOutOfSummary.shownPerPool === 2);
		next();
	})));

	// ---- one set of pools from all three forms (G3.3)
	steps.push((next) => {
		const formFieldList = shared.fieldList.slice(30, 36).map((oneField, fieldIndex) => ({ ...oneField, name: oneField.name, fieldIndex }));
		const uniqueByName = [...new Map(formFieldList.map((oneField) => [oneField.name, oneField])).values()];
		const plainList = uniqueByName.map(({ name, definition }) => ({ name, ...(definition ? { definition } : {}) }));
		const schemaDocument = { type: 'object', properties: Object.fromEntries(plainList.map(({ name, definition }) => [name, definition ? { description: definition } : {}])), $defs: {}, additionalProperties: { $ref: 'https://example.org/never' } };
		const contextDocument = { '@context': ['https://example.org/never.jsonld', Object.fromEntries(plainList.map(({ name, definition }) => [name, { '@id': `https://example.org/${name}`, ...(definition ? { 'rdfs:comment': definition } : {}) }]))] };
		const poolsOf = (answerBody) => JSON.stringify(answerBody.answer.fieldList.map(({ name, byHub }) => ({ name, byHub })));
		// a resolver that fails any lookup but the graph's own, for the length of these three: a remote $ref or @context must never reach it
		const dns = require('dns');
		const realLookup = dns.lookup;
		const lookedUpHostList = [];
		dns.lookup = (hostName, ...restArgument) => {
			lookedUpHostList.push(hostName);
			if (hostName === 'localhost') {
				realLookup(hostName, ...restArgument);
				return;
			}
			restArgument[restArgument.length - 1](new Error('this gate fails every lookup'));
		};
		retrieve({ fieldList: plainList, rowDetail: 'full' }, (listAnswer) => {
			retrieve({ jsonSchema: schemaDocument, rowDetail: 'full' }, (cleanSchemaAnswer) => {
				retrieve({ jsonLdContext: contextDocument, rowDetail: 'full' }, (contextAnswer) => {
					ok('forms: a field list, a schema and a context give the same names and the same pools', listAnswer.httpStatus === 200 && poolsOf(listAnswer.body) === poolsOf(cleanSchemaAnswer.body) && poolsOf(listAnswer.body) === poolsOf(contextAnswer.body), `${listAnswer.httpStatus} ${cleanSchemaAnswer.httpStatus} ${contextAnswer.httpStatus} ${JSON.stringify(contextAnswer.body.answer).slice(0, 200)}`);
					dns.lookup = realLookup;
					ok('forms: a remote $ref and @context in the documents, and no lookup but the graph\'s', lookedUpHostList.every((hostName) => hostName === 'localhost'), lookedUpHostList.join());
					ok('forms: a remote @context is listed in the answer', contextAnswer.body.answer.unresolvedContextList[0].context === 'https://example.org/never.jsonld');
					ok('forms: the format is said', listAnswer.body.answer.submissionFormat === 'fieldList' && cleanSchemaAnswer.body.answer.submissionFormat === 'jsonSchema' && contextAnswer.body.answer.submissionFormat === 'jsonLdContext');
					next();
				});
			});
		});
	});

	// ---- refusals by name
	steps.push((next) => retrieve({ hubList: ['CEDS'] }, ({ httpStatus, body }) => { ok('no submission: refused by name with the forms', httpStatus === 400 && body.answer.refusalName === 'noSubmission' && body.answer.validValueList.includes('jsonSchema')); next(); }));
	steps.push((next) => retrieve({ fieldList: [{ name: 'a' }], jsonSchema: { properties: {} } }, ({ httpStatus, body }) => { ok('two submissions: refused by name', httpStatus === 400 && body.answer.refusalName === 'noSubmission'); next(); }));
	steps.push((next) => retrieve({ fieldList: 'notAList' }, ({ httpStatus, body }) => { ok('a field list that is no list: invalidInput', httpStatus === 400 && body.answer.refusalName === 'invalidInput'); next(); }));
	steps.push((next) => retrieve({ fieldList: [{ name: 'dischargeDate' }], hubList: ['Nope'] }, ({ httpStatus, body }) => { ok('an unknown hub: refused with the valid list', httpStatus === 400 && body.answer.refusalName === 'unknownHub' && JSON.stringify(body.answer.validValueList) === '["CEDS","CTDL"]'); next(); }));
	steps.push((next) => retrieve({ fieldList: [{ name: 'dischargeDate' }], rowDetail: 'most' }, ({ httpStatus, body }) => { ok('a bad rowDetail: refused by name', httpStatus === 400 && body.answer.refusalName === 'invalidInput'); next(); }));
	steps.push((next) => retrieve({ fieldList: [{ name: 'dischargeDate' }], expectManifest: 'sha256:other' }, ({ httpStatus, body }) => { ok('expectManifest: manifestMismatch, as every operation', httpStatus === 409 && body.answer.refusalName === 'manifestMismatch'); next(); }));
	steps.push((next) => retrieve({ fieldList: Array.from({ length: 201 }, (unused, fieldIndex) => ({ name: `f${fieldIndex}` })) }, ({ httpStatus, body }) => { ok('201 fields: 413 maxFieldListLength', httpStatus === 413 && body.answer.refusalName === 'maxFieldListLength'); next(); }));
	steps.push((next) => retrieve({ unexpected: 'x', fieldList: [{ name: 'dischargeDate' }] }, ({ httpStatus, body }) => { ok('an unknown input: unknownInput', httpStatus === 400 && body.answer.refusalName === 'unknownInput'); next(); }));

	// ---- the usage counters: hubs only
	steps.push((next) => {
		const retrievalCountList = usageCountList.filter((oneCount) => oneCount.operationName === 'rosettaRetrieval');
		ok('usage: retrieval counts its hubs and names no URI and no text', retrievalCountList.length > 0 && retrievalCountList.every(({ uriList, subjectList }) => uriList.length === 0 && subjectList.every(({ subjectKind, subjectText }) => subjectKind === 'hub' && ['CEDS', 'CTDL'].includes(subjectText))));
		next();
	});

	// ---- the store holds no text
	steps.push((next) => {
		const storeBytes = fs.readFileSync(rosettaStoreFilePath);
		const absentTextList = shared.fieldList.filter((oneField) => oneField.definition).slice(0, 50).map((oneField) => oneField.definition);
		ok('store: mode 600', (fs.statSync(rosettaStoreFilePath).mode & 0o777) === 0o600);
		ok('store: no submitted text is in the file', absentTextList.length === 50 && absentTextList.every((oneText) => !storeBytes.includes(Buffer.from(oneText))));
		harness.strangerVectorStore.rowCount((countError, rowCount) => { ok('store: it does hold hashes and vectors', !countError && rowCount > 100, `${rowCount}`); next(); });
	});

	// ---- the element target (G3.2)
	steps.push((next) => {
		const twentyFieldList = shared.fieldList.slice(40, 60);
		let elementCount = 0;
		let uriCount = 0;
		const runOne = (fieldIndex, finished) => {
			if (fieldIndex >= twentyFieldList.length) {
				finished();
				return;
			}
			const { name, definition } = twentyFieldList[fieldIndex];
			goldenHandle.withReadSession((session, sessionDone) => rosettaRetrieval.retrieveCandidates({ session, serviceFacts: core.serviceFactsForGate(), queryTextList: [name, definition], target: { kind: 'standardElements', standardName: 'EdFi' } }, sessionDone), (retrieveError, pool) => {
				if (!retrieveError && pool.candidateList) {
					elementCount += pool.candidateList.length;
					uriCount += pool.candidateList.filter((oneCandidate) => /^https:\/\/w3id\.org\/EDUcore\/EdFi\//.test(oneCandidate.uri)).length;
				}
				runOne(fieldIndex + 1, finished);
			});
		};
		runOne(0, () => {
			console.log(`  element target: 20 LIF fields toward EdFi: ${elementCount} candidates, ${uriCount} with EdFi element URIs`);
			ok('element target: 20 LIF fields return EdFi elements with URIs', elementCount > 20 && uriCount === elementCount, `${uriCount}/${elementCount}`);
			next();
		});
	});
	steps.push((next) => goldenHandle.withReadSession((session, sessionDone) => rosettaRetrieval.retrieveCandidates({ session, serviceFacts: core.serviceFactsForGate(), queryTextList: ['dischargeDate'], target: { kind: 'standardElements', standardName: 'NoSuchStandard' } }, sessionDone), (retrieveError, result) => {
		ok('element target: an unknown standard is refused with the valid list', !retrieveError && result.refusal.refusalName === 'unknownStandard' && result.refusal.validValueList.includes('EdFi'));
		next();
	}));
	steps.push((next) => goldenHandle.withReadSession((session, sessionDone) => rosettaRetrieval.retrieveCandidates({ session, serviceFacts: core.serviceFactsForGate(), queryTextList: ['dischargeDate'], target: { kind: 'hubCards', hubName: 'CEDS', tier: 'property' } }, sessionDone), (retrieveError, result) => {
		ok('the same stage answers the hub form', !retrieveError && result.poolSize > 0 && result.target.sourceName && result.embeddingModelVersion === 'voyage-4-large', retrieveError);
		next();
	}));
	steps.push((next) => goldenHandle.withReadSession((session, sessionDone) => rosettaRetrieval.retrieveCandidates({ session, serviceFacts: core.serviceFactsForGate(), queryTextList: ['dischargeDate'], target: { kind: 'hubCards', hubName: 'CEDS', tier: 'value' } }, sessionDone), (retrieveError, result) => {
		ok('the stage refuses a tier it does not offer, by name', !retrieveError && result.refusal.refusalName === 'tierNotOffered');
		next();
	}));

	const runNext = (stepIndex) => {
		if (stepIndex >= steps.length) {
			harness.close(fuseTests);
			return;
		}
		steps[stepIndex](() => runNext(stepIndex + 1));
	};

	// ---- the fuse, each on a core of its own (a fresh store)
	const fuseTests = () => {
		const SECRET_TEXT = 'zqxPrivateStrangerWordsThatMustNotReachALog';
		const stubVector = Array.from({ length: 1024 }, (unused, vectorIndex) => (vectorIndex === 0 ? 1 : 0));
		const fuseStepList = [];
		fuseStepList.push((next) => openHarness({ fuseOverrideValues: { retrievalMaxTokensPerRequest: 3 }, embedder: { batchSize: 20, embed: (textList, done) => done('', textList.map(() => stubVector)) } }, (openError, tokenHarness) => {
			tokenHarness.core.runOperation({ operationName: 'rosettaRetrieval', input: { fieldList: [{ name: SECRET_TEXT }] }, principal: anonymous }, (unusedError, answer) => {
				ok('fuse: over the per-request tokens, 413 by name', answer.httpStatus === 413 && JSON.parse(answer.bodyText).answer.refusalName === 'retrievalTokensPerRequestExceeded', answer.bodyText.slice(0, 300));
				tokenHarness.close(next);
			});
		}));
		fuseStepList.push((next) => openHarness({ fuseOverrideValues: { retrievalDailyTokenCeiling: 3 }, embedder: { batchSize: 20, embed: (textList, done) => done('', textList.map(() => stubVector)) }, limitOverrideValues: {} }, (openError, ceilingHarness) => {
			ceilingHarness.core.runOperation({ operationName: 'rosettaRetrieval', input: { fieldList: [{ name: SECRET_TEXT }] }, principal: anonymous }, (unusedError, answer) => {
				ok('fuse: over the day, 429 retrievalCeilingReached, no call made', answer.httpStatus === 429 && JSON.parse(answer.bodyText).answer.refusalName === 'retrievalCeilingReached' && ceilingHarness.rosettaRetrieval.stats().embedCallsTotal === 0, answer.bodyText.slice(0, 300));
				ceilingHarness.core.runOperation({ operationName: 'search', input: { q: 'zzqq', mode: 'keyword' }, principal: anonymous }, (searchError, searchAnswer) => {
					ok('fuse: tripping it does not touch search', searchAnswer.httpStatus === 200 && ceilingHarness.core.serviceState().embeddingTokensToday === 0, `${searchAnswer.httpStatus}`);
					ceilingHarness.close(next);
				});
			});
		}));
		// the day's count lives in the file: a restart resets nothing
		fuseStepList.push((next) => {
			const dayFilePath = path.join(require('os').tmpdir(), `rosettaDay-${process.pid}.sqlite`);
			openHarness({ storeFilePath: dayFilePath, fuseOverrideValues: { retrievalDailyTokenCeiling: 40 }, embedder: { batchSize: 20, embed: (textList, done) => done('', textList.map(() => stubVector)) } }, (openError, firstHarness) => {
				firstHarness.core.runOperation({ operationName: 'rosettaRetrieval', input: { fieldList: [{ name: 'x'.repeat(120) }], hubList: ['CEDS'] }, principal: anonymous }, (unusedError, firstAnswer) => {
					firstHarness.strangerVectorStore.close(() => openHarness({ storeFilePath: dayFilePath, fuseOverrideValues: { retrievalDailyTokenCeiling: 40 }, embedder: { batchSize: 20, embed: (textList, done) => done('', textList.map(() => stubVector)) } }, (reopenError, secondHarness) => {
						secondHarness.core.runOperation({ operationName: 'rosettaRetrieval', input: { fieldList: [{ name: 'y'.repeat(120) }], hubList: ['CEDS'] }, principal: anonymous }, (alsoUnusedError, secondAnswer) => {
							ok('fuse: the day\'s count survives a restart', firstAnswer.httpStatus === 200 && secondAnswer.httpStatus === 429 && JSON.parse(secondAnswer.bodyText).answer.refusalName === 'retrievalCeilingReached', `${firstAnswer.httpStatus} ${secondAnswer.httpStatus}`);
							secondHarness.close(() => { fs.rmSync(dayFilePath, { force: true }); next(); });
						});
					}));
				});
			});
		});
		fuseStepList.push((next) => {
			const releaseList = [];
			const releaseAll = () => releaseList.splice(0).forEach((oneRelease) => oneRelease());
			openHarness({ embedder: { batchSize: 20, embed: (textList, done) => { releaseList.push(() => done('', textList.map(() => stubVector))); } } }, (openError, busyHarness) => {
				const ask = (done) => busyHarness.core.runOperation({ operationName: 'rosettaRetrieval', input: { fieldList: [{ name: `busyField${Math.random()}` }], hubList: ['CEDS'] }, principal: { kind: 'oauthUser', userRefId: 'mcpPerson', role: 'user' } }, done);
				ask((firstError, firstAnswer) => {
					ok('in flight: the first runs when the second has gone', firstAnswer.httpStatus === 200, `${firstAnswer.httpStatus}`);
					busyHarness.close(next);
				});
				const waitForFirst = () => {
					if (releaseList.length === 0) {
						setTimeout(waitForFirst, 20);
						return;
					}
					let secondHasAnswered = false;
					// a second retrieval let in would wait on the embedder for ever: say so and release it, so this gate fails rather than hangs
					const notRefusedTimer = setTimeout(() => {
						if (!secondHasAnswered) {
							ok('in flight: a second concurrent retrieval is refused at once', false, 'it went on to the embedder');
							releaseAll();
						}
					}, 3000);
					ask((secondError, secondAnswer) => {
						secondHasAnswered = true;
						clearTimeout(notRefusedTimer);
						if (secondAnswer.httpStatus === 200) {
							return;
						}
						ok('in flight: a second concurrent retrieval, whatever the door, is 503 busy with Retry-After', secondAnswer.httpStatus === 503 && JSON.parse(secondAnswer.bodyText).answer.refusalName === 'busy' && secondAnswer.retryAfterSeconds > 0, secondAnswer.bodyText.slice(0, 200));
						releaseAll();
					});
				};
				waitForFirst();
			});
		});
		// a vendor's error may repeat what it was sent: the log gets its status alone, and the caller a refusal
		fuseStepList.push((next) => openHarness({ embedder: { batchSize: 20, embed: (textList, done) => done(`Voyage API error 400: could not read ${textList[0]}`) } }, (openError, failingHarness) => {
			failingHarness.core.runOperation({ operationName: 'rosettaRetrieval', input: { fieldList: [{ name: SECRET_TEXT }], hubList: ['CEDS'] }, principal: anonymous }, (unusedError, answer) => {
				ok('embedding failure: 503 embeddingFailed by name', answer.httpStatus === 503 && JSON.parse(answer.bodyText).answer.refusalName === 'embeddingFailed' && !answer.bodyText.includes(SECRET_TEXT), answer.bodyText.slice(0, 200));
				ok('embedding failure: the log has the status and no text', failingHarness.errorLineList.some((oneLine) => /status 400/.test(oneLine)) && !failingHarness.errorLineList.some((oneLine) => oneLine.includes(SECRET_TEXT)), failingHarness.errorLineList.join(' | '));
				failingHarness.close(next);
			});
		}));
		const runNextFuse = (stepIndex) => {
			if (stepIndex >= fuseStepList.length) {
				finish();
				return;
			}
			fuseStepList[stepIndex](() => runNextFuse(stepIndex + 1));
		};
		runNextFuse(0);
	};

	runNext(0);
});
