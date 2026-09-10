#!/usr/bin/env node
'use strict';
// @concept: [[UserMappingPersistence]]
// @concept: [[AccessPointPattern]]
//
// Upserts one or more of a user's curated mappings (with their transformation
// rules). Identity is (userRefId, mappingKey, targetStandard, targetName); an
// existing row is updated in place, otherwise a new row is inserted. Returns the
// saved rows so the caller learns each row's refId.

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const qt = require('qtools-functional-library');
const { pipeRunner, taskListPlus, mergeArgs, forwardArgs } = new require(
	'qtools-asynchronous-pipe-plus',
)();

const { getMappingTable } = require('../../lib/dme-user-mapping-table');
const newRefId = require('../../lib/new-refid')({ digits: 20 });
const REFID_OPTIONS = { excludedChars: ['0', 'O', '1', 'l'] };

const TEXT_FIELDS = [
	'mappingKey',
	'sourceStandard',
	'sourceName',
	'sourceId',
	'targetStandard',
	'targetName',
	'targetSourceId',
	'rel',
	'detail',
	'transformType',
	'transformRule',
	'transformNotes',
];

//START OF moduleFunction() ============================================================

const moduleFunction = function ({ dotD, passThroughParameters }) {
	// ================================================================================
	// INITIALIZATION

	const { xLog, getConfig, rawConfig, commandLineParameters } = process.global;
	const localConfig = getConfig(moduleName);

	const { sqlDb, hxAccess, dataMapping } = passThroughParameters;

	// Only plain-text fields, coerced to strings, ever reach SQL.
	const sanitize = (raw = {}) => {
		const clean = {};
		TEXT_FIELDS.forEach((name) => {
			const value = raw[name];
			clean[name] = value === undefined || value === null ? '' : String(value);
		});
		return clean;
	};

	// ================================================================================
	// SERVICE FUNCTION

	const serviceFunction = (inputData, callback) => {
		const taskList = new taskListPlus();

		// --------------------------------------------------------------------------------
		// VALIDATE INPUT

		taskList.push((args, next) => {
			const { userRefId, mappings } = args;
			if (!userRefId) {
				next('No user identity supplied', args);
				return;
			}
			const list = (Array.isArray(mappings) ? mappings : [mappings])
				.filter(Boolean)
				.map(sanitize);
			const bad = list.find((m) => !m.mappingKey || !m.targetStandard || !m.targetName);
			if (bad) {
				next('Each mapping needs mappingKey, targetStandard and targetName', args);
				return;
			}
			next('', { ...args, mappings: list });
		});

		// --------------------------------------------------------------------------------
		// GET TABLE (schema grown as needed)

		taskList.push((args, next) =>
			getMappingTable(
				{ sqlDb: args.sqlDb, dataMapping: args.dataMapping },
				mergeArgs(args, next, 'mappingTable'),
			),
		);

		// --------------------------------------------------------------------------------
		// UPSERT EACH MAPPING

		taskList.push((args, next) => {
			const { mappingTable, dataMapping, userRefId, mappings } = args;
			const mapper = dataMapping['dme-user-mapping'];
			const saved = [];
			const innerTasks = new taskListPlus();

			mappings.forEach((mapping) => {
				innerTasks.push((innerArgs, innerNext) => {
					const identity = {
						userRefId,
						mappingKey: mapping.mappingKey,
						targetStandard: mapping.targetStandard,
						targetName: mapping.targetName,
					};
					mappingTable.getData(
						mapper.getSql('byIdentity', identity),
						{ suppressStatementLog: true },
						(err, rows = []) => {
							if (err) {
								innerNext(err, innerArgs);
								return;
							}
							const existing = (rows || []).qtLast();
							const refId = existing ? existing.refId : newRefId(REFID_OPTIONS);
							const record = { ...mapping, refId, userRefId };
							const sql = existing
								? mapper.getSql('updateByRefId', record)
								: mapper.getSql('insert', record);
							mappingTable.runStatement(sql, { suppressStatementLog: true }, (runErr) => {
								if (!runErr) saved.push(refId);
								innerNext(runErr, innerArgs);
							});
						},
					);
				});
			});

			pipeRunner(innerTasks.getList(), {}, (err) => next(err, { ...args, savedRefIds: saved }));
		});

		// --------------------------------------------------------------------------------
		// READ BACK THE SAVED ROWS

		taskList.push((args, next) => {
			const { mappingTable, dataMapping, userRefId, savedRefIds } = args;
			const mapper = dataMapping['dme-user-mapping'];
			mappingTable.getData(
				mapper.getSql('byUser', { userRefId }),
				{ suppressStatementLog: true },
				(err, rows = []) => {
					const savedRows = (rows || []).filter((r) => savedRefIds.includes(r.refId));
					next(err, { ...args, savedRows });
				},
			);
		});

		// --------------------------------------------------------------------------------
		// INIT AND EXECUTE THE PIPELINE

		const initialData = {
			userRefId: inputData.userRefId,
			mappings: inputData.mappings,
			sqlDb,
			dataMapping,
		};

		pipeRunner(taskList.getList(), initialData, (err, args) => {
			if (err) {
				callback(err, []);
				return;
			}
			callback('', args.savedRows);
		});
	};

	// ================================================================================
	// Access Point Registration

	const addEndpoint = ({ name, serviceFunction, dotD }) => {
		dotD.logList.push(name);
		dotD.library.add(name, serviceFunction);
	};

	addEndpoint({ name: moduleName, serviceFunction, dotD });

	return {};
};

//END OF moduleFunction() ============================================================

module.exports = moduleFunction;
