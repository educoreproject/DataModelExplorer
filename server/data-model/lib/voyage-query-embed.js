#!/usr/bin/env node
'use strict';
// @concept: [[SemanticSearch]]
//
// Embeds a free-text QUERY with the same Voyage model the forge used for the
// graph's node embeddings, so the two vectors live in one space and cosine
// similarity is meaningful. The graph's nodes currently carry
// embeddingModelVersion 'voyage-4-large'; the caller may pass whatever the
// graph reports. `input_type: 'query'` is Voyage's asymmetric-retrieval hint —
// nodes were embedded as documents, a search phrase is a query.
//
// The API key lives in the DME-local dataModelExplorerSearch.ini (same
// resolution as dme-user-graph-write.js). With no key, callers fall back to a
// lexical ranking and say so.

const path = require('path');
const https = require('https');

const DEFAULT_MODEL = 'voyage-4-large';

const resolveVoyageApiKey = () => {
	const { getConfig } = process.global;
	const fromCfg = (getConfig('dataModelExplorerSearch') || {}).voyageApiKey;
	if (fromCfg && fromCfg.indexOf('<!') === -1) return fromCfg;
	const srcFile = process.global.configurationSourceFilePath;
	if (!srcFile) return undefined;
	try {
		const configFileProcessor = require('qtools-config-file-processor');
		const dir = path.dirname(srcFile) + '/';
		const c = configFileProcessor.getConfig('dataModelExplorerSearch.ini', dir, { resolve: true });
		return (c.dataModelExplorerSearch || {}).voyageApiKey;
	} catch (_e) {
		return undefined;
	}
};

// (text, { apiKey, model }, callback(err, vector))
const embedQueryText = (text, { apiKey, model = DEFAULT_MODEL } = {}, callback) => {
	if (!apiKey) {
		callback('voyage-query-embed: no voyageApiKey configured');
		return;
	}
	const body = JSON.stringify({ model, input: [String(text || '').slice(0, 2000)], input_type: 'query' });
	const req = https.request(
		{
			hostname: 'api.voyageai.com',
			path: '/v1/embeddings',
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
			timeout: 8000,
		},
		(res) => {
			let data = '';
			res.on('data', (c) => (data += c));
			res.on('end', () => {
				if (res.statusCode !== 200) {
					callback(`Voyage API ${res.statusCode}: ${data.slice(0, 300)}`);
					return;
				}
				let parsed;
				try {
					parsed = JSON.parse(data);
				} catch (e) {
					callback(`Voyage parse: ${e.message}`);
					return;
				}
				const vec = parsed && parsed.data && parsed.data[0] && parsed.data[0].embedding;
				if (!Array.isArray(vec)) {
					callback('Voyage: no embedding in response');
					return;
				}
				callback('', vec);
			});
		},
	);
	req.on('timeout', () => req.destroy(new Error('timeout')));
	req.on('error', (e) => callback(`Voyage request failed: ${e.message}`));
	req.write(body);
	req.end();
};

module.exports = { resolveVoyageApiKey, embedQueryText, DEFAULT_MODEL };
