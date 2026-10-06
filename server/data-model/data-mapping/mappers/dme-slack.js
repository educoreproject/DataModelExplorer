#!/usr/bin/env node
'use strict';
// @concept: [[DataModelExplorer]]
// @concept: [[SlackIntegration]]
// @concept: [[MapperPattern]]

// ============================================================================
// dme-slack — mapper for the DME/Slack Q&A bridge (plan v3, task 1.5)
//
// Three responsibilities, all pure translation:
//   1. getCypher(queryName, params) — parameterized element-lookup templates
//      against the CURRENT golden schema (ForgedNode / HubReference / CEDS hub
//      tuples). User text travels ONLY in $params, never in query text. No
//      CALL {} subqueries — these queries pass the hardened cypher validator
//      (so a card is two named queries, merged by mergeElementCard).
//   2. Block Kit shaping — graph rows → Slack blocks with an output-size cap
//      and a deep link into the DME explorer (?prompt= auto-send affordance,
//      the page's only deep-link route — html/pages/dm/explorer.vue:68).
//   3. getSql(queryName, params) — spend-ledger SQL via the sqlDb abstraction.
// ============================================================================

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

const qt = require('qtools-functional-library');
// W-E-1 / W-E-2 / W-E-3 (campaign P1, 2026-10-06): the card's limits, row lists and carriers are declared once, beside
// every other DME tool payload, in the CONTRACTS §14 module
const {
	SLACK_LOOKUP_LIMITS,
	SLACK_LOOKUP_SEARCH_ROW_FIELD_LIST,
	SLACK_ELEMENT_CARD_TUPLE_FIELD_LIST,
	SLACK_CARD_CARRIED_BY_LIST,
	SLACK_CARDABLE_ROLE_LIST,
} = require('../../../../cli/lib.d/data-model-explorer/lib/toolPayloadContract');

// Slack hard limits are ~3k chars per section and ~50 blocks per message;
// these caps stay comfortably inside them.
const SECTION_TEXT_CAP = 2900;
const ANSWER_TOTAL_CAP = 11600; // four full sections

// The four SKOS match relations and the word the card shows for each. Every match edge is a judgment;
// the card shows its relation, confidence and source (mappingSource), and flags a debug judge's edge.
const MATCH_RELATION_WORD_BY_EDGE_TYPE = {
	EXACT_MATCH: 'exact',
	CLOSE_MATCH: 'close',
	BROAD_MATCH: 'broad',
	NARROW_MATCH: 'narrow',
};
const MATCH_EDGE_PATTERN = Object.keys(MATCH_RELATION_WORD_BY_EDGE_TYPE).join('|');
const DEBUG_MAPPING_SOURCE = 'bridge-debug';
// the instance's group: the SIF Object that owns the Field (HAS_FIELD), else the PESC occurrence's sectionPath
const INSTANCE_GROUP_CYPHER = 'coalesce(head([(groupObject:ForgedNode)-[:HAS_FIELD]->(instanceNode) | groupObject.name]), instanceNode.sectionPath)';
// one tuple's fields, in SLACK_ELEMENT_CARD_TUPLE_FIELD_LIST order, for the two card arms
const cardTupleProjection = (carriedByText, instanceGroupListText, instanceCountText) => `{
									mappingType: mappingType,
									confidence: confidence,
									mappingKind: mappingKind,
									mappingSource: mappingSource,
									hubName: hub.name,
									hubKey: hub.canonicalKey,
									cedsDomain: cedsDomain.name,
									cedsProperty: cedsProperty.name,
									cedsRange: coalesce(cedsRange.name, hub.rangeDatatype),
									carriedBy: ${carriedByText},
									instanceGroupList: ${instanceGroupListText},
									instanceCount: ${instanceCountText}
								}`;

//START OF moduleFunction() ============================================================

const moduleFunction =
	({ moduleName }) =>
	({ baseMappingProcess, safeSql }) => {
		process.global = process.global ? process.global : {};
		const xLog = process.global.xLog;

		// ================================================================================
		// NAMED CYPHER QUERY GENERATION (element lookup)

		const getCypher = (queryName, queryParams = {}) => {
			const queries = {
				// ----- elementSearch — find elements by term, space/case-insensitive.
				// '/dme birth date' matches BirthDate, Birthdate, Birth Date. ONE row per NODE (W-E-2: grouping by
				// name + source merged distinct nodes and the card then picked one with LIMIT 1), declarations only
				// (an instance Field is never carded — its Question is), exact normalized matches first, then
				// shorter names; stableId last so the page is deterministic.
				elementSearch: {
					cypher: `
						MATCH (n:ForgedNode)
						WITH n, replace(toLower($term), ' ', '') AS needle
						WHERE needle <> '' AND replace(toLower(n.name), ' ', '') CONTAINS needle
						  AND n.role IN $cardableRoleList
						WITH n, needle
						ORDER BY CASE WHEN replace(toLower(n.name), ' ', '') = needle THEN 0 ELSE 1 END,
							size(n.name), n._source, n.name, n.stableId
						RETURN n.stableId AS stableId, n.name AS name, n._source AS source, n.role AS role,
							coalesce(n.description, '') AS description
						LIMIT ${SLACK_LOOKUP_LIMITS.searchPageSize}
					`,
					// the page size is a declared constant in the text (a JS number param reaches Neo4j as a float,
					// which LIMIT refuses); only the user's term travels in $params
					params: {
						term: String(queryParams.term || ''),
						cardableRoleList: SLACK_CARDABLE_ROLE_LIST,
					},
				},

				// ----- elementSearchCount — the whole match count behind the page ("showing 3 of N")
				elementSearchCount: {
					cypher: `
						MATCH (n:ForgedNode)
						WITH n, replace(toLower($term), ' ', '') AS needle
						WHERE needle <> '' AND replace(toLower(n.name), ' ', '') CONTAINS needle
						  AND n.role IN $cardableRoleList
						RETURN count(n) AS totalMatchCount
					`,
					params: { term: String(queryParams.term || ''), cardableRoleList: SLACK_CARDABLE_ROLE_LIST },
				},

				// ----- elementCardOwn — one node's card, keyed by stableId: identity, the CEDS hub tuples on its
				// OWN match edges, and the peers from other standards on those hubs
				elementCardOwn: {
					cypher: `
						MATCH (n:ForgedNode {stableId: $stableId})
						OPTIONAL MATCH (n)-[m:${MATCH_EDGE_PATTERN}]->(hub:HubReference)
						WITH n, hub, type(m) AS mappingType, m.mappingConfidence AS confidence,
							m.mappingKind AS mappingKind, m.mappingSource AS mappingSource
						OPTIONAL MATCH (hub)-[:HAS_CEDS_DOMAIN]->(cedsDomain:ForgedNode)
						OPTIONAL MATCH (hub)-[:HAS_CEDS_PROPERTY]->(cedsProperty:ForgedNode)
						OPTIONAL MATCH (hub)-[:HAS_CEDS_RANGE]->(cedsRange:ForgedNode)
						OPTIONAL MATCH (peer:ForgedNode)-[peerMatch:${MATCH_EDGE_PATTERN}]->(hub)
							WHERE peer._source <> n._source
						RETURN n.name AS name, n._source AS source,
							n.description AS description, n.path AS path, n.stableId AS stableId,
							collect(DISTINCT ${cardTupleProjection("'own'", '[]', '0')}) AS hubTuples,
							collect(DISTINCT {
								peerName: peer.name,
								peerSource: peer._source,
								mappingType: type(peerMatch)
							}) AS peers
					`,
					params: { stableId: String(queryParams.stableId || '') },
				},

				// ----- elementCardViaInstance (W-E-1) — SIF and PESC carry their mappings on HAS_INSTANCE children,
				// never on the declaration the search finds: one tuple per hub and verdict, with the instance
				// groups (SIF objects / PESC sections) holding it and how many instances do. Two named queries
				// instead of a CALL {} union: the read-only validator refuses CALL {}.
				elementCardViaInstance: {
					cypher: `
						MATCH (n:ForgedNode {stableId: $stableId})-[:HAS_INSTANCE]->(instanceNode:ForgedNode)-[m:${MATCH_EDGE_PATTERN}]->(hub:HubReference)
						WITH n, hub, type(m) AS mappingType, m.mappingConfidence AS confidence,
							m.mappingKind AS mappingKind, m.mappingSource AS mappingSource,
							${INSTANCE_GROUP_CYPHER} AS instanceGroupName
						WITH n, hub, mappingType, confidence, mappingKind, mappingSource,
							collect(DISTINCT instanceGroupName) AS instanceGroupList, count(*) AS instanceCount
						OPTIONAL MATCH (hub)-[:HAS_CEDS_DOMAIN]->(cedsDomain:ForgedNode)
						OPTIONAL MATCH (hub)-[:HAS_CEDS_PROPERTY]->(cedsProperty:ForgedNode)
						OPTIONAL MATCH (hub)-[:HAS_CEDS_RANGE]->(cedsRange:ForgedNode)
						OPTIONAL MATCH (peer:ForgedNode)-[peerMatch:${MATCH_EDGE_PATTERN}]->(hub)
							WHERE peer._source <> n._source AND NOT (n)-[:HAS_INSTANCE]->(peer)
						RETURN collect(DISTINCT ${cardTupleProjection("'instance'", 'instanceGroupList', 'instanceCount')}) AS hubTuples,
							collect(DISTINCT {
								peerName: peer.name,
								peerSource: peer._source,
								mappingType: type(peerMatch)
							}) AS peers
					`,
					params: { stableId: String(queryParams.stableId || '') },
				},

				// ----- graphIdentity — the golden's passport facts for /dme health (W-E-2: it counted every
				// ForgedNode, the 133 :GraphMeta self-documentation nodes among them)
				graphIdentity: {
					cypher: `
						MATCH (p:GraphProvenance)
						RETURN p.graphName AS graphName, p.manifestRefId AS manifestRefId,
							p.contentNodeCount AS contentNodeCount, p.standardsIncluded AS standardsIncluded,
							p.builtAt AS builtAt
					`,
					params: {},
				},
			};

			if (!queries[queryName]) {
				xLog.error(`Unknown cypher query name '${queryName}' in ${moduleName}`);
				return undefined;
			}

			return queries[queryName];
		};

		// ================================================================================
		// SPEND-LEDGER SQL (sqlDb abstraction; table dmeSlackSpend)
		//
		// One row per /dme ask: slackUserId, costUsd, requestRefId, localDay,
		// askedAtIso. Each row stamps localDay (YYYY-MM-DD in the configured
		// reset timezone) AT WRITE TIME, so "today's spend" is a same-string
		// comparison — midnight reset needs no job and no offset math.

		const getSql = (queryName, replaceObject = {}) => {
			const queries = {
				todayUserSpend: `SELECT COALESCE(SUM(costUsd), 0) AS totalUsd FROM <!tableName!> WHERE slackUserId = <!slackUserId!> AND localDay = <!localDay!>`,
				todayGlobalSpend: `SELECT COALESCE(SUM(costUsd), 0) AS totalUsd FROM <!tableName!> WHERE localDay = <!localDay!>`,
			};

			if (!queries[queryName]) {
				xLog.error(`Unknown sql query name '${queryName}' in ${moduleName}`);
				return undefined;
			}

			return safeSql(queries[queryName], replaceObject);
		};

		// ================================================================================
		// DEEP LINKS
		//
		// The explorer's deep-link affordance is ?prompt= (auto-sent over the WS
		// on connect — explorer.vue:68-88). Opening one runs a real AI query, so
		// cards carry exactly one link, pre-filled to ask about the element.

		const makeDeepLink = ({ dmeBaseUrl, promptText }) => {
			if (!dmeBaseUrl) {
				return null;
			}
			const base = dmeBaseUrl.replace(/\/$/, '');
			return `${base}/dm/explorer?prompt=${encodeURIComponent(promptText)}`;
		};

		// ================================================================================
		// BLOCK KIT SHAPING

		const truncateWithAffordance = (text, cap) => {
			if (text.length <= cap) {
				return { text, truncated: false };
			}
			return {
				text: `${text.slice(0, cap - 1)}…`,
				truncated: true,
			};
		};

		// ----- the two card arms → one card; an undeclared carrier is refused by name (W-E-1)
		const mergeElementCard = ({ ownRow, viaInstanceRow }) => {
			if (!ownRow || !ownRow.stableId) {
				return { refusalText: 'mergeElementCard: the own arm returned no node', card: null };
			}
			const hubTuples = [...(ownRow.hubTuples || []), ...((viaInstanceRow || {}).hubTuples || [])];
			const strangeTuple = hubTuples.find((tuple) => tuple.hubName && SLACK_CARD_CARRIED_BY_LIST.indexOf(tuple.carriedBy) === -1);
			if (strangeTuple) {
				return { refusalText: `mergeElementCard: carriedBy '${strangeTuple.carriedBy}' is not one of ${SLACK_CARD_CARRIED_BY_LIST.join(', ')}`, card: null };
			}
			const peerTextSet = new Set();
			const peers = [...(ownRow.peers || []), ...((viaInstanceRow || {}).peers || [])].filter((peer) => {
				const peerText = JSON.stringify([peer.peerSource, peer.peerName, peer.mappingType]);
				if (peerTextSet.has(peerText)) return false;
				peerTextSet.add(peerText);
				return true;
			});
			return { refusalText: '', card: { ...ownRow, hubTuples, peers } };
		};

		const carrierTextOf = (tuple) => {
			if (tuple.carriedBy !== 'instance') return '';
			const shownGroupList = (tuple.instanceGroupList || []).slice(0, 4);
			const moreGroupCount = (tuple.instanceGroupList || []).length - shownGroupList.length;
			return ` via ${tuple.instanceCount} instance${tuple.instanceCount === 1 ? '' : 's'}: ${shownGroupList.join(', ')}${moreGroupCount > 0 ? ` +${moreGroupCount} more` : ''}`;
		};

		// ----- one element card → Slack section text
		const formatElementCard = (card) => {
			const lines = [`*${card.name}*  ·  ${card.source}`];

			if (card.description) {
				lines.push(card.description);
			}

			const realTuples = (card.hubTuples || []).filter(
				(tuple) => tuple.hubName || tuple.cedsProperty,
			);
			if (realTuples.length) {
				lines.push('*CEDS hub tuple:*');
				realTuples.slice(0, SLACK_LOOKUP_LIMITS.tupleLinesShown).forEach((tuple) => {
					// an edge type outside the four is shown by its own name, never relabelled
					const relationWord =
						MATCH_RELATION_WORD_BY_EDGE_TYPE[tuple.mappingType] || tuple.mappingType;
					const confidenceText =
						typeof tuple.confidence === 'number' ? ` ${Math.round(tuple.confidence * 100)}%` : '';
					const sourceText = tuple.mappingSource ? `, ${tuple.mappingSource}` : '';
					const debugText =
						tuple.mappingSource === DEBUG_MAPPING_SOURCE ? ' ⚠ DEBUG placeholder, not a mapping' : '';
					const tupleParts = [
						tuple.cedsDomain,
						tuple.cedsProperty,
						tuple.cedsRange,
					].filter(Boolean);
					lines.push(
						`• ${tupleParts.join(' › ')} — \`${tuple.hubKey || '?'}\` (${relationWord}${confidenceText}${sourceText})${carrierTextOf(tuple)}${debugText}`,
					);
				});
				// W-E-2: a cut list says how much was cut, as the peer line always did
				if (realTuples.length > SLACK_LOOKUP_LIMITS.tupleLinesShown) {
					lines.push(`  +${realTuples.length - SLACK_LOOKUP_LIMITS.tupleLinesShown} more tuples`);
				}
			}

			const realPeers = (card.peers || []).filter((peer) => peer.peerName);
			if (realPeers.length) {
				const peerSummary = realPeers
					.slice(0, SLACK_LOOKUP_LIMITS.peerLinesShown)
					.map((peer) => `${peer.peerSource}:${peer.peerName}`)
					.join(', ');
				const overflow =
					realPeers.length > SLACK_LOOKUP_LIMITS.peerLinesShown ? ` +${realPeers.length - SLACK_LOOKUP_LIMITS.peerLinesShown} more` : '';
				lines.push(`*Same hub in other standards:* ${peerSummary}${overflow}`);
			}

			if (!realTuples.length && !realPeers.length) {
				lines.push('_No CEDS hub mapping recorded for this element._');
			}

			return truncateWithAffordance(lines.join('\n'), SECTION_TEXT_CAP);
		};

		// ----- lookup reply: term + cards (+ overflow affordance + deep link)
		// slashCommand is the command name as Slack delivered it (/dme, /tqdme…);
		// questionHint, when present, is an extra context line suggesting the
		// ask form for question-shaped terms (user opts in — never auto-routed).
		const buildLookupBlocks = ({
			term,
			cards,
			totalMatches,
			dmeBaseUrl,
			slashCommand = '/dme',
			questionHint,
		}) => {
			const blocks = [];
			const shownCards = cards.slice(0, SLACK_LOOKUP_LIMITS.cardLimit);

			blocks.push({
				type: 'section',
				text: {
					type: 'mrkdwn',
					text: `*${slashCommand}* matches for *${term}* — showing ${shownCards.length} of ${totalMatches}`,
				},
			});

			let anyTruncated = false;
			shownCards.forEach((card) => {
				const { text, truncated } = formatElementCard(card);
				anyTruncated = anyTruncated || truncated;
				blocks.push({ type: 'divider' });
				blocks.push({
					type: 'section',
					text: { type: 'mrkdwn', text },
				});
			});

			const contextParts = [];
			if (questionHint) {
				contextParts.push(questionHint);
			}
			if (totalMatches > shownCards.length || anyTruncated) {
				contextParts.push(
					'Results trimmed — refine your term, or open in the DME.',
				);
			}
			const deepLink = makeDeepLink({
				dmeBaseUrl,
				promptText: `Tell me about "${term}" — which standards model it and what CEDS tuple does it resolve to?`,
			});
			if (deepLink) {
				contextParts.push(`<${deepLink}|Open in DME explorer>`);
			}
			if (contextParts.length) {
				blocks.push({
					type: 'context',
					elements: [{ type: 'mrkdwn', text: contextParts.join('  ·  ') }],
				});
			}

			return blocks;
		};

		// ----- ask reply: buffered askMilo answer → capped sections + deep link
		const buildAskAnswerBlocks = ({ question, answerText, dmeBaseUrl, answerCutOff }) => {
			const { text: cappedAnswer, truncated } = truncateWithAffordance(
				String(answerText || '').trim(),
				ANSWER_TOTAL_CAP,
			);

			const blocks = [];
			for (
				let offset = 0;
				offset < cappedAnswer.length;
				offset += SECTION_TEXT_CAP
			) {
				blocks.push({
					type: 'section',
					text: {
						type: 'mrkdwn',
						text: cappedAnswer.slice(offset, offset + SECTION_TEXT_CAP),
					},
				});
			}
			if (!blocks.length) {
				blocks.push({
					type: 'section',
					text: { type: 'mrkdwn', text: '_askMilo returned an empty answer._' },
				});
			}

			const contextParts = [];
			// W-E-3: the model stopped at its output limit — the answer is incomplete, and the reader is told
			if (answerCutOff === true) {
				contextParts.push('Answer cut off at the model\'s output limit — ask a narrower question.');
			}
			if (truncated) {
				contextParts.push('Answer trimmed — refine, or open in the DME.');
			}
			const deepLink = makeDeepLink({ dmeBaseUrl, promptText: question });
			if (deepLink) {
				contextParts.push(`<${deepLink}|Open in DME explorer>`);
			}
			if (contextParts.length) {
				blocks.push({
					type: 'context',
					elements: [{ type: 'mrkdwn', text: contextParts.join('  ·  ') }],
				});
			}

			return blocks;
		};

		// ================================================================================
		// MAPPER API EXPORT

		return {
			getCypher,
			getSql,
			makeDeepLink,
			mergeElementCard,
			buildLookupBlocks,
			buildAskAnswerBlocks,
			limits: {
				sectionTextCap: SECTION_TEXT_CAP,
				answerTotalCap: ANSWER_TOTAL_CAP,
				lookupCardLimit: SLACK_LOOKUP_LIMITS.cardLimit,
				lookupSearchLimit: SLACK_LOOKUP_LIMITS.searchPageSize,
				searchRowFieldList: SLACK_LOOKUP_SEARCH_ROW_FIELD_LIST,
				cardTupleFieldList: SLACK_ELEMENT_CARD_TUPLE_FIELD_LIST,
			},
		};
	};

//END OF moduleFunction() ============================================================

module.exports = moduleFunction({ moduleName });
