'use strict';

// goldenContainerName.js — W-E-11 (campaign P1, 2026-10-06; V2-C29, A13). The DME's golden container is declared ONCE,
// in configs/instanceSpecific/<instance>/_goldenContainer.ini; six live tests instead defaulted to a literal container
// name (one that no longer exists) when GOLDEN_CONTAINER was unset. Tests now read the declaration;
// GOLDEN_CONTAINER still overrides it, and an absent declaration is refused by name — never a literal.

const os = require('os');
const path = require('path');
const configFileProcessor = require('qtools-config-file-processor');

const readGoldenContainerName = () => {
	if (process.env.GOLDEN_CONTAINER) {
		return process.env.GOLDEN_CONTAINER;
	}
	const hostName = os.hostname();
	const instanceDirName = hostName === 'qMini.local' || hostName === 'qbook.local' ? 'instanceSpecific/qbook' : '';
	// test/lib -> test -> server -> the code root; configs sit beside the code root (code/../configs)
	const configDirPath = path.join(__dirname, '..', '..', '..', '..', 'configs', instanceDirName) + '/';
	const goldenConfig = configFileProcessor.getConfig('_goldenContainer.ini', configDirPath) || {};
	const goldenContainerName = (goldenConfig.dataModelExplorerSearch || {}).goldenContainerName;
	if (!goldenContainerName) {
		throw new Error(`goldenContainerName: ${configDirPath}_goldenContainer.ini declares no [dataModelExplorerSearch] goldenContainerName, and GOLDEN_CONTAINER is unset`);
	}
	return goldenContainerName;
};

module.exports = { readGoldenContainerName };
