#!/usr/bin/env node
'use strict';

// htmlAnswer — how one resolver answer becomes bytes, per the format the request negotiated (edcResolverEndpoint-110226, briefing section 3).
//   answerTextFor({ answerFormat, httpStatus, answerBody, edcIri, publicPathPrefix, baseIri }) → the response text
//   CONTENT_TYPE_BY_FORMAT
// json is the stub's exact bytes. html is a server-rendered page with no client script: the kind and IRI as the title, the status, a link for every
// string value that begins with baseIri (rewritten under publicPathPrefix, so it resolves here today), and the pretty JSON. EVERY value is escaped.

const CONTENT_TYPE_BY_FORMAT = Object.freeze({
	json: 'application/json; charset=utf-8',
	html: 'text/html; charset=utf-8',
});

const HTML_ESCAPE_BY_CHARACTER = Object.freeze({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' });
const escapedHtmlOf = (text) => String(text).replace(/[&<>"']/g, (oneCharacter) => HTML_ESCAPE_BY_CHARACTER[oneCharacter]);

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

const pageFor = ({ httpStatus, answerBody, edcIri, publicPathPrefix, baseIri }) => {
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
		'<style>body{font:15px/1.5 system-ui,sans-serif;margin:2rem auto;max-width:60rem;padding:0 1rem;color:#222;background:#fff}h1{font-size:1.15rem;overflow-wrap:anywhere}pre{background:#f5f5f2;padding:1rem;overflow-x:auto;font-size:13px}.status{font-weight:600}.refusal{color:#8a1c1c}li{overflow-wrap:anywhere}</style>',
		'</head><body>',
		`<h1>${escapedHtmlOf(titleText)}</h1>`,
		`<p class="status">HTTP ${escapedHtmlOf(httpStatus)}</p>`,
		errorSection,
		linkItemList.length ? `<ul>${linkItemList.join('')}</ul>` : '',
		`<pre>${escapedHtmlOf(JSON.stringify(answerBody, null, 2))}</pre>`,
		'</body></html>',
		'',
	].join('\n');
};

const ANSWER_TEXT_BY_FORMAT = Object.freeze({
	json: ({ answerBody }) => `${JSON.stringify(answerBody, null, 2)}\n`,
	html: pageFor,
});

const answerTextFor = ({ answerFormat, ...answerParts }) => ANSWER_TEXT_BY_FORMAT[answerFormat](answerParts);

module.exports = { answerTextFor, CONTENT_TYPE_BY_FORMAT };
