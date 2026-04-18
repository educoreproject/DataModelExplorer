// SingleCall with Tools (Direct API): extends single-call-direct with tool_use conversation loop.
// Does NOT modify single-call-direct.mjs. New file for compare-and-learn.
// Handles any prompt + optional session context + tool definitions + tool execution.
// Uses @anthropic-ai/sdk directly.

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

import Anthropic from "@anthropic-ai/sdk";

// Cost estimation based on model pricing (per million tokens)
const MODEL_PRICING = {
	'claude-opus-4-6': { input: 5.00, output: 25.00 },
	'claude-sonnet-4-6': { input: 3.00, output: 15.00 },
	'claude-haiku-4-5': { input: 1.00, output: 5.00 },
};

const estimateCost = (model, usage) => {
	const rates = MODEL_PRICING[model] || MODEL_PRICING['claude-sonnet-4-6'];
	const inputCost = (usage.input_tokens / 1_000_000) * rates.input;
	const outputCost = (usage.output_tokens / 1_000_000) * rates.output;
	return inputCost + outputCost;
};

const accumulateCost = (totalCost, usage, model) => {
	const iterationUsd = estimateCost(model, usage);
	return {
		inputTokens: totalCost.inputTokens + usage.input_tokens,
		outputTokens: totalCost.outputTokens + usage.output_tokens,
		usd: totalCost.usd + iterationUsd,
	};
};

const MAX_TOOL_ITERATIONS = 30;

const singleCallWithTools = async ({ prompt, systemPrompt, sessionContext, config, tools, toolHandler, timing, onEvent }) => {
	const emitEvent = onEvent || (() => {});
	const tm = timing || { mark: () => {} };

	if (config.mockApi) {
		const { mockSingleCall } = require('../lib/mockApi');
		return mockSingleCall({ prompt, systemPrompt, config });
	}

	const { xLog } = process.global;
	const verbose = config.verbose;
	const model = config.agentModel;

	// Build initial user message: prompt + optional session context
	tm.mark('singleCallTools', 'prompt_build_start');
	let userMessage = prompt;
	if (sessionContext) {
		userMessage = `${sessionContext}\n\n--- NEW PROMPT ---\n${prompt}`;
	}
	tm.mark('singleCallTools', 'prompt_build_done', {
		userMessageLength: userMessage.length,
		systemPromptLength: systemPrompt.length,
		toolCount: (tools || []).length,
	});

	if (verbose) {
		xLog.status(`[SingleCallTools] Calling messages API with model=${model}...`);
		xLog.status(`[SingleCallTools] User message length: ${userMessage.length} chars`);
		xLog.status(`[SingleCallTools] Tools registered: ${(tools || []).map(t => t.name).join(', ') || '(none)'}`);
		if (sessionContext) {
			xLog.status(`[SingleCallTools] Session context injected (${sessionContext.length} chars)`);
		}
	}

	const client = new Anthropic({ apiKey: config.anthropicApiKey });

	// Initialize conversation messages
	let messages = [{ role: 'user', content: userMessage }];
	let totalCost = { inputTokens: 0, outputTokens: 0, usd: 0 };
	let iteration = 0;

	while (iteration < MAX_TOOL_ITERATIONS) {
		const requestParams = {
			model,
			max_tokens: 16384,
			system: systemPrompt,
			messages,
		};

		// Include tools if provided
		if (tools && tools.length > 0) {
			requestParams.tools = tools;
		}

		// Use adaptive thinking for Opus 4.6, skip for others
		if (model.includes('opus-4-6')) {
			requestParams.thinking = { type: 'adaptive' };
		}

		if (verbose) {
			xLog.status(`[SingleCallTools] Iteration ${iteration + 1}: sending ${messages.length} messages...`);
		}

		tm.mark('singleCallTools', 'iteration_stream_start', { iteration: iteration + 1, messageCount: messages.length });
		const stream = client.messages.stream(requestParams);

		// Surface streaming events through onEvent callback
		stream.on('text', (textDelta) => {
			emitEvent({ type: 'text', delta: textDelta });
		});

		stream.on('message', (message) => {
			// Emit tool_call events for each tool_use block as the full message assembles
			const toolBlocks = (message.content || []).filter(b => b.type === 'tool_use');
			for (const block of toolBlocks) {
				emitEvent({ type: 'tool_call', tool: block.name, toolUseId: block.id, input: block.input });
			}
		});

		const response = await stream.finalMessage();
		tm.mark('singleCallTools', 'iteration_stream_done', { iteration: iteration + 1, stopReason: response.stop_reason });

		// Accumulate cost
		totalCost = accumulateCost(totalCost, response.usage, model);

		if (verbose) {
			const blockTypes = response.content.map(b => b.type).join(', ');
			xLog.status(`[SingleCallTools] Iteration ${iteration + 1}: stop_reason=${response.stop_reason}, blocks=[${blockTypes}]`);
			xLog.status(`[SingleCallTools] Tokens — input: ${response.usage.input_tokens} | output: ${response.usage.output_tokens} | running cost: $${totalCost.usd.toFixed(4)}`);
		}

		// If stop_reason is NOT tool_use, this is the final response
		if (response.stop_reason !== 'tool_use') {
			// Extract text blocks (skip thinking blocks)
			const textParts = response.content
				.filter(b => b.type === 'text' && b.text)
				.map(b => b.text.trim())
				.filter(t => t.length > 0);

			const responseText = textParts.length > 0 ? textParts.join('\n\n') : '[NO RESPONSE]';

			if (verbose) {
				xLog.status(`[SingleCallTools] Final response: ${responseText.length} chars, ${totalCost.outputTokens} total output tokens, $${totalCost.usd.toFixed(4)} total`);
				xLog.status(`[SingleCallTools] Total iterations: ${iteration + 1}`);
			}

			emitEvent({ type: 'done', cost: totalCost, iterations: iteration + 1 });
			return { responseText, cost: totalCost };
		}

		// stop_reason is 'tool_use' - extract and execute tool calls
		const toolUseBlocks = response.content.filter(b => b.type === 'tool_use');

		if (verbose) {
			xLog.status(`[SingleCallTools] Executing ${toolUseBlocks.length} tool call(s): ${toolUseBlocks.map(b => b.name).join(', ')}`);
		}

		tm.mark('singleCallTools', 'tool_exec_start', { iteration: iteration + 1, toolCount: toolUseBlocks.length, tools: toolUseBlocks.map(b => b.name) });
		const toolResults = await Promise.all(toolUseBlocks.map(async (block) => {
			if (verbose) {
				xLog.status(`[SingleCallTools]   -> ${block.name}(${JSON.stringify(block.input).slice(0, 100)})`);
			}

			const toolStart = Date.now();
			const result = await toolHandler.executeToolCall({
				toolName: block.name,
				toolInput: block.input,
			});
			const toolDurationMs = Date.now() - toolStart;
			tm.mark('singleCallTools', 'tool_exec_one', { tool: block.name, durationMs: toolDurationMs });

			if (verbose) {
				xLog.status(`[SingleCallTools] Tool ${block.name} returned (${toolDurationMs}ms)${result.is_error ? ' ERROR:' : ''} ${(result.content || '').slice(0, 300)}`);
			}

			emitEvent({
				type: 'tool_result',
				tool: block.name,
				toolUseId: block.id,
				isError: !!result.is_error,
				content: result.content,
				durationMs: toolDurationMs,
			});

			if (verbose) {
				const preview = (result.content || '').slice(0, 120);
				xLog.status(`[SingleCallTools]   <- ${block.name}: ${result.is_error ? 'ERROR: ' : ''}${preview}...`);
			}

			return {
				type: 'tool_result',
				tool_use_id: block.id,
				content: result.content,
				...(result.is_error ? { is_error: true } : {}),
			};
		}));

		tm.mark('singleCallTools', 'tool_exec_done', { iteration: iteration + 1 });

		// Append assistant response + tool results to conversation
		messages.push({ role: 'assistant', content: response.content });
		messages.push({ role: 'user', content: toolResults });
		iteration++;
	}

	// Max iterations reached without a final text response
	if (verbose) {
		xLog.status(`[SingleCallTools] WARNING: Max tool iterations (${MAX_TOOL_ITERATIONS}) reached.`);
	}

	return {
		responseText: `[MAX TOOL ITERATIONS REACHED (${MAX_TOOL_ITERATIONS})] The model continued requesting tool calls beyond the iteration limit.`,
		cost: totalCost,
	};
};

export { singleCallWithTools };
