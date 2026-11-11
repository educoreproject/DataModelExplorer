// ROSETTA PAGE SETTINGS — the Rosetta page's numbers, as data (TQ's rule: every number from config). Each is checked here when the page loads; a bad one throws by name.
//   meaningReadsPerPageLimit  ⟪rosettaReportLegible, ROMANTIC_PARASOL⟫ the Meanings answers (POST /api/standards-neighbourhood) one shown report page may ask, for its
//                             proposed meanings' expressed-in counts. A fetch page is 10 fields (standardsQueryOperations.json, rosettaFetch) against two hubs today,
//                             so 20 reads every meaning a page can propose; past it a meaning says the limit instead of its count.

export const rosettaPageSettings = Object.freeze({
	meaningReadsPerPageLimit: 20,
});

if (!Number.isInteger(rosettaPageSettings.meaningReadsPerPageLimit) || rosettaPageSettings.meaningReadsPerPageLimit < 1) {
	throw new Error(`rosettaPageSettings: meaningReadsPerPageLimit must be a whole number above 0 (got ${JSON.stringify(rosettaPageSettings.meaningReadsPerPageLimit)})`);
}
