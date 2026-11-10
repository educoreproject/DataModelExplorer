#!/usr/bin/env node
// meaningsWording.test.mjs — WORKORDER-meaningsPolish-111026, the Meanings explorer's words (TQ's punch list items 1, 3-7, 9), pure: no browser, no server.
//   1. a meaning is an "EDC meaning", whichever hub defines it
//   3. a hub's row says what its next level shows: "<n> domains · <n> meanings"
//   4. a domain's row says what its level lists: its meanings, and its own term apart; the term row is labelled unmistakably as the domain's own term
//   5. one is singular: "1 meaning", "1 domain", "1 element maps here"
//   6. the intro line, verbatim
//   7. "36 meanings · 2 expressed in other standards"
//   9. the explainer is TQ's approved text, and its diagram is labelled illustrative
//   and: every template is filled or refused by name (no silent blank)
//
//   node html/tests/standardsExplorer/meaningsWording.test.mjs

import assert from 'node:assert/strict';
import {
	kindDisplayNameOf,
	pluralKindNameOf,
	relationshipDisplayNameOf,
	meaningCountTextOf,
	meaningInfoTextOf,
	meaningExpressionTextOf,
	meaningFactListOf,
	walkProfileOf,
	wordingOf,
	meaningsVocabulary,
} from '../../components/standardsExplorer/explorerVocabulary.js';

const resultList = [];
const check = (checkName, checkFunction) => {
	const failureText = (() => {
		try {
			checkFunction();
			return '';
		} catch (checkError) {
			return checkError.message;
		}
	})();
	resultList.push({ checkName, failureText });
	console.log(`  ${failureText ? 'FAIL' : 'PASS'}: ${checkName}${failureText ? ` — ${failureText}` : ''}`);
};

// rows as the server sends them (GOLD_261030_useCases: CEDS 379 domains holding 2,777 property meanings; Accessibility Feature; Adult Education Course)
const cedsHubRow = { kind: 'meaningHub', hubName: 'CEDS', domainCount: 379, meaningCount: 2777 };
const accessibilityFeatureRow = { kind: 'meaningDomain', hubName: 'CEDS', meaningCount: 36, mappedMeaningCount: 2, termMeaningCount: 1 };
const adultEducationCourseRow = { kind: 'meaningDomain', hubName: 'CEDS', meaningCount: 5, mappedMeaningCount: 0, termMeaningCount: 1 };
const lonelyDomainRow = { kind: 'meaningDomain', hubName: 'CEDS', meaningCount: 1, mappedMeaningCount: 1, termMeaningCount: 0 };
// the domain's own term row is known by the group it is listed in (the server's HAS_TERM_MEANING), not by re-deriving the server's tier rule
const domainTermRow = { kind: 'meaning', hubName: 'CEDS', referenceTier: 'term', termKind: 'class', elementCount: 0, relationshipType: 'HAS_TERM_MEANING' };
const termOnlyDomainRow = { kind: 'meaningDomain', hubName: 'CEDS', meaningCount: 0, mappedMeaningCount: 0, termMeaningCount: 1 };
const accessibilityFeatureNode = { ...accessibilityFeatureRow, nativeId: { cedsId: 'C200012' } };
const propertyMeaningRow = { kind: 'meaning', hubName: 'CEDS', referenceTier: 'property', rangeName: 'Sex', qualifierNameList: ['Staff Member Identifier'], elementCount: 1 };

check('1: a meaning is an "EDC meaning" on every hub, never "<hub> meaning"', () => {
	assert.equal(kindDisplayNameOf('meaning', 'CTDL'), 'EDC meaning');
	assert.equal(kindDisplayNameOf('meaning', 'CEDS'), 'EDC meaning');
	assert.equal(pluralKindNameOf('meaning', 'CEDS'), 'EDC meanings');
});
check('1: a domain is still its hub\'s own ("CEDS domain")', () => assert.equal(kindDisplayNameOf('meaningDomain', 'CEDS'), 'CEDS domain'));
check('3: the hub row reads "379 domains · 2,777 meanings"', () => assert.equal(meaningCountTextOf(cedsHubRow), '379 domains · 2,777 meanings'));
check('4, 7: Accessibility Feature reads "36 meanings + its own term · 2 expressed in other standards"', () => assert.equal(meaningCountTextOf(accessibilityFeatureRow), '36 meanings + its own term · 2 expressed in other standards'));
check('4: Adult Education Course reads "5 meanings + its own term" (none expressed: no expressed part)', () => assert.equal(meaningCountTextOf(adultEducationCourseRow), '5 meanings + its own term'));
check('5: one meaning, no own term, one expressed: "1 meaning · 1 expressed in other standards"', () => assert.equal(meaningCountTextOf(lonelyDomainRow), '1 meaning · 1 expressed in other standards'));
check('5: one domain is singular', () => assert.equal(meaningCountTextOf({ ...cedsHubRow, domainCount: 1, meaningCount: 1 }), '1 domain · 1 meaning'));
check('4: the domain\'s own term row says so unmistakably', () => assert.equal(meaningInfoTextOf(domainTermRow), "This domain's own term"));
check('review S5: a term row listed outside the own-term group is not called the domain\'s own term', () => assert.equal(meaningInfoTextOf({ ...domainTermRow, relationshipType: 'HAS_VALUE_MEANING' }), ''));
check('review S6: a domain whose only meaning is its own term reads "its own term only"', () => assert.equal(meaningCountTextOf(termOnlyDomainRow), 'its own term only'));
check('review S4: a domain\'s panel facts carry its id in its hub\'s standard ("CEDS id" C200012)', () =>
	assert.deepEqual(meaningFactListOf(accessibilityFeatureNode), [
		{ factName: 'Meanings', factText: '36 meanings + its own term · 2 expressed in other standards' },
		{ factName: 'CEDS id', factText: 'C200012' },
	]),
);
check('4: the own-term group is named as the domain\'s own term', () => assert.equal(relationshipDisplayNameOf('HAS_TERM_MEANING'), "This domain's own term"));
check('4: no property level is named any more (the walk\'s groups are hubs, domains, meanings, the own term, value meanings)', () =>
	assert.deepEqual(Object.keys(meaningsVocabulary.relationshipDisplayNameByType), ['HAS_MEANING_HUB', 'HAS_MEANING_DOMAIN', 'HAS_MEANING', 'HAS_TERM_MEANING', 'HAS_VALUE_MEANING']),
);
check('a property meaning row says its range and qualifiers, not its tier', () => assert.equal(meaningInfoTextOf(propertyMeaningRow), 'range Sex · qualified by Staff Member Identifier'));
check('5: "1 element maps here", "2 elements map here", "nothing maps here"', () => {
	assert.equal(meaningExpressionTextOf({ elementCount: 1 }), '1 element maps here');
	assert.equal(meaningExpressionTextOf({ elementCount: 1004 }), '1,004 elements map here');
	assert.equal(meaningExpressionTextOf({ elementCount: 0 }), 'nothing maps here');
});
check('the hub\'s panel facts: its domains and its meanings, as its next level shows them', () =>
	assert.deepEqual(meaningFactListOf(cedsHubRow), [
		{ factName: 'Domains', factText: '379' },
		{ factName: 'Meanings', factText: '2,777' },
	]),
);
check('the domain\'s panel fact is its row\'s count text', () => assert.deepEqual(meaningFactListOf(accessibilityFeatureRow), [{ factName: 'Meanings', factText: '36 meanings + its own term · 2 expressed in other standards' }]));
check('6: the intro line is TQ\'s, ending "...within a particular CEDS domain. ..."', () =>
	assert.equal(
		walkProfileOf('meanings').introText,
		'A meaning is one idea the standards can express, named once with a permanent URI. Sometimes a meaning is a single element of a standard; often it is a tuple, such as a property within a particular CEDS domain. Pick a hub, then a domain; open a meaning to see what it names and every standard element that expresses it.',
	),
);
// ⟪review N5⟫ TQ's approved text, all five paragraphs, pinned here as he approved it (2026-11-10, PUNCHLIST-meaningsRosetta-111026 item 9; *…* is italic)
const TQ_EXPLAINER_PARAGRAPH_LIST = [
	'A meaning is one complete idea that a data element can carry, such as "a staff member\'s identifier", recorded once in EDUcore with a permanent URI.',
	'To say what a data element means, you point it at a reference standard (an ontology, such as CEDS). Often one pointer is enough: "First Name" points at First Name. Often it is not. A staff ID and a student ID both point at "Identifier". What separates them is the second pointer: one is the identifier *of a staff member*, the other the identifier *of a student*. The complete idea takes two ontology elements together, a class and a property.',
	'If each data element simply kept two separate pointers, mapping would break down. A staff ID pointing at "Staff Member" and at "Identifier" looks, link by link, like any other element that touches either one, and nothing records that the two pointers belong together. There is no single place to look up "everything that means a staff member\'s identifier", and so nothing to translate through.',
	'EDUcore solves this by giving the pair a node of its own: the meaning. In ontology terms the combination is reified, made into a thing that can be named and pointed at. The meaning points to the ontology elements that define it, and data elements from any standard point to the meaning.',
	'That is what makes a meaning useful for mapping. A SIF element, an Ed-Fi element and a PESC element that all point to the same meaning express the same idea, so the meaning translates between them. Your own database\'s columns can point to it in the same way.',
];
check('9: the explainer is TQ\'s five paragraphs, verbatim, with his two italic runs', () =>
	assert.deepEqual(
		meaningsVocabulary.explainer.paragraphList.map((runList) => runList.map((oneRun) => (oneRun.isEmphasis ? `*${oneRun.text}*` : oneRun.text)).join('')),
		TQ_EXPLAINER_PARAGRAPH_LIST,
	),
);
check('9: the diagram is generic and its caption says illustrative (TQ\'s ruling)', () => {
	assert.deepEqual([...meaningsVocabulary.explainer.ontologyElementLabelList], ['Ontology class', 'Ontology property']);
	assert.match(meaningsVocabulary.explainer.captionText, /\(illustrative\)\.$/);
});
check('a template missing a value is refused by name, never left blank', () => assert.throws(() => wordingOf('{countText} expressed', {}), /countText/));
check('a count the server did not send is refused by name, never shown as NaN', () => assert.throws(() => meaningCountTextOf({ ...cedsHubRow, domainCount: undefined }), /must be a number/));

const failedList = resultList.filter((oneResult) => oneResult.failureText);
console.log(`\n${resultList.length - failedList.length} passed, ${failedList.length} failed`);
process.exit(failedList.length ? 1 : 0);
