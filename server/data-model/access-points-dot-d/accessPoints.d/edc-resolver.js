#!/usr/bin/env node
'use strict';
// @concept: [[AccessPointPattern]]

// edc-resolver — answers one edc: request path (edcResolverEndpoint-110226). Input { edcRequestPath, answerFormat, whenClientGone }; output { httpStatus, contentType,
// bodyText, extraHeaderByName } or, for a whole-block child, { httpStatus, contentType, deliverTo }. Dispatch by forgeAdapter.routeFor: the single-row kinds
// resolve in this process; the whole-block kinds and the slow listings in a spawned child, one at a time; a block over wholeBlockMaxBytes is sent as the store holds it, by a child reading it with sqlite3; over directBlockMaxBytes it answers 413 without spawning. Every
// refusal the resolver or this module makes is an ANSWER, never a pipe error: its status and its words are the contract.
// The store and the forge load once, here, at startup. A failure is logged once and every request answers 503 with the same cause until a restart;
// nothing retries. Replacing the store file or changing the licence hold list means an API restart (see forgeAdapter.js).

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const { pipeRunner, taskListPlus } = new require('qtools-asynchronous-pipe-plus')();
const { openForgeAdapter } = require('../../../lib/edc-resolver/forgeAdapter');
const { wholeBlockRunnerFor } = require('../../../lib/edc-resolver/wholeBlockRunner');
const { answerTextFor, CONTENT_TYPE_BY_FORMAT } = require('../../../lib/edc-resolver/htmlAnswer');

const WHOLE_BLOCK_BUSY_RETRY_SECONDS = 5;
// ⟪TQ Q39⟫ the bytes of a direct block reach the client unchecked: the client holds the hash and checks it, as the block's own name promises it can
const DIRECT_BLOCK_CONTENT_TYPE = 'text/plain; charset=utf-8';
const DIRECT_BLOCK_VERIFICATION_TEXT = 'This block is read directly from the store and is not checked before it is sent: check that the sha256 of these bytes equals X-Edc-Expected-Sha256, which is also the name in its URI.';

//START OF moduleFunction() ============================================================

const moduleFunction = function ({ dotD, passThroughParameters }) {
	const { xLog, getConfig } = process.global;

	const forgeAdapter = openForgeAdapter({ configValues: getConfig(moduleName) });
	if (forgeAdapter.refusalText) {
		xLog.error(forgeAdapter.refusalText);
	} else {
		xLog.status(forgeAdapter.startupLine);
	}
	const wholeBlockRunner = forgeAdapter.refusalText ? null : wholeBlockRunnerFor({ ...forgeAdapter, xLog });

	const textAnswerFor = ({ edcRequestPath, answerFormat, httpStatus, answerBody, extraHeaderByName = {} }) => ({
		httpStatus,
		contentType: CONTENT_TYPE_BY_FORMAT[answerFormat],
		extraHeaderByName,
		bodyText: answerTextFor({
			answerFormat,
			httpStatus,
			answerBody,
			edcIri: forgeAdapter.refusalText ? edcRequestPath : forgeAdapter.edcIriFor(edcRequestPath),
			publicPathPrefix: forgeAdapter.publicPathPrefix,
			baseIri: forgeAdapter.baseIri,
		}),
	});

	// one answer per route (DATA, no branch); each calls done(answer)
	const ANSWER_BY_ROUTE_NAME = Object.freeze({
		inProcess: ({ edcRequestPath, answerFormat }, done) =>
			forgeAdapter.resolveInProcess(edcRequestPath, ({ httpStatus, body }) => done(textAnswerFor({ edcRequestPath, answerFormat, httpStatus, answerBody: body }))),
		overCap: ({ edcRequestPath, answerFormat, route }, done) =>
			done(textAnswerFor({
				edcRequestPath,
				answerFormat,
				httpStatus: 413,
				answerBody: { kind: route.kind, blockIdentity: route.blockIdentity, byteSize: route.byteSize, wholeBlockMaxBytes: forgeAdapter.wholeBlockMaxBytes, error: `${route.kind} ${route.blockIdentity} is ${route.byteSize} bytes, over this instance's cap of ${forgeAdapter.directBlockMaxBytes}; it is not served here` },
			})),
		directBlock: ({ edcRequestPath, answerFormat, whenClientGone, route }, done) => {
			if (wholeBlockRunner.isBusy()) {
				done(textAnswerFor({ edcRequestPath, answerFormat, httpStatus: 503, extraHeaderByName: { 'Retry-After': String(WHOLE_BLOCK_BUSY_RETRY_SECONDS) }, answerBody: { kind: route.kind, error: `another long read is running; this instance runs one at a time. Retry after ${WHOLE_BLOCK_BUSY_RETRY_SECONDS} seconds` } }));
				return;
			}
			const { educoreForgeCodePath, uriContractFilePath, publicPathPrefix, directBlockSqliteCommandPath } = forgeAdapter;
			wholeBlockRunner.runOneChild({ childPlanName: 'directBlock', whenClientGone, childInput: { educoreForgeCodePath, uriContractFilePath, sqliteCommandPath: directBlockSqliteCommandPath, kind: route.kind, blockIdentity: route.blockIdentity, answerFormat, publicPathPrefix } }, (childFault, childAnswer) => {
				if (childFault) {
					xLog.error(childFault.errorText);
					done(textAnswerFor({ edcRequestPath, answerFormat, httpStatus: childFault.httpStatus, answerBody: { kind: route.kind, error: childFault.errorText } }));
					return;
				}
				if (childAnswer.httpStatus !== 200) {
					done({ httpStatus: childAnswer.httpStatus, contentType: CONTENT_TYPE_BY_FORMAT[answerFormat], extraHeaderByName: {}, deliverTo: childAnswer.deliverTo });
					return;
				}
				done({ httpStatus: 200, contentType: DIRECT_BLOCK_CONTENT_TYPE, extraHeaderByName: { 'Content-Length': String(route.byteSize), 'X-Edc-Expected-Sha256': route.blockIdentity, 'X-Edc-Verification': DIRECT_BLOCK_VERIFICATION_TEXT }, deliverTo: childAnswer.deliverTo });
			});
		},
		wholeBlockChild: ({ edcRequestPath, answerFormat, whenClientGone, route }, done) => {
			if (wholeBlockRunner.isBusy()) {
				done(textAnswerFor({ edcRequestPath, answerFormat, httpStatus: 503, extraHeaderByName: { 'Retry-After': String(WHOLE_BLOCK_BUSY_RETRY_SECONDS) }, answerBody: { kind: route.kind, error: `another long read is running; this instance runs one at a time. Retry in ${WHOLE_BLOCK_BUSY_RETRY_SECONDS} seconds` } }));
				return;
			}
			const { educoreForgeCodePath, uriContractFilePath, publicPathPrefix } = forgeAdapter;
			wholeBlockRunner.runOneChild({ childPlanName: 'wholeBlock', whenClientGone, childInput: { educoreForgeCodePath, uriContractFilePath, uriOrPath: edcRequestPath, answerFormat, publicPathPrefix } }, (childFault, childAnswer) => {
				if (childFault) {
					xLog.error(childFault.errorText);
					done(textAnswerFor({ edcRequestPath, answerFormat, httpStatus: childFault.httpStatus, answerBody: { kind: route.kind, error: childFault.errorText } }));
					return;
				}
				done({ httpStatus: childAnswer.httpStatus, contentType: CONTENT_TYPE_BY_FORMAT[answerFormat], extraHeaderByName: {}, deliverTo: childAnswer.deliverTo });
			});
		},
	});

	// ================================================================================
	// SERVICE FUNCTION

	const serviceFunction = ({ edcRequestPath, answerFormat, whenClientGone }, callback) => {
		const taskList = new taskListPlus();

		// the store is not open: the same cause the startup log gave
		taskList.push((args, next) => {
			if (forgeAdapter.refusalText) {
				next('skipRestOfPipe', { ...args, resolverAnswer: textAnswerFor({ edcRequestPath, answerFormat, httpStatus: 503, answerBody: { error: forgeAdapter.refusalText } }) });
				return;
			}
			next('', args);
		});

		taskList.push((args, next) => next('', { ...args, route: forgeAdapter.routeFor(edcRequestPath) }));

		taskList.push((args, next) => {
			ANSWER_BY_ROUTE_NAME[args.route.routeName]({ edcRequestPath, answerFormat, whenClientGone, route: args.route }, (resolverAnswer) => next('', { ...args, resolverAnswer }));
		});

		pipeRunner(taskList.getList(), {}, (pipeError, args) => {
			if (pipeError && pipeError !== 'skipRestOfPipe') {
				callback(`${moduleName}: ${pipeError}`);
				return;
			}
			callback('', args.resolverAnswer);
		});
	};

	// ================================================================================
	// REGISTRATION

	dotD.library.add(moduleName, serviceFunction);
	return {};
};

//END OF moduleFunction() ============================================================

module.exports = moduleFunction;
