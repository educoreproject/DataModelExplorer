'use strict';

// moduleTwin.js — TEST SUPPORT (campaign P2): compile ONE module of this directory in memory with exact text mutations and
// return its exports, so a gate can OBSERVE its own red twin without writing a file (the idea of educoreForge's
// loadBuildJsDouble). Every find must match exactly once, or the twin refuses: a mutation that changed nothing proves
// nothing. Requires inside the mutated module load for real (relative paths resolve against the module's own directory).
//
//   loadWithMutations({ modulePath, mutationList: [{ find, replace }] }) -> the mutated module's exports

const fs = require('fs');
const path = require('path');
const Module = require('module');
const vm = require('vm');

const loadWithMutations = ({ modulePath, mutationList }) => {
	let sourceText = fs.readFileSync(modulePath, 'utf8');
	mutationList.forEach((oneMutation) => {
		const matchCount = sourceText.split(oneMutation.find).length - 1;
		if (matchCount !== 1) {
			throw new Error(`moduleTwin REFUSED: find-text matched ${matchCount} times in ${path.basename(modulePath)} (must match exactly once): ${JSON.stringify(oneMutation.find).slice(0, 120)}`);
		}
		sourceText = sourceText.replace(oneMutation.find, () => oneMutation.replace);
	});
	const twinModule = new Module(modulePath, module);
	twinModule.filename = modulePath;
	twinModule.paths = Module._nodeModulePaths(path.dirname(modulePath));
	// eslint-disable-next-line prefer-arrow-callback
	function twinRequire(requestPath) {
		return requestPath.startsWith('.') ? require(path.resolve(path.dirname(modulePath), requestPath)) : twinModule.require(requestPath);
	}
	const compiledWrapper = vm.runInThisContext(Module.wrap(sourceText), { filename: modulePath });
	compiledWrapper.call(twinModule.exports, twinModule.exports, twinRequire, twinModule, modulePath, path.dirname(modulePath));
	return twinModule.exports;
};

module.exports = { loadWithMutations };
