#!/usr/bin/env node
'use strict';

// streamOneBlock — one block over the cap a Node string can carry, sent as the store holds it (TQ Q39, cardUriAnswers-110426 Addendum A1). The system sqlite3 reads the one column read-only and its
// bytes pass straight through here, so no heap ever holds the block. A licence hold answers first, as it does under the cap: for a schema block from the block's own first line, which arrives before any
// byte is sent; for a decision block, whose one line is the whole block, from the derived rows naming its subjects.
//
//   node --max-old-space-size=<megabytes> streamOneBlock.js < <one JSON object>
//   stdin:  { educoreForgeCodePath, uriContractFilePath, sqliteCommandPath, kind, blockIdentity, answerFormat, publicPathPrefix }  every part required
//   stdout: one line {"httpStatus":N}, then the block's bytes (200), or the answer's text (451)
// THE BYTES CANNOT BE CHECKED BEFORE THEY ARE SENT, so the hash runs as they pass and a mismatch ends this process by name with exit 3; the client holds the expected hash and checks it.
// Exit 0 with an answer; 2 on bad input; 3 when the read failed or the hash did not match; the refusal or the fault on stderr. The caller kills this process's whole group at its timeout,
// which is what also stops sqlite3. -help, --help and -h print this header.

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const commandLineParser = require('qtools-parse-command-line');
const { loadForgeResolver } = require(path.join(__dirname, 'forgeAdapter'));
const { answerTextFor } = require(path.join(__dirname, 'htmlAnswer'));

const { switches } = commandLineParser.getParameters();
if (switches.help || switches.h) {
	process.stdout.write(`${fs.readFileSync(__filename, 'utf8').split('\n').filter((oneLine) => oneLine.startsWith('//')).map((oneLine) => oneLine.replace(/^\/\/ ?/, '')).join('\n')}\n`);
	process.exit(0);
}

const refuseAndExit = (refusalText, exitCode) => {
	process.stderr.write(`${moduleName}: ${refusalText}\n`);
	process.exit(exitCode);
};

const BLOCK_IDENTITY_PATTERN = /^[0-9a-f]{64}$/;
const NEWLINE_BYTE = 10;
const HEADER_LINE_BYTE_LIMIT = 1048576;
const EXIT_BAD_INPUT = 2;
const EXIT_READ_FAILED = 3;
const REQUIRED_INPUT_NAME_LIST = ['educoreForgeCodePath', 'uriContractFilePath', 'sqliteCommandPath', 'kind', 'blockIdentity', 'answerFormat', 'publicPathPrefix'];

// what each kind reads (DATA). The sqlite3 text holds only a value already matched against BLOCK_IDENTITY_PATTERN, and sqlite3 is spawned with no shell.
const BLOCK_READ_BY_KIND = Object.freeze({
	schemaBlock: {
		textSqlFor: (blockIdentity) => `SELECT text FROM schemaBlocks WHERE refId = '${blockIdentity}'`,
		metadataSql: 'SELECT refId AS schemaBlockRefId, kind AS blockKind, subject, version FROM schemaBlocks WHERE refId = ?',
		holdIsReadFromFirstLine: true,
	},
	decisionSchemaBlock: {
		textSqlFor: (blockIdentity) => `SELECT frozenText FROM decisionSchemaBlocks WHERE decisionSchemaBlockHash = '${blockIdentity}'`,
		metadataSql: 'SELECT decisionSchemaBlockHash AS decisionBlockHash, pairKey FROM decisionSchemaBlocks WHERE decisionSchemaBlockHash = ?',
		holdIsReadFromFirstLine: false,
	},
});
const DECISION_SUBJECT_SQL = 'SELECT DISTINCT subjectStableId FROM derivedAssertions WHERE decisionBlockHash = ?';

const inputText = fs.readFileSync(0, 'utf8');
const inputObject = inputText.charAt(0) === '{' ? JSON.parse(inputText) : refuseAndExit('stdin must be one JSON object', EXIT_BAD_INPUT);
const absentNameList = REQUIRED_INPUT_NAME_LIST.filter((inputName) => !inputObject[inputName]);
if (absentNameList.length) {
	refuseAndExit(`stdin lacks ${absentNameList.join(', ')}`, EXIT_BAD_INPUT);
}
const { educoreForgeCodePath, uriContractFilePath, sqliteCommandPath, kind, blockIdentity, answerFormat, publicPathPrefix } = inputObject;
const blockRead = BLOCK_READ_BY_KIND[kind];
if (blockRead === undefined) {
	refuseAndExit(`kind '${kind}' is not read this way (${Object.keys(BLOCK_READ_BY_KIND).join(', ')})`, EXIT_BAD_INPUT);
}
if (!BLOCK_IDENTITY_PATTERN.test(blockIdentity)) {
	refuseAndExit('blockIdentity is not 64 lowercase hex', EXIT_BAD_INPUT);
}
const forgeResolver = loadForgeResolver({ educoreForgeCodePath, uriContractFilePath });
if (forgeResolver.error) {
	refuseAndExit(forgeResolver.error, EXIT_BAD_INPUT);
}
const { withheldAnswerFor, schemaBlockStandardKeyListFor, subjectPrefixOf } = forgeResolver.stubResolver;
const storeHandle = new forgeResolver.Database(uriContractFilePath, { readonly: true, fileMustExist: true });

const sendHeader = (httpStatus) => process.stdout.write(`${JSON.stringify({ httpStatus })}\n`);
const withheldAnswerOf = (standardKeyList) => withheldAnswerFor({ standardKeyList, metadata: { kind, ...storeHandle.prepare(blockRead.metadataSql).get(blockIdentity) } });
const sendWithheldAnswer = ({ httpStatus, body }) => {
	sendHeader(httpStatus);
	process.stdout.write(answerTextFor({ answerFormat, httpStatus, answerBody: body, edcIri: `${forgeResolver.edcUri.URI_SCHEME.baseIri}${kind}/sha256/${blockIdentity}`, publicPathPrefix, baseIri: forgeResolver.edcUri.URI_SCHEME.baseIri, requestPath: `/${kind}/sha256/${blockIdentity}` }));
};

// a decision block's subjects, read from its derived rows: every prefix a whole read of the block would find (runs/a1_holdSubjectsCompare.txt checks this over every block in the store)
const decisionStandardKeyList = () => {
	const prefixSet = new Set();
	for (const oneRow of storeHandle.prepare(DECISION_SUBJECT_SQL).iterate(blockIdentity)) {
		prefixSet.add(subjectPrefixOf(oneRow.subjectStableId));
	}
	prefixSet.delete('');
	return Array.from(prefixSet).sort();
};

if (!blockRead.holdIsReadFromFirstLine) {
	const withheld = withheldAnswerOf(decisionStandardKeyList());
	if (withheld !== null) {
		sendWithheldAnswer(withheld);
		return;
	}
}

const sqliteChild = spawn(sqliteCommandPath, ['-init', '/dev/null', '-readonly', '-batch', '-noheader', '-safe', '-list', '-separator', '', '-newline', '', uriContractFilePath, blockRead.textSqlFor(blockIdentity)], { stdio: ['ignore', 'pipe', 'pipe'] });
const blockHash = crypto.createHash('sha256');
let stderrTail = '';
let hasDecidedHold = !blockRead.holdIsReadFromFirstLine;
let leadingBuffer = Buffer.alloc(0);
let isWithheld = false;

const failAndExit = (faultText) => {
	sqliteChild.kill('SIGKILL');
	refuseAndExit(faultText, EXIT_READ_FAILED);
};
const passBytes = (oneChunk) => {
	blockHash.update(oneChunk);
	if (!process.stdout.write(oneChunk)) {
		sqliteChild.stdout.pause();
		process.stdout.once('drain', () => sqliteChild.stdout.resume());
	}
};
process.stdout.on('error', (stdoutError) => failAndExit(`the reader of this block went away: ${stdoutError.message}`));
sqliteChild.on('error', (spawnError) => refuseAndExit(`${sqliteCommandPath} could not start: ${spawnError.message}`, EXIT_READ_FAILED));
sqliteChild.stderr.setEncoding('utf8');
sqliteChild.stderr.on('data', (stderrChunk) => {
	stderrTail = `${stderrTail}${stderrChunk}`.slice(-2000);
});
if (hasDecidedHold) {
	sendHeader(200);
}
sqliteChild.stdout.on('data', (oneChunk) => {
	if (isWithheld) {
		return;
	}
	if (hasDecidedHold) {
		passBytes(oneChunk);
		return;
	}
	leadingBuffer = Buffer.concat([leadingBuffer, oneChunk]);
	const newlineIndex = leadingBuffer.indexOf(NEWLINE_BYTE);
	if (newlineIndex === -1) {
		if (leadingBuffer.length > HEADER_LINE_BYTE_LIMIT) {
			failAndExit(`block ${blockIdentity} has no first line within ${HEADER_LINE_BYTE_LIMIT} bytes, so its licence hold cannot be read`);
		}
		return;
	}
	hasDecidedHold = true;
	const withheld = withheldAnswerOf(schemaBlockStandardKeyListFor(leadingBuffer.subarray(0, newlineIndex + 1).toString('utf8')));
	if (withheld !== null) {
		isWithheld = true;
		sqliteChild.kill('SIGKILL');
		sendWithheldAnswer(withheld);
		return;
	}
	sendHeader(200);
	passBytes(leadingBuffer);
	leadingBuffer = Buffer.alloc(0);
});
sqliteChild.on('close', (exitCode, signalName) => {
	if (isWithheld) {
		return;
	}
	if (exitCode !== 0) {
		refuseAndExit(`${sqliteCommandPath} ended exit=${exitCode} signal=${signalName}: ${stderrTail}`, EXIT_READ_FAILED);
	}
	const sentHash = blockHash.digest('hex');
	if (sentHash !== blockIdentity) {
		process.stderr.write(`${moduleName}: HASH MISMATCH on ${kind} ${blockIdentity}: the bytes sent hash to ${sentHash}\n`);
		process.exitCode = EXIT_READ_FAILED;
	}
});
