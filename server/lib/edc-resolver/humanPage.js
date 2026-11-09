'use strict';

// humanPage — the /edc answer as a person reads it, in the educore.dev site's look (WORKORDER-edcHumanPages-110926, TQ Q68, Q70). PURE: an answer and its graph facts in, one HTML page out.
//
//   humanPageFor({ httpStatus, answerBody, humanPageFacts, edcIri, requestPath, publicPathPrefix, baseIri }) → the page text, for a kind in humanPageRules.humanPageKindList
//   pageChromeFor({ titleText, jsonHref, mainHtml }) → a whole page in the site's chrome (the plain page uses it too)
//   jsonHtmlOf(answerBody) → the answer as JSON.stringify(answerBody, null, 2) writes it, escaped, every URI a link
//   jsonHrefOf({ requestPath, publicPathPrefix }) → the page's own address with format=json added (its other query parts kept)
//   escapedHtmlOf(text)
//
// EVERY value from an answer or the graph passes through escapedHtmlOf before it reaches the page, attributes included. The page runs no script but one: the copy
// button's, which reads only its own data-copy attribute. Sections are collapsed <details>, which need no script. An EDUcore URI links to its page here (rewritten under
// publicPathPrefix, so it resolves on this host today); any other URI opens where it points, in a new tab.

const humanPageRules = require('./humanPageRules.json');
const hubCardTupleRules = require('../standards-query/hubCardTupleRules.json');

const HTML_ESCAPE_BY_CHARACTER = Object.freeze({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' });
const escapedHtmlOf = (text) => String(text).replace(/[&<>"']/g, (oneCharacter) => HTML_ESCAPE_BY_CHARACTER[oneCharacter]);

const ABSOLUTE_URI_PATTERN = /^https?:\/\/[^\s"<>]+$/;
const JSON_FORMAT_QUERY_PART = 'format=json';
const JSON_INDENT_TEXT = '  ';

// ================================================================================
// LINKS

const linkContextOf = ({ publicPathPrefix, baseIri }) => {
	// where a URI leads from this page: an EDUcore URI to its page here, any other web URI to itself, anything else nowhere
	const hrefOf = (uriText) => {
		if (typeof uriText !== 'string') {
			return undefined;
		}
		if (uriText.indexOf(baseIri) === 0) {
			return `${publicPathPrefix}${uriText.slice(baseIri.length)}`;
		}
		return ABSOLUTE_URI_PATTERN.test(uriText) ? uriText : undefined;
	};
	const linkHtmlOf = (uriText, labelText) => {
		const href = hrefOf(uriText);
		const shownText = escapedHtmlOf(labelText === undefined ? uriText : labelText);
		if (href === undefined) {
			return shownText;
		}
		const opensElsewhere = uriText.indexOf(baseIri) !== 0;
		return `<a href="${escapedHtmlOf(href)}"${opensElsewhere ? ' target="_blank" rel="noopener"' : ''}>${shownText}</a>`;
	};
	return { hrefOf, linkHtmlOf };
};

const jsonHrefOf = ({ requestPath, publicPathPrefix }) => {
	const relativePath = requestPath.replace(/^\//, '');
	return `${publicPathPrefix}${relativePath}${relativePath.includes('?') ? '&' : '?'}${JSON_FORMAT_QUERY_PART}`;
};

// ================================================================================
// JSON, as JSON.stringify(body, null, 2) writes it, with every URI string a link that opens in a new tab

const jsonHtmlOf = (answerBody) => {
	const writtenHtmlOf = (oneValue, depth) => {
		const innerIndent = JSON_INDENT_TEXT.repeat(depth + 1);
		const closingIndent = JSON_INDENT_TEXT.repeat(depth);
		if (Array.isArray(oneValue)) {
			return oneValue.length === 0 ? '[]' : `[\n${oneValue.map((oneItem) => `${innerIndent}${writtenHtmlOf(oneItem, depth + 1)}`).join(',\n')}\n${closingIndent}]`;
		}
		if (oneValue !== null && typeof oneValue === 'object') {
			const entryList = Object.entries(oneValue).filter(([, entryValue]) => entryValue !== undefined);
			return entryList.length === 0 ? '{}' : `{\n${entryList.map(([entryName, entryValue]) => `${innerIndent}${escapedHtmlOf(JSON.stringify(entryName))}: ${writtenHtmlOf(entryValue, depth + 1)}`).join(',\n')}\n${closingIndent}}`;
		}
		const writtenText = JSON.stringify(oneValue);
		if (typeof oneValue === 'string' && ABSOLUTE_URI_PATTERN.test(oneValue)) {
			return `"<a href="${escapedHtmlOf(oneValue)}" target="_blank" rel="noopener">${escapedHtmlOf(writtenText.slice(1, -1))}</a>"`;
		}
		return escapedHtmlOf(writtenText);
	};
	return writtenHtmlOf(answerBody, 0);
};

// ================================================================================
// CHROME: educore.dev's tokens (html/assets/css/global.css), its header and footer (html/pages/index.vue), a dark twin, and phone width with no sideways scroll

const PAGE_STYLE_TEXT = `
:root{--edu-blue:#072A6C;--edu-teal:#00B5B8;--edu-orange:#FFAB40;--edu-violet:#5B3FD3;--page-bg:#F8F9FC;--surface:#FFFFFF;--text:#111827;--text-muted:#5F6B82;--border:#E2E7F0;--heading:#072A6C;--link:#0B6E8E;--chip-bg:#EEF1F7;--code-bg:#EEF1F7;--shadow-card:0 2px 12px rgba(7,42,108,.08),0 0 0 1px rgba(7,42,108,.06);--radius-sm:6px;--radius-md:12px}
@media (prefers-color-scheme:dark){:root{--page-bg:#0B1222;--surface:#131D33;--text:#E6EAF2;--text-muted:#9AA6BC;--border:#26324D;--heading:#CFE0FF;--link:#5FD9DB;--chip-bg:#1D2A47;--code-bg:#0F182C;--shadow-card:0 0 0 1px #26324D}}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;font-family:'Open Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:16px;line-height:1.6;color:var(--text);background:var(--page-bg);-webkit-font-smoothing:antialiased}
a{color:var(--link);overflow-wrap:anywhere}
.site-header{position:sticky;top:0;z-index:10;background:var(--surface);border-bottom:1px solid var(--border)}
.site-header .inner{display:flex;align-items:center;justify-content:space-between;gap:1rem;padding-top:.6rem;padding-bottom:.6rem}
.brand{display:inline-flex;align-items:center;background:#fff;border-radius:var(--radius-sm);padding:2px 6px}
.brand img{height:48px;width:auto;display:block}
.site-nav a{font-weight:600;font-size:.9rem;text-decoration:none;color:var(--heading)}
.inner{max-width:960px;margin:0 auto;padding-left:16px;padding-right:16px}
main.inner{padding-top:1.75rem;padding-bottom:3rem}
.overline{font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--edu-teal);margin:0 0 .25rem}
h1{font-family:'DM Serif Display',Georgia,serif;font-weight:400;color:var(--heading);font-size:2.1rem;line-height:1.2;margin:0 0 .5rem;overflow-wrap:anywhere}
h2{font-size:1rem;color:var(--heading);margin:1.5rem 0 .5rem}
.card h2:first-child{margin-top:0}
.definition{font-size:1.05rem;margin:.25rem 0 1rem;max-width:46rem}
.chip-row{display:flex;flex-wrap:wrap;gap:.4rem;margin:.5rem 0 1rem}
.chip{display:inline-block;background:var(--chip-bg);color:var(--heading);border-radius:999px;padding:.1rem .7rem;font-size:.82rem;font-weight:600;overflow-wrap:anywhere}
.chip.bracket{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-weight:600;background:var(--edu-blue);color:#fff;border-radius:var(--radius-sm)}
.card{background:var(--surface);border-radius:var(--radius-md);box-shadow:var(--shadow-card);padding:1rem 1.1rem;margin:0 0 1rem}
.cite{display:flex;flex-wrap:wrap;align-items:center;gap:.5rem}
.cite-label{font-weight:700;color:var(--heading);font-size:.9rem}
code,.mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.86rem;background:var(--code-bg);border-radius:4px;padding:.05rem .35rem;overflow-wrap:anywhere;word-break:break-word}
.cite code{flex:1 1 18rem;padding:.35rem .5rem}
button.copy{font:inherit;font-size:.82rem;font-weight:600;border:1px solid var(--edu-teal);color:var(--heading);background:transparent;border-radius:var(--radius-sm);padding:.2rem .7rem;cursor:pointer}
dl.facts{display:grid;grid-template-columns:max-content minmax(0,1fr);gap:.3rem 1rem;margin:.75rem 0 0}
dl.facts dt{font-weight:600;color:var(--text-muted);font-size:.88rem}
dl.facts dd{margin:0;overflow-wrap:anywhere;min-width:0}
.json-link{margin:.25rem 0 1.25rem;font-size:.9rem}
.json-link a{font-weight:700}
details{background:var(--surface);border-radius:var(--radius-md);box-shadow:var(--shadow-card);margin:0 0 .75rem;padding:0 1.1rem}
summary{cursor:pointer;font-weight:600;color:var(--heading);padding:.75rem 0}
details[open] summary{border-bottom:1px solid var(--border);margin-bottom:.75rem}
details>*:last-child{margin-bottom:1rem}
.count{color:var(--text-muted);font-weight:400}
ul.rows{list-style:none;margin:0;padding:0}
ul.rows li{padding:.45rem 0;border-bottom:1px solid var(--border);overflow-wrap:anywhere}
ul.rows li:last-child{border-bottom:none}
.row-meta{display:block;color:var(--text-muted);font-size:.84rem}
.note{color:var(--text-muted);font-size:.88rem;margin:.25rem 0 .75rem}
.refusal{color:#B42318;font-weight:600}
@media (prefers-color-scheme:dark){.refusal{color:#FF8A80}}
pre.json{white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.8rem;line-height:1.5;background:var(--code-bg);border-radius:var(--radius-sm);padding:.75rem;margin:0 0 1rem}
footer.site-footer{text-align:center;padding:2rem 16px;color:var(--text-muted);font-size:.88rem;border-top:1px solid var(--border)}
@media (max-width:600px){h1{font-size:1.6rem}dl.facts{grid-template-columns:minmax(0,1fr)}dl.facts dt{margin-top:.35rem}}
`;

// the one script a page runs: a Copy button copies its own data-copy text
const COPY_SCRIPT_TEXT = "document.addEventListener('click',function(e){var b=e.target.closest('button[data-copy]');if(!b||!navigator.clipboard)return;navigator.clipboard.writeText(b.getAttribute('data-copy')).then(function(){b.textContent='Copied';setTimeout(function(){b.textContent='Copy';},1500);});});";

const pageChromeFor = ({ titleText, jsonHref, mainHtml }) => {
	const { siteChrome } = humanPageRules;
	return [
		'<!doctype html>',
		'<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">',
		`<title>${escapedHtmlOf(titleText)}</title>`,
		jsonHref === undefined ? '' : `<link rel="alternate" type="application/json" href="${escapedHtmlOf(jsonHref)}">`,
		`<link rel="stylesheet" href="${escapedHtmlOf(siteChrome.fontStylesheetHref)}">`,
		`<style>${PAGE_STYLE_TEXT}</style>`,
		'</head><body>',
		`<header class="site-header"><div class="inner"><a class="brand" href="${escapedHtmlOf(siteChrome.homeHref)}"><img src="${escapedHtmlOf(siteChrome.logoPath)}" alt="${escapedHtmlOf(siteChrome.logoAltText)}"></a></div></header>`,
		`<main class="inner">${mainHtml}</main>`,
		`<footer class="site-footer">${escapedHtmlOf(siteChrome.footerText)}</footer>`,
		`<script>${COPY_SCRIPT_TEXT}</script>`,
		'</body></html>',
		'',
	].join('\n');
};

// ================================================================================
// SHARED PIECES

const citeHtmlOf = (citedUri) => `<div class="card cite"><span class="cite-label">Cite as</span><code>${escapedHtmlOf(citedUri)}</code><button type="button" class="copy" data-copy="${escapedHtmlOf(citedUri)}">Copy</button></div>`;
const jsonLinkHtmlOf = (jsonHref) => `<p class="json-link"><a href="${escapedHtmlOf(jsonHref)}">JSON</a> <span class="count">this answer as a program reads it</span></p>`;
const detailsHtmlOf = ({ summaryText, countText, innerHtml }) => `<details><summary>${escapedHtmlOf(summaryText)}${countText === undefined ? '' : ` <span class="count">${escapedHtmlOf(countText)}</span>`}</summary>${innerHtml}</details>`;
const jsonDetailsHtmlOf = (answerBody) => detailsHtmlOf({ summaryText: 'JSON', innerHtml: `<pre class="json">${jsonHtmlOf(answerBody)}</pre>` });
const factsRowHtmlOf = (termText, definitionHtml) => `<dt>${escapedHtmlOf(termText)}</dt><dd>${definitionHtml}</dd>`;
const shownCountTextOf = ({ listedCount, heldCount }) => (listedCount < heldCount ? `${heldCount}, showing ${listedCount}` : String(heldCount));
const factsAbsentHtmlOf = (factsAbsentName) => `<p class="note">The live graph was not read for this page: <code>${escapedHtmlOf(factsAbsentName)}</code>.</p>`;

// a hub card in a list: its label linked to its page, its bracket, its hub release and tier, and what joins it to this element
const cardRowHtmlOf = ({ cardRow, linkHtmlOf, joinText }) => `<li>${linkHtmlOf(cardRow.uri, cardRow.label || cardRow.uri)} <span class="mono">${escapedHtmlOf(cardRow.tupleBracketText)}</span>`
	+ `<span class="row-meta">${escapedHtmlOf([cardRow.hubName, cardRow.hubVersion].filter(Boolean).join(' '))}${cardRow.referenceTier ? ` · ${escapedHtmlOf(cardRow.referenceTier)} card` : ''}${joinText ? ` · ${escapedHtmlOf(joinText)}` : ''}</span></li>`;

// one tuple or range part: slot, kind, native identifier, label linked to the element's page
const partRowHtmlOf = ({ slotName, part, linkHtmlOf }) => {
	const nativeIdText = part.nativeId ? Object.entries(part.nativeId).map(([idName, idText]) => `${idName} ${idText}`).join(', ') : `no native identifier: ${part.nativeIdAbsentName}`;
	const labelHtml = part.uri === undefined ? `${escapedHtmlOf(part.label)} <span class="count">(no URI: ${escapedHtmlOf(part.uriAbsentReason)})</span>` : linkHtmlOf(part.uri, part.label);
	return `<li>${slotName === undefined ? '' : `<strong>${escapedHtmlOf(slotName)}</strong> · `}${labelHtml}<span class="row-meta">${escapedHtmlOf(part.kind)} · ${escapedHtmlOf(nativeIdText)}</span></li>`;
};

// ================================================================================
// THE ELEMENT PAGE

const KIND_BY_GRAPH_LABEL = hubCardTupleRules.partKindByGraphLabel;
const elementKindTextOf = (labelList) => {
	const kindLabel = labelList.find((oneLabel) => KIND_BY_GRAPH_LABEL[oneLabel] !== undefined);
	return kindLabel === undefined ? labelList.join(', ') : KIND_BY_GRAPH_LABEL[kindLabel];
};

const firstValueOf = (propertyByName, propertyName) => (Array.isArray(propertyByName[propertyName]) ? propertyByName[propertyName][0] : propertyByName[propertyName]);

// the standard's own IRI and status, where humanPageRules records how the standard publishes them
const OWN_IRI_READER_BY_RULE_NAME = Object.freeze({
	nodePropertyName: ({ ruleText, node }) => firstValueOf(node.properties, ruleText),
	prefixExpansion: ({ ruleText, node }) => {
		const matchedPrefix = Object.keys(ruleText).find((onePrefix) => node.stableId.indexOf(onePrefix) === 0);
		return matchedPrefix === undefined ? undefined : `${ruleText[matchedPrefix]}${node.stableId.slice(matchedPrefix.length)}`;
	},
});
const ownIriRowsHtmlOf = ({ standardName, node, linkHtmlOf }) => {
	const ownIriRule = humanPageRules.standardOwnIriRuleByStandardName[standardName];
	if (ownIriRule === undefined) {
		return factsRowHtmlOf("Standard's IRI", `<span class="count">not recorded for ${escapedHtmlOf(standardName)}</span>`);
	}
	const ownIri = Object.keys(OWN_IRI_READER_BY_RULE_NAME).filter((ruleName) => ownIriRule[ruleName] !== undefined).map((ruleName) => OWN_IRI_READER_BY_RULE_NAME[ruleName]({ ruleText: ownIriRule[ruleName], node })).find((readIri) => readIri !== undefined);
	const statusText = ownIriRule.statusPropertyName === undefined ? undefined : firstValueOf(node.properties, ownIriRule.statusPropertyName);
	return [
		factsRowHtmlOf("Standard's IRI", ownIri === undefined ? '<span class="count">this node carries none</span>' : linkHtmlOf(ownIri)),
		statusText === undefined ? '' : factsRowHtmlOf("Standard's status", escapedHtmlOf(statusText)),
	].join('');
};

// the parent is shown only where it is the element's one holder: an element held by several (a CTDL property on 53 classes) has no single parent, and Used on says where
const parentIsSingleOwnerOf = ({ answerBody, humanPageFacts }) => humanPageFacts.factsAbsentName === undefined
	&& (humanPageFacts.usedOnCount === 0 || (humanPageFacts.usedOnCount === 1 && humanPageFacts.usedOnList[0].uri === answerBody.parent));

const elementHeadHtmlOf = ({ answerBody, humanPageFacts, linkHtmlOf, jsonHref }) => {
	const { node, partByName } = answerBody;
	const nameText = firstValueOf(node.properties, 'name') || partByName.elementStableId;
	return [
		`<p class="overline">EDUcore URI · element</p>`,
		`<h1>${escapedHtmlOf(nameText)}</h1>`,
		answerBody.definitionText ? `<p class="definition">${escapedHtmlOf(answerBody.definitionText)}</p>` : '',
		`<div class="chip-row"><span class="chip">${escapedHtmlOf(partByName.standardName)}</span><span class="chip">${escapedHtmlOf(partByName.standardVersion)}</span><span class="chip">${escapedHtmlOf(elementKindTextOf(node.labels))}</span></div>`,
		citeHtmlOf(answerBody.element),
		`<div class="card"><dl class="facts">`,
		factsRowHtmlOf('Identifier', `<code>${escapedHtmlOf(node.stableId)}</code>`),
		ownIriRowsHtmlOf({ standardName: partByName.standardName, node, linkHtmlOf }),
		answerBody.parent && parentIsSingleOwnerOf({ answerBody, humanPageFacts }) ? factsRowHtmlOf('Parent', linkHtmlOf(answerBody.parent, humanPageFacts.usedOnCount === 1 ? humanPageFacts.usedOnList[0].label : answerBody.parent)) : '',
		answerBody.schemaBlock ? factsRowHtmlOf('Source text', linkHtmlOf(answerBody.schemaBlock, 'the schema block this element was read from')) : '',
		`</dl></div>`,
		jsonLinkHtmlOf(jsonHref),
	].join('');
};

const usedOnSectionHtmlOf = ({ humanPageFacts, linkHtmlOf }) => {
	if (humanPageFacts.factsAbsentName !== undefined) {
		return detailsHtmlOf({ summaryText: 'Used on', innerHtml: factsAbsentHtmlOf(humanPageFacts.factsAbsentName) });
	}
	const { usedOnList, usedOnCount } = humanPageFacts;
	const innerHtml = usedOnCount === 0
		? '<p class="note">No class or option set in this standard holds this element.</p>'
		: `<ul class="rows">${usedOnList.map((onePart) => `<li>${onePart.uri === undefined ? `${escapedHtmlOf(onePart.label)} <span class="count">(no URI: ${escapedHtmlOf(onePart.uriAbsentReason)})</span>` : linkHtmlOf(onePart.uri, onePart.label)}</li>`).join('')}</ul>`;
	return detailsHtmlOf({ summaryText: 'Used on', countText: shownCountTextOf({ listedCount: usedOnList.length, heldCount: usedOnCount }), innerHtml });
};

const meaningSectionHtmlOf = ({ humanPageFacts, linkHtmlOf }) => {
	if (humanPageFacts.factsAbsentName !== undefined) {
		return detailsHtmlOf({ summaryText: 'Meanings it takes part in', innerHtml: factsAbsentHtmlOf(humanPageFacts.factsAbsentName) });
	}
	const { meaningAsPartList, meaningAsPartCount, meaningMappedList, meaningMappedCount } = humanPageFacts;
	const asPartHtml = meaningAsPartCount === 0 ? '' : `<h2>Names it as part of the card's tuple <span class="count">${escapedHtmlOf(shownCountTextOf({ listedCount: meaningAsPartList.length, heldCount: meaningAsPartCount }))}</span></h2>`
		+ `<ul class="rows">${meaningAsPartList.map((cardRow) => cardRowHtmlOf({ cardRow, linkHtmlOf, joinText: `as its ${cardRow.slotName}` })).join('')}</ul>`;
	const mappedHtml = meaningMappedCount === 0 ? '' : `<h2>Mapped to <span class="count">${escapedHtmlOf(shownCountTextOf({ listedCount: meaningMappedList.length, heldCount: meaningMappedCount }))}</span></h2>`
		+ `<ul class="rows">${meaningMappedList.map((cardRow) => cardRowHtmlOf({ cardRow, linkHtmlOf, joinText: [cardRow.relationType, cardRow.matchBasis, cardRow.mappingConfidence === undefined || cardRow.mappingConfidence === null ? undefined : `confidence ${cardRow.mappingConfidence}`].filter(Boolean).join(' · ') })).join('')}</ul>`;
	const innerHtml = asPartHtml === '' && mappedHtml === '' ? '<p class="note">No hub card names this element or is mapped from it.</p>' : `${asPartHtml}${mappedHtml}`;
	return detailsHtmlOf({ summaryText: 'Meanings it takes part in', countText: String(meaningAsPartCount + meaningMappedCount), innerHtml });
};

// the layers that interpret this element, by layer; shown only when the answer has them
const whatMapsHereSectionHtmlOf = ({ answerBody, linkHtmlOf }) => {
	const interpretationList = answerBody.interpretationList || [];
	if (interpretationList.length === 0) {
		return '';
	}
	const rowHtml = interpretationList.map((oneInterpretation) => `<li><strong>${escapedHtmlOf(oneInterpretation.layerKey)}</strong> ${escapedHtmlOf(oneInterpretation.versionTag)}`
		+ `<span class="row-meta">${escapedHtmlOf(oneInterpretation.registrationStatus)} · ${linkHtmlOf(oneInterpretation.pinned, 'this version')} · ${linkHtmlOf(oneInterpretation.floating, 'latest')}</span></li>`).join('');
	return detailsHtmlOf({ summaryText: 'What maps here', countText: `${interpretationList.length} layer versions`, innerHtml: `<p class="note">The mapping layers that interpret this element, each version citable.</p><ul class="rows">${rowHtml}</ul>` });
};

const propertyListHtmlOf = ({ propertyNameList, propertyByName, linkHtmlOf }) => `<dl class="facts">${propertyNameList.map((propertyName) => {
	const valueList = Array.isArray(propertyByName[propertyName]) ? propertyByName[propertyName] : [propertyByName[propertyName]];
	return factsRowHtmlOf(propertyName, valueList.map((oneValue) => (typeof oneValue === 'string' && ABSOLUTE_URI_PATTERN.test(oneValue) ? linkHtmlOf(oneValue) : `<span class="mono">${escapedHtmlOf(typeof oneValue === 'string' ? oneValue : JSON.stringify(oneValue))}</span>`)).join('<br>'));
}).join('')}</dl>`;

// the node's properties, split by humanPageRules into what the standard wrote and what EDUcore added; a standard with no split is shown unsplit, by name
const propertySectionHtmlOf = ({ answerBody, linkHtmlOf }) => {
	const { node, partByName } = answerBody;
	const shownNameList = Object.keys(node.properties).filter((propertyName) => !humanPageRules.propertyNameNotShownList.includes(propertyName));
	const walkName = humanPageRules.propertyProvenanceByStandardName[partByName.standardName];
	if (walkName === undefined) {
		return detailsHtmlOf({
			summaryText: 'Properties (unsplit)',
			countText: String(shownNameList.length),
			innerHtml: `<p class="note">Unsplit: which of these ${escapedHtmlOf(partByName.standardName)} wrote and which EDUcore added is not yet derived from its forge.</p>${propertyListHtmlOf({ propertyNameList: shownNameList, propertyByName: node.properties, linkHtmlOf })}`,
		});
	}
	const { sourcePropertyNameList, addedPropertyNameList, sourceNoteText } = humanPageRules.propertyProvenanceByWalkName[walkName];
	const sourceNameList = shownNameList.filter((propertyName) => sourcePropertyNameList.includes(propertyName));
	const addedNameList = shownNameList.filter((propertyName) => addedPropertyNameList.includes(propertyName));
	const unclassifiedNameList = shownNameList.filter((propertyName) => !sourcePropertyNameList.includes(propertyName) && !addedPropertyNameList.includes(propertyName));
	return [
		detailsHtmlOf({ summaryText: 'From the standard', countText: String(sourceNameList.length), innerHtml: `<p class="note">${escapedHtmlOf(sourceNoteText)}</p>${propertyListHtmlOf({ propertyNameList: sourceNameList, propertyByName: node.properties, linkHtmlOf })}` }),
		detailsHtmlOf({ summaryText: 'Added by EDUcore', countText: String(addedNameList.length), innerHtml: propertyListHtmlOf({ propertyNameList: addedNameList, propertyByName: node.properties, linkHtmlOf }) }),
		unclassifiedNameList.length === 0 ? '' : detailsHtmlOf({ summaryText: 'Not classified', countText: String(unclassifiedNameList.length), innerHtml: `<p class="note">The split names none of these.</p>${propertyListHtmlOf({ propertyNameList: unclassifiedNameList, propertyByName: node.properties, linkHtmlOf })}` }),
	].join('');
};

const elementMainHtmlOf = (pageParts) => [
	elementHeadHtmlOf(pageParts),
	usedOnSectionHtmlOf(pageParts),
	meaningSectionHtmlOf(pageParts),
	whatMapsHereSectionHtmlOf(pageParts),
	propertySectionHtmlOf(pageParts),
	jsonDetailsHtmlOf(pageParts.answerBody),
].join('\n');

// ================================================================================
// THE MEANING PAGE

const SLOT_NAME_LIST = hubCardTupleRules.slotList.map((oneSlot) => oneSlot.slotName);

const meaningHeadHtmlOf = ({ answerBody, humanPageFacts, jsonHref }) => {
	const bracketText = humanPageFacts.tupleBracketText || `[tuple not read: ${humanPageFacts.factsAbsentName}]`;
	return [
		`<p class="overline">EDUcore URI · meaning</p>`,
		`<h1>${escapedHtmlOf(answerBody.label)}</h1>`,
		`<div class="chip-row"><span class="chip bracket">${escapedHtmlOf(bracketText)}</span><span class="chip">${escapedHtmlOf(answerBody.hubName)} hub</span><span class="chip">${escapedHtmlOf(answerBody.hubVersion)}</span>${answerBody.referenceTier ? `<span class="chip">${escapedHtmlOf(answerBody.referenceTier)} card</span>` : ''}</div>`,
		answerBody.definition ? `<p class="definition">${escapedHtmlOf(answerBody.definition)}</p>` : '',
		citeHtmlOf(answerBody.meaning),
		jsonLinkHtmlOf(jsonHref),
	].join('');
};

const tuplePartsHtmlOf = ({ humanPageFacts, linkHtmlOf }) => {
	if (humanPageFacts.factsAbsentName !== undefined) {
		return `<div class="card"><h2>What this meaning names</h2>${factsAbsentHtmlOf(humanPageFacts.factsAbsentName)}</div>`;
	}
	if (humanPageFacts.tuple === undefined) {
		return `<div class="card"><h2>What this meaning names</h2><p class="note">No citable tuple: <code>${escapedHtmlOf(humanPageFacts.tupleAbsentName)}</code>.</p></div>`;
	}
	const partRowHtml = SLOT_NAME_LIST.filter((slotName) => humanPageFacts.tuple[slotName]).map((slotName) => partRowHtmlOf({ slotName, part: humanPageFacts.tuple[slotName], linkHtmlOf })).join('');
	return `<div class="card"><h2>What this meaning names</h2><ul class="rows">${partRowHtml}</ul></div>`;
};

const rangeSectionHtmlOf = ({ answerBody, humanPageFacts, linkHtmlOf }) => {
	const rangeList = answerBody.rangeList || [];
	const rangeDatatypeList = answerBody.rangeDatatypeList || [];
	if (answerBody.rangeListAbsentName !== undefined) {
		return detailsHtmlOf({ summaryText: 'Ranges', innerHtml: `<p class="note">No range list: <code>${escapedHtmlOf(answerBody.rangeListAbsentName)}</code>.</p>` });
	}
	const describedNote = humanPageFacts.rangeIsIdentity === false ? `<p class="note">This hub describes its ranges: they say what the property may point to, and are not part of what the card names.</p>` : '';
	const datatypeHtml = rangeDatatypeList.length === 0 ? '' : `<h2>Datatype</h2><p>${rangeDatatypeList.map((datatypeText) => `<code>${escapedHtmlOf(datatypeText)}</code>`).join(' ')}</p>`;
	const partHtml = rangeList.length === 0 ? '' : `<ul class="rows">${rangeList.map((part) => partRowHtmlOf({ part, linkHtmlOf })).join('')}</ul>`;
	return detailsHtmlOf({ summaryText: 'Ranges', countText: String(rangeList.length + rangeDatatypeList.length), innerHtml: `${describedNote}${partHtml}${datatypeHtml}` });
};

const mappedElementSectionHtmlOf = ({ answerBody, linkHtmlOf }) => {
	const mappedElementList = answerBody.mappedElementList || [];
	if (mappedElementList.length === 0) {
		return detailsHtmlOf({ summaryText: 'Elements mapped to this meaning', countText: '0', innerHtml: '<p class="note">No element of any standard is mapped to this meaning in the manifests that hold it.</p>' });
	}
	const rowHtml = mappedElementList.map((oneMapped) => `<li>${linkHtmlOf(oneMapped.element, oneMapped.name)}<span class="row-meta">${escapedHtmlOf(oneMapped.standardName)} · ${escapedHtmlOf(oneMapped.relationType)} · ${linkHtmlOf(oneMapped.layerVersion, 'layer')}</span></li>`).join('');
	const pagerHtml = answerBody.pageCount > 1
		? `<p class="note">Page ${escapedHtmlOf(answerBody.pageNumber)} of ${escapedHtmlOf(answerBody.pageCount)}${answerBody.previous ? ` · ${linkHtmlOf(answerBody.previous, 'previous')}` : ''}${answerBody.next ? ` · ${linkHtmlOf(answerBody.next, 'next')}` : ''}</p>`
		: '';
	return detailsHtmlOf({ summaryText: 'Elements mapped to this meaning', countText: `${answerBody.distinctElementCount} elements`, innerHtml: `<ul class="rows">${rowHtml}</ul>${pagerHtml}` });
};

const manifestSectionHtmlOf = ({ answerBody, linkHtmlOf }) => {
	const manifestList = answerBody.manifestList || [];
	if (manifestList.length === 0) {
		return '';
	}
	// the status date reads as a date on the page (TQ, 2026-11-09); the JSON keeps the full timestamp
	const statusDateOf = (changedAt) => String(changedAt || '').slice(0, 10);
	const rowHtml = manifestList.map((oneManifest) => `<li>${linkHtmlOf(oneManifest.manifest, oneManifest.publicLabel)}<span class="row-meta">${escapedHtmlOf(oneManifest.latestStatus ? `${oneManifest.latestStatus.registrationStatus} since ${statusDateOf(oneManifest.latestStatus.changedAt)}` : '')}</span></li>`).join('');
	return detailsHtmlOf({ summaryText: 'Published in', countText: `${manifestList.length} releases`, innerHtml: `<p class="note">The EDUcore releases (manifests) this meaning appears in.</p><ul class="rows">${rowHtml}</ul>` });
};

const meaningMainHtmlOf = (pageParts) => [
	meaningHeadHtmlOf(pageParts),
	tuplePartsHtmlOf(pageParts),
	rangeSectionHtmlOf(pageParts),
	mappedElementSectionHtmlOf(pageParts),
	manifestSectionHtmlOf(pageParts),
	jsonDetailsHtmlOf(pageParts.answerBody),
].join('\n');

// ================================================================================
// DISPATCH (data: one main renderer and one title per kind; humanPageRules lists the kinds)

const PAGE_BY_KIND = Object.freeze({
	element: { mainHtmlOf: elementMainHtmlOf, titleTextOf: ({ answerBody }) => `${firstValueOf(answerBody.node.properties, 'name') || answerBody.partByName.elementStableId} · ${answerBody.partByName.standardName} · EDUcore` },
	meaning: { mainHtmlOf: meaningMainHtmlOf, titleTextOf: ({ answerBody }) => `${answerBody.label} · ${answerBody.hubName} meaning · EDUcore` },
});
const undeclaredKindList = humanPageRules.humanPageKindList.filter((kindName) => PAGE_BY_KIND[kindName] === undefined);
if (undeclaredKindList.length) {
	throw new Error(`humanPage: humanPageRules lists ${undeclaredKindList.join(', ')}, which has no page here`);
}

const humanPageFor = ({ answerBody, humanPageFacts, requestPath, publicPathPrefix, baseIri }) => {
	const page = PAGE_BY_KIND[answerBody.kind];
	const jsonHref = jsonHrefOf({ requestPath, publicPathPrefix });
	const pageParts = { answerBody, humanPageFacts, jsonHref, ...linkContextOf({ publicPathPrefix, baseIri }) };
	return pageChromeFor({ titleText: page.titleTextOf(pageParts), jsonHref, mainHtml: page.mainHtmlOf(pageParts) });
};

module.exports = { humanPageFor, pageChromeFor, jsonHtmlOf, jsonHrefOf, escapedHtmlOf };
