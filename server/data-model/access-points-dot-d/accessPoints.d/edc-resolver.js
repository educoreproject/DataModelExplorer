#!/usr/bin/env node
'use strict';
// @concept: [[AccessPointPattern]]

// edc-resolver — answers one edc: request path (edcResolverEndpoint-110226). Input { edcRequestPath, answerFormat, whenClientGone }; output { httpStatus, contentType,
// bodyText, extraHeaderByName } or, for a whole-block child, { httpStatus, contentType, deliverTo }. Dispatch by forgeAdapter.routeFor: the single-row kinds
// resolve in this process; the whole-block kinds in a spawned child, one at a time; a block over wholeBlockMaxBytes answers 413 without spawning. Every
// refusal the resolver or this module makes is an ANSWER, never a pipe error: its status and its words are the contract.
// The store and the forge load once, here, at startup. A failure is logged once and every request answers 503 with the same cause until a restart;
// nothing retries. Replacing the store file or changing the licence hold list means an API restart (see forgeAdapter.js).

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const { pipeRunner, taskListPlus } = new require('qtools-asynchronous-pipe-plus')();
const { openForgeAdapter } = require('../../../lib/edc-resolver/forgeAdapter');
const { wholeBlockRunnerFor } = require('../../../lib/edc-resolver/wholeBlockRunner');
const { answerTextFor, CONTENT_TYPE_BY_FORMAT } = require('../../../lib/edc-resolver/htmlAnswer');

const WHOLE_BLOCK_BUSY_RETRY_SECONDS = 5;

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
				answerBody: { kind: route.kind, blockIdentity: route.blockIdentity, byteSize: route.byteSize, wholeBlockMaxBytes: forgeAdapter.wholeBlockMaxBytes, error: `${route.kind} ${route.blockIdentity} is ${route.byteSize} bytes, over this instance's cap of ${forgeAdapter.wholeBlockMaxBytes}; it is not served here` },
			})),
		wholeBlockChild: ({ edcRequestPath, answerFormat, whenClientGone, route }, done) => {
			if (wholeBlockRunner.isBusy()) {
				done(textAnswerFor({ edcRequestPath, answerFormat, httpStatus: 503, extraHeaderByName: { 'Retry-After': String(WHOLE_BLOCK_BUSY_RETRY_SECONDS) }, answerBody: { kind: route.kind, error: `another whole-block answer is being read; this instance reads one at a time. Retry in ${WHOLE_BLOCK_BUSY_RETRY_SECONDS} seconds` } }));
				return;
			}
			const { educoreForgeCodePath, uriContractFilePath, publicPathPrefix } = forgeAdapter;
			wholeBlockRunner.runOneChild({ whenClientGone, childInput: { educoreForgeCodePath, uriContractFilePath, uriOrPath: edcRequestPath, answerFormat, publicPathPrefix } }, (childFault, childAnswer) => {
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
