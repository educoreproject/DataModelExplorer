'use strict';

// sampleReport.js — sample-report.md: everything a reader needs to check the draw by hand. Deterministic (no clock).
//
//   writeSampleReport({ reportFilePath, drawConfig, kindRuleRegistry, frameByStandard, exclusionReportListByStandard,
//                       drawReportByStandard, sampleDocument })

const fs = require('fs');

const tableOf = (headerList, rowList) =>
	[`| ${headerList.join(' | ')} |`, `|${headerList.map((headerText, position) => (position === 0 ? ':---' : '---:')).join('|')}|`, ...rowList.map((cellList) => `| ${cellList.join(' | ')} |`)].join('\n');

const exclusionLabelOf = (exclusion) => exclusion.edFiPath || exclusion.sifXpath || `${exclusion.pescSourceName} ${exclusion.elementName}`;

const writeSampleReport = ({ reportFilePath, drawConfig, kindRuleRegistry, frameByStandard, exclusionReportListByStandard, drawReportByStandard, sampleDocument }) => {
	const { standardNameList, kindNameList, surveyNameList } = drawConfig;
	const elementList = sampleDocument.elementList;
	const countWhere = (testFunction) => elementList.filter(testFunction).length;

	const sectionList = [
		'# CEDS Rater: sample report',
		'',
		`*Written by \`raterTool.js -buildSample\`. Gold: \`${sampleDocument.goldenContainerName}\`. Seed: \`${drawConfig.sampleSeedText}\`. The same gold and seed give a byte-identical sample.json.*`,
		'',
		'## 1. The frame rules',
		'',
		'- **Ed-Fi:** every `EdfiProperty` that references no other construct (a scalar, descriptor or enumeration property), owned by an entity: ' + `${drawConfig.edFiEntityOwnerTypeList.join(', ')}. Commons, inline commons and choices are reusable groups, not entities, and are left out. Each property is one element.`,
		`- **SIF (${drawConfig.sifSourceName}):** every field with no child field below it. Fields with identical name + definition + type count as one element (a question asked in many objects); its path is the lexically first member's xpath, and memberCount says how many fields it stands for.`,
		`- **PESC:** the latest release in the gold of each sub-standard (${drawConfig.pescLatestReleaseList.map((release) => release.sourceName).join(', ')}); every element declaration whose type is not a complex type. Declarations with identical name + definition + type count as one element, across the seven releases.`,
		'- **Owner:** Ed-Fi, the owning entity; SIF, the element directly above (a parent field carries a definition; SIF objects and containers are published without one); PESC, the owning complex type.',
		'- **No definition:** kept, with `definition: null` and `definitionAbsentReason` ("No definition published by <standard>"). Never replaced.',
		'- **Documentation URL:** `null` for every element: the gold carries no per-element documentation link for these standards, and none is invented.',
		'',
		'## 2. The kind rule',
		'',
		`Each element's kind is read from its standard's own type information (\`config/kindRuleRegistry.json\`). The tests run in this order and the first that matches decides: ${kindRuleRegistry.kindPrecedenceList.join(' → ')}.`,
		'',
		`- **identifier:** the name (a leading @ stripped) ends with \`${kindRuleRegistry.identifierNamePattern}\` (case-sensitive), or the type is an identifier type (Ed-Fi shared type IdentificationCode; SIF RefIdType, IdRefType, gRefIdType, gRefIdPointerType, LocalIdType, or any type ending IdType / RefIdPointerType).`,
		`- **indicator:** a boolean type, or an option set whose values (up to 4) are only ${kindRuleRegistry.indicatorOptionValueList.join(', ')}.`,
		'- **code:** an option set (Ed-Fi descriptor or enumeration, SIF codeset, PESC code list).',
		'- **dateTime:** Ed-Fi date, time, datetime, year; SIF date, dateTime, time, SchoolYearType, PartialDateType, gYear…; PESC an xsd date/time base type.',
		'- **number:** Ed-Fi integer, decimal, shared integer/decimal, currency, percent, duration; SIF and PESC the xsd numeric types (SIF also MonetaryAmountType).',
		'- **freeText:** anything else (strings, URIs, names, descriptions).',
		'',
		'## 3. Frame sizes',
		'',
		tableOf(['standard', 'declarations read', 'elements (after grouping)', 'excluded', 'frame drawn from'], standardNameList.map((standardName) => [
			standardName,
			frameByStandard[standardName].memberRowCount,
			frameByStandard[standardName].elementList.length,
			frameByStandard[standardName].elementList.length - drawReportByStandard[standardName].keptCount,
			drawReportByStandard[standardName].keptCount,
		])),
		'',
		'## 4. Kind counts in each frame (after exclusions) and the draw',
		'',
		tableOf(['standard', ...kindNameList.map((kindName) => `${kindName} frame / drawn`)], standardNameList.map((standardName) => [
			standardName,
			...kindNameList.map((kindName) => `${drawReportByStandard[standardName].kindCountByName[kindName] || 0} / ${drawReportByStandard[standardName].drawCountByKind[kindName] || 0}`),
		])),
		'',
		`Allocation: ${drawConfig.perStandardDrawCount} per standard in proportion to the frame (largest remainder), at least ${drawConfig.minimumPerKindCount} per kind where the frame has them (all of them where it has fewer). Within a kind the draw is a seeded shuffle, first N taken.`,
		'',
		'## 5. Exclusions',
		'',
		tableOf(['standard', 'excluded element', 'frame elements removed'], standardNameList.reduce((soFar, standardName) => soFar.concat(exclusionReportListByStandard[standardName].map((exclusionReport) => [standardName, `\`${exclusionLabelOf(exclusionReport.exclusion)}\``, exclusionReport.removedElementStableIdList.length])), [])),
		'',
		'An exclusion that removed 0 elements did not match the gold and must be investigated before rating.',
		'',
		'## 6. Survey composition',
		'',
		tableOf(['survey', ...standardNameList, 'total'], surveyNameList.map((surveyName) => [surveyName, ...standardNameList.map((standardName) => countWhere((element) => element.surveyName === surveyName && element.standard === standardName)), countWhere((element) => element.surveyName === surveyName)])),
		'',
		tableOf(['survey', ...kindNameList], surveyNameList.map((surveyName) => [surveyName, ...kindNameList.map((kindName) => countWhere((element) => element.surveyName === surveyName && element.kind === kindName))])),
		'',
		'Dealing: all 150, laid out kind by kind (seeded shuffle within kind), each go to the survey with room for that standard that holds the fewest of that kind so far (then the fewest items, then survey order). The 16 rotates (A: Ed-Fi, B: SIF, C: PESC).',
		'',
		'## 7. The 25/25 dev/sealed split (never shown by the tool)',
		'',
		tableOf(['standard', 'dev', 'sealed'], standardNameList.map((standardName) => [standardName, countWhere((element) => element.standard === standardName && element.splitHalf === 'dev'), countWhere((element) => element.standard === standardName && element.splitHalf === 'sealed')])),
		'',
		'Kind-stratified: within each kind the drawn elements are shuffled, kinds laid end to end, halves alternating from a seeded start.',
		'',
		'## 8. The sample',
		'',
		tableOf(['survey', 'standard', 'kind', 'element', 'path'], elementList.map((element) => [element.surveyName, element.standard, element.kind, `\`${element.name}\``, `\`${element.path}\``])),
		'',
	];
	fs.writeFileSync(reportFilePath, `${sectionList.join('\n')}\n`);
};

module.exports = { writeSampleReport };
