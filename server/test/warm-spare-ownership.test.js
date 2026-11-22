'use strict';
// warm-spare-ownership.test.js — WORKORDER-raterAndAdminLooseEnds-112226 R7 (supervisor ruling a7368aab, 2026-11-22).
// clone-manager's describeWarmContainers lists every running usr__warm_* container on the docker host. Until this change
// it ADOPTED every query-ready one into this instance's pool and TORE DOWN every not-ready one, whoever had made it; on
// 2026-11-22 the one live spare on the workstation came from another session's scratch config. A spare now counts only
// when its clone directory lies under THIS instance's userGraphsDirPath, compared on real paths with a trailing separator.
//
//   W1 an own ready spare is adopted
//   W2 a foreign ready spare (under the sibling directory userGraphs2, the trailing-separator trap) is not adopted
//   W3 a foreign not-ready spare is NOT torn down: no docker rm, its directory is still there
//   W4 an own not-ready spare is still torn down
//   W5 the config names userGraphsDirPath through a symlinked path (macOS /var -> /private/var): the own spare still counts
//   W6 a foreign spare is logged by name once, not on every describe
//   W7 with no userGraphsDirPath configured, no spare is adopted and none torn down
//
// docker is a double (child_process.execFileSync answered from a scenario); nothing reaches a real container.
//
//   node server/test/warm-spare-ownership.test.js

const fs = require('fs');
const os = require('os');
const path = require('path');
const { loadWithStubs } = require('./lib/moduleWithStubs');

const CLONE_MANAGER_PATH = path.join(__dirname, '..', 'data-model', 'lib', 'user-graph', 'clone-manager.js');

let passCount = 0;
let failCount = 0;
const check = (checkName, condition, detailText = '') => {
	if (condition) {
		passCount++;
	} else {
		failCount++;
	}
	console.log(`  ${condition ? 'PASS' : 'FAIL'}: ${checkName}${condition || !detailText ? '' : ` — ${detailText}`}`);
};

// scratch layout: <real tmp>/warmSpareOwnership-*/userGraphs (ours) and .../userGraphs2 (a sibling that shares the prefix)
const scratchRealDirPath = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'warmSpareOwnership-')));
const ownUserGraphsDirPath = path.join(scratchRealDirPath, 'userGraphs');
const foreignUserGraphsDirPath = path.join(scratchRealDirPath, 'userGraphs2');
const symlinkDirPath = path.join(scratchRealDirPath, 'linkToScratch');
fs.symlinkSync(scratchRealDirPath, symlinkDirPath);

const spareCloneDirOf = (userGraphsDirPath, spareName) => {
	const cloneDirPath = path.join(userGraphsDirPath, 'uid-_warm', `ver-${spareName}`);
	fs.mkdirSync(path.join(cloneDirPath, 'data'), { recursive: true });
	return cloneDirPath;
};

// every spare docker would report: name, clone directory, bolt port, and whether its port answers
const SPARE_LIST = [
	{ containerName: 'usr__warm_own1', cloneDirPath: spareCloneDirOf(ownUserGraphsDirPath, 'own1'), boltPort: 41001, isReady: true },
	{ containerName: 'usr__warm_foreign1', cloneDirPath: spareCloneDirOf(foreignUserGraphsDirPath, 'foreign1'), boltPort: 41002, isReady: true },
	{ containerName: 'usr__warm_foreign2', cloneDirPath: spareCloneDirOf(foreignUserGraphsDirPath, 'foreign2'), boltPort: 41003, isReady: false },
	{ containerName: 'usr__warm_own2', cloneDirPath: spareCloneDirOf(ownUserGraphsDirPath, 'own2'), boltPort: 41004, isReady: false },
];

const removedContainerNameList = [];
const statusLineList = [];

const fakeExecFileSync = (commandName, argumentList) => {
	const argumentText = argumentList.join(' ');
	if (commandName === 'docker' && argumentList[0] === 'ps') {
		return SPARE_LIST.filter((spare) => !removedContainerNameList.includes(spare.containerName)).map((spare) => spare.containerName).join('\n');
	}
	if (commandName === 'docker' && argumentList[0] === 'inspect') {
		const spare = SPARE_LIST.find((candidate) => argumentList.includes(candidate.containerName));
		if (!spare || removedContainerNameList.includes(spare.containerName)) {
			throw new Error(`fake docker: no such container in '${argumentText}'`);
		}
		if (/NetworkSettings\.Ports/.test(argumentText)) {
			return `7687/tcp=${spare.boltPort};7474/tcp=${spare.boltPort + 100};`;
		}
		if (/\.Mounts/.test(argumentText)) {
			return `/data=${path.join(spare.cloneDirPath, 'data')}\n/logs=${path.join(spare.cloneDirPath, 'logs')}\n`;
		}
		return '[]';
	}
	if (commandName === 'docker' && argumentList[0] === 'rm') {
		removedContainerNameList.push(argumentList[argumentList.length - 1]);
		return '';
	}
	if (commandName === 'bash') {
		const spare = SPARE_LIST.find((candidate) => argumentText.endsWith(`/${candidate.boltPort}`));
		if (spare && spare.isReady) {
			return '';
		}
		throw new Error('fake probe: port closed');
	}
	throw new Error(`fake execFileSync: unexpected ${commandName} ${argumentText}`);
};

const configuredUserGraphsDirPathByCase = { current: ownUserGraphsDirPath };
process.global = {
	xLog: { status: (lineText) => statusLineList.push(`${lineText}`), error: (lineText) => statusLineList.push(`${lineText}`), verbose: () => {} },
	getConfig: (moduleName) => (moduleName === 'dataModelExplorerSearch' ? { userGraphsDirPath: configuredUserGraphsDirPathByCase.current, goldenContainerName: 'GOLD_TEST_warmSpareOwnership' } : {}),
};

const realChildProcess = require('child_process');
const cloneManager = loadWithStubs({
	modulePath: CLONE_MANAGER_PATH,
	stubByRequestPath: {
		child_process: { ...realChildProcess, execFileSync: fakeExecFileSync },
		'./container-connection-resolver': { resolveContainerConnection: () => ({ password: 'test-password', boltUri: 'bolt://localhost:41000' }) },
	},
});

const adoptedNameListOf = () => cloneManager.describeWarmContainers().map((descriptor) => descriptor.containerName);

console.log('describeWarmContainers, config names the real userGraphs path');
const adoptedNameList = adoptedNameListOf();
check('W1 an own ready spare is adopted', adoptedNameList.includes('usr__warm_own1'), JSON.stringify(adoptedNameList));
check('W2 a foreign ready spare under the sibling userGraphs2 is not adopted', !adoptedNameList.includes('usr__warm_foreign1'), JSON.stringify(adoptedNameList));
check('W3 a foreign not-ready spare is not torn down (no docker rm)', !removedContainerNameList.includes('usr__warm_foreign2'), JSON.stringify(removedContainerNameList));
check('W3 …and its clone directory is still there', fs.existsSync(SPARE_LIST[2].cloneDirPath));
check('W4 an own not-ready spare is still torn down', removedContainerNameList.includes('usr__warm_own2') && !fs.existsSync(SPARE_LIST[3].cloneDirPath), JSON.stringify(removedContainerNameList));
check('W4 nothing else was torn down', removedContainerNameList.length === 1, JSON.stringify(removedContainerNameList));

console.log('the config names userGraphsDirPath through a symlink');
configuredUserGraphsDirPathByCase.current = path.join(symlinkDirPath, 'userGraphs');
const symlinkAdoptedNameList = adoptedNameListOf();
check('W5 the own spare still counts when the configured path is a symlinked spelling of it', JSON.stringify(symlinkAdoptedNameList) === '["usr__warm_own1"]', JSON.stringify(symlinkAdoptedNameList));

const foreignLogCountOf = (containerName) => statusLineList.filter((lineText) => lineText.includes(containerName)).length;
check('W6 a foreign spare is logged by name, once over two describes', foreignLogCountOf('usr__warm_foreign1') === 1 && foreignLogCountOf('usr__warm_foreign2') === 1, `foreign1 ${foreignLogCountOf('usr__warm_foreign1')}, foreign2 ${foreignLogCountOf('usr__warm_foreign2')}`);

console.log('no userGraphsDirPath configured');
configuredUserGraphsDirPathByCase.current = undefined;
SPARE_LIST.push({ containerName: 'usr__warm_own3', cloneDirPath: spareCloneDirOf(ownUserGraphsDirPath, 'own3'), boltPort: 41005, isReady: false });
const unconfiguredAdoptedNameList = adoptedNameListOf();
check('W7 with no userGraphsDirPath nothing is adopted', unconfiguredAdoptedNameList.length === 0, JSON.stringify(unconfiguredAdoptedNameList));
check('W7 …and nothing is torn down', !removedContainerNameList.includes('usr__warm_own3'), JSON.stringify(removedContainerNameList));

fs.rmSync(scratchRealDirPath, { recursive: true, force: true });
console.log(`\nwarm-spare-ownership: ${passCount} passed, ${failCount} failed`);
process.exit(failCount ? 1 : 0);
