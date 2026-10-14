'use strict';

// rater-store.js — the CEDS Rater store's reads and writes, through the sqlite abstraction and the rater-tool mapper's
// named queries only. Every write is READ BACK and compared, because this project's sqlite-instance (pre-10.1, see
// code/CLAUDE.md) reports success on a refused write; a write that did not land is refused by name (storeWriteLost).
//
//   makeRaterStore({ raterToolAccess, raterMapper }) -> {
//     readRows(tableRole, queryName, queryParameters, callback(errText, rowList))
//     saveRowVerified(tableRole, row, callback(errText, savedRefId))   — row.refId present = update, absent = insert
//     runStatement(tableRole, queryName, queryParameters, callback(errText))
//     readRater(raterUserName, callback(errText, rater | null))
//   }

const makeRaterStore = ({ raterToolAccess, raterMapper }) => {
	const readRows = (tableRole, queryName, queryParameters, callback) => {
		raterToolAccess.getStoreTable(tableRole, (tableError, tableRef) => {
			if (tableError) {
				callback(`rater store: the ${tableRole} table did not open: ${tableError}`);
				return;
			}
			tableRef.getData(raterMapper.getSql(queryName, queryParameters), { suppressStatementLog: true, noTableNameOk: true }, (readError, rowList) =>
				readError ? callback(`rater store: ${queryName} failed: ${readError}`) : callback('', rowList || []));
		});
	};

	const saveRowVerified = (tableRole, row, callback) => {
		raterToolAccess.getStoreTable(tableRole, (tableError, tableRef) => {
			if (tableError) {
				callback(`rater store: the ${tableRole} table did not open: ${tableError}`);
				return;
			}
			tableRef.saveObject(row, { suppressStatementLog: true }, (saveError, savedRefId) => {
				if (saveError) {
					callback(`rater store: writing ${tableRole} failed: ${saveError}`);
					return;
				}
				tableRef.getData(raterMapper.getSql('rowByRefId', { refId: savedRefId }), { suppressStatementLog: true, noTableNameOk: true }, (readError, rowList) => {
					const writtenRow = (rowList || [])[0];
					const lostFieldList = writtenRow ? Object.keys(row).filter((fieldName) => `${writtenRow[fieldName]}` !== `${row[fieldName]}`) : ['the whole row'];
					if (readError || lostFieldList.length > 0) {
						callback(`storeWriteLost: the ${tableRole} write was reported done but did not land (${readError || lostFieldList.join(', ')})`);
						return;
					}
					callback('', savedRefId);
				});
			});
		});
	};

	const runStatement = (tableRole, queryName, queryParameters, callback) => {
		raterToolAccess.getStoreTable(tableRole, (tableError, tableRef) => {
			if (tableError) {
				callback(`rater store: the ${tableRole} table did not open: ${tableError}`);
				return;
			}
			tableRef.runStatement(raterMapper.getSql(queryName, queryParameters), { suppressStatementLog: true, noTableNameOk: true }, (statementError) =>
				statementError ? callback(`rater store: ${queryName} failed: ${statementError}`) : callback(''));
		});
	};

	const readRater = (raterUserName, callback) => {
		readRows('raters', 'raterByUserName', { raterUserName }, (readError, rowList) => (readError ? callback(readError) : callback('', rowList.length > 0 ? raterMapper.raterOf(rowList[rowList.length - 1]) : null)));
	};

	return { readRows, saveRowVerified, runStatement, readRater };
};

module.exports = { makeRaterStore };
