#!/usr/bin/env node
'use strict';
// @concept: [[DataModelExplorer]]
// @concept: [[AccessPointPattern]]

// dme-list-standards — the standards inventory for the Data Model Explorer's welcome screen (WEL, 2026-10-07). It is
// askMilo's dme_list_standards, not a copy of it: the DME CLI module's search('listStandards') runs in-process, so the
// page and the model read one query on one READ session against the graph dataModelExplorerSearch.ini names. Output is
// one inventory object: { standards, count, totals: { hubSource, standardCount, familyList, ... } }. When the graph
// cannot answer, the call REFUSES BY NAME (graphUnreachable) — the page then says the list is unavailable and why,
// never shows a remembered one.

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const { pipeRunner, taskListPlus } = new require('qtools-asynchronous-pipe-plus')();

const DME_SEARCH_MODULE_PATH = '../../../../cli/lib.d/data-model-explorer/dataModelExplorerSearch';

//START OF moduleFunction() ============================================================

const moduleFunction = function ({ dotD, passThroughParameters }) {
	const { search: dmeSearch } = require(DME_SEARCH_MODULE_PATH);

	// ================================================================================
	// SERVICE FUNCTION

	const serviceFunction = (xQuery, callback) => {
		const taskList = new taskListPlus();

		// STAGE 1: the same verb askMilo calls; an error here means the graph did not answer
		taskList.push((args, next) => {
			dmeSearch('listStandards', {}, (searchError, standardInventory) => {
				if (searchError) {
					next(`${moduleName}: graphUnreachable: ${searchError}`, args);
					return;
				}
				if (!standardInventory || standardInventory.refusedByName) {
					next(`${moduleName}: listStandardsRefused: ${(standardInventory && standardInventory.reason) || 'the verb answered nothing'}`, args);
					return;
				}
				next('', { ...args, standardInventory });
			});
		});

		pipeRunner(taskList.getList(), { xQuery: xQuery || {} }, (pipeError, args) => {
			if (pipeError) {
				callback(pipeError);
				return;
			}
			callback('', args.standardInventory);
		});
	};

	// ================================================================================
	// ACCESS POINT REGISTRATION

	dotD.logList.push(moduleName);
	dotD.library.add(moduleName, serviceFunction);

	return {};
};

//END OF moduleFunction() ============================================================

module.exports = moduleFunction;
