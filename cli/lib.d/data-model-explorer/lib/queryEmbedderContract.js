'use strict';

// queryEmbedderContract.js — the DME's OWN declaration of the model it embeds queries with (campaign P2, W-A-9 / V2-C28).
// Declared once here (it was a literal in dataModelExplorerSearch.js and in nineteen per-standard files), and COMPARED with
// the passport by graphEmbeddingContract before any search runs: a query vector from another model or width cannot be
// compared with the graph's vectors, and a search that ran anyway would return confident nonsense. It is the reader's
// declaration, not a copy of the passport's — the DME embeds with a key it holds, so the two are checked, never assumed.

const QUERY_EMBEDDER_CONTRACT = Object.freeze({ provider: 'voyage', model: 'voyage-4-large', dimension: 1024 });

module.exports = { QUERY_EMBEDDER_CONTRACT };
