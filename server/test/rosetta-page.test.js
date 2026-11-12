'use strict';
// rosetta-page.test.js — the Rosetta page's source, read as text (run in the browser on demo too). G4.5's half: a rationale, a field name or a prompt can be hostile,
// and Vue's {{ }} escapes it, so the page shows answers only that way. ⟪rosettaMeanings⟫ R1: the page shows no candidates (the API keeps them). R2: a Prompt tab,
// after Report and Drafts, shows each prompt by interpolation. R6: TQ's PII notice, verbatim, beside the Rosetta input and on the login page. No magic strings: no
// bare word between the page's tags; every word comes from rosettaVocabulary.
const fs = require('fs');
const path = require('path');

const HTML_PATH = path.join(__dirname, '..', '..', 'html');
const readHtmlFile = (relativePath) => fs.readFileSync(path.join(HTML_PATH, relativePath), 'utf8');
const pageText = readHtmlFile('pages/explore/rosetta.vue');
// the template section alone: from its first tag to its last close, so the style block's words are not read as the page's
const templateSectionOf = (fileText) => fileText.slice(fileText.indexOf('<template>'), fileText.lastIndexOf('</template>') + '</template>'.length);
const templateText = templateSectionOf(pageText);
const storeText = readHtmlFile('stores/rosettaStore.js');
const vocabularyText = readHtmlFile('components/rosetta/rosettaVocabulary.js');
const loginPageText = readHtmlFile('pages/login.vue');
const piiNoticeComponentText = readHtmlFile('components/siteNotice/PiiNotice.vue');
const siteNoticeVocabularyText = readHtmlFile('components/siteNotice/siteNoticeVocabulary.js');
const TQ_PII_NOTICE_TEXT = 'Do not enter personal information (PII) in any search or other input on this site. All queries and results are recorded and used to improve the site. They are never sold or shared, except with the AI services that process them, which are set to keep nothing.';

// the words between tags once every interpolation and every tag is gone: what is left must be no word at all
const bareWordListOf = (oneTemplateText) => oneTemplateText.replace(/<!--[\s\S]*?-->/g, ' ').replace(/\{\{[\s\S]*?\}\}/g, ' ').replace(/<(?:[^>"']|"[^"]*"|'[^']*')*>/g, ' ').split(/\s+/).filter((oneWord) => /[A-Za-z]/.test(oneWord));
const tabValueList = [...templateText.matchAll(/<v-tab value="([A-Za-z]+)"/g)].map((oneMatch) => oneMatch[1]);

const checkList = [
	['the template uses no v-html', !/v-html/.test(templateText)],
	['the page writes no HTML by hand', !/innerHTML|outerHTML|insertAdjacentHTML/.test(pageText)],
	// ⟪P7a⟫ a field's results are a resultList, each naming its hub: the page reads one through resultFor
	['the rationale is shown by interpolation', /\{\{ resultFor\(oneField, hubName\)\.judgesRationale \}\}/.test(templateText)],
	['the rationale is labelled as the judge\'s words', /\{\{ rosettaPageWords\.reportRationaleHeading \}\}/.test(templateText) && /reportRationaleHeading: 'The judge\\'s words'/.test(vocabularyText)],
	['the report reads requestName and resultList, never byHub or a field\'s bare name', !/byHub|oneField\.name\b/.test(templateText) && /\{\{ oneField\.requestName \}\}/.test(templateText)],
	// R1
	['R1: no Show candidates button, no Candidates tab', !/rosetta-show-candidates|showCandidates|value="pools"|retrievalAnswer/.test(pageText)],
	['R1: the store no longer calls retrieval', !/`\$\{ROUTE_BASE_PATH\}\/retrieval`|async retrieve\(|retrievalAnswer/.test(storeText)],
	['R1: no word of the page names candidates as a thing to show', !/Show candidates|Candidates need/.test(vocabularyText)],
	// R2
	['R2: the tabs are Your fields, Job, Report, Drafts, Prompt, in that order', JSON.stringify(tabValueList) === JSON.stringify(['submit', 'job', 'report', 'drafts', 'prompt'])],
	['R2: the Prompt tab shows each prompt by interpolation', /\{\{ onePrompt\.systemPrompt \}\}/.test(templateText) && /\{\{ onePrompt\.userPrompt \}\}/.test(templateText)],
	['R2: the store reads the prompts from rosetta/jobs/prompts', /`\$\{ROUTE_BASE_PATH\}\/jobs\/prompts`/.test(storeText)],
	// R3
	['R3: Ask for a judged draft is open to a visitor who is not signed in', /data-testid="rosetta-ask-draft"/.test(templateText) && !/:disabled="!loginStore\.validUser"/.test(templateText)],
	['R3: a job opens from its link', /route\.query\[JOB_LINK_QUERY_NAME\]/.test(pageText) && /store\.openJob\(/.test(pageText)],
	// R6
	['R6: the PII notice stands beside the Rosetta input', /<SiteNoticePiiNotice[^>]*\/>\s*<v-textarea/.test(templateText)],
	['R6: the PII notice stands on the login page', /<SiteNoticePiiNotice\s*\/>/.test(loginPageText)],
	['R6: on the login page the notice stands BELOW the login form (TQ, 2026-11-10)', /<form_login\s*\/>[\s\S]*<SiteNoticePiiNotice\s*\/>/.test(loginPageText)],
	['R6: the notice wears the theme primary (the logo blue), not the warning colour', /color="primary"/.test(piiNoticeComponentText) && !/type="warning"/.test(piiNoticeComponentText)],
	['R6: the notice shows TQ\'s words, verbatim, from the site notice vocabulary', siteNoticeVocabularyText.includes(`piiNoticeText: '${TQ_PII_NOTICE_TEXT}'`) && /\{\{ siteNoticeWords\.piiNoticeText \}\}/.test(piiNoticeComponentText)],
	// ⟪rosettaReportLegible⟫ gate 1: the Report tab, field by field, from rosettaReportBlocks; the summary below it
	['legible: the report draws one block per field from fieldBlockListOf, and the summary below it', /fieldBlockListOf\(/.test(pageText) && templateText.indexOf('data-testid="rosetta-field-block"') !== -1 && templateText.indexOf('data-testid="rosetta-field-block"') < templateText.indexOf('rosettaPageWords.reportSummaryHeading') && templateText.indexOf('rosettaPageWords.reportSummaryHeading') < templateText.indexOf('<v-table')],
	['legible: each block shows the rationale by interpolation', (templateText.match(/\{\{ oneHubBlock\.rationaleText \}\}/g) || []).length === 2],
	// ⟪rosettaLoginPolish⟫ a no-proposal block shows whyText (its status words and the job's stop, joined in rosettaReportBlocks)
	['legible: each block shows the meaning, its URI, its slots, strength, relation and expressed-in by interpolation', ['meaningName', 'meaningUri', 'strengthWords', 'strengthExplanation', 'relationText', 'expressedText', 'whyText'].every((fieldName) => templateText.includes(`{{ oneHubBlock.${fieldName} }}`)) && /\{\{ oneSlot\.uri \}\}/.test(templateText)],
	['legible: Open in Meanings is a real link to the Meanings explorer\'s own link', /<NuxtLink :to="oneHubBlock\.meaningsLink"[^>]*data-testid="rosetta-open-in-meanings"/.test(templateText)],
	// gate 1: progress, completion (TQ addendum 2b), the button (TQ's correction)
	['legible: the progress indicator stands above the tabs, shown by progressOf', /<div v-if="progress\.isShown"[^>]*data-testid="rosetta-progress">\s*<v-progress-linear indeterminate/.test(templateText) && templateText.indexOf('rosetta-progress') < templateText.indexOf('<v-tabs') && /progressOf\(\{ jobStatus: store\.jobStatus, busyStepName: store\.busyStepName, isStatusCheckFailed: store\.isStatusCheckFailed \}\)/.test(pageText)],
	['legible: an unfinished end says so', /v-if="progress\.endedText"[^>]*data-testid="rosetta-job-ended">\{\{ progress\.endedText \}\}/.test(templateText)],
	['legible: a finished job says to open the Report tab, and the tab is marked while the report is unseen', /<v-alert v-if="store\.reportUnseen"[^>]*data-testid="rosetta-report-ready"/.test(templateText) && /<v-badge v-if="store\.reportUnseen"/.test(templateText)],
	['legible: opening the Report tab marks the report seen', /watch\(activeTab, \(nextTabName\) => \{\s*if \(nextTabName === TAB_NAME\.report\) store\.markReportSeen\(\);/.test(pageText)],
	['legible: the job button\'s words come from askButtonWordsOf', /data-testid="rosetta-ask-draft" @click="askForDraft">\{\{ askButtonText \}\}/.test(templateText) && /askButtonWordsOf\(\{ review: store\.review \}\)/.test(pageText)],
	// ⟪review⟫ S1 the store remembers the open tab and the page reopens it; S2 a failed status check says so with a retry; S3 a failed count can be read again; N7 only an https href
	['review S1: the open tab is remembered by the store and opened again on a return to the same job', /store\.rememberTab\(nextTabName\)/.test(pageText) && /if \(store\.shownTabName\) activeTab\.value = store\.shownTabName;/.test(pageText)],
	['review S2: a failed status check shows its words and a retry', /v-if="progress\.checkFailedText"[^>]*data-testid="rosetta-status-check-failed"/.test(templateText) && /@click="store\.retryStatusCheck\(\)"/.test(templateText)],
	['review S3: a failed expressed-in read offers a retry', /v-if="oneHubBlock\.expressedReadFailed"[^>]*@click="store\.readExpressions\(\)"/.test(templateText)],
	['review N7: hrefs are the blocks\' https-only ones', /:href="oneHubBlock\.meaningHref"/.test(templateText) && /:href="oneSlot\.href"/.test(templateText) && !/:href="oneHubBlock\.meaningUri"|:href="oneSlot\.uri"/.test(templateText)],
	['review N4: the page declares no job status list of its own', !/\['queued', 'running', 'cancelling'\]/.test(pageText)],
	// no magic strings
	['no bare word between the page\'s tags: every word is from the vocabulary', bareWordListOf(templateText).length === 0, bareWordListOf(templateText).slice(0, 8).join(' ')],
	['no bare word in the PII notice component', bareWordListOf(templateSectionOf(piiNoticeComponentText)).length === 0],
];

const failedList = checkList.filter(([, isPassing]) => !isPassing);
checkList.forEach(([checkName, isPassing, detailText]) => console.log(`  ${isPassing ? 'PASS' : 'FAIL'}: ${checkName}${!isPassing && detailText ? ` — ${detailText}` : ''}`));
console.log(`rosetta-page: ${checkList.length - failedList.length} passed, ${failedList.length} failed`);
process.exit(failedList.length === 0 ? 0 : 1);
