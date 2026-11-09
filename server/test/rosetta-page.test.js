'use strict';
// rosetta-page.test.js — G4.5's page half: a rationale or a field name can be hostile, and Vue's {{ }} escapes it, so the page must show answers only that way. Reads the source; run in the browser on demo too.
const fs = require('fs');
const path = require('path');

const pageText = fs.readFileSync(path.join(__dirname, '..', '..', 'html', 'pages', 'explore', 'rosetta.vue'), 'utf8');
const templateText = pageText.slice(pageText.indexOf('<template>'));
const faultList = [
	/v-html/.test(templateText) ? 'the template uses v-html' : '',
	/innerHTML|outerHTML|insertAdjacentHTML/.test(pageText) ? 'the page writes HTML by hand' : '',
	// ⟪P7a⟫ a field's results are a resultList, each naming its hub: the page reads one through resultFor
	/judgesRationale/.test(templateText) && !/\{\{ resultFor\(oneField, hubName\)\.judgesRationale \}\}/.test(templateText) ? 'the rationale is not shown by interpolation' : '',
	/The judge's words/.test(templateText) ? '' : 'the rationale is not labelled as the judge\'s words',
	// ⟪P7b⟫ retrieval speaks fetch's words: the Candidates tab reads requestName and each resultList item's hub, never byHub or a field's bare name
	/byHub|oneField\.name\b/.test(templateText) || !/oneField\.resultList/.test(templateText) || !/\{\{ oneField\.requestName \}\}[\s\S]*\{\{ onePool\.hub \}\}/.test(templateText) ? 'the Candidates tab does not read requestName and resultList' : '',
].filter(Boolean);
faultList.forEach((oneFault) => console.log(`  FAIL: ${oneFault}`));
console.log(faultList.length === 0 ? '  PASS: the page shows every answer by interpolation, and labels the rationale\nrosetta-page: 1 passed, 0 failed' : `rosetta-page: 0 passed, ${faultList.length} failed`);
process.exit(faultList.length === 0 ? 0 : 1);
