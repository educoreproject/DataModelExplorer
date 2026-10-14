'use strict';

// rater-tool-admin.js — what the ADMIN can do with the CEDS Rater (SPEC §3.5–3.6). A registry of actions, one interface:
//   action({ adminRequest }, callback(errText, result | { refusal }))
//
//   list           every rater: survey, saved of item count, finished, last active
//   add            { raterUserName, whoText, emailAdr, surveyName, password }: a users row with role 'rater' (through the
//                  existing admin-create-user access point: its validation and password hashing) plus the raters row.
//                  whoText (who they are, admin-only) becomes the user's first name; last name is 'CEDS Rater'. emailAdr is
//                  optional: without one the account gets <name>@raters.educore.invalid (.invalid is reserved, RFC 2606:
//                  plainly not an address). password is optional: without one a random one is made and returned ONCE as
//                  issuedPassword for the admin to pass on (the design's "Add and make a password").
//   surveyChange   { raterUserName, surveyName, forced }: refused once the rater has answers, unless forced; a forced change
//                  KEEPS the old answers in the store (they appear in the download, and no longer count as progress)
//   passwordReset  { raterUserName, password }: the users row of a rater (role 'rater' only), hashed by profile-user;
//                  without a password one is made and returned once as issuedPassword
//   download       { downloadFormat: 'json' | 'csv' }: every saved answer, with foundBy and its full history
//   remove         { raterUserName }: the rater's answers, history, search log and raters row, and the users row when its
//                  role is exactly 'rater'. Permanent; the admin screen asks first.
//
//   makeRaterToolAdmin({ raterToolAccess, dataMapping, sqlDb, accessPointsDotD, raterService }) -> { runAdminAction }

const crypto = require('crypto');
const { pipeRunner, taskListPlus } = new (require('qtools-asynchronous-pipe-plus'))();

const ADMIN_REFUSAL_NAME_LIST = Object.freeze(['adminActionInvalid', 'surveyNameInvalid', 'raterNameInvalid', 'raterUnknown', 'raterExists', 'raterAccountInvalid', 'surveyChangeWithAnswers', 'passwordInvalid', 'downloadFormatInvalid', 'userNotARater']);
const refusalOf = (refusalName, refusalText) => {
	if (ADMIN_REFUSAL_NAME_LIST.indexOf(refusalName) === -1) {
		throw new Error(`rater-tool-admin: '${refusalName}' is not one of ${ADMIN_REFUSAL_NAME_LIST.join(', ')}`);
	}
	return { refusal: { refusalName, refusalText } };
};
const RATER_USER_NAME_PATTERN = /^[a-z0-9_-]{2,40}$/;
const nowText = () => new Date().toISOString();

// issuePassword — 4 groups of 4 from an alphabet without look-alikes (no 0/o, 1/l/i), checked against the house strength
// rule; a draw that trips the common-word check is drawn again
const ISSUED_PASSWORD_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const issuePassword = (validatePasswordStrength) => {
	for (let attemptCount = 0; attemptCount < 20; attemptCount++) {
		const byteList = crypto.randomBytes(16);
		const passwordText = Array.from(byteList).map((byteValue) => ISSUED_PASSWORD_ALPHABET[byteValue % ISSUED_PASSWORD_ALPHABET.length]).join('').replace(/(.{4})(?=.)/g, '$1-');
		if (validatePasswordStrength(passwordText).isValid) {
			return passwordText;
		}
	}
	throw new Error('rater-tool-admin.issuePassword: no valid password in 20 draws');
};
const PLACEHOLDER_EMAIL_DOMAIN = 'raters.educore.invalid';

const cardLabelOf = (card) => `${card.className} › ${card.propertyName}${card.qualifierNameList && card.qualifierNameList.length > 0 ? ` (${card.qualifierNameList.join(', ')})` : ''}`;

const CSV_COLUMN_LIST = Object.freeze(['raterName', 'surveyName', 'finishedAt', 'standard', 'elementStableId', 'elementName', 'elementPath', 'answerKind', 'bestCedsTupleId', 'bestLabel', 'bestFoundBy', 'sameCards', 'addedCards', 'note', 'searchesTyped', 'secondsOnItem', 'savedAt', 'historyCount', 'historyJson']);
const csvCellOf = (cellValue) => {
	const cellText = cellValue === null || cellValue === undefined ? '' : typeof cellValue === 'string' ? cellValue : JSON.stringify(cellValue);
	return /[",\n\r]/.test(cellText) ? `"${cellText.replace(/"/g, '""')}"` : cellText;
};

const makeRaterToolAdmin = ({ raterToolAccess, dataMapping, sqlDb, accessPointsDotD, raterService }) => {
	const { raterStore, raterMapper } = raterService;
	const profileUserMapper = dataMapping['profile-user'];

	const readRaterOrRefuse = (raterUserName, callback) =>
		raterStore.readRater(`${raterUserName || ''}`, (readError, rater) => (readError ? callback(readError) : rater ? callback('', { rater }) : callback('', refusalOf('raterUnknown', `There is no rater named '${raterUserName}'.`))));

	const readUserRow = (username, callback) =>
		sqlDb.getTable('users', (tableError, userTable) => {
			if (tableError) {
				callback(`the users table did not open: ${tableError}`);
				return;
			}
			userTable.getData(profileUserMapper.getSql('byUsername', { username }), { suppressStatementLog: true, noTableNameOk: true }, (readError, rowList) => (readError ? callback(readError) : callback('', { userTable, userRow: (rowList || [])[0] || null })));
		});

	// downloadRecordList — one record per saved answer, in SPEC §5's shape, with history and foundBy
	const downloadRecordList = (callback) => {
		const taskList = new taskListPlus();
		taskList.push((args, next) => raterStore.readRows('raters', 'allRaters', {}, (readError, rowList) => (readError ? next(readError, args) : next('', { ...args, raterList: rowList.map(raterMapper.raterOf) }))));
		taskList.push((args, next) => raterStore.readRows('answers', 'allAnswers', {}, (readError, rowList) => (readError ? next(readError, args) : next('', { ...args, answerList: rowList.map(raterMapper.answerOf) }))));
		taskList.push((args, next) => raterStore.readRows('answerHistory', 'allHistory', {}, (readError, rowList) => (readError ? next(readError, args) : next('', { ...args, historyList: rowList.map(raterMapper.answerOf) }))));
		taskList.push((args, next) => raterStore.readRows('searchLog', 'allSearches', {}, (readError, rowList) => (readError ? next(readError, args) : next('', { ...args, searchRowList: rowList }))));
		pipeRunner(taskList.getList(), {}, (err, args) => {
			if (err) {
				callback(err);
				return;
			}
			const raterByUserName = args.raterList.reduce((soFar, rater) => ({ ...soFar, [rater.raterUserName]: rater }), {});
			const cardSummaryOf = (answer, raterUserName, elementStableId) => {
				const suggestedCardList = (raterToolAccess.suggestedDocument.suggestedByElementStableId[elementStableId] || { cardList: [] }).cardList;
				const cardByTupleId = suggestedCardList.concat(answer.addedCardList).reduce((soFar, card) => ({ ...soFar, [card.cedsTupleId]: card }), {});
				const foundByOf = (cedsTupleId) => (suggestedCardList.some((card) => card.cedsTupleId === cedsTupleId) ? 'suggested' : (answer.addedCardList.find((card) => card.cedsTupleId === cedsTupleId) || {}).foundBy || 'unknown');
				const chosenCardOf = (cedsTupleId, choice) => ({ cedsTupleId, label: cardByTupleId[cedsTupleId] ? cardLabelOf(cardByTupleId[cedsTupleId]) : null, cedsId: cardByTupleId[cedsTupleId] ? cardByTupleId[cedsTupleId].cedsId : null, choice, foundBy: foundByOf(cedsTupleId) });
				const chosenTupleIdList = answer.answerKind === 'cards' ? [answer.bestCedsTupleId, ...answer.sameCedsTupleIdList] : [];
				return {
					cards: answer.answerKind === 'cards' ? [chosenCardOf(answer.bestCedsTupleId, 'best'), ...answer.sameCedsTupleIdList.map((cedsTupleId) => chosenCardOf(cedsTupleId, 'prettyMuchSame'))] : [],
					addedCards: answer.addedCardList.filter((card) => chosenTupleIdList.indexOf(card.cedsTupleId) === -1).map((card) => ({ cedsTupleId: card.cedsTupleId, label: cardLabelOf(card), cedsId: card.cedsId, foundBy: card.foundBy })),
				};
			};
			const recordList = args.answerList.map((answerRecord) => {
				const element = raterToolAccess.elementByStableId[answerRecord.elementStableId] || {};
				const rater = raterByUserName[answerRecord.raterUserName] || {};
				const history = args.historyList
					.filter((historyRecord) => historyRecord.raterUserName === answerRecord.raterUserName && historyRecord.elementStableId === answerRecord.elementStableId)
					.map((historyRecord) => ({ historySequence: historyRecord.historySequence, savedAt: historyRecord.savedAt, answerKind: historyRecord.answer.answerKind, ...cardSummaryOf(historyRecord.answer, historyRecord.raterUserName, historyRecord.elementStableId), note: historyRecord.answer.note }));
				return {
					raterName: answerRecord.raterUserName,
					surveyName: rater.surveyName || null,
					finishedAt: rater.finishedAt || null,
					standard: element.standard || null,
					elementStableId: answerRecord.elementStableId,
					elementName: element.name || null,
					elementPath: element.path || null,
					answerKind: answerRecord.answer.answerKind,
					...cardSummaryOf(answerRecord.answer, answerRecord.raterUserName, answerRecord.elementStableId),
					note: answerRecord.answer.note,
					searchesTyped: answerRecord.answer.searchesTyped,
					secondsOnItem: answerRecord.answer.secondsOnItem,
					savedAt: answerRecord.savedAt,
					history,
				};
			});
			const searchLog = args.searchRowList.map((searchRow) => ({ raterName: searchRow.raterUserName, elementStableId: searchRow.elementStableId, searchMode: searchRow.searchMode, queryText: (raterMapper.decodeJsonColumn(searchRow.searchJson) || {}).queryText, resultCount: Number(searchRow.resultCount), searchedAt: searchRow.searchedAt }));
			callback('', { recordList, searchLog, raterList: args.raterList });
		});
	};

	const ADMIN_ACTION_BY_NAME = Object.freeze({
		list: ({ adminRequest }, callback) => {
			raterStore.readRows('raters', 'allRaters', {}, (readError, raterRowList) => {
				if (readError) {
					callback(readError);
					return;
				}
				raterStore.readRows('answers', 'allAnswers', {}, (answerError, answerRowList) => {
					if (answerError) {
						callback(answerError);
						return;
					}
					const answerList = answerRowList.map(raterMapper.answerOf);
					callback('', {
						surveyNameList: raterToolAccess.surveyNameList,
						goldenContainerName: raterToolAccess.goldenContainerName,
						raterList: raterRowList.map(raterMapper.raterOf).map((rater) => {
							const surveyElementList = raterToolAccess.elementListBySurvey[rater.surveyName] || [];
							const surveyStableIdSet = new Set(surveyElementList.map((element) => element.elementStableId));
							const raterAnswerList = answerList.filter((answerRecord) => answerRecord.raterUserName === rater.raterUserName);
							return {
								raterUserName: rater.raterUserName,
								display: rater.display,
								surveyName: rater.surveyName,
								savedCount: raterAnswerList.filter((answerRecord) => surveyStableIdSet.has(answerRecord.elementStableId)).length,
								answerCount: raterAnswerList.length,
								itemCount: surveyElementList.length,
								finishedAt: rater.finishedAt,
								lastActiveAt: rater.lastActiveAt,
								createdAt: rater.createdAt,
							};
						}),
					});
				});
			});
		},
		add: ({ adminRequest }, callback) => {
			const raterUserName = `${adminRequest.raterUserName || ''}`.trim().toLowerCase();
			if (!RATER_USER_NAME_PATTERN.test(raterUserName)) {
				callback('', refusalOf('raterNameInvalid', 'A rater name is 2–40 lower-case letters, digits, hyphens or underscores (eg rater-03).'));
				return;
			}
			if (raterToolAccess.surveyNameList.indexOf(adminRequest.surveyName) === -1) {
				callback('', refusalOf('surveyNameInvalid', `The survey must be one of ${raterToolAccess.surveyNameList.join(', ')}.`));
				return;
			}
			const issuedPassword = adminRequest.password ? null : issuePassword(profileUserMapper.validatePasswordStrength);
			const passwordText = adminRequest.password || issuedPassword;
			const whoText = `${adminRequest.whoText || ''}`.trim();
			const givenEmailAdr = `${adminRequest.emailAdr || ''}`.trim().toLowerCase();
			const taskList = new taskListPlus();
			taskList.push((args, next) => raterStore.readRater(raterUserName, (readError, rater) => (readError ? next(readError, args) : rater ? next('skipRestOfPipe', { ...args, refusalAnswer: refusalOf('raterExists', `There is already a rater named '${raterUserName}'.`) }) : next('', args))));
			taskList.push((args, next) =>
				accessPointsDotD['admin-create-user']({ username: raterUserName, password: passwordText, first: whoText || raterUserName, last: 'CEDS Rater', emailAdr: givenEmailAdr || `${raterUserName}@${PLACEHOLDER_EMAIL_DOMAIN}`, role: 'rater' }, (createError) =>
					createError ? next('skipRestOfPipe', { ...args, refusalAnswer: refusalOf(/already exists/i.test(createError) ? 'raterExists' : /password/i.test(createError) ? 'passwordInvalid' : 'raterAccountInvalid', `${createError}`) }) : next('', args)));
			taskList.push((args, next) =>
				raterStore.saveRowVerified('raters', { raterUserName, surveyName: adminRequest.surveyName, displayJson: raterMapper.encodeJsonColumn({ whoText, emailAdr: givenEmailAdr || null }), raterSeedText: crypto.randomBytes(16).toString('hex') }, (saveError) =>
					saveError ? next(saveError, args) : next('', args)));
			pipeRunner(taskList.getList(), {}, (err, args) => (err === 'skipRestOfPipe' ? callback('', args.refusalAnswer) : err ? callback(err) : callback('', { added: true, raterUserName, surveyName: adminRequest.surveyName, issuedPassword })));
		},
		surveyChange: ({ adminRequest }, callback) => {
			if (raterToolAccess.surveyNameList.indexOf(adminRequest.surveyName) === -1) {
				callback('', refusalOf('surveyNameInvalid', `The survey must be one of ${raterToolAccess.surveyNameList.join(', ')}.`));
				return;
			}
			readRaterOrRefuse(adminRequest.raterUserName, (readError, readAnswer) => {
				if (readError || readAnswer.refusal) {
					callback(readError, readAnswer);
					return;
				}
				const { rater } = readAnswer;
				raterStore.readRows('answers', 'answersOfRater', { raterUserName: rater.raterUserName }, (answerError, answerRowList) => {
					if (answerError) {
						callback(answerError);
						return;
					}
					if (answerRowList.length > 0 && adminRequest.forced !== true) {
						callback('', refusalOf('surveyChangeWithAnswers', `${rater.raterUserName} has ${answerRowList.length} saved answers on survey ${rater.surveyName}. Changing the survey needs forced: true; the old answers are kept.`));
						return;
					}
					raterStore.saveRowVerified('raters', { refId: rater.raterRefId, surveyName: adminRequest.surveyName }, (saveError) =>
						saveError ? callback(saveError) : callback('', { changed: true, raterUserName: rater.raterUserName, surveyName: adminRequest.surveyName, keptAnswerCount: answerRowList.length }));
				});
			});
		},
		passwordReset: ({ adminRequest }, callback) => {
			const issuedPassword = adminRequest.password ? null : issuePassword(profileUserMapper.validatePasswordStrength);
			const passwordText = adminRequest.password || issuedPassword;
			const passwordVerdict = profileUserMapper.validatePasswordStrength(passwordText);
			if (!passwordVerdict.isValid) {
				callback('', refusalOf('passwordInvalid', passwordVerdict.errors.join(', ')));
				return;
			}
			readRaterOrRefuse(adminRequest.raterUserName, (readError, readAnswer) => {
				if (readError || readAnswer.refusal) {
					callback(readError, readAnswer);
					return;
				}
				readUserRow(readAnswer.rater.raterUserName, (userError, { userTable, userRow } = {}) => {
					if (userError) {
						callback(userError);
						return;
					}
					if (!userRow || userRow.role !== 'rater') {
						callback('', refusalOf('userNotARater', `The account '${readAnswer.rater.raterUserName}' is not a rater account; its password is not changed here.`));
						return;
					}
					userTable.saveObject(profileUserMapper.map({ refId: userRow.refId, password: passwordText }, 'reverse'), { suppressStatementLog: true }, (saveError) =>
						saveError ? callback(`the password reset failed: ${saveError}`) : callback('', { passwordReset: true, raterUserName: readAnswer.rater.raterUserName, issuedPassword }));
				});
			});
		},
		download: ({ adminRequest }, callback) => {
			const downloadFormat = adminRequest.downloadFormat;
			if (['json', 'csv'].indexOf(downloadFormat) === -1) {
				callback('', refusalOf('downloadFormatInvalid', "downloadFormat must be 'json' or 'csv'."));
				return;
			}
			downloadRecordList((downloadError, downloadAnswer) => {
				if (downloadError) {
					callback(downloadError);
					return;
				}
				const stampText = nowText().replace(/[:.]/g, '-');
				if (downloadFormat === 'json') {
					const downloadDocument = { goldenContainerName: raterToolAccess.goldenContainerName, sampleSeedText: raterToolAccess.sampleDocument.sampleSeedText, downloadedAt: nowText(), raterList: downloadAnswer.raterList.map((rater) => ({ raterName: rater.raterUserName, surveyName: rater.surveyName, finishedAt: rater.finishedAt, lastActiveAt: rater.lastActiveAt })), answerList: downloadAnswer.recordList, searchLog: downloadAnswer.searchLog };
					callback('', { fileName: `cedsRaterAnswers-${stampText}.json`, contentType: 'application/json', recordCount: downloadAnswer.recordList.length, contentText: JSON.stringify(downloadDocument, null, '\t') });
					return;
				}
				const rowTextList = downloadAnswer.recordList.map((record) => {
					const bestCard = record.cards.find((card) => card.choice === 'best') || {};
					const cellByColumn = {
						...record,
						bestCedsTupleId: bestCard.cedsTupleId,
						bestLabel: bestCard.label,
						bestFoundBy: bestCard.foundBy,
						sameCards: record.cards.filter((card) => card.choice === 'prettyMuchSame').map((card) => `${card.label} [${card.foundBy}]`).join('; '),
						addedCards: record.addedCards.map((card) => `${card.label} [${card.foundBy}]`).join('; '),
						searchesTyped: record.searchesTyped.join('; '),
						historyCount: record.history.length,
						historyJson: record.history,
					};
					return CSV_COLUMN_LIST.map((columnName) => csvCellOf(cellByColumn[columnName])).join(',');
				});
				callback('', { fileName: `cedsRaterAnswers-${stampText}.csv`, contentType: 'text/csv', recordCount: downloadAnswer.recordList.length, contentText: [CSV_COLUMN_LIST.join(','), ...rowTextList].join('\n') + '\n' });
			});
		},
		remove: ({ adminRequest }, callback) => {
			readRaterOrRefuse(adminRequest.raterUserName, (readError, readAnswer) => {
				if (readError || readAnswer.refusal) {
					callback(readError, readAnswer);
					return;
				}
				const raterUserName = readAnswer.rater.raterUserName;
				const taskList = new taskListPlus();
				['answers', 'answerHistory', 'searchLog', 'raters'].forEach((tableRole) => {
					taskList.push((args, next) => raterStore.runStatement(tableRole, 'deleteRowsOfRater', { raterUserName }, (deleteError) => next(deleteError, args)));
				});
				taskList.push((args, next) =>
					sqlDb.getTable('users', (tableError, userTable) => {
						if (tableError) {
							next(`the users table did not open: ${tableError}`, args);
							return;
						}
						userTable.runStatement(raterMapper.getSql('deleteRaterUser', { username: raterUserName }), { suppressStatementLog: true, noTableNameOk: true }, (deleteError) => next(deleteError, args));
					}));
				taskList.push((args, next) => raterStore.readRater(raterUserName, (verifyError, stillThere) => (verifyError ? next(verifyError, args) : stillThere ? next(`storeWriteLost: the raters row for ${raterUserName} is still there after the delete`, args) : next('', args))));
				pipeRunner(taskList.getList(), {}, (err) => (err ? callback(err) : callback('', { removed: true, raterUserName })));
			});
		},
	});

	const runAdminAction = ({ adminRequest }, callback) => {
		const adminAction = ADMIN_ACTION_BY_NAME[(adminRequest || {}).adminAction];
		if (!adminAction) {
			callback('', refusalOf('adminActionInvalid', `adminAction must be one of ${Object.keys(ADMIN_ACTION_BY_NAME).join(', ')}.`));
			return;
		}
		adminAction({ adminRequest }, callback);
	};

	return { runAdminAction, downloadRecordList, ADMIN_ACTION_NAME_LIST: Object.keys(ADMIN_ACTION_BY_NAME) };
};

module.exports = { makeRaterToolAdmin, ADMIN_REFUSAL_NAME_LIST, CSV_COLUMN_LIST };
