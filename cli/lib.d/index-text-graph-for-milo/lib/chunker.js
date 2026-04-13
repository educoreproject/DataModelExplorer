'use strict';

// chunker.js — LLM-assisted document chunking module
// Sends source documents to Claude with a chunking strategy instruction.
// Returns an array of chunk objects with text, label, sourceFile, startLine.

const fs = require('fs');
const path = require('path');
const https = require('https');

// =====================================================================
// CHUNKING PROMPT TEMPLATE
// =====================================================================

const CHUNKING_SYSTEM_PROMPT = `You are a document chunking assistant. Given a document, identify chunks according to the strategy below.

OUTPUT FORMAT: Return a JSON array. Each element:
{
    "text": "the chunk content",
    "label": "short descriptive label for this chunk",
    "startLine": N
}

RULES:
- Each chunk must be independently meaningful — a reader should understand it without surrounding context
- Target 100–1000 tokens per chunk
- Include enough surrounding context for the chunk to make sense on its own
- If content doesn't match the strategy, skip it
- Preserve proper nouns, dates, and specific details exactly as they appear in the source
- Return ONLY the JSON array, no markdown fences, no commentary`;

// ---------------------------------------------------------------------
// buildChunkingPrompt — Combine system boilerplate with user strategy

const buildChunkingPrompt = (chunkStrategy, documentContent, sourceFile) => {
	return `${CHUNKING_SYSTEM_PROMPT}

─────────────── USER STRATEGY ───────────────
${chunkStrategy}

─────────────── DOCUMENT ────────────────
Source file: ${sourceFile}

${documentContent}`;
};

// ---------------------------------------------------------------------
// callClaudeApi — Direct HTTP call to Anthropic Messages API

const callClaudeApi = (prompt, anthropicApiKey, callback) => {
	const requestBody = JSON.stringify({
		model: 'claude-sonnet-4-6',
		max_tokens: 16384,
		messages: [{ role: 'user', content: prompt }],
	});

	const options = {
		hostname: 'api.anthropic.com',
		port: 443,
		path: '/v1/messages',
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'x-api-key': anthropicApiKey,
			'anthropic-version': '2023-06-01',
			'Content-Length': Buffer.byteLength(requestBody),
		},
	};

	const req = https.request(options, (res) => {
		let data = '';
		res.on('data', (chunk) => { data += chunk; });
		res.on('end', () => {
			if (res.statusCode !== 200) {
				callback(`API returned ${res.statusCode}: ${data}`);
				return;
			}
			try {
				const parsed = JSON.parse(data);
				const text = parsed.content && parsed.content[0] && parsed.content[0].text;
				if (!text) {
					callback('No text in API response');
					return;
				}
				callback('', text);
			} catch (err) {
				callback(`Failed to parse API response: ${err.message}`);
			}
		});
	});

	req.on('error', (err) => {
		callback(`API request failed: ${err.message}`);
	});

	req.write(requestBody);
	req.end();
};

// ---------------------------------------------------------------------
// parseChunkResponse — Extract JSON array from LLM response

const parseChunkResponse = (responseText) => {
	const { xLog } = process.global;

	// Clean the response: remove code fences if present
	let cleaned = responseText.trim();
	const codeBlockMatch = cleaned.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
	if (codeBlockMatch) {
		cleaned = codeBlockMatch[1].trim();
	}

	// Try direct JSON parse first
	try {
		const parsed = JSON.parse(cleaned);
		if (Array.isArray(parsed)) return parsed;
	} catch (err) {
		xLog.status(`[chunker] JSON parse error: ${err.message}`);
		// Try to find position info
		const posMatch = err.message.match(/position (\d+)/);
		if (posMatch) {
			const pos = parseInt(posMatch[1], 10);
			xLog.status(`[chunker] Context around error: ...${cleaned.slice(Math.max(0, pos - 80), pos)}<<<HERE>>>${cleaned.slice(pos, pos + 80)}...`);
		}
	}

	// Try finding array brackets and sanitizing
	const bracketStart = cleaned.indexOf('[');
	const bracketEnd = cleaned.lastIndexOf(']');
	if (bracketStart >= 0 && bracketEnd > bracketStart) {
		const jsonCandidate = cleaned.slice(bracketStart, bracketEnd + 1);
		try {
			return JSON.parse(jsonCandidate);
		} catch (err) {
			// Try sanitizing: replace unescaped control characters
			const sanitized = jsonCandidate
				.replace(/[\x00-\x1f]/g, (ch) => {
					if (ch === '\n') return '\\n';
					if (ch === '\r') return '\\r';
					if (ch === '\t') return '\\t';
					return '';
				});
			try {
				return JSON.parse(sanitized);
			} catch (err2) {
				xLog.status(`[chunker] Sanitized parse also failed: ${err2.message}`);
			}
		}
	}

	return null;
};

// ---------------------------------------------------------------------
// chunkSingleDocument — Process one source file through LLM chunking

const chunkSingleDocument = ({ filePath, chunkStrategy, anthropicApiKey }, callback) => {
	const { xLog } = process.global;
	const sourceFile = path.basename(filePath);

	const documentContent = fs.readFileSync(filePath, 'utf-8');
	const prompt = buildChunkingPrompt(chunkStrategy, documentContent, sourceFile);

	xLog.status(`[chunker] Processing: ${sourceFile} (${documentContent.length} chars)`);

	callClaudeApi(prompt, anthropicApiKey, (err, responseText) => {
		if (err) {
			callback(`Failed to chunk ${sourceFile}: ${err}`);
			return;
		}

		const chunks = parseChunkResponse(responseText);
		if (!chunks) {
			xLog.status(`[chunker] Raw response length: ${responseText.length}`);
			xLog.status(`[chunker] Raw response start: ${responseText.slice(0, 300)}`);
			xLog.status(`[chunker] Raw response end: ${responseText.slice(-300)}`);
			callback(`Failed to parse chunks from ${sourceFile}`);
			return;
		}

		// Annotate each chunk with sourceFile
		const annotatedChunks = chunks.map(chunk => ({
			text: chunk.text || '',
			label: chunk.label || '',
			sourceFile: sourceFile,
			startLine: chunk.startLine || 0,
		}));

		xLog.status(`[chunker] ${sourceFile}: ${annotatedChunks.length} chunks extracted`);
		callback('', annotatedChunks);
	});
};

// ---------------------------------------------------------------------
// chunkDocuments — Process all source files sequentially

const chunkDocuments = ({ sourceFiles, chunkStrategy, anthropicApiKey }, callback) => {
	const allChunks = [];
	let fileIndex = 0;

	const processNext = () => {
		if (fileIndex >= sourceFiles.length) {
			callback('', allChunks);
			return;
		}

		const filePath = sourceFiles[fileIndex];
		fileIndex++;

		chunkSingleDocument({ filePath, chunkStrategy, anthropicApiKey }, (err, chunks) => {
			if (err) {
				callback(err);
				return;
			}
			allChunks.push(...chunks);
			processNext();
		});
	};

	processNext();
};

module.exports = { chunkDocuments, parseChunkResponse };
