'use strict';
// repair-sqlite10-damage.test.js — server/scripts/repairSqlite10Damage.js: the un-doubling rule on its own, then a
// whole -apply run against a scratch database built the way the pre-10.0 module left real ones (WHERE-less trigger,
// apostrophes doubled per save, rollback journal). Includes the 2026-11-19 adversarial review's S-1 (typed pairs never
// halved silently), S-2 (refuses a database 11.0 has opened), S-3 (-dryRun writes nothing, not even the journal mode).
// Never opens a project database. Run: node server/test/repair-sqlite10-damage.test.js

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const Database = require('better-sqlite3');
const { undoubledTurnListOf, undoubledSessionNameOf, isWherelessTimestampTrigger } = require('../scripts/repairSqlite10Damage');

const resultList = [];
const check = (label, passed, detail = '') => {
	resultList.push(passed);
	console.log(`  ${passed ? 'PASS' : 'FAIL'}: ${label}${passed || !detail ? '' : ` — ${detail}`}`);
};
const doubled = (text, saveCount) => text.replace(/'/g, "'".repeat(2 ** saveCount));

// --- the rule
const typedTurnList = [
	{ prompt: "John's first", stdout: "It's fine. WHERE x <> ''", stderr: '', timestamp: 1 },
	{ prompt: "isn't it", stdout: 'no apostrophes here', stderr: "don't", timestamp: 2 },
	{ prompt: 'plain', stdout: 'plain', stderr: '', timestamp: 3 },
	{ prompt: "last one's", stdout: '', stderr: '', timestamp: 4 },
];
// turn i has been through (4 - i) saves
const storedTurnList = typedTurnList.map((turn, turnIndex) => ({ ...turn, prompt: doubled(turn.prompt, 4 - turnIndex), stdout: doubled(turn.stdout, 4 - turnIndex), stderr: doubled(turn.stderr, 4 - turnIndex) }));
const ruleResult = undoubledTurnListOf(storedTurnList);
check('every turn back to what was typed, each with its own save count', !ruleResult.flagText && JSON.stringify(ruleResult.repairedTurnList) === JSON.stringify(typedTurnList), ruleResult.flagText || JSON.stringify(ruleResult.repairedTurnList));
check("a typed pair (SQL '') beside a typed single comes back as a pair", ruleResult.repairedTurnList[0] && ruleResult.repairedTurnList[0].stdout.endsWith("<> ''"));
check('text already single-escaped (n = 0) is never read as needing repair: flagged, because stored pre-11.0 text went through at least one save', /outside the 1 to/.test(undoubledTurnListOf(typedTurnList).flagText), undoubledTurnListOf(typedTurnList).flagText);

// S-1: a typed pair with no word-internal apostrophe to pin the count is never halved silently
const oneTurnTypedPair = [{ prompt: doubled("Use WHERE name = '' in SQL.", 1), stdout: '' }];
const oneTurnResult = undoubledTurnListOf(oneTurnTypedPair);
check("S-1: one turn, a typed SQL '' saved once (stored ''''): FLAGGED, not halved to '", /could be anything from 1 to 2/.test(oneTurnResult.flagText), oneTurnResult.flagText || JSON.stringify(oneTurnResult.repairedTurnList));
const pairAfterBare = [{ prompt: 'no apostrophes here', stdout: '' }, { prompt: doubled("x = ''", 1), stdout: '' }];
check("S-1: a typed pair in turn 2 after a turn with no apostrophes: FLAGGED", /turn 2: none of its apostrophes is inside a word/.test(undoubledTurnListOf(pairAfterBare).flagText));
const onlyPairsLater = [{ prompt: doubled("a'b", 2), stdout: '' }, { prompt: doubled("x = ''", 1), stdout: '' }];
check("a typed pair whose count lies between its neighbours' bounds (1 to 2) is FLAGGED, not guessed", /turn 2: .*from 1 to 2/.test(undoubledTurnListOf(onlyPairsLater).flagText), undoubledTurnListOf(onlyPairsLater).flagText);
const htmlOnlySingleTurn = [{ prompt: 'q', stdout: doubled("<table border='1'>", 1) }];
const htmlResult = undoubledTurnListOf(htmlOnlySingleTurn);
check("bounds that meet decide it: one turn whose only runs are 2 long must have n = 1 (stored turns went through at least one save)", !htmlResult.flagText && htmlResult.repairedTurnList[0].stdout === "<table border='1'>", htmlResult.flagText);
check('a shortest word-internal run that is not a power of two is flagged', /not a power of two/.test(undoubledTurnListOf([{ prompt: "a'''b" }]).flagText));
check('a pinned count its own runs do not allow is flagged', /outside the/.test(undoubledTurnListOf([{ prompt: "a''''b''''''c" }]).flagText), undoubledTurnListOf([{ prompt: "a''''b''''''c" }]).flagText);
// S-2 cannot be caught by the rule itself: a typed pair saved by 11.0 (run 2, n = 0) beside an older turn at n = 1
// reads exactly like a doubled single. The guard is the journal-mode refusal, tested below.
check("sessionName (written once per save) is un-doubled once", undoubledSessionNameOf("John''s Session").repairedSessionName === "John's Session");

check('a WHERE-less UpdateTimestamp trigger is recognised; a correct one and an audit trigger are not', isWherelessTimestampTrigger({ name: 'usersUpdateTimestamp', sql: 'CREATE TRIGGER usersUpdateTimestamp AFTER UPDATE ON users BEGIN UPDATE users SET updatedAt = CURRENT_TIMESTAMP; END' }) && !isWherelessTimestampTrigger({ name: 'dme_sessionsUpdateTimestamp', sql: '... WHERE [refId] = NEW.[refId]; END' }) && !isWherelessTimestampTrigger({ name: 'authAuditLog_append_only_no_update', sql: 'CREATE TRIGGER x BEFORE UPDATE ON y BEGIN SELECT RAISE(ABORT, 1); END' }));

// --- a whole run on a scratch database shaped like the damaged ones
const scratchDirPath = fs.mkdtempSync(path.join(os.tmpdir(), 'repairSqlite10Damage-'));
const databaseFilePath = path.join(scratchDirPath, 'damaged.sqlite3');
const backupFilePath = path.join(scratchDirPath, 'backup.sqlite3');
const db = new Database(databaseFilePath);
db.exec(`CREATE TABLE users ([refId] TEXT PRIMARY KEY, [createdAt] TIMESTAMP DEFAULT CURRENT_TIMESTAMP, [updatedAt] TIMESTAMP DEFAULT CURRENT_TIMESTAMP, [first] TEXT);
CREATE TRIGGER usersUpdateTimestamp AFTER UPDATE ON users BEGIN UPDATE users SET [updatedAt] = CURRENT_TIMESTAMP; END;
CREATE TABLE dme_sessions ([refId] TEXT PRIMARY KEY, [createdAt] TIMESTAMP DEFAULT CURRENT_TIMESTAMP, [updatedAt] TIMESTAMP DEFAULT CURRENT_TIMESTAMP, [userRefId] TEXT, [sessionName] TEXT, [sessionData] TEXT);
CREATE TRIGGER dme_sessionsUpdateTimestamp AFTER UPDATE ON dme_sessions FOR EACH ROW BEGIN UPDATE dme_sessions SET [updatedAt] = CURRENT_TIMESTAMP WHERE [refId] = NEW.[refId]; END;`);
db.prepare('INSERT INTO users (refId, updatedAt, first) VALUES (?, ?, ?)').run('u1', '2026-01-01 00:00:00', "O''Brien");
db.prepare('INSERT INTO users (refId, updatedAt, first) VALUES (?, ?, ?)').run('u2', '2026-01-02 00:00:00', 'Plain');
db.prepare('INSERT INTO dme_sessions (refId, updatedAt, sessionName, sessionData) VALUES (?, ?, ?, ?)').run('s1', '2026-02-01 00:00:00', "John''s Session", JSON.stringify(storedTurnList));
db.prepare('INSERT INTO dme_sessions (refId, updatedAt, sessionName, sessionData) VALUES (?, ?, ?, ?)').run('s2', '2026-02-02 00:00:00', 'Pairs', JSON.stringify(oneTurnTypedPair));
db.prepare('INSERT INTO dme_sessions (refId, updatedAt, sessionName, sessionData) VALUES (?, ?, ?, ?)').run('s3', '2026-02-03 00:00:00', 'Clean', JSON.stringify(typedTurnList.slice(2)));
db.close();

const scriptPath = path.join(__dirname, '..', 'scripts', 'repairSqlite10Damage.js');
const journalModeOf = (filePath) => {
	const probeDb = new Database(filePath, { readonly: true });
	const journalMode = probeDb.pragma('journal_mode', { simple: true });
	probeDb.close();
	return journalMode;
};
const runScript = (argumentList) => {
	const childResult = spawnSync(process.execPath, [scriptPath, `--databaseFilePath=${databaseFilePath}`, ...argumentList], { encoding: 'utf8' });
	return { status: childResult.status, report: childResult.stdout.trim().startsWith('{') ? JSON.parse(childResult.stdout) : null, stderrText: childResult.stderr };
};

check('neither -dryRun nor -apply is refused by name', /give exactly one of -dryRun or -apply/.test(runScript([]).stderrText));
check('-apply without --backupFilePath is refused by name', /-apply requires --backupFilePath/.test(runScript(['-apply']).stderrText));

const dryRun = runScript(['-dryRun']);
const readBack = () => {
	const readDb = new Database(databaseFilePath, { readonly: true });
	const state = { sessionRowList: readDb.prepare('SELECT * FROM dme_sessions ORDER BY refId').all(), userRowList: readDb.prepare('SELECT * FROM users ORDER BY refId').all(), triggerSql: readDb.prepare("SELECT sql FROM sqlite_master WHERE name = 'usersUpdateTimestamp'").get().sql };
	readDb.close();
	return state;
};
const beforeState = readBack();
check('-dryRun reports the WHERE-less trigger, 2 damaged sessions, 1 repairable, 1 flagged, and the users.first row it will not touch', dryRun.status === 0 && dryRun.report.triggerReplacedList.join() === 'users' && dryRun.report.sessionDoubledRowCount === 2 && dryRun.report.sessionRepairableRowCount === 1 && dryRun.report.sessionRepairedRowCount === 0 && dryRun.report.sessionFlaggedList.map((flag) => flag.refId).join() === 's2' && dryRun.report.otherDoubledByColumn['users.first'] === 1, JSON.stringify(dryRun.report));
check('-dryRun changed nothing', !/WHERE/.test(beforeState.triggerSql) && beforeState.sessionRowList[0].sessionName === "John''s Session");
check('S-3: -dryRun left the journal mode as it was (delete) and made no -wal or -shm file', journalModeOf(databaseFilePath) === 'delete' && !fs.existsSync(`${databaseFilePath}-wal`) && !fs.existsSync(`${databaseFilePath}-shm`), `${journalModeOf(databaseFilePath)} ${fs.readdirSync(scratchDirPath).join(',')}`);

const applied = runScript([`--backupFilePath=${backupFilePath}`, '-apply']);
const afterState = readBack();
const repairedSession = afterState.sessionRowList.find((row) => row.refId === 's1');
check('-apply wrote the backup first, and the backup holds the damaged data', applied.status === 0 && fs.existsSync(backupFilePath) && new Database(backupFilePath, { readonly: true }).prepare("SELECT sessionName FROM dme_sessions WHERE refId = 's1'").get().sessionName === "John''s Session", applied.stderrText);
check('the session is back to what was typed, its name too', JSON.stringify(JSON.parse(repairedSession.sessionData)) === JSON.stringify(typedTurnList) && repairedSession.sessionName === "John's Session", repairedSession.sessionData.slice(0, 200));
check("the repair kept each session's updatedAt", repairedSession.updatedAt === '2026-02-01 00:00:00', repairedSession.updatedAt);
check('the flagged session was left exactly as it was', afterState.sessionRowList.find((row) => row.refId === 's2').sessionData === JSON.stringify(oneTurnTypedPair));
check('-apply kept the journal mode it found (delete), so the 11.0 marker stays meaningful', journalModeOf(databaseFilePath) === 'delete', journalModeOf(databaseFilePath));
check('the users trigger now has its WHERE clause', /WHERE \[refId\] = NEW\.\[refId\]/.test(afterState.triggerSql), afterState.triggerSql);
check("users.first (not a column the script repairs) is untouched: still O''Brien", afterState.userRowList[0].first === "O''Brien");

// the repaired trigger behaves: updating one user restamps only that user
const behaviourDb = new Database(databaseFilePath);
behaviourDb.prepare("UPDATE users SET first = 'Changed' WHERE refId = 'u2'").run();
const u1UpdatedAt = behaviourDb.prepare("SELECT updatedAt FROM users WHERE refId = 'u1'").get().updatedAt;
behaviourDb.close();
check('after the repair, updating one user leaves the other user\'s updatedAt alone', u1UpdatedAt === '2026-01-01 00:00:00', u1UpdatedAt);

const secondDryRun = runScript(['-dryRun']);
check('after -apply a -dryRun reports the database as already repaired, with nothing to do', secondDryRun.status === 0 && secondDryRun.report.isAlreadyRepaired === true && secondDryRun.report.triggerReplacedList.length === 0 && secondDryRun.report.sessionRepairableRowCount === 0 && secondDryRun.report.sessionFlaggedList.length === 0, JSON.stringify(secondDryRun.report));
const secondApply = runScript([`--backupFilePath=${path.join(scratchDirPath, 'backup2.sqlite3')}`, '-apply']);
check('a second -apply is refused by name (already repaired) and changes nothing', secondApply.status === 1 && /already repaired/.test(secondApply.stderrText) && !fs.existsSync(path.join(scratchDirPath, 'backup2.sqlite3')), secondApply.stderrText);

// S-2: once a database is in WAL mode (sqlite-instance 11.0 sets it on every open), -apply refuses, unless told
// the -apply backup is a pre-repair copy: put it in WAL mode, as an 11.0 server's first open would
const walCopyPath = path.join(scratchDirPath, 'walCopy.sqlite3');
fs.copyFileSync(backupFilePath, walCopyPath);
const walDb = new Database(walCopyPath);
walDb.pragma('journal_mode = WAL');
walDb.close();
const runOn = (filePath, argumentList) => {
	const childResult = spawnSync(process.execPath, [scriptPath, `--databaseFilePath=${filePath}`, ...argumentList], { encoding: 'utf8' });
	return { status: childResult.status, report: childResult.stdout.trim().startsWith('{') ? JSON.parse(childResult.stdout) : null, stderrText: childResult.stderr };
};
const walRefused = runOn(walCopyPath, [`--backupFilePath=${path.join(scratchDirPath, 'backup3.sqlite3')}`, '-apply']);
check('S-2: -apply refuses a database already in WAL mode, by name, and writes no backup', walRefused.status === 1 && /already in WAL mode/.test(walRefused.stderrText) && !fs.existsSync(path.join(scratchDirPath, 'backup3.sqlite3')), walRefused.stderrText);
check('-apply refuses to overwrite an existing backup', /already exists/.test(runOn(walCopyPath, [`--backupFilePath=${backupFilePath}`, '-apply', '-acceptWalDatabase']).stderrText));
const walAccepted = runOn(walCopyPath, [`--backupFilePath=${path.join(scratchDirPath, 'backup4.sqlite3')}`, '-apply', '-acceptWalDatabase']);
check('S-2: -acceptWalDatabase lets an operator who knows better proceed', walAccepted.status === 0 && walAccepted.report.journalModeFound === 'wal', walAccepted.stderrText);

fs.rmSync(scratchDirPath, { recursive: true, force: true });
const failedCount = resultList.filter((passed) => !passed).length;
console.log(`repair-sqlite10-damage: ${resultList.length - failedCount} passed, ${failedCount} failed`);
process.exit(failedCount ? 1 : 0);
