#!/usr/bin/env node
'use strict';
// @concept: [[UserMappingPersistence]]
// @concept: [[AccessPointPattern]]
//
// Upserts one or more of a user's curated mappings (with their transformation
// rules). Identity is (userRefId, mappingKey, targetStandard, targetName); an
// existing row is updated in place, otherwise a new row is inserted as a
// 'proposed' mapping. Review fields (status, reviewedBy, …) are never written
// here — an owner re-saving a mapping keeps whatever review it already has.
// Returns the saved rows so the caller learns each row's refId.

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const qt = require('qtools-functional-library');
const { pipeRunner, taskListPlus, mergeArgs, forwardArgs } = new require(
	'qtools-asynchronous-pipe-plus',
)();

const { getMappingTable, getUserDirectory, decorateRows } = require('../../lib/dme-user-mapping-table');
const newRefId = require('../../lib/new-refid')({ digits: 20 });
const REFID_OPTIONS = { excludedChars: ['0', 'O', '1', 'l'] };

// Fields a proposer may set. Review fields are deliberately absent.
const TEXT_FIELDS = [
	'mappingKey',
	'sourceStandard',
	'sourceName',
	'sourceId',
	'sourcePath',
	'targetStandard',
	'targetName',
	'targetSourceId',
	'targetPath',
	'rel',
	'detail',
	'transformType',
	'transformRule',
	'transformNotes',
];
const REVIEW_FIELDS = ['status', 'reviewedBy', 'reviewedAt', 'reviewNote'];

//START OF moduleFunction() ============================================================

const moduleFunction = function ({ dotD, passThroughParameters }) {
	// ================================================================================
	// INITIALIZATION

	const { xLog, getConfig, rawConfig, commandLineParameters } = process.global;
	const localConfig = getConfig(moduleName);

	const { sqlDb, hxAccess, dataMapping } = passThroughParameters;

	// Only plain-text fields, coerced to strings, ever reach SQL. Fields the
	// caller did not send are left out, so an update merges onto the existing
	// row (a rule edit must not blank the source columns); on insert the mapper
	// fills the gaps with ''.
	const sanitize = (raw = {}) => {
		const clean = {};
		TEXT_FIELDS.forEach((name) => {
			const value = raw[name];
			if (value === undefined) return;
			clean[name] = value === null ? '' : String(value);
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

							// Carry the existing row forward — its review verdict and any
							// data field the caller did not resend — then lay the new values
							// over it. A fresh row is a proposal.
							const carried = {};
							[...TEXT_FIELDS, ...REVIEW_FIELDS].forEach((f) => {
								carried[f] = existing ? existing[f] || '' : '';
							});
							if (!carried.status) carried.status = 'proposed';

							const record = { ...carried, ...mapping, refId, userRefId };
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

		taskList.push((args, next) =>
			getUserDirectory({ sqlDb: args.sqlDb, dataMapping: args.dataMapping }, (err, directory) =>
				next('', { ...args, directory: err ? {} : directory }),
			),
		);

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
			callback('', decorateRows(args.savedRows, args.directory, args.userRefId));
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
