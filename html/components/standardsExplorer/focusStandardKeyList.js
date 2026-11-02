// @concept: [[DataModelExplorer]]
// @concept: [[CompanionPages]]
//
// THE FOCUS RULE: which standards the explorer's focus names. One function, called by every detail-panel section that
// shows things belonging to the standard in view (DownloadsSection.vue, CompanionPagesSection.vue), so no two sections
// can disagree about it (SPEC-companionPages-102826 gate G2.2). Moved here unchanged from DownloadsSection.vue.
//   the families catalog   no standard
//   a family               its standard when the family holds exactly one, else none
//   a release              the standards listed on this level (one per version)
//   anything else          the focus's own standardKey (a standard root, a class, a field, a hub element, a group)
//
//   standardKeyListOfFocus({ focusNode, levelRowList, standardKeyListOfFamily }) -> [standardKey, ...]
//     standardKeyListOfFamily(standardFamily) -> the family's standardKeys (the downloads manifest's getter of that name)

const standardKeyListByKind = {
	family: ({ focusNode, standardKeyListOfFamily }) => {
		const familyStandardKeyList = standardKeyListOfFamily(focusNode.standardFamily || '');
		return familyStandardKeyList.length === 1 ? familyStandardKeyList : [];
	},
	release: ({ levelRowList }) => [...new Set(levelRowList.filter((oneRow) => oneRow.kind === 'standard' && oneRow.standardKey).map((oneRow) => oneRow.standardKey))],
};

export const standardKeyListOfFocus = ({ focusNode, levelRowList, standardKeyListOfFamily }) => {
	if (!focusNode || focusNode.kind === 'familyCatalog') return [];
	const listOfKind = standardKeyListByKind[focusNode.kind];
	if (listOfKind) return listOfKind({ focusNode, levelRowList, standardKeyListOfFamily });
	return focusNode.standardKey ? [focusNode.standardKey] : [];
};
