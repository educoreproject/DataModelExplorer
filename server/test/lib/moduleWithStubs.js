'use strict';

// moduleWithStubs.js — TEST SUPPORT (campaign P2): compile ONE server module in memory with exact text mutations and with
// chosen require() requests answered by stubs, and return its exports. The server-side sibling of the DME's
// test/lib/moduleTwin.js: a gate observes its own red twin without writing a file, and an access point can be driven
// with its neighbours (clone lookup, neo4j connection, the store) replaced by doubles.
//
//   loadWithStubs({ modulePath, mutationList: [{ find, replace }], stubByRequestPath: { '<exact require string>': exports } })
//     -> the module's exports
//
// Every find must match exactly once, or the load refuses: a mutation that changed nothing proves nothing. A request
// not named in stubByRequestPath loads for real (relative paths resolve against the module's own directory).

const fs = require('fs');
const path = require('path');
const Module = require('module');
const vm = require('vm');

const loadWithStubs = ({ modulePath, mutationList, stubByRequestPath }) => {
	let sourceText = fs.readFileSync(modulePath, 'utf8').replace(/^#!.*\n/, '\n');
	(mutationList || []).forEach((oneMutation) => {
		const matchCount = sourceText.split(oneMutation.find).length - 1;
		if (matchCount !== 1) {
			throw new Error(`moduleWithStubs REFUSED: find-text matched ${matchCount} times in ${path.basename(modulePath)} (must match exactly once): ${JSON.stringify(oneMutation.find).slice(0, 120)}`);
		}
		sourceText = sourceText.replace(oneMutation.find, () => oneMutation.replace);
	});
	const stubMap = stubByRequestPath || {};
	const loadedModule = new Module(modulePath, module);
	loadedModule.filename = modulePath;
	loadedModule.paths = Module._nodeModulePaths(path.dirname(modulePath));
	// eslint-disable-next-line prefer-arrow-callback
	function stubbedRequire(requestPath) {
		if (Object.prototype.hasOwnProperty.call(stubMap, requestPath)) {
			return stubMap[requestPath];
		}
		return requestPath.startsWith('.') ? require(path.resolve(path.dirname(modulePath), requestPath)) : loadedModule.require(requestPath);
	}
	const compiledWrapper = vm.runInThisContext(Module.wrap(sourceText), { filename: modulePath });
	compiledWrapper.call(loadedModule.exports, loadedModule.exports, stubbedRequire, loadedModule, modulePath, path.dirname(modulePath));
	return loadedModule.exports;
};

module.exports = { loadWithStubs };
