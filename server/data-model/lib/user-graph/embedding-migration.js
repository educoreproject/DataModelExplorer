'use strict';
// @concept: [[DataModelExplorer]]
// @concept: [[MultiTenant]]
// @concept: [[EmbeddingMigration]]
//
// embedding-migration.js — coordinated re-embed migration over graph_state_versions
// (design doc 08). When golden is rebuilt with a newer embedding model, the user layers'
// inline vectors must be re-embedded with the same model so user vectors stay compatible
// with golden's for vector search. This job re-opens a version, re-embeds each
// :UserContent node from its text with the new model, bumps embeddingModelVersion, and
// re-emits + persists. Dry-run reports what WOULD change without writing.

const { getUserGraph, releaseUserGraph } = require('./user-graph');
const { embedText } = require('./write-executor');
const { reEmit } = require('./re-emit');
const neo4jGen = require('../neo4j-instance/neo4j-instance')({ unused: true });

// migrateVersion(opts, callback(err, summary))
const migrateVersion = (opts, callback) => {
	const { sqlDb, dataMapping, accessPointsDotD, userRefId, versionRefId, newModelVersion, voyageApiKey, dryRun } = opts;

	getUserGraph({ userRefId, versionRefId, username: '_migration', sqlDb, dataMapping }, (oErr, handle) => {
		if (oErr) { callback(`migrate open failed: ${oErr}`); return; }

		const done = (err, summary) => releaseUserGraph(handle, { sqlDb, dataMapping }, () => callback(err || '', summary));
		const conn = handle.graphConnection;

		neo4jGen.initDatabaseInstance(
			{ neo4jBoltUri: conn.boltUri, neo4jUser: conn.user, neo4jPassword: conn.password },
			(cErr, db) => {
				if (cErr) { done(`migrate connect failed: ${cErr}`); return; }

				db.runQuery(
					"MATCH (n:UserContent) WHERE NOT n:UserGraphIdentity " +
					"RETURN n.userNodeId AS id, (coalesce(n.name,'') + ' ' + coalesce(n.description,'')) AS text",
					{},
					(qErr, rows) => {
						if (qErr) { db.close(); done(`migrate query failed: ${qErr}`); return; }
						const nodes = rows || [];

						if (dryRun) {
							db.close();
							done('', { dryRun: true, wouldReEmbed: nodes.length, newModelVersion });
							return;
						}

						let i = 0;
						let migrated = 0;
						const reEmbedNext = () => {
							if (i >= nodes.length) {
								// re-emit with the bumped stamp + persist
								reEmit({ userGraphDb: db, embeddingModelVersion: newModelVersion }, (rErr, res) => {
									db.close();
									if (rErr) { done(`migrate re-emit failed: ${rErr}`); return; }
									accessPointsDotD['graph-state-version-save'](
										{ userRefId, refId: versionRefId, stateScript: res.stateScript, userNodeCount: res.userNodeCount, embeddingModelVersion: newModelVersion },
										(sErr) => done(sErr || '', { dryRun: false, reEmbedded: migrated, newModelVersion }),
									);
								});
								return;
							}
							const nd = nodes[i++];
							embedText(nd.text, voyageApiKey, (eErr, vec) => {
								if (eErr) { db.close(); done(`migrate embed failed: ${eErr}`); return; }
								db.runQuery(
									'MATCH (n:UserContent {userNodeId:$id}) SET n.embedding = $v, n.embeddingModelVersion = $m',
									{ id: nd.id, v: vec, m: newModelVersion },
									(uErr) => {
										if (uErr) { db.close(); done(`migrate set failed: ${uErr}`); return; }
										migrated += 1;
										reEmbedNext();
									},
								);
							});
						};
						reEmbedNext();
					},
				);
			},
		);
	});
};

module.exports = { migrateVersion };
