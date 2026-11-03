'use strict';

// multiHubQuestionSet.js — the fixed question set of ctdlHub P7 (DME reads a multi-hub graph, educoreForge
// WORKORDER-P7-dmeMultiHub-101926). It asks one named graph container the same questions every time and writes each
// answer to its own file, so a run on the single-hub gold BEFORE the multi-hub change and a run AFTER it can be compared
// byte for byte (compareQuestionSetOutputs.js), and the same set can be put to a two-hub graph.
//
// Every question goes through the code the DME runs: the CLI verbs through QUERY_HANDLER_BY_QUERY_TYPE on a READ session
// (askMilo's spawn adds only argument parsing and stdout), the HTTP endpoints through their own route handlers over the
// real dme-cypher-query access point, the Specification Viewer and PESC Explorer through their access points and mappers,
// the Slack card through its mapper, getSchema through schema-provider, and the MCP instructions as the source declares them.
//
// Elements are named by (source, name, role), never by stableId: stableIds differ between builds, and the set must ask
// the two-hub graph the same question. A question whose element the graph lacks is answered as { elementAbsent }.
//
// Run: node cli/lib.d/data-model-explorer/test/multiHubQuestionSet.js <containerName> <outputDirectoryPath> [questionSetName]
//   questionSetName: singleHub (default: the regression set), twoHub (singleHub plus the CTDL questions of step 7), or
//   predicateAlignment (two questions whose neighbourhoods hold BROAD_MATCH edges: the evidence for the RELATED_MATCH ->
//   BROAD_MATCH change in the two endpoints, which the regression set's answers do not reach)

const fs = require('fs');
const path = require('path');

const [containerName, outputDirectoryPath, questionSetNameArgument] = process.argv.slice(2);
const QUESTION_SET_NAME_LIST = ['singleHub', 'twoHub', 'predicateAlignment'];
const questionSetName = questionSetNameArgument || 'singleHub';
if (!containerName || !outputDirectoryPath || QUESTION_SET_NAME_LIST.indexOf(questionSetName) === -1) {
	console.error(`usage: multiHubQuestionSet.js <containerName> <outputDirectoryPath> [${QUESTION_SET_NAME_LIST.join('|')}] (got ${JSON.stringify(process.argv.slice(2))})`);
	process.exit(2);
}
if (!fs.existsSync(outputDirectoryPath)) {
	console.error(`multiHubQuestionSet: output directory '${outputDirectoryPath}' does not exist; create it first`);
	process.exit(2);
}

process.global = {
	getConfig: () => ({}),
	xLog: { status: () => {}, error: () => {}, verbose: () => {}, result: () => {} },
	rawConfig: {},
	commandLineParameters: { switches: {}, values: {} },
};

const dmeDirPath = path.join(__dirname, '..');
const codeRootPath = path.join(dmeDirPath, '..', '..', '..');
const neo4j = require(path.join(dmeDirPath, 'node_modules', 'neo4j-driver'));
const { resolveContainerConnection } = require(path.join(codeRootPath, 'server/data-model/lib/user-graph/container-connection-resolver'));
const { withNeo4jSession, QUERY_HANDLER_BY_QUERY_TYPE } = require(path.join(dmeDirPath, 'dataModelExplorerSearch'));
const { VERB_FLAG_DEFAULT_BY_VERB } = require(path.join(dmeDirPath, 'lib', 'toolPayloadContract'));
const neo4jInstanceFactory = require(path.join(codeRootPath, 'server/data-model/lib/neo4j-instance/neo4j-instance'));

const connection = resolveContainerConnection(containerName);
if (connection.error) {
	console.error(`multiHubQuestionSet: ${connection.error}`);
	process.exit(2);
}
const cliConfig = { neo4jBoltUri: connection.boltUri, neo4jUser: connection.user, neo4jPassword: connection.password };

// ---- the questions. kind names the path; elementLookup names an element by (source, name, role)

const SINGLE_HUB_QUESTION_LIST = [
	{ questionName: 'findMappings-Birthdate', kind: 'cliVerb', verbName: 'findMappings', params: { name: 'Birthdate' } },
	{ questionName: 'findMappings-P000033', kind: 'cliVerb', verbName: 'findMappings', params: { name: 'P000033' } },
	{ questionName: 'findMappings-race', kind: 'cliVerb', verbName: 'findMappings', params: { name: 'race' } },
	{ questionName: 'findMappings-FirstName', kind: 'cliVerb', verbName: 'findMappings', params: { name: 'First Name' } },
	{ questionName: 'findMappings-nothingMatched', kind: 'cliVerb', verbName: 'findMappings', params: { name: 'zzqqxxNoSuchElement' } },
	{ questionName: 'compareCodesets-Sex', kind: 'cliVerb', verbName: 'compareCodesets', params: { name: 'Sex' } },
	{ questionName: 'compareCodesets-GradeLevel', kind: 'cliVerb', verbName: 'compareCodesets', params: { name: 'Grade Level' } },
	{ questionName: 'unmappedFields-all', kind: 'cliVerb', verbName: 'unmappedFields', params: {} },
	{ questionName: 'unmappedFields-EdFi', kind: 'cliVerb', verbName: 'unmappedFields', params: { standard: 'EdFi', limit: '20' } },
	{ questionName: 'unmappedFields-CEDS', kind: 'cliVerb', verbName: 'unmappedFields', params: { standard: 'CEDS', limit: '5' } },
	{ questionName: 'stats', kind: 'cliVerb', verbName: 'stats', params: {} },
	{ questionName: 'listStandards', kind: 'cliVerb', verbName: 'listStandards', params: {} },
	{ questionName: 'graphRetriever-birthDate', kind: 'cliVerb', verbName: 'graphRetriever', params: { query: 'birth date', searchMode: 'keyword', limit: '5' } },
	{ questionName: 'graphRetriever-race', kind: 'cliVerb', verbName: 'graphRetriever', params: { query: 'race', searchMode: 'keyword', limit: '5' } },
	{ questionName: 'explore-BirthDate', kind: 'cliVerb', verbName: 'explore', params: { name: 'BirthDate' } },
	{ questionName: 'describeGraph', kind: 'cliVerb', verbName: 'describeGraph', params: { limit: '5' } },
	{ questionName: 'dmeEquivalents-birthDate', kind: 'httpGet', endpointFileName: 'dme-equivalents.js', query: { term: 'birth date' } },
	{ questionName: 'dmeEquivalents-lastName', kind: 'httpGet', endpointFileName: 'dme-equivalents.js', query: { term: 'last name' } },
	{ questionName: 'dmeCrossSpecMappings-EdFiBirthDate', kind: 'httpGet', endpointFileName: 'dme-cross-spec-mappings.js', query: { source: 'EdFi', name: 'BirthDate' } },
	{ questionName: 'schemaEquivalents-birthDate', kind: 'schemaEquivalents', wordList: ['birth', 'date'] },
	{ questionName: 'standardsNeighbourhood-cedsBirthdate', kind: 'standardsNeighbourhood', elementLookup: { source: 'CEDS', name: 'Birthdate', role: 'DmeProperty' } },
	{ questionName: 'slackCard-EdFiBirthDate', kind: 'slackCard', elementLookup: { source: 'EdFi', name: 'BirthDate', role: 'DmeProperty' } },
	{ questionName: 'slackCard-SifRace', kind: 'slackCard', elementLookup: { source: 'SIF260928', name: 'race', role: 'DmeProperty' } },
	{ questionName: 'getSchemaText', kind: 'schemaText' },
	{ questionName: 'mcpInstructionText', kind: 'mcpInstructionText' },
];
// step 7: the CTDL questions, asked only of a graph that holds CTDL
const TWO_HUB_ADDITION_LIST = [
	{ questionName: 'findMappings-ceterms-Credential', kind: 'cliVerb', verbName: 'findMappings', params: { name: 'ceterms:Credential' } },
	{ questionName: 'unmappedFields-CTDLASN', kind: 'cliVerb', verbName: 'unmappedFields', params: { standard: 'CTDLASN', limit: '20' } },
	{ questionName: 'unmappedFields-CTDL', kind: 'cliVerb', verbName: 'unmappedFields', params: { standard: 'CTDL', limit: '20' } },
	{ questionName: 'graphRetriever-credential', kind: 'cliVerb', verbName: 'graphRetriever', params: { query: 'credential', searchMode: 'keyword', limit: '5' } },
	{ questionName: 'slackCard-ctdlName', kind: 'slackCard', elementLookup: { source: 'CTDL', name: 'name', role: 'DmeProperty' } },
	// a hub ANCHOR page in the PESC Explorer: its context groups are named by the anchor's own hub's slot edges
	{ questionName: 'standardsNeighbourhood-cedsAnchorBirthdate', kind: 'standardsNeighbourhood', cardLookup: { hubName: 'CEDS', name: 'Birthdate' } },
	{ questionName: 'standardsNeighbourhood-ctdlAnchorName', kind: 'standardsNeighbourhood', cardLookup: { hubName: 'CTDL', name: 'Name' } },
	// published cross-IRI assertions (DECLARED_CORRESPONDENCE), listed apart from every mapping
	{ questionName: 'findMappings-CodedNotation', kind: 'cliVerb', verbName: 'findMappings', params: { name: 'Coded Notation' } },
	{ questionName: 'explore-FederalGrant', kind: 'cliVerb', verbName: 'explore', params: { name: 'Federal Grant' } },
];
const PREDICATE_ALIGNMENT_QUESTION_LIST = [
	{ questionName: 'dmeCrossSpecMappings-EdFiAddress', kind: 'httpGet', endpointFileName: 'dme-cross-spec-mappings.js', query: { source: 'EdFi', name: 'Address' } },
	{ questionName: 'dmeEquivalents-institutionTelephone', kind: 'httpGet', endpointFileName: 'dme-equivalents.js', query: { term: 'institution telephone' } },
];
const QUESTION_LIST_BY_SET_NAME = Object.freeze({
	singleHub: SINGLE_HUB_QUESTION_LIST,
	twoHub: SINGLE_HUB_QUESTION_LIST.concat(TWO_HUB_ADDITION_LIST),
	predicateAlignment: PREDICATE_ALIGNMENT_QUESTION_LIST,
});

// ---- graph handles

const ELEMENT_LOOKUP_CYPHER = 'MATCH (n:ForgedNode {_source: $source, name: $name, role: $role}) RETURN n.stableId AS stableId ORDER BY stableId LIMIT 1';
// a property-tier hub card, by its hub and name (the first by stableId)
const CARD_LOOKUP_CYPHER = "MATCH (n:HubReference {hubName: $hubName, referenceTier: 'property', name: $name}) RETURN n.stableId AS stableId ORDER BY stableId LIMIT 1";

const lookUpStableId = (serverDb, elementLookup, callback) => {
	serverDb.runQuery(elementLookup.hubName ? CARD_LOOKUP_CYPHER : ELEMENT_LOOKUP_CYPHER, elementLookup, (lookupError, recordList) => {
		if (lookupError) {
			callback(lookupError);
			return;
		}
		callback('', recordList.length ? recordList[0].stableId : null);
	});
};

const accessPointFrom = (accessPointFilePath, passThroughParameters) => {
	const accessPointByName = {};
	require(accessPointFilePath)({
		dotD: { logList: [], library: { add: (accessPointName, serviceFunction) => { accessPointByName[accessPointName] = serviceFunction; } } },
		passThroughParameters,
	});
	return accessPointByName;
};

// ---- one answer per kind; each callback('', answer) where an answer that is an error is recorded AS the answer

const answerByKind = {
	cliVerb: ({ question }, callback) => {
		const params = { ...(VERB_FLAG_DEFAULT_BY_VERB[question.verbName] || {}), ...question.params };
		withNeo4jSession(cliConfig, { accessMode: neo4j.session.READ }, (session, sessionCallback) => {
			QUERY_HANDLER_BY_QUERY_TYPE[question.verbName](session, params, cliConfig, sessionCallback);
		}, (verbError, verbResult) => callback('', verbError ? { verbError: String(verbError) } : verbResult));
	},
	httpGet: ({ question, serverDb }, callback) => {
		const cypherAccessPoint = accessPointFrom(path.join(codeRootPath, 'server/data-model/access-points-dot-d/accessPoints.d/dme-cypher-query.js'), { neo4jDb: serverDb });
		const accessTokenHeaderTools = require(path.join(codeRootPath, 'server/lib/access-token-header-tools.js'))({ expressApp: {} });
		let routeHandler;
		require(path.join(codeRootPath, 'server/endpoints-dot-d/qtDotLib.d', question.endpointFileName))({
			dotD: { logList: [] },
			passThroughParameters: { expressApp: { get: (routePath, handler) => { routeHandler = handler; } }, accessTokenHeaderTools, accessPointsDotD: cypherAccessPoint, routingPrefix: '/api/' },
		});
		const xReq = { appValueGetter: () => ({}), qtGetSurePath: () => question.query };
		const answer = { statusCode: 200 };
		const xRes = { status: (statusCode) => { answer.statusCode = statusCode; return xRes; }, send: (body) => { answer.body = body; callback('', answer); } };
		routeHandler(xReq, xRes, () => {});
	},
	schemaEquivalents: ({ question, serverDb }, callback) => {
		const mapper = require(path.join(codeRootPath, 'server/data-model/data-mapping/mappers/schema-equivalents.js'))({});
		const accessPoint = accessPointFrom(path.join(codeRootPath, 'server/data-model/access-points-dot-d/accessPoints.d/schema-equivalents.js'), { neo4jDb: serverDb, dataMapping: { 'schema-equivalents': mapper } })['schema-equivalents'];
		accessPoint({ wordList: question.wordList }, (accessError, rowList) => callback('', accessError ? { accessError: String(accessError) } : rowList));
	},
	standardsNeighbourhood: ({ question, serverDb }, callback) => {
		const lookup = question.elementLookup || question.cardLookup;
		lookUpStableId(serverDb, lookup, (lookupError, stableId) => {
			if (lookupError || !stableId) {
				callback('', lookupError ? { lookupError: String(lookupError) } : { elementAbsent: lookup });
				return;
			}
			const mapper = require(path.join(codeRootPath, 'server/data-model/data-mapping/mappers/standards-neighbourhood.js'))({});
			const accessPoint = accessPointFrom(path.join(codeRootPath, 'server/data-model/access-points-dot-d/accessPoints.d/standards-neighbourhood.js'), { neo4jDb: serverDb, dataMapping: { 'standards-neighbourhood': mapper } })['standards-neighbourhood'];
			accessPoint({ action: 'node', stableId }, (accessError, neighbourhood) => callback('', accessError ? { accessError: String(accessError) } : neighbourhood));
		});
	},
	slackCard: ({ question, serverDb }, callback) => {
		lookUpStableId(serverDb, question.elementLookup, (lookupError, stableId) => {
			if (lookupError || !stableId) {
				callback('', lookupError ? { lookupError: String(lookupError) } : { elementAbsent: question.elementLookup });
				return;
			}
			const mapper = require(path.join(codeRootPath, 'server/data-model/data-mapping/mappers/dme-slack.js'))({});
			const ownQuery = mapper.getCypher('elementCardOwn', { stableId });
			const viaQuery = mapper.getCypher('elementCardViaInstance', { stableId });
			serverDb.runQuery(ownQuery.cypher, ownQuery.params, (ownError, ownRowList) => {
				serverDb.runQuery(viaQuery.cypher, viaQuery.params, (viaError, viaRowList) => {
					if (ownError || viaError) {
						callback('', { queryError: String(ownError || viaError) });
						return;
					}
					callback('', mapper.mergeElementCard({ ownRow: ownRowList[0], viaInstanceRow: viaRowList[0] }));
				});
			});
		});
	},
	schemaText: ({ serverDb }, callback) => {
		require(path.join(codeRootPath, 'server/lib/schema-provider'))({ neo4jDb: serverDb })((schemaError, schemaText) => callback('', schemaError ? { schemaError: String(schemaError) } : schemaText));
	},
	// the MCP instructions are a literal array in the server factory; read as the source declares them
	mcpInstructionText: (unusedContext, callback) => {
		const sourceText = fs.readFileSync(path.join(codeRootPath, 'server/lib/mcp-server/mcp-server.js'), 'utf8');
		const instructionMatch = sourceText.match(/instructions: \[([\s\S]*?)\]\.join\('\\n'\)/);
		callback('', instructionMatch ? instructionMatch[1] : { instructionsNotFound: true });
	},
};

// ---- run

const questionList = QUESTION_LIST_BY_SET_NAME[questionSetName];
neo4jInstanceFactory({ unused: true }).initDatabaseInstance({ neo4jBoltUri: connection.boltUri, neo4jUser: connection.user, neo4jPassword: connection.password, readOnly: true, queryTimeoutMs: 120000 }, (connectError, serverDb) => {
	if (connectError) {
		console.error(`multiHubQuestionSet: cannot open ${containerName}: ${connectError}`);
		process.exit(2);
	}
	const askNext = (questionIndex) => {
		if (questionIndex === questionList.length) {
			serverDb.close();
			console.log(`multiHubQuestionSet: ${questionList.length} answers from ${containerName} (${questionSetName}) -> ${outputDirectoryPath}`);
			process.exit(0);
		}
		const question = questionList[questionIndex];
		const answerFilePath = path.join(outputDirectoryPath, `${String(questionIndex + 1).padStart(2, '0')}-${question.questionName}.${question.kind.endsWith('Text') ? 'txt' : 'json'}`);
		answerByKind[question.kind]({ question, serverDb }, (unusedError, answer) => {
			fs.writeFileSync(answerFilePath, typeof answer === 'string' ? answer : `${JSON.stringify(answer, null, 2)}\n`, 'utf8');
			console.log(`  ${path.basename(answerFilePath)}`);
			askNext(questionIndex + 1);
		});
	};
	askNext(0);
});
