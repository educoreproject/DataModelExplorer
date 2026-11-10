'use strict';
// rosetta-free-text.test.js — the Rosetta page's input ladder and review (WORKORDER-rosettaFreeInput-111026, gates 1a, 1b, 1c, 1h, 1i, 1j). No server, no graph, no model.
// The browser modules run here as they are: html/stores/rosettaFreeText.js is imported from a temporary .mjs copy, and html/stores/rosettaStore.js runs in the real
// Pinia (from html/node_modules) with its three imports pointed at doubles: axios records every request, the login store gives no token, the ladder is the copy above.
//   1. VALID JSON AS TODAY: every JSON text becomes the submission main's submissionOfText made of it (read with git show), byte for byte.
//   2. LINE FORMATS: name: description, name - description (hyphen, en and em dash), name<TAB>description with and without a header row, bare names, bullets, blank lines.
//   3. MIXED OR GARBLED: two separators, prose, a line that is no name, a third column, broken JSON: none is read here; each goes to the AI.
//   4. REVIEW, NEVER SENT: lines stop for review with no request at all; free text sends one request, to rosetta/interpret, and none to retrieval or jobs; only pressing again sends the JSON.
//   5. UNDO: puts back the typed text byte for byte; after an edit it asks first; untouched, it does not.
//   6. A REFUSAL AFTER EVERY RUNG says what was tried.
// Run: /usr/local/bin/node server/test/rosetta-free-text.test.js

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { pathToFileURL } = require('url');

const codeRootPath = path.join(__dirname, '..', '..');
const storesDirPath = path.join(codeRootPath, 'html', 'stores');
const ladderFilePath = path.join(storesDirPath, 'rosettaFreeText.js');
const storeFilePath = path.join(storesDirPath, 'rosettaStore.js');
const BASE_COMMIT = process.env.ROSETTA_FREE_TEXT_BASE_COMMIT || 'main';

let passedCount = 0;
let failedCount = 0;
const ok = (testName, condition, detailText) => {
	if (condition) { passedCount += 1; console.log(`  PASS: ${testName}`); return; }
	failedCount += 1;
	console.log(`  FAIL: ${testName}${detailText ? ` — ${detailText}` : ''}`);
};

const scratchDirPath = fs.mkdtempSync(path.join(os.tmpdir(), 'rosettaFreeText-'));
const writeModule = (fileName, sourceText) => {
	const filePath = path.join(scratchDirPath, fileName);
	fs.writeFileSync(filePath, sourceText);
	return pathToFileURL(filePath).href;
};
// each import the store makes is replaced exactly once, or the test says which did not match: a silent miss would test a store that is not the page's
const rewriteOnce = (sourceText, findText, replaceText) => {
	const matchCount = sourceText.split(findText).length - 1;
	if (matchCount !== 1) {
		throw new Error(`rosetta-free-text.test: '${findText}' occurs ${matchCount} times in rosettaStore.js; the test rewrites it exactly once`);
	}
	return sourceText.replace(findText, () => replaceText);
};

// main's own reading of a JSON text, the function itself, from git
const baseSubmissionOfText = (() => {
	const baseStoreText = execFileSync('git', ['show', `${BASE_COMMIT}:html/stores/rosettaStore.js`], { cwd: codeRootPath, encoding: 'utf8' });
	const functionMatch = baseStoreText.match(/const submissionOfText = (\(pastedText\) => \{[\s\S]*?\n\});/);
	return new Function(`return ${functionMatch[1].replace(/;$/, '')}`)();
})();

const ladderUrl = writeModule('rosettaFreeText.mjs', fs.readFileSync(ladderFilePath, 'utf8'));
const piniaUrl = pathToFileURL(path.join(codeRootPath, 'html', 'node_modules', 'pinia', 'dist', 'pinia.mjs')).href;
const axiosDoubleUrl = writeModule('axiosDouble.mjs', 'export default { post: (url, body, options) => globalThis.rosettaAxiosDouble.answer("post", url, body), get: (url, options) => globalThis.rosettaAxiosDouble.answer("get", url, options) };\n');
const loginDoubleUrl = writeModule('loginStoreDouble.mjs', 'export const useLoginStore = () => ({ getAuthTokenProperty: {} });\n');
const storeUrl = (() => {
	let storeText = fs.readFileSync(storeFilePath, 'utf8');
	storeText = rewriteOnce(storeText, "import axios from 'axios';", `import { defineStore } from '${piniaUrl}';\nimport axios from '${axiosDoubleUrl}';`);
	storeText = rewriteOnce(storeText, "from '@/stores/loginStore';", `from '${loginDoubleUrl}';`);
	storeText = rewriteOnce(storeText, "from '@/stores/rosettaFreeText';", `from '${ladderUrl}';`);
	return writeModule('rosettaStore.mjs', storeText);
})();

// the double answers by route; every request is kept
globalThis.rosettaAxiosDouble = {
	requestList: [],
	answerByRoute: {},
	answer(methodName, url, body) {
		this.requestList.push({ methodName, url, body });
		const routeName = url.replace('/api/standards/v1/rosetta/', '');
		const scripted = this.answerByRoute[routeName];
		if (!scripted) {
			return Promise.reject(new Error(`the double has no answer for ${url}`));
		}
		return scripted.refusal ? Promise.reject({ response: { data: { answer: scripted.refusal } }, message: 'refused' }) : Promise.resolve({ data: scripted.data });
	},
	reset(answerByRoute) {
		this.requestList = [];
		this.answerByRoute = answerByRoute;
	},
};

const JSON_CORPUS = [
	'[{"name":"dob","definition":"date of birth"}]',
	'{"fieldList":[{"name":"dob"}]}',
	'{"type":"object","properties":{"dob":{"type":"string","description":"date of birth"}}}',
	'{"@context":{"dob":"http://example.org/dob"}}',
	'["just","strings"]',
	'"a quoted string"',
	'42',
	'true',
	'  {\n\t"fieldList": []\n}\n',
];

const LINE_CASE_LIST = [
	{ caseName: 'name: description', text: 'birthDate: the date the person was born\nschoolName: the name of the school', fieldList: [{ name: 'birthDate', definition: 'the date the person was born' }, { name: 'schoolName', definition: 'the name of the school' }] },
	{ caseName: 'name - description', text: 'birthDate - the date the person was born\nschoolName - the name of the school', fieldList: [{ name: 'birthDate', definition: 'the date the person was born' }, { name: 'schoolName', definition: 'the name of the school' }] },
	{ caseName: 'spaced en dash', text: 'birthDate – the date the person was born', fieldList: [{ name: 'birthDate', definition: 'the date the person was born' }] },
	{ caseName: 'spaced em dash', text: 'birthDate — the date the person was born', fieldList: [{ name: 'birthDate', definition: 'the date the person was born' }] },
	{ caseName: 'name<TAB>description, header row skipped', text: 'Field Name\tDescription\nFirst Name\tThe given name\nLast Name\tThe family name', fieldList: [{ name: 'First Name', definition: 'The given name' }, { name: 'Last Name', definition: 'The family name' }] },
	{ caseName: 'name<TAB>description with no header, an empty cell a bare name', text: 'First Name\tThe given name\nMiddle Name\t\r\nLast Name\tThe family name', fieldList: [{ name: 'First Name', definition: 'The given name' }, { name: 'Middle Name' }, { name: 'Last Name', definition: 'The family name' }] },
	{ caseName: 'bare names, blank lines ignored', text: 'studentId\n\n  gradeLevel  \n\nenrollmentDate\n', fieldList: [{ name: 'studentId' }, { name: 'gradeLevel' }, { name: 'enrollmentDate' }] },
	{ caseName: 'bare names beside colon lines', text: 'studentId\ngradeLevel: the grade the student is in', fieldList: [{ name: 'studentId' }, { name: 'gradeLevel', definition: 'the grade the student is in' }] },
	{ caseName: 'bulleted lines', text: '- studentId: the student\'s number\n• gradeLevel: the grade\n3. schoolYear: the year', fieldList: [{ name: 'studentId', definition: 'the student\'s number' }, { name: 'gradeLevel', definition: 'the grade' }, { name: 'schoolYear', definition: 'the year' }] },
	{ caseName: 'a dash inside a colon description stays in it', text: 'term: the school term - fall or spring', fieldList: [{ name: 'term', definition: 'the school term - fall or spring' }] },
];

const GARBLED_CASE_LIST = [
	{ caseName: 'two separators in one text', text: 'birthDate: the date of birth\nschoolName - the name of the school' },
	{ caseName: 'a paragraph of prose', text: 'We keep each student\'s birth date and the school they attend, and we also record the grade level for the current year.' },
	{ caseName: 'a clean line beside a sentence', text: 'birthDate: the date of birth\nWe also keep a few other things that I cannot remember right now.' },
	{ caseName: 'a third column', text: 'name\tdescription\ttype\nbirthDate\tthe date of birth\tdate' },
	{ caseName: 'broken JSON', text: '[{"name": "birthDate", "definition": "the date of birth"' },
];

const sortedKeysText = (anyValue) => JSON.stringify(anyValue);

import(ladderUrl).then((ladder) => import(piniaUrl).then((pinia) => import(storeUrl).then(({ useRosettaStore }) => {
	// ---- 1. valid JSON as today
	JSON_CORPUS.forEach((jsonText) => {
		const step = ladder.ladderStepOf(jsonText);
		const baseSubmission = baseSubmissionOfText(jsonText);
		ok(`valid JSON as on ${BASE_COMMIT}: ${JSON.stringify(jsonText).slice(0, 50)}`, step.submission !== undefined && sortedKeysText(step.submission) === sortedKeysText(baseSubmission), `${sortedKeysText(step)} vs ${sortedKeysText(baseSubmission)}`);
	});
	const nullThrewOnBase = (() => { try { baseSubmissionOfText('null'); return false; } catch (baseError) { return true; } })();
	ok('the JSON value null is refused, as main refused it (it threw, and the page said notJson)', nullThrewOnBase && ladder.ladderStepOf('null').refusal && ladder.ladderStepOf('null').refusal.refusalName === 'notJson');
	ok('an empty text is refused by name, and goes nowhere', ladder.ladderStepOf('  \n ').refusal && ladder.ladderStepOf('  \n ').refusal.refusalName === 'noSubmission');

	// ---- 2. line formats
	LINE_CASE_LIST.forEach(({ caseName, text, fieldList }) => {
		const step = ladder.ladderStepOf(text);
		ok(`lines read: ${caseName}`, step.lineReading && JSON.stringify(step.lineReading.fieldList) === JSON.stringify(fieldList), JSON.stringify(step));
	});

	// ---- 3. mixed or garbled goes to the AI
	GARBLED_CASE_LIST.forEach(({ caseName, text }) => {
		const step = ladder.ladderStepOf(text);
		ok(`not read as lines, so to the AI: ${caseName}`, step.needsInterpretation === true, JSON.stringify(step));
	});

	pinia.setActivePinia(pinia.createPinia());
	const store = useRosettaStore();
	const stepList = [];

	// ---- 4. review, never sent
	stepList.push((next) => {
		globalThis.rosettaAxiosDouble.reset({});
		store.$reset();
		store.pastedText = LINE_CASE_LIST[0].text;
		store.retrieve().then((outcomeName) => {
			ok('lines stop for review: no request at all', outcomeName === 'review' && globalThis.rosettaAxiosDouble.requestList.length === 0, JSON.stringify(globalThis.rosettaAxiosDouble.requestList));
			ok('the textarea shows the pretty JSON', store.pastedText === JSON.stringify(LINE_CASE_LIST[0].fieldList, null, 2));
			ok('the status line says how it was read and what to do', store.review && store.review.statusText.startsWith('Read as 2 name/description lines.') && /Undo\.$/.test(store.review.statusText), store.review && store.review.statusText);
			next();
		});
	});
	const FREE_TEXT = 'We keep each student\'s birth date, which is the date the student was born, and the school name.';
	const INTERPRETED_FIELD_LIST = [{ name: 'birth date', definition: 'the date the student was born' }, { name: 'school name' }];
	stepList.push((next) => {
		globalThis.rosettaAxiosDouble.reset({ interpret: { data: { fieldList: INTERPRETED_FIELD_LIST, droppedFieldCount: 1, unusedLineCount: 0 } }, retrieval: { data: { answer: { fieldList: [] } } }, jobs: { data: { answer: { jobRefId: 'x', status: 'queued' } } } });
		store.$reset();
		store.pastedText = FREE_TEXT;
		store.retrieve().then((outcomeName) => {
			const urlList = globalThis.rosettaAxiosDouble.requestList.map((oneRequest) => oneRequest.url);
			ok('free text: one request, to rosetta/interpret, carrying the text as typed; none to retrieval or jobs', outcomeName === 'review' && JSON.stringify(urlList) === '["/api/standards/v1/rosetta/interpret"]' && globalThis.rosettaAxiosDouble.requestList[0].body.text === FREE_TEXT, JSON.stringify(urlList));
			ok('the AI\'s status line counts what was kept and left out', store.review.statusText.startsWith('Interpreted by AI: 2 fields; 1 field the AI offered was not in your text and was left out.'), store.review.statusText);
			ok('no retrieval answer appeared', store.retrievalAnswer === null);
			store.retrieve().then((secondOutcomeName) => {
				const secondRequest = globalThis.rosettaAxiosDouble.requestList[1];
				ok('pressing again sends the shown JSON down the ladder from rung 1, to retrieval', secondOutcomeName === 'sent' && secondRequest && secondRequest.url === '/api/standards/v1/rosetta/retrieval' && JSON.stringify(secondRequest.body) === JSON.stringify({ fieldList: INTERPRETED_FIELD_LIST }), JSON.stringify(secondRequest));
				next();
			});
		});
	});
	stepList.push((next) => {
		globalThis.rosettaAxiosDouble.reset({ interpret: { data: { fieldList: INTERPRETED_FIELD_LIST, droppedFieldCount: 0, unusedLineCount: 2 } } });
		store.$reset();
		store.pastedText = FREE_TEXT;
		store.submitJob().then((outcomeName) => {
			const urlList = globalThis.rosettaAxiosDouble.requestList.map((oneRequest) => oneRequest.url);
			ok('Ask for a judged draft on free text interprets and stops: no job is submitted', outcomeName === 'review' && JSON.stringify(urlList) === '["/api/standards/v1/rosetta/interpret"]' && store.jobRefId === '', JSON.stringify(urlList));
			ok('lines the AI did not use are counted in the status', /2 lines could not be read/.test(store.review.statusText), store.review.statusText);
			next();
		});
	});

	stepList.push((next) => {
		globalThis.rosettaAxiosDouble.reset({ interpret: { data: { fieldList: INTERPRETED_FIELD_LIST } } });
		store.$reset();
		store.pastedText = FREE_TEXT;
		store.retrieve().then((outcomeName) => {
			ok('an AI answer without its counts is refused, never shown as nothing dropped', outcomeName === 'refused' && store.review === null && /droppedFieldCount/.test(store.refusal.reason) && store.pastedText === FREE_TEXT, JSON.stringify(store.refusal));
			next();
		});
	});

	// ---- 5. undo
	const TYPED_TEXT = 'Name\tDescription\r\nFirst Name\tThe given name  \r\nLast Name\tThe family name é\u{1F600}\r\n';
	stepList.push((next) => {
		globalThis.rosettaAxiosDouble.reset({});
		store.$reset();
		store.pastedText = TYPED_TEXT;
		store.retrieve().then(() => {
			ok('untouched, Undo does not ask', store.review !== null && store.undoNeedsConfirmation === false);
			store.undoReview();
			ok('Undo puts back the typed text byte for byte', store.pastedText === TYPED_TEXT && Buffer.from(store.pastedText).equals(Buffer.from(TYPED_TEXT)) && store.review === null);
			next();
		});
	});
	stepList.push((next) => {
		globalThis.rosettaAxiosDouble.reset({});
		store.$reset();
		store.pastedText = TYPED_TEXT;
		store.retrieve().then(() => {
			store.pastedText = store.pastedText.replace('The given name', 'The given name, edited');
			ok('after an edit, Undo asks first', store.undoNeedsConfirmation === true);
			store.undoReview();
			ok('and once confirmed, still puts back the typed text byte for byte', store.pastedText === TYPED_TEXT);
			next();
		});
	});

	// ---- 6. a refusal after every rung says what was tried
	stepList.push((next) => {
		globalThis.rosettaAxiosDouble.reset({ interpret: { refusal: { refusalName: 'noFieldsFound', reason: 'the AI found no fields in the text' } } });
		store.$reset();
		store.pastedText = FREE_TEXT;
		store.retrieve().then((outcomeName) => {
			ok('every rung failed: the refusal names the service\'s refusal and says what was tried', outcomeName === 'refused' && store.refusal.refusalName === 'noFieldsFound' && /not JSON/.test(store.refusal.reason) && /name\/description lines/.test(store.refusal.reason) && /the AI found no fields/.test(store.refusal.reason) && store.review === null, JSON.stringify(store.refusal));
			ok('and the text is left as typed', store.pastedText === FREE_TEXT);
			next();
		});
	});

	const runStep = (stepIndex) => {
		if (stepIndex >= stepList.length) {
			console.log(`rosetta-free-text: ${passedCount} passed, ${failedCount} failed`);
			process.exit(failedCount === 0 ? 0 : 1);
		}
		stepList[stepIndex](() => runStep(stepIndex + 1));
	};
	runStep(0);
}))).catch((loadError) => {
	console.log(`  FAIL: the modules would not load — ${loadError.stack || loadError}`);
	console.log(`rosetta-free-text: ${passedCount} passed, ${failedCount + 1} failed`);
	process.exit(1);
});
