'use strict';
const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

//START OF moduleFunction() ============================================================
const moduleFunction = ({ moduleName } = {}) => ({ unused } = {}) => {
	const { xLog, getConfig, rawConfig, commandLineParameters, projectRoot } = process.global;
	const localConfig = getConfig(moduleName);

	const formatSingleCallText = ({ promptName, prompt, responseText, cost, model, elapsedSeconds }) => {
		const lines = [];
		lines.push("================================================================");
		lines.push(`askMilo -- ${promptName || 'default'}`);
		lines.push("================================================================");
		lines.push("");
		lines.push(`PROMPT: ${prompt}`);
		lines.push("");
		lines.push(responseText);
		lines.push("");
		lines.push("================================================================");
		return lines.join("\n");
	};

	const formatChorusText = ({ originalPrompt, instructions, results, expandCost, synthesis, synthesisCost, elapsedSeconds }) => {
		const lines = [];

		lines.push("================================================================");
		lines.push("PROMPT EVALUATOR REPORT");
		lines.push("================================================================");
		lines.push("");
		lines.push("ORIGINAL PROMPT:");
		lines.push(`  ${originalPrompt}`);
		lines.push("");

		if (instructions) {
			lines.push(`EXPANSION (${instructions.length} perspectives):`);
			instructions.forEach((instr) => {
				lines.push(`  ${instr.id}. [${instr.perspective}] ${instr.instruction.slice(0, 100)}...`);
			});
			lines.push("");
		}

		if (results) {
			results.forEach((r) => {
				lines.push("----------------------------------------------------------------");
				lines.push(`PERSPECTIVE ${r.id}: ${r.perspective}`);
				lines.push("----------------------------------------------------------------");
				lines.push(`  Instruction: ${r.instruction}`);
				lines.push("");
				lines.push("  Findings:");
				lines.push(r.findings);
				lines.push("");
			});
		}

		// Synthesis section (only if synthesis was performed)
		if (synthesis) {
			lines.push("================================================================");
			lines.push("SYNTHESIS");
			lines.push("================================================================");
			lines.push("");
			lines.push(synthesis);
			lines.push("");
		}

		lines.push("================================================================");

		return lines.join("\n");
	};

	const formatText = ({ mode, ...params }) => {
		if (mode === 'singleCall') {
			return formatSingleCallText(params);
		}
		return formatChorusText(params);
	};

	return { formatText };
};

//END OF moduleFunction() ============================================================

module.exports = moduleFunction({ moduleName })({});
