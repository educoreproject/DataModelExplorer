// @concept: [[DataModelExplorer]]
// sharedWalkPath — ⟪meaningsClarity review N4⟫ THE ONE ?path= CODEC and the Meanings explorer's route, for both the explorer (explorerVocabulary.js re-exports them) and
// the server's /edc pages (humanPage.js loads this ES module with require(), as it loads sharedWording.js), so a link into the walk is made one way everywhere.
// A stableId may itself hold ',' (42 Ed-Fi code values do) or '%', so each id writes those two as %2C and %25 before joining; the router's own encoding sits on top
// and is undone by the router, so reading splits on ',' and then restores the two (explorerVocabulary's pathStableIdListOf).

export const pathTextOf = (pathStableIdList) => pathStableIdList.map((oneStableId) => oneStableId.replace(/%/g, '%25').replace(/,/g, '%2C')).join(',');

export const MEANINGS_ROUTE_PATH = '/explore/meanings';

// a link into the Meanings explorer as an href (a page with no router, the /edc page): the route, and the path text encoded as the router would
export const meaningsHrefOf = (pathStableIdList) => `${MEANINGS_ROUTE_PATH}?path=${encodeURIComponent(pathTextOf(pathStableIdList))}`;
