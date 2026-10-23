#!/usr/bin/env node
'use strict';

// runSamplePrompts.js — ⟪lane zbE, E2-7 / E3⟫ answer every DME sample prompt (html/data/dmeExamplePromptList.ts) through the
// askMilo path ws-graphinator.js spawns in Standard mode, one at a time, and write each answer with its reported cost. It
// mirrors STEEL_ARROW's 10-21 method (VERDICTS-samplePrompts-102126.md): singleCallPromptName=DataModelExplorer,
// expandModel=opus, perspectives=0, aiToolsSuppressed=DmeUserRead,DmeUserWrite, 'json' in place of 'stream' so the answer is
// captured whole. SPEND IS REAL (askMilo budget): BRONZE_CROWN's line is $55 for this run, so the runner STOPS before the
// next prompt once the measured running total passes the --stopAtUsd it is given. --dryRun passes askMilo's own -dryRun
// (mock API, zero spend) to prove the wiring.
//
//   node runSamplePrompts.js --codeRootPath=<system/code> --configPath=<configs/instanceSpecific/qbook> --outputDirPath=<dir>
//        --stopAtUsd=55 [--onlyIdList=a,b] [--dryRun]
//
// Async style: callback(err, result) through the prompt list; this is a test harness under testData, not server code.

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const argumentByName = {};
process.argv.slice(2).forEach((oneArgument) => {
	const match = oneArgument.match(/^--([A-Za-z]+)(?:=(.*))?$/);
	if (match) argumentByName[match[1]] = match[2] === undefined ? true : match[2];
});
const REQUIRED_ARGUMENT_LIST = ['codeRootPath', 'configPath', 'outputDirPath', 'stopAtUsd'];
const missingArgumentList = REQUIRED_ARGUMENT_LIST.filter((argumentName) => argumentByName[argumentName] === undefined || argumentByName[argumentName] === true);
if (missingArgumentList.length) {
	console.error(`runSamplePrompts: missing --${missingArgumentList.join(', --')} (no defaults: the config names the graph and the stop line is a spend decision)`);
	process.exit(2);
}
const stopAtUsd = Number(argumentByName.stopAtUsd);
if (!(stopAtUsd > 0)) {
	console.error(`runSamplePrompts: --stopAtUsd must be a positive number (got ${JSON.stringify(argumentByName.stopAtUsd)})`);
	process.exit(2);
}
const { codeRootPath, configPath, outputDirPath } = argumentByName;
const onlyIdList = argumentByName.onlyIdList ? String(argumentByName.onlyIdList).split(',') : null;

// the prompt list, read from the TypeScript source: every LIVE { promptText, requiredFamilyList } object (commented entries
// skipped). The entries carry no id, so each is named by its position in the live list (prompt01, prompt02, ...)
const promptListText = fs.readFileSync(path.join(codeRootPath, 'html', 'data', 'dmeExamplePromptList.ts'), 'utf8')
	.split('\n').filter((lineText) => !/^\s*\/\//.test(lineText)).join('\n');
const promptList = [];
const entryPattern = /promptText:\s*'((?:[^'\\]|\\.)*)'/g;
let entryMatch;
while ((entryMatch = entryPattern.exec(promptListText)) !== null) {
	promptList.push({ promptId: `prompt${String(promptList.length + 1).padStart(2, '0')}`, promptText: entryMatch[1].replace(/\\'/g, "'") });
}
const selectedPromptList = onlyIdList ? promptList.filter((onePrompt) => onlyIdList.includes(onePrompt.promptId)) : promptList;
if (selectedPromptList.length === 0) {
	console.error(`runSamplePrompts: no prompts selected (parsed ${promptList.length})`);
	process.exit(2);
}
fs.mkdirSync(outputDirPath, { recursive: true });
const askMiloFilePath = path.join(codeRootPath, 'server', 'data-model', 'lib', 'ask-milo-multitool', 'askMilo.js');
const nodeBinPath = process.env.SUITE_NODE_BIN_PATH || '/usr/local/bin/node';

const askOne = ({ promptId, promptText }, callback) => {
	const switches = { json: true, ...(argumentByName.dryRun ? { dryRun: true, noSave: true } : {}) };
	const values = { configPath: [configPath], singleCallPromptName: ['DataModelExplorer'], expandModel: ['opus'], perspectives: ['0'], aiToolsSuppressed: ['DmeUserRead,DmeUserWrite'] };
	const child = spawn(nodeBinPath, [askMiloFilePath], { env: process.env });
	let stdoutText = '';
	let stderrText = '';
	child.stdout.on('data', (chunk) => { stdoutText += chunk; });
	child.stderr.on('data', (chunk) => { stderrText += chunk; });
	child.on('close', (exitCode) => {
		let answer = null;
		try { answer = JSON.parse(stdoutText); } catch (parseError) { answer = null; }
		// askMilo's json answer reports { cost: { inputTokens, outputTokens, usd } } (measured on its -dryRun mock); an answer
		// without it counts as unknown spend, which the ledger shows as null rather than as zero
		const costUsd = answer && answer.cost && typeof answer.cost.usd === 'number' ? answer.cost.usd : null;
		fs.writeFileSync(path.join(outputDirPath, `${promptId}.json`), JSON.stringify({ promptId, promptText, exitCode, costUsd, answer, stdoutTextWhenUnparsed: answer ? undefined : stdoutText, stderrTail: stderrText.slice(-4000) }, null, '\t'));
		callback('', { promptId, exitCode, costUsd, parsed: !!answer });
	});
	child.stdin.write(JSON.stringify({ switches, values, fileList: [promptText] }));
	child.stdin.end();
};

const ledgerFilePath = path.join(outputDirPath, 'ledger.tsv');
fs.writeFileSync(ledgerFilePath, 'promptId\texitCode\tparsed\tcostUsd\trunningUsd\n');
const runFrom = (promptIndex, runningUsd) => {
	if (promptIndex >= selectedPromptList.length) {
		console.log(`runSamplePrompts: DONE ${selectedPromptList.length} prompts, measured total USD ${runningUsd.toFixed(4)}`);
		return;
	}
	if (runningUsd > stopAtUsd) {
		console.log(`runSamplePrompts: STOPPED before ${selectedPromptList[promptIndex].promptId}: measured USD ${runningUsd.toFixed(4)} passed --stopAtUsd=${stopAtUsd}`);
		process.exitCode = 3;
		return;
	}
	askOne(selectedPromptList[promptIndex], (err, outcome) => {
		if (outcome.costUsd === null && !argumentByName.dryRun) {
			console.log(`runSamplePrompts: STOPPED after ${outcome.promptId}: its answer reports no cost, so the running total can no longer be measured`);
			process.exitCode = 3;
			return;
		}
		const nextUsd = runningUsd + (outcome.costUsd || 0);
		fs.appendFileSync(ledgerFilePath, `${outcome.promptId}\t${outcome.exitCode}\t${outcome.parsed}\t${outcome.costUsd}\t${nextUsd.toFixed(4)}\n`);
		console.log(`${outcome.promptId} exit=${outcome.exitCode} parsed=${outcome.parsed} cost=${outcome.costUsd} running=${nextUsd.toFixed(4)}`);
		runFrom(promptIndex + 1, nextUsd);
	});
};
console.log(`runSamplePrompts: ${selectedPromptList.length} of ${promptList.length} prompts, stop line USD ${stopAtUsd}${argumentByName.dryRun ? ' (DRY RUN, mock API)' : ''}`);
runFrom(0, 0);
