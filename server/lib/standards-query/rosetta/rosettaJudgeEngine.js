'use strict';

// rosettaJudgeEngine — one field against one pool, through the forge's own judge with Rosetta's own store (design 4.1 stage two, 4.5, 4.8). No hold on any pool or prompt outlives the call.
//
//   rosettaJudgedValuesOf({ fuseConfigValues, judgeConfigValues }) → { judgedValues } | { refusalText }. The fuse limits and the judge's config are read together, once, at startup.
//   createRosettaJudgeEngine({ judgedValues, judgeModules, jobStore, componentOverrides?, nowMs, waitMilliseconds, xLog }) → { refusalText } | engine
//   engine.judgeFieldAgainstPool({ jobRefId, ownerPrincipalRefId, fieldIndex, oneField, searchDescriptionText?, hubName, candidateCardList, stopReasonNow }, done(errText, outcome))
//     searchDescriptionText (TQ Q110): a field with no description of its own is shown it on a labelled line of its own; the outcome then says judgedWithSearchDescription
//     candidateCardList: the cards the judge is offered, each { stableId, ...its text }. THE MASKED TEST'S HOOK IS THIS ARGUMENT: a gate takes a true card out of the list before calling. No route, tool, config or request holds it, because the runner always passes what retrieval gave.
//     outcome: { unitStatus: 'proposed' | 'abstained' | 'identifierInSourceText' | 'identifierInCandidateText' | 'judgeRefused', chosenCardStableId?, collapsedMemberStableIdList?, category?, confidence?, judgesRationale?, predicate?, promptHash?, rendererVersion?, cacheHit? }
//            | { vendorStop: { faultName, reason } } (the job must end: nothing about the field was learned) | { stoppedBy: { stopReasonName, ... } } (stopReasonNow said so between attempts)
//   engine.hubFactsFor(hubName) → { refusalText } | { candidateFieldNameList }. engine.judgeFacts, engine.spendPricer.
//
// THE VENDOR'S FAILURE NEVER READS AS AN ABSTENTION. An abstention is a judge's answer of NONE. A dead credential, a rate limit or a timeout is vendorStop, which carries no judgment, and the unit is reported notJudged with the fault's name.
// THE ONE RETRY LOOP IS HERE. The forge's client retries six times with backoff and loses the spend of any 200 it then fails on, so it is called with maxRetries 1: each attempt is one row in judgeCalls, written before it goes and priced when it answers, and the wait between attempts is this instance's stated bound.

const PROVIDER_NAME_ANTHROPIC = 'anthropic';
const { ANONYMOUS_PRINCIPAL_KIND } = require('../admitRequest');
const judgedSettings = require('./rosettaJudgedSettings.json');
const { reasonOf, REASON_NAME_LIST } = require('./rosettaReasonWords');

const CALL_STATUS = Object.freeze({ answered: 'answered', failedUnbilled: 'failedUnbilled', unansweredPriced: 'unansweredPriced' });
const CONFIDENCE_OF_NO_CATEGORY = null;
const SINGLE_ATTEMPT = 1;
const STOP_REASON_MAX_TOKENS = 'max_tokens';
const JUDGMENT_BUDGET_PER_UNIT = Object.freeze({ maxJudgmentCount: 2 }); // one ask and judgeOne's one bounded re-ask

// ⟪rosettaMeanings R3, TQ Q86⟫ the anonymous limits are config like every other: a field cap, a per-visitor count in a window, their own running and queue caps (never the signed-in ones), their own retention, a worst-case overhead for pricing a judge call before it goes, and their own 24-hour ceiling
const INTEGER_FUSE_NAME_LIST = Object.freeze(['judgedDailyTokenCeiling', 'judgedMaxFieldListLength', 'maxRunningJobs', 'maxQueuedJobs', 'perPrincipalJobsOpen', 'jobRetentionDays', 'jobRunnerPollSeconds', 'anonymousMaxFieldListLength', 'anonymousJobsPerVisitorWindow', 'anonymousVisitorWindowMinutes', 'anonymousMaxRunningJobs', 'anonymousMaxQueuedJobs', 'anonymousJobRetentionDays', 'judgeWorstCaseOverheadTokens', 'promptPageSize', 'jobServiceMaxInFlight', 'jobServiceBusyRetrySeconds', 'anonymousJobServiceMaxInFlight', 'anonymousJobsOpenPerVisitor']);
const USD_FUSE_NAME_LIST = Object.freeze(['perJobCeilingUsd', 'perPrincipalDailyUsd', 'dailyJudgeCeilingUsd', 'judgeUsdPerFieldEstimate', 'anonymousDailyCeilingUsd', 'anonymousPerVisitorDailyUsd']);
// ⟪rosettaMeanings review S2⟫ the file holding the secret that keys a visitor's HMAC; read at assembly, never logged
const FUSE_TEXT_NAME_LIST = Object.freeze(['anonymousVisitorSecretFilePath']);
const JUDGE_TEXT_NAME_LIST = Object.freeze(['judgeProviderName', 'judgeWireModel', 'judgeOutputTokenBudget', 'anthropicConfigFilePath', 'spendPricingFilePath', 'judgePromptVariant', 'spendLedgerFilePath']);

const rosettaJudgedValuesOf = ({ fuseConfigValues, judgeConfigValues }) => {
	const badFuseList = [
		...INTEGER_FUSE_NAME_LIST.filter((settingName) => !/^[1-9][0-9]*$/.test(String(fuseConfigValues[settingName]))),
		...USD_FUSE_NAME_LIST.filter((settingName) => !(Number(fuseConfigValues[settingName]) > 0)),
		...(/^[1-9][0-9]*(,[1-9][0-9]*)*$/.test(String(fuseConfigValues.judgeRetryWaitSecondsList)) ? [] : ['judgeRetryWaitSecondsList']),
		...(/^[0-9]+$/.test(String(fuseConfigValues.judgedPoolCap)) ? [] : ['judgedPoolCap']),
	];
	const absentFuseTextList = FUSE_TEXT_NAME_LIST.filter((settingName) => !fuseConfigValues[settingName]);
	if (badFuseList.length > 0 || absentFuseTextList.length > 0) {
		return { refusalText: `[rosetta-fuse] must give ${[...INTEGER_FUSE_NAME_LIST, ...USD_FUSE_NAME_LIST, ...FUSE_TEXT_NAME_LIST, 'judgeRetryWaitSecondsList', 'judgedPoolCap (0 is off)'].join(', ')}; absent or bad: ${[...badFuseList, ...absentFuseTextList].join(', ')}` };
	}
	const fuseNumberByName = [...INTEGER_FUSE_NAME_LIST, ...USD_FUSE_NAME_LIST].reduce((soFar, settingName) => ({ ...soFar, [settingName]: Number(fuseConfigValues[settingName]) }), {});
	const judgeRetryWaitSecondsList = String(fuseConfigValues.judgeRetryWaitSecondsList).split(',').map(Number);
	const absentJudgeList = JUDGE_TEXT_NAME_LIST.filter((settingName) => !judgeConfigValues[settingName]);
	// an instance may run retrieval with no judge. Which is not silence: every submission is refused judgeNotConfigured, naming this reason.
	const judgeAbsentReason = absentJudgeList.length > 0 ? `this instance's [rosetta-judge] does not give ${absentJudgeList.join(', ')}` : '';
	return { judgedValues: { ...fuseNumberByName, ...FUSE_TEXT_NAME_LIST.reduce((soFar, settingName) => ({ ...soFar, [settingName]: fuseConfigValues[settingName] }), {}), judgedPoolCap: Number(fuseConfigValues.judgedPoolCap), judgeRetryWaitSecondsList, judgeAbsentReason, ...JUDGE_TEXT_NAME_LIST.reduce((soFar, settingName) => ({ ...soFar, [settingName]: judgeConfigValues[settingName] }), {}) } };
};

// the JSON's patterns, compiled once; the first row that matches names the fault. An error text that matches none is the judge's answer being refused, not the vendor failing.
const FAULT_ROW_LIST = judgedSettings.vendorFaultRowList.map((oneRow) => ({ ...oneRow, compiledPattern: new RegExp(oneRow.pattern, 'i') }));
const vendorFaultRowOf = (errorText) => FAULT_ROW_LIST.find((oneRow) => oneRow.compiledPattern.test(errorText));
// ⟪rosettaLoginPolish #5, review S2⟫ a vendor fault's words are a stopped job's words, so they live in rosettaReasonWords.json under the fault's own name; a
// fault the vocabulary has no words for is refused here, at load, rather than when a vendor first fails that way
const unwordedFaultNameList = [...judgedSettings.vendorFaultRowList, judgedSettings.unnamedVendorFault].map((oneRow) => oneRow.faultName).filter((faultName) => !REASON_NAME_LIST.includes(faultName));
if (unwordedFaultNameList.length) {
	throw new Error(`rosettaJudgeEngine: rosettaReasonWords.json has no words for the vendor faults ${unwordedFaultNameList.join(', ')}`);
}
const vendorStopOf = (faultName) => ({ faultName, reason: reasonOf(faultName) });

// the forge's scan reads identifiers as they are written: P001234, ceterms:Name. A person may type p001234, P 001234, P００１２３４ or CETERMS:Name, and a model reads all of them as the id. So each text is scanned as written and in two normal forms: full width folded, separators inside an id closed up, then each case.
const SEPARATOR_INSIDE_IDENTIFIER_PATTERN = /([PpCc]|\d)[\s\-_.]+(?=\d)/g;
// zero-width and other format characters (Unicode Cf) are invisible to a reader and to NFKC, so they go before anything else
const FORMAT_CHARACTER_PATTERN = /\p{Cf}/gu;
// a whole text upper-cased turns step123456 into an id; only a p or c standing alone before six digits is raised
const IDENTIFIER_LETTER_PATTERN = /(?<![A-Za-z])([pc])(?=\d{6})/g;
const normalFormListOf = (fieldText) => {
	const closedText = String(fieldText).replace(FORMAT_CHARACTER_PATTERN, '').normalize('NFKC').replace(SEPARATOR_INSIDE_IDENTIFIER_PATTERN, '$1');
	return [String(fieldText), closedText, closedText.replace(IDENTIFIER_LETTER_PATTERN, (identifierLetter) => identifierLetter.toUpperCase()), closedText.toLowerCase()];
};
// one text's surfaces for a scan, each normal form named by its part: name0..name3
const surfacesOfPart = ({ partName, partText }) => normalFormListOf(partText || '').reduce((formsSoFar, formText, formIndex) => ({ ...formsSoFar, [`${partName}${formIndex}`]: formText }), {});
const sourceSurfacesOf = (oneField) => ['name', 'definition', 'path', 'type'].reduce((soFar, partName) => ({ ...soFar, ...surfacesOfPart({ partName, partText: oneField[partName] }) }), {});

// ⟪rosettaSearchDescription⟫ one hub's identifier scan, from the forge's own bridging: the judge reads it per hub, and the search describer scans its own sentence with
// every judged hub's scan, so a model's sentence holding a hub identifier never becomes a search text
const hubIdentifierScanFor = ({ judgeModules, hubName }) => {
	const hubRow = judgedSettings.hubRowByName[hubName];
	if (!hubRow) {
		return { refusalText: `this service has no judge wording for hub ${hubName}` };
	}
	const bridgingRead = judgeModules.hubBridgingFor(hubRow);
	if (bridgingRead.error) {
		return { refusalText: bridgingRead.error };
	}
	const { hubBridging } = bridgingRead;
	const scanMade = judgeModules.promptIdentifierScanFor({ scanDeclaration: hubBridging.promptIdentifierScan, standardKey: hubRow.forgeBundleName });
	if (scanMade.error) {
		return { refusalText: scanMade.error };
	}
	return { hubBridging, identifierScan: scanMade };
};

// a NONE from a response that was cut may be the model running out of room, so it is not reported as a judge declining
const unitStatusOfJudged = ({ chosenCardStableId, answerWasCut }) => {
	if (chosenCardStableId !== null) {
		return 'proposed';
	}
	return answerWasCut ? 'abstainedOnCutAnswer' : 'abstained';
};
const STORE_FAILED_STOP = Object.freeze({ jobStatus: 'stopped', stopReasonName: 'storeFailed', stopReasonText: reasonOf('storeRefusedJudgeRecord') });
const JUDGE_ANSWER_REFUSAL_PATTERN = new RegExp(judgedSettings.judgeAnswerRefusalPattern, 'i');

const createRosettaJudgeEngine = ({ judgedValues, judgeModules, jobStore, componentOverrides, nowMs, waitMilliseconds, xLog }) => {
	if (judgedValues.judgeProviderName !== PROVIDER_NAME_ANTHROPIC) {
		return { refusalText: `[rosetta-judge] judgeProviderName is '${judgedValues.judgeProviderName}'; this build judges through ${PROVIDER_NAME_ANTHROPIC}` };
	}
	// ⟪rosettaMeanings review B1⟫ the variant is checked here, once, against the forge actually loaded: a forge without it leaves the judged step off by name at startup, never a job stopped unit by unit
	const renderedVariantNameList = judgeModules.judgePromptVariantNameList || [];
	if (!renderedVariantNameList.includes(judgedValues.judgePromptVariant)) {
		return { refusalText: `[rosetta-judge] judgePromptVariant '${judgedValues.judgePromptVariant}' is not a variant the loaded forge renders; it renders ${renderedVariantNameList.join(', ') || 'none it declares'}` };
	}
	const pricing = judgeModules.loadSpendPricing({ pricingFilePath: judgedValues.spendPricingFilePath });
	if (pricing.error) {
		return { refusalText: `the judge's prices would not read: ${pricing.error.message || pricing.error}` };
	}
	const { spendPricer } = pricing;
	// the model is this instance's choice, named in [rosetta-judge]: the forge's ini holds the credential, and its model line is the forge's business
	const made = judgeModules.createLlmClient({ configFilePath: judgedValues.anthropicConfigFilePath, wireModel: judgedValues.judgeWireModel, ...(componentOverrides ? { componentOverrides } : {}) });
	if (made.error) {
		return { refusalText: made.error };
	}
	const { judgeClient } = made;
	// the budget lives in the file the credential lives in, which a person can carry from another instance: said here and proved here, so a wrong file is a refusal and not a run of cut answers
	if (judgeClient.judgeConfig.maxTokens !== Number(judgedValues.judgeOutputTokenBudget)) {
		return { refusalText: `[rosetta-judge] judgeOutputTokenBudget is ${judgedValues.judgeOutputTokenBudget}, and the judge's own ini gives ${judgeClient.judgeConfig.maxTokens}: set maxTokens in that file` };
	}
	const priceRead = spendPricer.priceRowFor({ provider: PROVIDER_NAME_ANTHROPIC, model: judgeClient.wireModel });
	if (priceRead.error) {
		return { refusalText: `the judge's model ${judgeClient.wireModel} is refused as unpriced: ${priceRead.error.message || priceRead.error}` };
	}

	// each hub's half of a bridge, once: what its cards show the judge and what must never reach the judge
	const hubFactsByName = {};
	const hubFactsFor = (hubName) => {
		if (hubFactsByName[hubName]) {
			return hubFactsByName[hubName];
		}
		const scanRead = hubIdentifierScanFor({ judgeModules, hubName });
		if (scanRead.refusalText) {
			return scanRead;
		}
		const { hubBridging, identifierScan } = scanRead;
		hubFactsByName[hubName] = { hubBridging, identifierScan, candidateFieldNameList: hubBridging.candidateRenderingAllowList };
		return hubFactsByName[hubName];
	};

	// ⟪rosettaMeanings R3, TQ Q86⟫ ANONYMOUS JUDGING'S OWN CEILING, before every one of its vendor calls. A call is priced at its WORST case (the prompt's characters,
	// more than its tokens, plus the configured overhead, and the whole output budget), and that worst case is what its judgeCalls row holds until the bill corrects
	// it: so the rolling sum already carries every anonymous call in flight at its worst case. Check and write take turns, in this process (the only writer), so two
	// anonymous jobs cannot both pass on the room for one.
	const MILLISECONDS_PER_DAY = 86400000;
	let isCheckingAnonymousSpend = false;
	const waitingAnonymousCheckList = [];
	const inAnonymousTurn = (checkAndWrite) => {
		const begin = () => {
			isCheckingAnonymousSpend = true;
			checkAndWrite(() => {
				isCheckingAnonymousSpend = false;
				const nextInLine = waitingAnonymousCheckList.shift();
				if (nextInLine) {
					nextInLine();
				}
			});
		};
		if (isCheckingAnonymousSpend) {
			waitingAnonymousCheckList.push(begin);
			return;
		}
		begin();
	};
	const worstCaseUsdOf = (rerankOptions) => spendPricer.usdFor({ provider: PROVIDER_NAME_ANTHROPIC, model: judgeClient.wireModel, inputTokens: String(rerankOptions.systemPrompt || '').length + String(rerankOptions.userPrompt || '').length + judgedValues.judgeWorstCaseOverheadTokens, outputTokens: Number(judgedValues.judgeOutputTokenBudget) });
	// writes the call's row and answers its callRefId, or answers a stop: for an anonymous job only after its ceiling admits this call's worst case
	const addMeteredCall = ({ jobRefId, ownerPrincipalRefId, ownerPrincipalKind, fieldIndex, hubName, promptHash, rerankOptions }, done) => {
		if (ownerPrincipalKind !== ANONYMOUS_PRINCIPAL_KIND) {
			jobStore.addJudgeCall({ jobRefId, ownerPrincipalRefId, fieldIndex, hubName, estimateUsd: judgedValues.judgeUsdPerFieldEstimate, wireModel: judgeClient.wireModel, promptHash }, (addError, callRefId) => done(addError, { callRefId }));
			return;
		}
		const worstCase = worstCaseUsdOf(rerankOptions);
		if (worstCase.error) {
			done(`the worst case of a judge call cannot be priced: ${worstCase.error.message || worstCase.error}`);
			return;
		}
		inAnonymousTurn((turnFinished) => jobStore.rollingSpendUsd({ sinceMs: nowMs() - MILLISECONDS_PER_DAY, ownerPrincipalKindList: [ANONYMOUS_PRINCIPAL_KIND] }, (spendError, anonymousSpentUsd) => {
			if (spendError) {
				turnFinished();
				done(spendError);
				return;
			}
			if (anonymousSpentUsd + worstCase.usd > judgedValues.anonymousDailyCeilingUsd) {
				turnFinished();
				done('', { stopReason: { jobStatus: 'fuseTripped', stopReasonName: 'anonymousDailyCeilingReached', stopReasonText: reasonOf('anonymousDailyCeilingStop') } });
				return;
			}
			jobStore.addJudgeCall({ jobRefId, ownerPrincipalRefId, fieldIndex, hubName, estimateUsd: worstCase.usd, wireModel: judgeClient.wireModel, promptHash }, (addError, callRefId) => {
				turnFinished();
				done(addError, { callRefId });
			});
		}));
	};

	// THE METER. judgeOne calls rerank; this is rerank. One attempt per row, priced as it answers, waits between attempts within the stated bound, and stopReasonNow asked before each attempt, so a fuse or a cancel holds between retries too.
	const meteredClientFor = ({ jobRefId, ownerPrincipalRefId, ownerPrincipalKind, fieldIndex, hubName, stopReasonNow, stopHolder, promptHash }) => ({
		...judgeClient,
		rerank: (rerankOptions, rerankDone) => {
			const attemptNumberOf = (waitIndex) => waitIndex + 1;
			const runAttempt = (waitIndex) => stopReasonNow((stopError, stopReason) => {
				if (stopError) {
					stopHolder.stopReason = STORE_FAILED_STOP;
					rerankDone(`rosettaJudgeEngine: the fuse could not be read: ${stopError}`);
					return;
				}
				if (stopReason) {
					stopHolder.stopReason = stopReason;
					rerankDone(`rosettaJudgeEngine: stopped before attempt ${attemptNumberOf(waitIndex)}: ${stopReason.stopReasonName}`);
					return;
				}
				addMeteredCall({ jobRefId, ownerPrincipalRefId, ownerPrincipalKind, fieldIndex, hubName, promptHash, rerankOptions }, (addError, metered) => {
					if (addError) {
						stopHolder.stopReason = STORE_FAILED_STOP;
						rerankDone(`rosettaJudgeEngine: the bill would not write, so the call was not sent: ${addError}`);
						return;
					}
					if (metered.stopReason) {
						stopHolder.stopReason = metered.stopReason;
						rerankDone(`rosettaJudgeEngine: stopped before attempt ${attemptNumberOf(waitIndex)}: ${metered.stopReason.stopReasonName}`);
						return;
					}
					const { callRefId } = metered;
					// ⟪rosettaMeanings R2⟫ the exact text this attempt sends: the last one sent is the prompt the unit was judged with
					stopHolder.sentPrompt = { systemPrompt: String(rerankOptions.systemPrompt), userPrompt: String(rerankOptions.userPrompt) };
					const startedAtMs = nowMs();
					judgeClient.rerank({ ...rerankOptions, maxRetries: SINGLE_ATTEMPT }, (rerankError, clientReturn) => {
						const faultRow = rerankError ? vendorFaultRowOf(String(rerankError)) : undefined;
						// a fault the vendor does not bill frees its estimate; one it may have billed keeps it, and a retry adds another: retries are priced
						const finishWith = (callFacts, afterFinish) => jobStore.finishJudgeCall({ callRefId, ...callFacts }, (finishError) => {
							if (finishError) {
								stopHolder.stopReason = STORE_FAILED_STOP;
								rerankDone(`rosettaJudgeEngine: the bill would not write: ${finishError}`);
								return;
							}
							afterFinish();
						});
						const retryOrStop = (oneFaultRow, afterStop) => {
							const waitSeconds = judgedValues.judgeRetryWaitSecondsList[waitIndex];
							const isUnderAttemptLimit = oneFaultRow.attemptLimit === undefined || attemptNumberOf(waitIndex) < oneFaultRow.attemptLimit;
							if (oneFaultRow.retriable && waitSeconds !== undefined && isUnderAttemptLimit) {
								xLog.status(`rosettaJudgeEngine: job ${jobRefId}: ${oneFaultRow.faultName}, attempt ${attemptNumberOf(waitIndex)}, waiting ${waitSeconds} s`);
								waitMilliseconds(waitSeconds * 1000, () => runAttempt(waitIndex + 1));
								return;
							}
							afterStop();
						};
						if (rerankError) {
							// a vendor failing in a way nobody named stops the job: asked a hundred times, it would otherwise end done
							if (!faultRow) {
								finishWith({ callStatus: CALL_STATUS.failedUnbilled, usd: 0, faultName: judgedSettings.unnamedVendorFault.faultName }, () => {
									stopHolder.vendorStop = vendorStopOf(judgedSettings.unnamedVendorFault.faultName);
									rerankDone(`rosettaJudgeEngine: ${judgedSettings.unnamedVendorFault.faultName}`);
								});
								return;
							}
							finishWith(faultRow.billedWhenUnanswered ? { callStatus: CALL_STATUS.unansweredPriced, usd: judgedValues.judgeUsdPerFieldEstimate, faultName: faultRow.faultName } : { callStatus: CALL_STATUS.failedUnbilled, usd: 0, faultName: faultRow.faultName }, () => retryOrStop(faultRow, () => {
								if (faultRow.endsUnitOnly) {
									rerankDone(`rosettaJudgeEngine: ${faultRow.faultName}`);
									return;
								}
								stopHolder.vendorStop = vendorStopOf(faultRow.faultName);
								rerankDone(`rosettaJudgeEngine: ${faultRow.faultName}`);
							}));
							return;
						}
						const spendCallList = clientReturn.spendCallList || [];
						const pricedUsd = spendCallList.reduce((soFar, oneCall) => {
							const priced = spendPricer.usdFor(oneCall);
							return soFar === null || priced.error ? null : soFar + priced.usd;
						}, 0);
						if (pricedUsd === null) {
							finishWith({ callStatus: CALL_STATUS.unansweredPriced, usd: judgedValues.judgeUsdPerFieldEstimate, faultName: 'judgeModelUnpriced' }, () => {
								stopHolder.vendorStop = vendorStopOf('judgeModelUnpriced');
								rerankDone('rosettaJudgeEngine: judgeModelUnpriced');
							});
							return;
						}
						const callFacts = { callStatus: CALL_STATUS.answered, usd: pricedUsd, inputTokens: spendCallList.reduce((soFar, oneCall) => soFar + oneCall.inputTokens, 0), outputTokens: spendCallList.reduce((soFar, oneCall) => soFar + oneCall.outputTokens, 0) };
						// a response cut at the client's token budget still holds its choice when the model wrote that first. It is a fact about the answer, kept with it (measured: at a pool of 40 the forge's tool asks more than fits).
						// set afresh on every answered attempt: a re-ask that answers whole is not cut because the first answer was
						stopHolder.answerWasCut = clientReturn.stopReason === STOP_REASON_MAX_TOKENS;
						if (stopHolder.answerWasCut) {
							callFacts.faultName = 'answerCutAtMaxTokens';
						}
						const isIncomplete = clientReturn.category === undefined || clientReturn.rationale === undefined;
						finishWith(callFacts, () => {
							// a judgment with no category or reason, cut or careless: one more try, priced, and then judgeOne's own rule decides. It can never read as an abstention, because judgeOne refuses an abstention with no reason.
							if (isIncomplete && waitIndex === 0) {
								waitMilliseconds(judgedValues.judgeRetryWaitSecondsList[0] * 1000, () => runAttempt(1));
								return;
							}
							rerankDone('', { ...clientReturn, latencyMs: nowMs() - startedAtMs });
						});
					});
				});
			});
			runAttempt(0);
		},
	});

	// what the stranger wrote, as the forge's source element: the subject side of the allow-list, so a property nobody declared cannot reach a prompt. On one line each: the renderer prints a value raw, so a newline in a stranger's text would make lines that look like the prompt's own sections.
	const oneLineOf = (fieldText) => String(fieldText).replace(/\s*[\r\n\u2028\u2029]+\s*/g, ' ');
	// ⟪rosettaSearchDescription, TQ Q110⟫ a field the person gave no description may carry the model's search description, on its own labelled line (searchDescription, its
	// value prefixed with whose words they are), never as the field's description. A field with a description of its own never carries it.
	const searchDescriptionMaterialOf = ({ oneField, searchDescriptionText }) => (!oneField.definition && searchDescriptionText ? { searchDescription: `${judgedSettings.searchDescriptionSubjectPrefix}${oneLineOf(searchDescriptionText)}` } : {});
	const sourceElementOf = ({ oneField, searchDescriptionText }) => ({
		name: oneLineOf(oneField.name),
		stableId: oneLineOf(oneField.name),
		material: { name: oneLineOf(oneField.name), ...(oneField.definition ? { description: oneLineOf(oneField.definition) } : {}), ...(oneField.path ? { path: oneLineOf(oneField.path) } : {}), ...(oneField.type ? { dataType: oneLineOf(oneField.type) } : {}), ...searchDescriptionMaterialOf({ oneField, searchDescriptionText }) },
		evidence: { subject: {}, assertion: {} },
		sourceLabelByColumn: {},
		sourceNoteByColumn: {},
	});

	const judgeFieldAgainstPool = ({ jobRefId, ownerPrincipalRefId, ownerPrincipalKind, fieldIndex, oneField, searchDescriptionText, hubName, candidateCardList, stopReasonNow }, done) => {
		const searchDescriptionMaterial = searchDescriptionMaterialOf({ oneField, searchDescriptionText });
		const isJudgedWithSearchDescription = Boolean(searchDescriptionMaterial.searchDescription);
		const hubFacts = hubFactsFor(hubName);
		if (hubFacts.refusalText) {
			done(hubFacts.refusalText);
			return;
		}
		const { hubBridging, identifierScan } = hubFacts;
		// a stranger who pastes ids is no attacker, but an id lets the judge match by id instead of meaning: this one field is not judged, and the job goes on (design 4.8)
		const sourceHit = identifierScan.firstHitIn({ ...sourceSurfacesOf(oneField), ...surfacesOfPart({ partName: 'searchDescription', partText: searchDescriptionMaterial.searchDescription }) });
		if (sourceHit) {
			done('', { unitStatus: 'identifierInSourceText', identifierScanPatternName: sourceHit.patternName, identifierScanSurfaceName: sourceHit.surfaceName });
			return;
		}
		const sortedPool = candidateCardList.slice().sort((left, right) => (left.stableId < right.stableId ? -1 : left.stableId > right.stableId ? 1 : 0)); // retrieval's rank never reaches the judge, as in the forge
		const rendered = judgeModules.renderQuestion({
			sourceElement: sourceElementOf({ oneField, searchDescriptionText }),
			candidatePool: sortedPool.map((oneCard) => ({ card: oneCard, seatReason: 'retrieval' })),
			globalGuidanceList: [],
			perCandidateNoteByStableId: {},
			promptSegmentList: [],
			judgePromptVariant: judgedValues.judgePromptVariant,
			renderingAllowList: { subject: judgedSettings.subjectRenderingAllowList, candidate: hubBridging.candidateRenderingAllowList },
			blindingNameList: hubBridging.sourceAnchorBlindingNameList,
			renderedProseIdentifierRule: hubBridging.renderedProseIdentifierRule,
		});
		if (rendered.error) {
			done(`rendering a question: ${rendered.error.message}`);
			return;
		}
		const question = { ...rendered, toolCandidateNoun: hubBridging.judgeWording.toolCandidateNoun };
		const questionHit = identifierScan.firstHitIn(identifierScan.surfacesOfQuestion({ predicateRule: judgedSettings.judgePredicateRule, question }));
		if (questionHit) {
			done('', { unitStatus: 'identifierInCandidateText', identifierScanPatternName: questionHit.patternName, identifierScanSurfaceName: questionHit.surfaceName });
			return;
		}
		const stopHolder = {};
		const judgedPromptOf = () => stopHolder.sentPrompt || { systemPrompt: question.systemPrompt, userPrompt: question.userPrompt };
		judgeModules.judgeOne({
			question,
			judgeClient: meteredClientFor({ jobRefId, ownerPrincipalRefId, ownerPrincipalKind, fieldIndex, hubName, stopReasonNow, stopHolder, promptHash: question.promptHash }),
			// ⟪rosettaMeanings review⟫ an anonymous job's cache is its own: keyed by its jobRefId, so no cached answer (nor its being free) can tell one visitor what another at the same address sent, and it is deleted with the job
			judgmentCache: jobStore.judgmentCacheFor({ ownerPrincipalRefId: ownerPrincipalKind === ANONYMOUS_PRINCIPAL_KIND ? jobRefId : ownerPrincipalRefId, onCutMarkRead: (wasCut) => { stopHolder.answerWasCut = wasCut; }, cutMarkForPut: () => Boolean(stopHolder.answerWasCut) }),
			matchForensics: { appendRecord: ({ pairKey: pairName, generation, record }, appended) => jobStore.appendForensicRecord({ jobRefId, pairName, generation, record }, appended) },
			budget: { ...JUDGMENT_BUDGET_PER_UNIT, judgmentCountSoFar: 0 },
			pairKey: `rosetta::${hubName}`,
			generation: jobRefId,
			reaskPromptRefusalFor: (reaskUserPrompt) => {
				const reaskHit = identifierScan.firstHitIn({ reaskUserPrompt });
				return reaskHit ? `the re-ask carries an identifier (${reaskHit.patternName})` : '';
			},
			judgeConfigCacheDigest: null,
			spendPricer,
		}, (judgeError, judged) => {
			if (stopHolder.stopReason) {
				done('', { stoppedBy: stopHolder.stopReason });
				return;
			}
			if (stopHolder.vendorStop) {
				done('', { vendorStop: stopHolder.vendorStop });
				return;
			}
			if (judgeError) {
				// the vendor answered, and judgeOne would not take the answer (a form fault after its one re-ask, an unreadable choice). The money is already on the bill. The text can quote the prompt, so it stays in no log. Anything else judgeOne says is this service failing, which must stop the job and not read as a judge's refusal.
				if (!JUDGE_ANSWER_REFUSAL_PATTERN.test(String(judgeError)) && !/rosettaJudgeEngine: judgeUnpricedAnswer/.test(String(judgeError))) {
					xLog.error(`rosettaJudgeEngine: job ${jobRefId}: judging failed in this service, not at the vendor`);
					done('', { stoppedBy: { jobStatus: 'stopped', stopReasonName: 'judgeFaulted', stopReasonText: reasonOf('judgeFaulted') } });
					return;
				}
				xLog.status(`rosettaJudgeEngine: job ${jobRefId}: judgeOne refused one answer`);
				done('', { unitStatus: 'judgeRefused', notJudgedReason: 'answerRefused', promptHash: question.promptHash, rendererVersion: rendered.rendererVersion, judgedPrompt: judgedPromptOf(), ...(isJudgedWithSearchDescription ? { judgedWithSearchDescription: true } : {}) });
				return;
			}
			const collapse = (rendered.cardCollapseList || []).find((oneEntry) => oneEntry.renderedStableId === judged.chosenCardStableId);
			// ⟪rosettaMeanings R2⟫ judged from the cache, nothing was sent: the prompt is the rendered question that answer was given to (its promptHash is the cache's address)
			done('', {
				unitStatus: unitStatusOfJudged({ chosenCardStableId: judged.chosenCardStableId, answerWasCut: stopHolder.answerWasCut }),
				promptHash: question.promptHash,
				// ⟪P7b, TQ Q66⟫ the version this unit's question was rendered with, which keys its promptHash: what the fetch answer names as using.promptVersion
				rendererVersion: rendered.rendererVersion,
				cacheHit: judged.cacheHit,
				...(judged.chosenCardStableId === null ? {} : { chosenCardStableId: judged.chosenCardStableId, category: judged.category, confidence: judged.confidence === undefined ? CONFIDENCE_OF_NO_CATEGORY : judged.confidence, ...(judged.predicate ? { predicate: judged.predicate } : {}) }),
				...(collapse ? { collapsedMemberStableIdList: collapse.memberStableIdList } : {}),
				judgesRationale: judged.rationale,
				judgedPrompt: judgedPromptOf(),
				choiceCount: rendered.choiceEnum.length - 1,
				...(stopHolder.answerWasCut ? { answerWasCut: true } : {}),
				// ⟪TQ Q110⟫ the judge was shown the model's search description beside the field
				...(isJudgedWithSearchDescription ? { judgedWithSearchDescription: true } : {}),
			});
		});
	};

	return { judgeFieldAgainstPool, hubFactsFor, judgeClient, spendPricer, ledgerModules: { spendLedgerLib: judgeModules.spendLedgerLib }, judgeFacts: { provider: PROVIDER_NAME_ANTHROPIC, model: judgeClient.wireModel, promptVariant: judgedValues.judgePromptVariant } };
};

module.exports = { createRosettaJudgeEngine, rosettaJudgedValuesOf, vendorFaultRowOf, judgedSettings, hubIdentifierScanFor, surfacesOfPart };
