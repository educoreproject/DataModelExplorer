// @concept: [[DataModelExplorer]]
// sharedWording — THE ONE PLACE a template is filled, and a meaning's title and subtitle are chosen, for both the explorer (browser; explorerVocabulary.js re-exports
// wordingOf) and the server (the /edc pages, humanPage.js, and the meaning-facts reader, elementMeaningFacts.js, which load this ES module with require(), as the
// server already loads oidc-provider on Node >= 22.12). ⟪meaningsClarity, supervisor's ruling 3: "no duplication, even 4 lines"⟫ The words themselves are data:
// meaningFactsWording.json beside it, passed in, so this module imports nothing.
//
//   wordingOf(templateText, valueByName) → the template with each {name} filled; a name with no value is refused by name, never left blank
//   countTextOf(countValue, numberLocaleName) → "55,420": a count as the page writes numbers; a count that is no number is refused by name
//   meaningTitleTextOf({ meaningName, meaningFactsWording }) → "Meaning: Has Accessibility Feature Type"
//   meaningSubtitleTextOf({ referenceTier, hubName, domainName, meaningFactsWording }) → "a property in the CEDS domain Individualized Program Accessibility Feature";
//     a tier the words do not name, or a domain-naming tier with no domain name, says the tier as written

export const wordingOf = (templateText, valueByName) =>
	templateText.replace(/\{([A-Za-z]+)\}/g, (placeholderText, valueName) => {
		if (valueByName[valueName] === undefined || valueByName[valueName] === null) throw new Error(`sharedWording: wording '${templateText}' needs a value for '${valueName}'`);
		return String(valueByName[valueName]);
	});

// ⟪review N7⟫ both pages write a count the same way
export const countTextOf = (countValue, numberLocaleName) => {
	if (!Number.isFinite(countValue)) throw new Error(`sharedWording: a count must be a number (received ${JSON.stringify(countValue)})`);
	return new Intl.NumberFormat(numberLocaleName).format(countValue);
};

export const meaningTitleTextOf = ({ meaningName, meaningFactsWording }) => wordingOf(meaningFactsWording.meaningTitleTemplate, { meaningName });

export const meaningSubtitleTextOf = ({ referenceTier, hubName, domainName, meaningFactsWording }) => {
	const subtitleTemplate = meaningFactsWording.meaningSubtitleTemplateByTier[referenceTier];
	if (!subtitleTemplate || (subtitleTemplate.includes('{domainName}') && !domainName)) return referenceTier || '';
	return wordingOf(subtitleTemplate, { hubName, domainName });
};
