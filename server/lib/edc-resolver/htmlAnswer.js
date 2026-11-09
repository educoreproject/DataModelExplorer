#!/usr/bin/env node
'use strict';

// htmlAnswer — how one resolver answer becomes bytes, per the format the request negotiated (edcResolverEndpoint-110226, briefing section 3).
//   answerTextFor({ answerFormat, httpStatus, answerBody, edcIri, publicPathPrefix, baseIri, requestPath, humanPageFacts }) → the response text
//   CONTENT_TYPE_BY_FORMAT, HUMAN_PAGE_KIND_LIST
// json is the stub's exact bytes, and reads nothing but the body. html is a server-rendered page in the educore.dev site's look (WORKORDER-edcHumanPages-110926):
//   - an element or meaning answered 200 with its graph facts gets its human page (humanPage.js); humanPageFacts is what humanPageFacts.js read, absent by name or not
//   - every other answer keeps the plain page it had: the kind and IRI as the title, the status, a link for every string value that begins with baseIri (rewritten under
//     publicPathPrefix, so it resolves here today), and the pretty JSON
// Every html page carries a JSON link and a <link rel="alternate" type="application/json">, both to requestPath with format=json added. EVERY value is escaped.

const humanPageRules = require('./humanPageRules.json');
const { humanPageFor, jsonHrefOf, escapedHtmlOf } = require('./humanPage');

const CONTENT_TYPE_BY_FORMAT = Object.freeze({
	json: 'application/json; charset=utf-8',
	html: 'text/html; charset=utf-8',
});
const HUMAN_PAGE_KIND_LIST = Object.freeze(humanPageRules.humanPageKindList.slice());

// every string value in the body that begins with baseIri, once each, in first-seen order
const baseIriValueListOf = ({ answerBody, baseIri }) => {
	const foundSet = new Set();
	const visitList = [answerBody];
	while (visitList.length > 0) {
		const visited = visitList.shift();
		if (typeof visited === 'string' && visited.indexOf(baseIri) === 0) {
			foundSet.add(visited);
		} else if (visited !== null && typeof visited === 'object') {
			visitList.unshift(...Object.values(visited));
		}
	}
	return Array.from(foundSet);
};

// the page every other kind keeps (unchanged but for its two pointers to the JSON)
const plainPageFor = ({ httpStatus, answerBody, edcIri, publicPathPrefix, baseIri, jsonHref }) => {
	const titleText = `${answerBody.kind || 'edc: answer'}: ${edcIri || ''}`;
	const canLink = typeof baseIri === 'string' && typeof publicPathPrefix === 'string';
	const linkItemList = canLink
		? baseIriValueListOf({ answerBody, baseIri }).map((oneIri) => `<li><a href="${escapedHtmlOf(`${publicPathPrefix}${oneIri.slice(baseIri.length)}`)}">${escapedHtmlOf(oneIri)}</a></li>`)
		: [];
	const errorSection = answerBody.error === undefined ? '' : `<p class="refusal">${escapedHtmlOf(answerBody.error)}</p>`;
	return [
		'<!doctype html>',
		'<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">',
		`<title>${escapedHtmlOf(titleText)}</title>`,
		jsonHref === undefined ? '' : `<link rel="alternate" type="application/json" href="${escapedHtmlOf(jsonHref)}">`,
		'<style>body{font:15px/1.5 system-ui,sans-serif;margin:2rem auto;max-width:60rem;padding:0 1rem;color:#222;background:#fff}h1{font-size:1.15rem;overflow-wrap:anywhere}pre{background:#f5f5f2;padding:1rem;overflow-x:auto;font-size:13px}.status{font-weight:600}.refusal{color:#8a1c1c}li{overflow-wrap:anywhere}</style>',
		'</head><body>',
		`<h1>${escapedHtmlOf(titleText)}</h1>`,
		`<p class="status">HTTP ${escapedHtmlOf(httpStatus)}</p>`,
		errorSection,
		jsonHref === undefined ? '' : `<p><a href="${escapedHtmlOf(jsonHref)}">JSON</a></p>`,
		linkItemList.length ? `<ul>${linkItemList.join('')}</ul>` : '',
		`<pre>${escapedHtmlOf(JSON.stringify(answerBody, null, 2))}</pre>`,
		'</body></html>',
		'',
	].join('\n');
};

// the request as the resolver takes it: a path beginning '/', or a whole URI beginning baseIri (resolveInProcess and the child accept both), read as its path
const requestPathOf = ({ requestPath, baseIri }) => (typeof requestPath === 'string' && typeof baseIri === 'string' && requestPath.indexOf(baseIri) === 0 ? `/${requestPath.slice(baseIri.length)}` : requestPath);

// the human page needs its facts (absent by name is still facts), a 200 and a listed kind; anything else is the plain page
const htmlPageFor = (answerParts) => {
	const { httpStatus, answerBody, humanPageFacts, publicPathPrefix } = answerParts;
	const requestPath = requestPathOf(answerParts);
	if (typeof requestPath !== 'string' || requestPath.charAt(0) !== '/') {
		throw new Error(`htmlAnswer: an html page needs the request path, a path beginning '/' or a URI beginning the scheme's baseIri, for its JSON link (got ${JSON.stringify(answerParts.requestPath)})`);
	}
	const jsonHref = typeof publicPathPrefix === 'string' ? jsonHrefOf({ requestPath, publicPathPrefix }) : undefined;
	const isHumanPage = httpStatus === 200 && humanPageFacts !== undefined && humanPageFacts !== null && HUMAN_PAGE_KIND_LIST.includes(answerBody.kind);
	return isHumanPage ? humanPageFor({ ...answerParts, requestPath }) : plainPageFor({ ...answerParts, jsonHref });
};

const ANSWER_TEXT_BY_FORMAT = Object.freeze({
	json: ({ answerBody }) => `${JSON.stringify(answerBody, null, 2)}\n`,
	html: htmlPageFor,
});

const answerTextFor = ({ answerFormat, ...answerParts }) => ANSWER_TEXT_BY_FORMAT[answerFormat](answerParts);

module.exports = { answerTextFor, CONTENT_TYPE_BY_FORMAT, HUMAN_PAGE_KIND_LIST };
