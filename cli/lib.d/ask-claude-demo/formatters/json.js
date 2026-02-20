'use strict';
const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

//START OF moduleFunction() ============================================================
const moduleFunction = ({ moduleName } = {}) => ({ unused } = {}) => {
	const { xLog, getConfig, rawConfig, commandLineParameters, projectRoot } = process.global;
	const localConfig = getConfig(moduleName);

	const formatJson = ({ originalPrompt, instructions, results, expandCost, synthesis, synthesisCost, elapsedSeconds, config }) => {
		const totalInputTokens = (expandCost ? expandCost.inputTokens : 0) +
			(results ? results.reduce((s, r) => s + r.cost.inputTokens, 0) : 0) +
			(synthesisCost ? synthesisCost.inputTokens : 0);
		const totalOutputTokens = (expandCost ? expandCost.outputTokens : 0) +
			(results ? results.reduce((s, r) => s + r.cost.outputTokens, 0) : 0) +
			(synthesisCost ? synthesisCost.outputTokens : 0);
		const totalCostUsd = (expandCost ? expandCost.usd : 0) +
			(results ? results.reduce((s, r) => s + r.cost.usd, 0) : 0) +
			(synthesisCost ? synthesisCost.usd : 0);

		const output = {
			prompt: originalPrompt,
			expansion: {
				model: config.expandModel,
				instructions: instructions || [],
				cost: expandCost || { inputTokens: 0, outputTokens: 0, usd: 0 },
			},
			perspectives: (results || []).map((r) => ({
				id: r.id,
				perspective: r.perspective,
				instruction: r.instruction,
				findings: r.findings,
				model: r.model,
				cost: r.cost,
				turns: r.turns,
			})),
			totals: {
				inputTokens: totalInputTokens,
				outputTokens: totalOutputTokens,
				totalCostUsd: totalCostUsd,
				perspectivesCount: results ? results.length : 0,
				elapsedSeconds: elapsedSeconds || 0,
			},
		};

		// Add synthesis if present
		if (synthesis) {
			output.synthesis = {
				text: synthesis,
				model: config.expandModel,
				cost: synthesisCost || { inputTokens: 0, outputTokens: 0, usd: 0 },
			};
		}

		return output;
	};

	return { formatJson };
};

//END OF moduleFunction() ============================================================

module.exports = moduleFunction({ moduleName })({});
