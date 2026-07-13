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
//      CALL {} subqueries — these queries pass the hardened cypher validator.
//   2. Block Kit shaping — graph rows → Slack blocks with an output-size cap
//      and a deep link into the DME explorer (?prompt= auto-send affordance,
//      the page's only deep-link route — html/pages/dm/explorer.vue:68).
//   3. getSql(queryName, params) — spend-ledger SQL via the sqlDb abstraction.
// ============================================================================

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

const qt = require('qtools-functional-library');

// Slack hard limits are ~3k chars per section and ~50 blocks per message;
// these caps stay comfortably inside them.
const SECTION_TEXT_CAP = 2900;
const ANSWER_TOTAL_CAP = 11600; // four full sections
const LOOKUP_CARD_LIMIT = 3;
const LOOKUP_SEARCH_LIMIT = 8;

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
				// '/dme birth date' matches BirthDate, Birthdate, Birth Date. Exact
				// normalized matches sort first, then shorter (more specific) names.
				elementSearch: {
					cypher: `
						MATCH (n:ForgedNode)
						WITH n, replace(toLower($term), ' ', '') AS needle
						WHERE needle <> '' AND replace(toLower(n.name), ' ', '') CONTAINS needle
						WITH n.name AS name, n._source AS source, needle,
							max(coalesce(n.description, '')) AS description
						ORDER BY CASE WHEN replace(toLower(name), ' ', '') = needle THEN 0 ELSE 1 END,
							size(name), source, name
						RETURN name, source, description
						LIMIT ${LOOKUP_SEARCH_LIMIT}
					`,
					params: { term: String(queryParams.term || '') },
				},

				// ----- elementCard — one element's card: identity, CEDS hub tuple(s)
				// via EXACT_MATCH/CLOSE_MATCH, and the peer elements from other
				// standards landing on the same hub (cross-standard equivalents).
				elementCard: {
					cypher: `
						MATCH (n:ForgedNode {name: $name, _source: $source})
						WITH n LIMIT 1
						OPTIONAL MATCH (n)-[m:EXACT_MATCH|CLOSE_MATCH]->(hub:HubReference)
						OPTIONAL MATCH (hub)-[:HAS_CEDS_DOMAIN]->(cedsDomain:ForgedNode)
						OPTIONAL MATCH (hub)-[:HAS_CEDS_PROPERTY]->(cedsProperty:ForgedNode)
						OPTIONAL MATCH (hub)-[:HAS_CEDS_RANGE]->(cedsRange:ForgedNode)
						OPTIONAL MATCH (peer:ForgedNode)-[peerMatch:EXACT_MATCH|CLOSE_MATCH]->(hub)
							WHERE peer._source <> n._source
						RETURN n.name AS name, n._source AS source,
							n.description AS description, n.path AS path, n.stableId AS stableId,
							collect(DISTINCT {
								mappingType: type(m),
								confidence: m.confidence,
								hubName: hub.name,
								hubKey: hub.canonicalKey,
								cedsDomain: cedsDomain.name,
								cedsProperty: cedsProperty.name,
								cedsRange: coalesce(cedsRange.name, hub.rangeDatatype)
							}) AS hubTuples,
							collect(DISTINCT {
								peerName: peer.name,
								peerSource: peer._source,
								mappingType: type(peerMatch)
							}) AS peers
					`,
					params: {
						name: String(queryParams.name || ''),
						source: String(queryParams.source || ''),
					},
				},

				// ----- graphIdentity — golden passport facts for /dme health
				graphIdentity: {
					cypher: `
						MATCH (n:ForgedNode)
						RETURN count(n) AS forgedNodeCount
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

		const formatConfidence = (confidence) =>
			typeof confidence === 'number' ? ` (${Math.round(confidence * 100)}%)` : '';

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
				realTuples.slice(0, 4).forEach((tuple) => {
					const kind = tuple.mappingType === 'EXACT_MATCH' ? 'exact' : 'close';
					const tupleParts = [
						tuple.cedsDomain,
						tuple.cedsProperty,
						tuple.cedsRange,
					].filter(Boolean);
					lines.push(
						`• ${tupleParts.join(' › ')} — \`${tuple.hubKey || '?'}\` (${kind}${formatConfidence(tuple.confidence)})`,
					);
				});
			}

			const realPeers = (card.peers || []).filter((peer) => peer.peerName);
			if (realPeers.length) {
				const peerSummary = realPeers
					.slice(0, 6)
					.map((peer) => `${peer.peerSource}:${peer.peerName}`)
					.join(', ');
				const overflow =
					realPeers.length > 6 ? ` +${realPeers.length - 6} more` : '';
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
			const shownCards = cards.slice(0, LOOKUP_CARD_LIMIT);

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
		const buildAskAnswerBlocks = ({ question, answerText, dmeBaseUrl }) => {
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
			buildLookupBlocks,
			buildAskAnswerBlocks,
			limits: {
				sectionTextCap: SECTION_TEXT_CAP,
				answerTotalCap: ANSWER_TOTAL_CAP,
				lookupCardLimit: LOOKUP_CARD_LIMIT,
				lookupSearchLimit: LOOKUP_SEARCH_LIMIT,
			},
		};
	};

//END OF moduleFunction() ============================================================

module.exports = moduleFunction({ moduleName });
