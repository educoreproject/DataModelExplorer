'use strict';

// rater-embedder.js — the CEDS Rater's query embedder: the DME's own declared model (queryEmbedderContract: voyage,
// voyage-4-large, 1024), built with the qtools-graph-forge-core embeddingClient the DME uses, keyed by
// raterTool.voyageApiKey. Shared by the suggested-list script and the server's meaning search.
//
//   createRaterEmbedder({ voyageApiKey }) -> { embedder } | { refusal: { refusalName: 'noEmbedder', refusalText } }

const path = require('path');

const DME_DIR_PATH = path.join(__dirname, '..', '..', '..', '..', 'cli', 'lib.d', 'data-model-explorer');
const { QUERY_EMBEDDER_CONTRACT } = require(path.join(DME_DIR_PATH, 'lib', 'queryEmbedderContract'));

const createRaterEmbedder = ({ voyageApiKey }) => {
	if (typeof voyageApiKey !== 'string' || voyageApiKey.trim() === '' || voyageApiKey.startsWith('<!')) {
		return { refusal: { refusalName: 'noEmbedder', refusalText: 'CEDS Rater: raterTool.voyageApiKey is not configured, so the meaning search cannot run (words and CEDS ID searches can).' } };
	}
	const { embeddingClient } = require(require.resolve('qtools-graph-forge-core', { paths: [DME_DIR_PATH] }));
	const embedder = embeddingClient.create({ provider: QUERY_EMBEDDER_CONTRACT.provider, model: QUERY_EMBEDDER_CONTRACT.model, dimension: QUERY_EMBEDDER_CONTRACT.dimension, apiKey: voyageApiKey, batchSize: 20 });
	return { embedder };
};

module.exports = { createRaterEmbedder };
