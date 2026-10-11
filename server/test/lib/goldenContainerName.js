'use strict';

// goldenContainerName.js — W-E-11 (campaign P1, 2026-10-06; V2-C29, A13). The DME's golden container is declared ONCE,
// in configs/instanceSpecific/<instance>/_goldenContainer.ini; six live tests instead defaulted to a literal container
// name (one that no longer exists) when GOLDEN_CONTAINER was unset. Tests now read the declaration;
// GOLDEN_CONTAINER still overrides it, and an absent declaration is refused by name — never a literal.

const os = require('os');
const path = require('path');
const configFileProcessor = require('qtools-config-file-processor');

// test/lib -> test -> server -> the code root; configs sit beside the code root (code/../configs)
const serverConfigDirPath = () => {
	const hostName = os.hostname();
	const instanceDirName = hostName === 'qMini.local' || hostName === 'qbook.local' ? 'instanceSpecific/qbook' : '';
	return path.join(__dirname, '..', '..', '..', '..', 'configs', instanceDirName) + '/';
};

const readGoldenContainerName = () => {
	if (process.env.GOLDEN_CONTAINER) {
		return process.env.GOLDEN_CONTAINER;
	}
	const configDirPath = serverConfigDirPath();
	const goldenConfig = configFileProcessor.getConfig('_goldenContainer.ini', configDirPath) || {};
	const goldenContainerName = (goldenConfig.dataModelExplorerSearch || {}).goldenContainerName;
	if (!goldenContainerName) {
		throw new Error(`goldenContainerName: ${configDirPath}_goldenContainer.ini declares no [dataModelExplorerSearch] goldenContainerName, and GOLDEN_CONTAINER is unset`);
	}
	return goldenContainerName;
};

// goldenDmeConfigForTests — the [dataModelExplorerSearch] section a test's process.global.getConfig hands the code under test:
// the API server's OWN resolved section (startApiServer.ini, which merges _goldenContainer.ini: goldenContainerName,
// userGraphsDirPath, warmPoolDepth) plus the connection the resolver derives from the golden's name. The multiTenant suites
// used to hand a literal bolt URI and password of a retired container and no name, no userGraphsDirPath at all, so
// clone-manager refused before provisioning anything.
const goldenDmeConfigForTests = () => {
	const goldenContainerName = readGoldenContainerName();
	const serverConfig = configFileProcessor.getConfig('startApiServer.ini', serverConfigDirPath(), { resolve: true }) || {};
	const serverDmeSection = serverConfig.dataModelExplorerSearch;
	if (!serverDmeSection || !serverDmeSection.userGraphsDirPath) {
		throw new Error(`goldenDmeConfigForTests: ${serverConfigDirPath()}startApiServer.ini declares no [dataModelExplorerSearch] userGraphsDirPath`);
	}
	const { resolveContainerConnection } = require('../../data-model/lib/user-graph/container-connection-resolver');
	const { boltUri, user, password, error } = resolveContainerConnection(goldenContainerName);
	if (error) {
		throw new Error(`goldenDmeConfigForTests: ${goldenContainerName} does not resolve: ${error}`);
	}
	return { ...serverDmeSection, goldenContainerName, neo4jBoltUri: boltUri, neo4jUser: user, neo4jPassword: password };
};

module.exports = { readGoldenContainerName, goldenDmeConfigForTests };
