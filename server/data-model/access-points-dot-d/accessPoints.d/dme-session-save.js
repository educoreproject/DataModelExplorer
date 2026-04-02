#!/usr/bin/env node
'use strict';
// @concept: [[SessionPersistence]]
// @concept: [[AccessPointPattern]]

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');
const qt = require('qtools-functional-library');
const { pipeRunner, taskListPlus, mergeArgs, forwardArgs } = new require(
	'qtools-asynchronous-pipe-plus',
)();

//START OF moduleFunction() ============================================================

const moduleFunction = function ({ dotD, passThroughParameters }) {
	// ================================================================================
	// INITIALIZATION

	const { xLog, getConfig, rawConfig, commandLineParameters } = process.global;
	const localConfig = getConfig(moduleName);

	const { sqlDb, hxAccess, dataMapping } = passThroughParameters;

	// ================================================================================
	// ANTHROPIC SETUP FOR AUTO-TITLING

	const Anthropic = require('@anthropic-ai/sdk').default;
	const askmiloConfig = getConfig('askmilo-utility') || {};
	const apiKey = askmiloConfig.anthropicApiKey || process.env.ANTHROPIC_API_KEY;

	let anthropic;
	if (apiKey) {
		anthropic = new Anthropic({ apiKey });
	} else {
		xLog.error(`${moduleName}: No Anthropic API key found — auto-titling disabled`);
	}

	// ================================================================================
	// SERVICE FUNCTION

	const serviceFunction = (inputData, callback) => {
		const taskList = new taskListPlus();

		// --------------------------------------------------------------------------------
		// GET DME_SESSIONS TABLE

		taskList.push((args, next) =>
			args.sqlDb.getTable('dme_sessions', mergeArgs(args, next, 'sessionsTable')),
		);

		// --------------------------------------------------------------------------------
		// CHECK OWNERSHIP IF UPDATING (refId provided)

		taskList.push((args, next) => {
			const { sessionsTable, dataMapping, refId, userRefId } = args;

			if (!refId) {
				next('', args);
				return;
			}

			const query = dataMapping['dme-session'].getSql('byRefId', { refId });

			const localCallback = (err, resultList = []) => {
				if (err) {
					next(err, args);
					return;
				}

				const existingRecord = resultList.qtLast();

				if (!existingRecord) {
					next(`Session not found: ${refId}`, args);
					return;
				}

				if (existingRecord.userRefId !== userRefId) {
					next('Permission denied: not session owner', args);
					return;
				}

				next('', { ...args, existingRecord });
			};

			sessionsTable.getData(query, { suppressStatementLog: true, noTableNameOk: true }, localCallback);
		});

		// --------------------------------------------------------------------------------
		// SAVE SESSION RECORD

		taskList.push((args, next) => {
			const { sessionsTable, refId, userRefId, sessionData } = args;

			const saveObj = {
				userRefId,
				sessionData: JSON.stringify(sessionData),
				sessionName: 'Untitled Session',
			};

			if (refId) {
				saveObj.refId = refId;
			}

			const localCallback = (err, savedRefId) => {
				if (err) {
					next(err, args);
					return;
				}
				const resultRefId = refId || savedRefId;
				next('', { ...args, savedRefId: resultRefId });
			};

			sessionsTable.saveObject(saveObj, { suppressStatementLog: true }, localCallback);
		});

		// --------------------------------------------------------------------------------
		// GENERATE TITLE VIA ANTHROPIC HAIKU

		taskList.push((args, next) => {
			const { sessionData, savedRefId } = args;

			if (!anthropic) {
				next('', { ...args, generatedTitle: `Session ${new Date().toLocaleDateString()}` });
				return;
			}

			const prompts = sessionData
				.map((r) => r.prompt)
				.filter(Boolean)
				.join('\n');

			if (!prompts) {
				next('', { ...args, generatedTitle: `Session ${new Date().toLocaleDateString()}` });
				return;
			}

			const titlePrompt = `Given these conversation prompts, suggest a short descriptive title (max 60 chars). Reply with ONLY the title, nothing else.\n\n${prompts}`;

			anthropic.messages
				.create({
					model: 'claude-haiku-4-5-20251001',
					max_tokens: 100,
					messages: [{ role: 'user', content: titlePrompt }],
				})
				.then((message) => {
					const title = message.content
						.filter((block) => block.type === 'text')
						.map((block) => block.text)
						.join('')
						.trim();

					next('', { ...args, generatedTitle: title || `Session ${new Date().toLocaleDateString()}` });
				})
				.catch((err) => {
					xLog.error(`${moduleName}: Haiku title generation failed: ${err.message}`);
					next('', { ...args, generatedTitle: `Session ${new Date().toLocaleDateString()}` });
				});
		});

		// --------------------------------------------------------------------------------
		// UPDATE RECORD WITH GENERATED TITLE

		taskList.push((args, next) => {
			const { sessionsTable, savedRefId, generatedTitle } = args;

			const updateObj = {
				refId: savedRefId,
				sessionName: generatedTitle,
			};

			const localCallback = (err) => {
				if (err) {
					next(err, args);
					return;
				}
				next('', { ...args, sessionName: generatedTitle });
			};

			sessionsTable.saveObject(updateObj, { suppressStatementLog: true }, localCallback);
		});

		// --------------------------------------------------------------------------------
		// INIT AND EXECUTE THE PIPELINE

		const initialData = {
			refId: inputData.refId,
			userRefId: inputData.userRefId,
			sessionData: inputData.sessionData,
			sqlDb,
			dataMapping,
		};

		pipeRunner(taskList.getList(), initialData, (err, args) => {
			if (err) {
				callback(err, {});
				return;
			}
			const { savedRefId, sessionName } = args;
			callback('', { refId: savedRefId, sessionName });
		});
	};

	// ================================================================================
	// Access Point Registration

	const addEndpoint = ({ name, serviceFunction, dotD }) => {
		dotD.logList.push(name);
		dotD.library.add(name, serviceFunction);
	};

	// ================================================================================
	// Do the constructing

	const name = moduleName;

	addEndpoint({ name, serviceFunction, dotD });

	return {};
};

//END OF moduleFunction() ============================================================

module.exports = moduleFunction;
