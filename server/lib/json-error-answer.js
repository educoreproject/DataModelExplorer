'use strict';
// json-error-answer.js — the last middleware on the Express app: answers an error no route answered in JSON, by name, with an
// errorId, and never with the error's message, its stack or a path (todo 794a45ec: POST /mcp over the JSON parser's 100 KB limit,
// with no credential, got Express's HTML page carrying the stack and the server's file paths). The detail goes to the log under the
// same errorId. What each error type is called lives in json-error-answer-registry.json.
//
//   expressApp.use(require('./lib/json-error-answer'))   mounted once in startApiServer.js, after every route
//
// The four-argument signature is what makes Express treat this as an error handler. NODE_ENV is not read: the answer is the same
// in every environment.

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const makeRefId = require('./make-ref-id');
const { answerByErrorType, unknownErrorAnswer } = require('./json-error-answer-registry.json');

const CLIENT_ERROR_STATUS_PATTERN = /^4\d\d$/;

const answerOfError = (unansweredError) => {
	const errorTypeName = String((unansweredError && unansweredError.type) || '');
	const knownAnswer = Object.prototype.hasOwnProperty.call(answerByErrorType, errorTypeName) ? answerByErrorType[errorTypeName] : undefined;
	const parserStatus = unansweredError && (unansweredError.status || unansweredError.statusCode);
	if (knownAnswer && CLIENT_ERROR_STATUS_PATTERN.test(String(parserStatus))) {
		return { httpStatus: Number(parserStatus), ...knownAnswer };
	}
	return { httpStatus: 500, ...unknownErrorAnswer };
};

const jsonErrorAnswer = (unansweredError, xReq, xRes, next) => {
	const { xLog } = process.global;
	if (xRes.headersSent) {
		// a body already under way cannot be replaced; Express's own handler closes the connection
		next(unansweredError);
		return;
	}
	const errorId = makeRefId(12);
	const { httpStatus, refusalName, reason } = answerOfError(unansweredError);
	const detailText = httpStatus === 500 && unansweredError && unansweredError.stack ? unansweredError.stack : String((unansweredError && unansweredError.message) || unansweredError);
	xLog.error(`${moduleName} ${errorId}: ${xReq.method} ${xReq.path} answered ${httpStatus} ${refusalName}: ${detailText}`);
	xRes.status(httpStatus).json({ refusalName, reason, errorId });
};

module.exports = jsonErrorAnswer;
