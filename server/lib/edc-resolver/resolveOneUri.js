#!/usr/bin/env node
'use strict';

// resolveOneUri — one whole-block edc: URI in, one answer out, then exit (edcResolverEndpoint-110226, briefing section 4). A synchronous read of a big
// TEXT column blocks a whole process, so these kinds read here, under a heap cap, and never in the API.
//
//   node --max-old-space-size=<megabytes> resolveOneUri.js < <one JSON object>
//   stdin:  { educoreForgeCodePath, uriContractFilePath, uriOrPath, answerFormat, publicPathPrefix }  every part required
//   stdout: one line {"httpStatus":N}, then the answer's bytes
// Reads the store read-only, changes nothing. Exit 0 with an answer; exit 2 on bad input, with the refusal on stderr. The input arrives on stdin, not
// argv, because a URI path is hostile text and must never be read as a flag. -help, --help and -h print this header.

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const fs = require('fs');
const path = require('path');
const commandLineParser = require('qtools-parse-command-line');
const { loadForgeResolver, readerForRequest, resolveThroughForge } = require(path.join(__dirname, 'forgeAdapter'));
const { answerTextFor } = require(path.join(__dirname, 'htmlAnswer'));

const { switches } = commandLineParser.getParameters();
if (switches.help || switches.h) {
	process.stdout.write(`${fs.readFileSync(__filename, 'utf8').split('\n').filter((oneLine) => oneLine.startsWith('//')).map((oneLine) => oneLine.replace(/^\/\/ ?/, '')).join('\n')}\n`);
	process.exit(0);
}

const refuseAndExit = (refusalText) => {
	process.stderr.write(`${moduleName}: ${refusalText}\n`);
	process.exit(2);
};

const REQUIRED_INPUT_NAME_LIST = ['educoreForgeCodePath', 'uriContractFilePath', 'uriOrPath', 'answerFormat', 'publicPathPrefix'];
const inputText = fs.readFileSync(0, 'utf8');
const inputObject = inputText.charAt(0) === '{' ? JSON.parse(inputText) : refuseAndExit('stdin must be one JSON object');
const absentNameList = REQUIRED_INPUT_NAME_LIST.filter((inputName) => !inputObject[inputName]);
if (absentNameList.length) {
	refuseAndExit(`stdin lacks ${absentNameList.join(', ')}`);
}

const { educoreForgeCodePath, uriContractFilePath, uriOrPath, answerFormat, publicPathPrefix } = inputObject;
const forgeResolver = loadForgeResolver({ educoreForgeCodePath, uriContractFilePath });
if (forgeResolver.error) {
	refuseAndExit(forgeResolver.error);
}

resolveThroughForge({ forgeResolver, uriOrPath, uriContractReader: readerForRequest({ forgeResolver, uriOrPath, uriContractFilePath }) }, ({ httpStatus, body }) => {
	const answerText = answerTextFor({ answerFormat, httpStatus, answerBody: body, edcIri: forgeResolver.edcIriFor(uriOrPath), publicPathPrefix, baseIri: forgeResolver.edcUri.URI_SCHEME.baseIri });
	process.stdout.write(`${JSON.stringify({ httpStatus })}\n`);
	process.stdout.write(answerText);
});
