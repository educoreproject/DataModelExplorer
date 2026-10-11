'use strict';
// @concept: [[DataModelExplorer]]
// @concept: [[MultiTenant]]
// @concept: [[EmbeddingMigration]]
//
// embedding-migration.js — the coordinated re-embed migration over graph_state_versions (design doc 08), RETIRED by
// ruling A12 (campaign P2, W-E-6): the user layer is TEXT-ONLY (graph contract userEmbeddingRule.userVectorPolicy), so
// there are no user vectors to re-embed. The old job re-embedded with a constant model while stamping the NEW model's
// name on the result (V2-S34); it is not kept as an alternative path. Vectors an older layer still carries are removed
// on replay (re-emit.js replayStateScript).
//
// migrateVersion keeps its signature so a caller learns the policy by name instead of by a missing export.

const { USER_EMBEDDING_RULE } = require('./user-layer-contract');

// migrateVersion(opts, callback(err)) — always refuses; the refusal names the policy that makes it so.
const migrateVersion = (opts, callback) => {
	const { userVectorPolicy } = USER_EMBEDDING_RULE;
	if (userVectorPolicy === 'textOnly') {
		callback(`embedding-migration: the user layer is text-only (graph contract userEmbeddingRule.userVectorPolicy '${userVectorPolicy}'); there are no user vectors to re-embed`);
		return;
	}
	callback(`embedding-migration: no migration is implemented for userVectorPolicy '${userVectorPolicy}'`);
};

module.exports = { migrateVersion };
