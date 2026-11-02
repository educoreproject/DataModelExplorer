'use strict';
// companion-csv-python-parity.test.js — Companion Pages Phase 3 (SPEC-companionPages-102826). The JEDx compiler must
// read the dictionary exactly as the join probe did (Python csv.reader over a text-mode file, utf-8 with errors='replace',
// so CRLF and CR arrive as LF), or gate G3.1 would
// measure the reader, not the join. This compares lib/companion-pages/compilers/csv-row-list.js with python3's
// csv.reader row for row:
//   1. on every CSV of the jedx-dictionary sources on file (dataStores/companionSources/jedx-dictionary, read only);
//   2. on fixtures for each rule of the reader: quoted commas and newlines, doubled quotes, a quote inside a bare field,
//      text after a closing quote, CRLF and lone CR, blank lines, a trailing comma, no final newline, a byte-order mark,
//      and an invalid UTF-8 byte;
//   3. RED TWIN: a reader that does not fold a doubled quote fails 2.
// Needs python3 on PATH; it is run isolated (-I) on files it only reads.
//
// Run: /usr/local/bin/node server/test/companion-csv-python-parity.test.js

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const readerFilePath = path.join(__dirname, '..', 'data-model', 'lib', 'companion-pages', 'compilers', 'csv-row-list.js');
const { csvRowListOf } = require(readerFilePath);
const sourceDirPath = path.join(__dirname, '..', '..', '..', 'dataStores', 'companionSources', 'jedx-dictionary');

const PYTHON_READER_TEXT = "import csv, json, sys\nprint(json.dumps(list(csv.reader(open(sys.argv[1], encoding='utf-8', errors='replace')))))";

let passed = 0;
let failed = 0;
const ok = (testName, condition, detailText) => {
	if (condition) { passed++; console.log(`  PASS: ${testName}`); return; }
	failed++;
	console.log(`  FAIL: ${testName}${detailText ? ` — ${detailText}` : ''}`);
};

const pythonRowListOf = (filePath) => JSON.parse(execFileSync('python3', ['-I', '-c', PYTHON_READER_TEXT, filePath], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));

const firstDifferenceOf = (leftRowList, rightRowList) => {
	const rowCount = Math.max(leftRowList.length, rightRowList.length);
	for (let rowIndex = 0; rowIndex < rowCount; rowIndex++) {
		if (JSON.stringify(leftRowList[rowIndex]) !== JSON.stringify(rightRowList[rowIndex])) {
			return `row ${rowIndex}: node ${JSON.stringify(leftRowList[rowIndex])} python ${JSON.stringify(rightRowList[rowIndex])}`;
		}
	}
	return '';
};

const FIXTURE_LIST = [
	{ fixtureName: 'quoted comma and newline', contentBuffer: Buffer.from('a,"b,c\nd",e\nf,g\n') },
	{ fixtureName: 'doubled quote', contentBuffer: Buffer.from('"say ""hi""",x\n') },
	{ fixtureName: 'quote inside a bare field', contentBuffer: Buffer.from('ab"c,d\n') },
	{ fixtureName: 'text after a closing quote', contentBuffer: Buffer.from('"ab"cd,e\n') },
	{ fixtureName: 'CRLF and lone CR', contentBuffer: Buffer.from('a,b\r\nc,d\re,f\r\n') },
	{ fixtureName: 'blank lines', contentBuffer: Buffer.from('a\n\n\nb\n') },
	{ fixtureName: 'trailing comma, no final newline', contentBuffer: Buffer.from('a,b,') },
	{ fixtureName: 'byte-order mark', contentBuffer: Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('US Data Element,ID\n')]) },
	{ fixtureName: 'invalid UTF-8 byte', contentBuffer: Buffer.concat([Buffer.from('State '), Buffer.from([0x96]), Buffer.from(' UI,x\n')]) },
	{ fixtureName: 'quoted field at end of data', contentBuffer: Buffer.from('a,"b"') },
];

const fixtureDifferenceListOf = (readRowListOf) => {
	const scratchDirPath = fs.mkdtempSync(path.join(os.tmpdir(), 'csvParity-'));
	const differenceList = FIXTURE_LIST.map(({ fixtureName, contentBuffer }) => {
		const fixtureFilePath = path.join(scratchDirPath, 'fixture.csv');
		fs.writeFileSync(fixtureFilePath, contentBuffer);
		const differenceText = firstDifferenceOf(readRowListOf(contentBuffer), pythonRowListOf(fixtureFilePath));
		return differenceText ? `${fixtureName}: ${differenceText}` : '';
	}).filter(Boolean);
	fs.rmSync(scratchDirPath, { recursive: true });
	return differenceList;
};

console.log('\n1. Every jedx-dictionary CSV on file');
const sourceFileNameList = fs.readdirSync(sourceDirPath).filter((fileName) => fileName.endsWith('.csv')).sort();
ok(`sanity: there are CSV sources to compare (${sourceFileNameList.length})`, sourceFileNameList.length >= 10);
sourceFileNameList.forEach((fileName) => {
	const sourceFilePath = path.join(sourceDirPath, fileName);
	const nodeRowList = csvRowListOf(fs.readFileSync(sourceFilePath));
	const differenceText = firstDifferenceOf(nodeRowList, pythonRowListOf(sourceFilePath));
	ok(`${fileName}: ${nodeRowList.length} rows equal to csv.reader's`, !differenceText, differenceText);
});

console.log('\n2. Each rule of the reader');
const fixtureDifferenceList = fixtureDifferenceListOf(csvRowListOf);
ok(`all ${FIXTURE_LIST.length} fixtures read as csv.reader reads them`, fixtureDifferenceList.length === 0, fixtureDifferenceList.join('; '));

console.log('\n3. Red twin');
const unfoldedReaderOf = (contentBuffer) => csvRowListOf(Buffer.from(contentBuffer.toString('latin1').replace(/""/g, '"\u0000"'), 'latin1')).map((oneRow) => oneRow.map((fieldText) => fieldText.replace(/\u0000/g, '"')));
const twinDifferenceList = fixtureDifferenceListOf(unfoldedReaderOf);
ok('RED TWIN: a reader that keeps doubled quotes doubled fails the fixtures', twinDifferenceList.some((differenceText) => differenceText.startsWith('doubled quote')), twinDifferenceList.join('; '));

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
process.exit(failed ? 1 : 0);
