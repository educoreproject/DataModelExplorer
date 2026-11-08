// qualityReportText.js — the Certification page's text rules, pure so a node test can hold them (tests/qualityReport/).
//
// INLINE TEXT. The report's blocks carry inline **bold** and `code`, and nothing else (the generator's documentRenderer.js).
// inlineSegmentListOf reads them the way that renderer's HTML does (bold first, then code inside or outside it), into
// segments the page draws as text nodes, so no report text is ever inserted as HTML.
//   inlineSegmentListOf(text) -> [{ segmentText, isStrong, isCode }]
//
// DISPLAY. shortIdentityOf(hex) -> the first 12 characters (the full id is shown on hover); dayTextOf(iso) -> 'YYYY-MM-DD'
// (the date as written, never shifted to the viewer's time zone). Both refuse a value that is not what they read, by
// returning it marked rather than guessing.

const BOLD_PATTERN = /\*\*([^*]+)\*\*/g;
const CODE_PATTERN = /`([^`]+)`/g;

const splitByPattern = (text, pattern) => {
	const pieceList = [];
	let lastIndex = 0;
	for (const match of `${text}`.matchAll(pattern)) {
		if (match.index > lastIndex) pieceList.push({ pieceText: text.slice(lastIndex, match.index), isMatch: false });
		pieceList.push({ pieceText: match[1], isMatch: true });
		lastIndex = match.index + match[0].length;
	}
	if (lastIndex < `${text}`.length) pieceList.push({ pieceText: `${text}`.slice(lastIndex), isMatch: false });
	return pieceList;
};

export const inlineSegmentListOf = (inlineText) =>
	splitByPattern(`${inlineText}`, BOLD_PATTERN).flatMap((boldPiece) =>
		splitByPattern(boldPiece.pieceText, CODE_PATTERN).map((codePiece) => ({ segmentText: codePiece.pieceText, isStrong: boldPiece.isMatch, isCode: codePiece.isMatch })),
	);

const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/;
const ISO_DAY_PATTERN = /^(\d{4}-\d{2}-\d{2})T/;

export const shortIdentityOf = (identityHex) => (SHA256_HEX_PATTERN.test(`${identityHex}`) ? identityHex.slice(0, 12) : `(not an id: ${identityHex})`);

export const dayTextOf = (isoText) => {
	const match = ISO_DAY_PATTERN.exec(`${isoText}`);
	return match ? match[1] : `(not a date: ${isoText})`;
};
