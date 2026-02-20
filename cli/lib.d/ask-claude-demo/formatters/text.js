'use strict';
const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

//START OF moduleFunction() ============================================================
const moduleFunction = ({ moduleName } = {}) => ({ unused } = {}) => {
	const { xLog, getConfig, rawConfig, commandLineParameters, projectRoot } = process.global;
	const localConfig = getConfig(moduleName);

	const formatText = ({ originalPrompt, instructions, results, expandCost, elapsedSeconds }) => {
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

		// Cost summary
		lines.push("================================================================");
		lines.push("COST SUMMARY");
		lines.push("================================================================");
		if (expandCost) {
			lines.push(`  Stage 1 (Expand):    $${expandCost.usd.toFixed(4)}   (${expandCost.inputTokens} input / ${expandCost.outputTokens} output tokens)`);
		}
		if (results) {
			lines.push("  Stage 2 (Fan-out):");
			results.forEach((r) => {
				lines.push(`    Perspective ${r.id}:     $${r.cost.usd.toFixed(4)}   (${r.cost.inputTokens} input / ${r.cost.outputTokens} output tokens)`);
			});
		}

		const totalCost = (expandCost ? expandCost.usd : 0) +
			(results ? results.reduce((sum, r) => sum + r.cost.usd, 0) : 0);
		lines.push("  ----------------------------");
		lines.push(`  TOTAL:               $${totalCost.toFixed(4)}`);
		if (elapsedSeconds) {
			lines.push(`  Elapsed:             ${elapsedSeconds.toFixed(1)}s`);
		}
		lines.push("================================================================");

		return lines.join("\n");
	};

	return { formatText };
};

//END OF moduleFunction() ============================================================

module.exports = moduleFunction({ moduleName })({});
