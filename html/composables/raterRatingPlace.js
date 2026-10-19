// raterRatingPlace — where a rater is in the survey, carried as a URL query between /rater/rate and
// /rater/instructions (revision 18, TQ 2026-10-19 on the old "Back to rating", which always went to item 1: "this is
// bad. Can you fix it?"). The rate page reads ?item=N, and in "left undone" mode also &set=undone&items=3-7-12
// (pages/rater/rate.vue). The instructions page is opened with that same query and hands it back on "Back to rating".
//
// The instructions page trusts nothing it is given: ratingPlaceQueryOf accepts only the three names below, an item
// number written as the rate page writes it, within the rater's item count, and a well-formed left-undone set. Anything
// else is refused as a whole (null), and the page's Back links go to plain /rater/rate as they did before revision 18.

export const RATING_PAGE_PATH = '/rater/rate';
export const INSTRUCTIONS_PAGE_PATH = '/rater/instructions';
export const UNDONE_SET_NAME = 'undone';
export const ITEM_NUMBER_LIST_PATTERN = /^[1-9][0-9]*(-[1-9][0-9]*)*$/;

const ITEM_NUMBER_PATTERN = /^[1-9][0-9]*$/;
const RATING_PLACE_QUERY_NAME_LIST = Object.freeze(['item', 'set', 'items']);

// the query that names a place: { item } or { item, set, items }, all strings as the URL carries them
export const ratingPlaceQueryFrom = ({ itemNumber, undoneSetItemNumberList }) => {
	if (!undoneSetItemNumberList) {
		return { item: `${itemNumber}` };
	}
	return { item: `${itemNumber}`, set: UNDONE_SET_NAME, items: undoneSetItemNumberList.join('-') };
};

// a route query read back into a place query, or null when it names no place this rater can be at
export const ratingPlaceQueryOf = ({ routeQuery, itemCount }) => {
	const queryNameList = Object.keys(routeQuery);
	if (!Number.isInteger(itemCount) || itemCount < 1 || queryNameList.length === 0 || !queryNameList.every((queryName) => RATING_PLACE_QUERY_NAME_LIST.includes(queryName))) {
		return null;
	}
	const { item: itemText, set: setName, items: itemNumberText } = routeQuery;
	const isItemNumberInRange = (numberText) => ITEM_NUMBER_PATTERN.test(numberText) && Number(numberText) <= itemCount;
	if (typeof itemText !== 'string' || !isItemNumberInRange(itemText)) {
		return null;
	}
	if (setName === undefined && itemNumberText === undefined) {
		return { item: itemText };
	}
	if (setName !== UNDONE_SET_NAME || typeof itemNumberText !== 'string' || !ITEM_NUMBER_LIST_PATTERN.test(itemNumberText) || !itemNumberText.split('-').every(isItemNumberInRange)) {
		return null;
	}
	return { item: itemText, set: setName, items: itemNumberText };
};

// where "Back to rating" goes: the place, or plain /rater/rate when there is none
export const ratingRouteOf = (ratingPlaceQuery) => (ratingPlaceQuery ? { path: RATING_PAGE_PATH, query: ratingPlaceQuery } : RATING_PAGE_PATH);

// where "How to rate" and "Instructions" go from a rating item
export const instructionsRouteOf = (ratingPlaceQuery) => (ratingPlaceQuery ? { path: INSTRUCTIONS_PAGE_PATH, query: ratingPlaceQuery } : INSTRUCTIONS_PAGE_PATH);
