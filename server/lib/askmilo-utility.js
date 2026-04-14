'use strict';

const Anthropic = require('@anthropic-ai/sdk').default;

const moduleFunction = ({ expressApp }) => {
	const { xLog, getConfig } = process.global;

	// API key from config with environment variable fallback
	const config = getConfig('askmilo-utility') || {};
	const apiKey = config.anthropicApiKey || process.env.ANTHROPIC_API_KEY;

	if (!apiKey) {
		xLog.error('askmilo-utility: No Anthropic API key found in config or environment');
		return;
	}

	const anthropic = new Anthropic({ apiKey });

	// Model shorthand map (matches askMilo convention)
	const modelMap = {
		opus: 'claude-opus-4-6',
		sonnet: 'claude-sonnet-4-6',
		haiku: 'claude-haiku-4-5-20251001',
	};

	// POST /api/askmilo-utility
	// Body: { prompt: string, model?: string }
	// Returns: { response: string }
	expressApp.post('/api/askmilo-utility', async (xReq, xRes) => {
		const { prompt, model = 'haiku' } = xReq.body || {};

		if (!prompt) {
			xRes.status(400).send('Missing required field: prompt');
			return;
		}

		const resolvedModel = modelMap[model] || model;

		try {
			const maxTokens = xReq.body.maxTokens || 4096;

			console.log('\n[askmilo-utility] ===== API REQUEST =====');
			console.log('[askmilo-utility] Model:', resolvedModel);
			console.log('[askmilo-utility] Max tokens:', maxTokens);
			console.log('[askmilo-utility] Prompt:\n', prompt);
			console.log('[askmilo-utility] ===== END REQUEST =====\n');

			const message = await anthropic.messages.create({
				model: resolvedModel,
				max_tokens: maxTokens,
				messages: [{ role: 'user', content: prompt }],
			});

			const responseText = message.content
				.filter((block) => block.type === 'text')
				.map((block) => block.text)
				.join('');

			console.log('[askmilo-utility] ===== API RESPONSE =====');
			console.log('[askmilo-utility] Input tokens:', message.usage.input_tokens, '| Output tokens:', message.usage.output_tokens);
			console.log('[askmilo-utility] Response length:', responseText.length, 'chars');
			console.log('[askmilo-utility] ===== END RESPONSE =====\n');

			xRes.json({ response: responseText });
		} catch (err) {
			console.error('[askmilo-utility] ===== API ERROR =====');
			console.error('[askmilo-utility] Model:', resolvedModel);
			console.error('[askmilo-utility] Error:', err.message);
			console.error('[askmilo-utility] Stack:', err.stack);
			console.error('[askmilo-utility] ===== END ERROR =====\n');
			xLog.error(`askmilo-utility error: ${err.message}`);
			xRes.status(500).send(`AI request failed: ${err.message}`);
		}
	});

	xLog.status('askmilo-utility endpoint registered at POST /api/askmilo-utility');
};

module.exports = moduleFunction;
