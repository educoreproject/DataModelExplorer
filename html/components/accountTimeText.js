// accountTimeText.js — one way to show an account time on the approval pages (WORKORDER-approvalLooseEnds-112126 L1):
// in the viewer's own local time. Used by the /admin Pending approvals tool and the approval page.
//
//   localTimeTextOf(timestampText) -> the time in the browser's locale and zone, or accountVocabulary.timeAbsentText
//
// The server sends two forms. users.createdAt is SQLite's CURRENT_TIMESTAMP, UTC written WITHOUT a zone
// ('2026-11-21 19:24:59'); read bare, a browser would take it as local time, so it is read as UTC here. A decision's
// decidedAt is an ISO time with its zone ('2026-11-21T17:30:31.993Z'). An absent time is the vocabulary's named blank,
// never "Invalid Date"; a time in neither form is shown exactly as the server sent it rather than guessed at.

import { accountVocabulary } from './accountVocabulary.js';

const SQLITE_UTC_TIMESTAMP_PATTERN = /^(\d{4}-\d\d-\d\d) (\d\d:\d\d:\d\d)$/;
const ISO_ZONED_TIMESTAMP_PATTERN = /^\d{4}-\d\d-\d\dT\d\d:\d\d(:\d\d(\.\d+)?)?(Z|[+-]\d\d:\d\d)$/;

export const localTimeTextOf = (timestampText) => {
	if (timestampText === undefined || timestampText === null || !String(timestampText).trim()) {
		return accountVocabulary.timeAbsentText;
	}
	const trimmedText = String(timestampText).trim();
	const sqliteMatch = trimmedText.match(SQLITE_UTC_TIMESTAMP_PATTERN);
	const readableText = sqliteMatch ? `${sqliteMatch[1]}T${sqliteMatch[2]}Z` : ISO_ZONED_TIMESTAMP_PATTERN.test(trimmedText) ? trimmedText : '';
	const readDate = readableText ? new Date(readableText) : null;
	return readDate && !Number.isNaN(readDate.getTime()) ? readDate.toLocaleString() : trimmedText;
};
