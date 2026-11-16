// ROSETTA PAGE SETTINGS — the Rosetta page's numbers and file names, as data (TQ's rule: every number from config). Each is checked here when the page loads; a bad one
// throws by name.
//   meaningReadsPerPageLimit  ⟪rosettaReportLegible, ROMANTIC_PARASOL⟫ the Meanings answers (POST /api/standards-neighbourhood) one shown report page may ask, for its
//                             proposed meanings' expressed-in counts. A fetch page is 10 fields (standardsQueryOperations.json, rosettaFetch) against two hubs today,
//                             so 20 reads every meaning a page can propose; past it a meaning says the limit instead of its count.
//   ⟪rosettaDownloadAll⟫ Download all: one zip, named by one Haiku call (composables/useAiFilename.js), holding one file a tab
//   downloadAllNameSnippetLength     the field names sent to be named from, cut to this many characters (the DME sends 500 of its answer)
//   downloadAllNameMaxLength         the model's name is cut to this many characters after it is cleaned
//   downloadAllNameDisallowedPattern the characters cleaned out of the model's name (it lands in a file name and in every entry of the zip)
//   downloadAllStandInNamePrefix,    the name used when the naming call fails, is capped, or answers nothing usable: the prefix and that many characters of the
//   downloadAllStandInJobRefIdLength  job's id. The button area says it is a stand-in, and why.
//   downloadAllFileSuffixByPart      each tab's file: base name + suffix
//   downloadAllDraftsFilePrefix,     each hub's draft: base name + prefix + the hub's name + extension
//   downloadAllDraftsFileExtension
//   downloadAllZipExtension          the zip: base name + extension

export const rosettaPageSettings = Object.freeze({
	meaningReadsPerPageLimit: 20,
	downloadAllNameSnippetLength: 500,
	downloadAllNameMaxLength: 40,
	downloadAllNameDisallowedPattern: /[^A-Za-z0-9_-]/g,
	downloadAllStandInNamePrefix: 'rosetta-',
	downloadAllStandInJobRefIdLength: 8,
	downloadAllFileSuffixByPart: Object.freeze({ fields: '_fields.txt', job: '_job.md', report: '_report.md', prompts: '_prompts.md' }),
	downloadAllDraftsFilePrefix: '_drafts_',
	downloadAllDraftsFileExtension: '.jsonld',
	downloadAllZipExtension: '.zip',
});

const WHOLE_NUMBER_SETTING_NAME_LIST = ['meaningReadsPerPageLimit', 'downloadAllNameSnippetLength', 'downloadAllNameMaxLength', 'downloadAllStandInJobRefIdLength'];
const TEXT_SETTING_NAME_LIST = ['downloadAllStandInNamePrefix', 'downloadAllDraftsFilePrefix', 'downloadAllDraftsFileExtension', 'downloadAllZipExtension'];
const FILE_PART_NAME_LIST = ['fields', 'job', 'report', 'prompts'];

WHOLE_NUMBER_SETTING_NAME_LIST.forEach((settingName) => {
	if (!Number.isInteger(rosettaPageSettings[settingName]) || rosettaPageSettings[settingName] < 1) {
		throw new Error(`rosettaPageSettings: ${settingName} must be a whole number above 0 (got ${JSON.stringify(rosettaPageSettings[settingName])})`);
	}
});
TEXT_SETTING_NAME_LIST.forEach((settingName) => {
	if (typeof rosettaPageSettings[settingName] !== 'string' || rosettaPageSettings[settingName] === '') {
		throw new Error(`rosettaPageSettings: ${settingName} must be text (got ${JSON.stringify(rosettaPageSettings[settingName])})`);
	}
});
FILE_PART_NAME_LIST.forEach((partName) => {
	if (typeof rosettaPageSettings.downloadAllFileSuffixByPart[partName] !== 'string' || rosettaPageSettings.downloadAllFileSuffixByPart[partName] === '') {
		throw new Error(`rosettaPageSettings: downloadAllFileSuffixByPart.${partName} must be text (got ${JSON.stringify(rosettaPageSettings.downloadAllFileSuffixByPart[partName])})`);
	}
});
if (!(rosettaPageSettings.downloadAllNameDisallowedPattern instanceof RegExp) || !rosettaPageSettings.downloadAllNameDisallowedPattern.global) {
	throw new Error('rosettaPageSettings: downloadAllNameDisallowedPattern must be a global regular expression');
}
