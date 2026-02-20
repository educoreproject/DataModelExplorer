'use strict';
const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

//START OF moduleFunction() ============================================================
const moduleFunction = ({ moduleName } = {}) => ({ unused } = {}) => {
	const { xLog, getConfig, rawConfig, commandLineParameters, projectRoot } = process.global;
	const localConfig = getConfig(moduleName);

	const { formatText } = require('../formatters/text');
	const { formatJson } = require('../formatters/json');

	const collect = ({ originalPrompt, instructions, results, expandCost, elapsedSeconds, config }) => {
		if (config.verbose) {
			const format = config.json ? 'JSON' : 'text';
			xLog.status(`[Collect] Formatting ${(results || []).length} results as ${format}`);
		}
		if (config.json) {
			const reportJson = formatJson({ originalPrompt, instructions, results, expandCost, elapsedSeconds, config });
			return { report: JSON.stringify(reportJson, null, 2), reportJson };
		} else {
			const report = formatText({ originalPrompt, instructions, results, expandCost, elapsedSeconds });
			return { report };
		}
	};

	return { collect };
};

//END OF moduleFunction() ============================================================

module.exports = moduleFunction({ moduleName })({});
