'use strict';
// useCaseDiagramFixture — one forged use case as the forged-use-cases access point hands it to render-use-case-diagram:
// the rows of caseByStableId, caseContextList (grouped), caseStepList, caseCitationList (with citationState) and
// caseStepDataLinkList. Modelled on docs/use-case-model/transcript-exchange.svg (use_case branch); the identifiers are
// illustrative, not read from a graph. One name carries markup, so a test can prove it is escaped.

const useCase = {
	caseStableId: 'uc:transcript-exchange',
	shortName: 'Transcript exchange',
	longName: 'Send a transcript to another institution',
	level: 'user goal',
	scope: 'sending institution student information system',
	frequency: 'about 300 per week, peaking at term end',
	standardName: 'EDUcore Use Cases',
	releaseVersion: '1.0',
	primaryActorName: 'Student',
};

const contextBySection = {
	primaryActor: [{ targetStableId: 'actor:student', targetName: 'Student' }],
	actor: [],
	interestedParty: [
		{ targetStableId: 'org:receiving', targetName: 'Receiving institution', partyKind: 'organization', interest: 'a record it can verify' },
		{ targetStableId: 'org:privacy', targetName: 'Records privacy office', partyKind: 'organization', interest: 'disclosure only on request' },
	],
	valueDriver: [{ targetStableId: 'vd:mobility', targetName: 'Student mobility' }],
	subject: [{ targetStableId: 'topic:transcripts', targetName: 'Transcripts' }],
	trigger: [{ targetStableId: 'trigger:request', targetName: 'the student requests a transcript be sent' }],
	precondition: [{ targetStableId: 'pre:term', targetName: 'the student has completed at least one term' }],
	guarantee: [
		{ targetStableId: 'g:success', targetName: 'receiving institution has a complete, verifiable record', edgeRole: 'success' },
		{ targetStableId: 'g:minimal', targetName: 'no record has left the institution; the student knows why', edgeRole: 'minimal' },
	],
	relatedCase: [{ targetStableId: 'uc:verify-identity', targetShortName: 'Verify student identity', edgeType: 'INVOKES' }],
	resource: [],
};

const stepList = [
	{ codedNotation: '1', position: 1, stepKind: 'main', action: 'Student requests a transcript', intention: 'portal, paper or clearinghouse', actorName: 'Student' },
	{ codedNotation: '2', position: 2, stepKind: 'main', action: 'Registrar assembles the record', intention: 'courses, credits, GPA', actorName: 'Registrar' },
	{ codedNotation: '2a', position: 2.1, stepKind: 'extension', action: 'Unpaid hold', intention: 'registrar notifies; ends in failure', actorName: 'Registrar' },
	{ codedNotation: '3', position: 3, stepKind: 'main', action: 'Sending SIS delivers', intention: 'PESC XML or signed PDF', actorName: 'Sending SIS' },
	{ codedNotation: '4', position: 4, stepKind: 'main', action: 'Receiving SIS loads', intention: 'match student, post credit', actorName: 'Receiving SIS' },
	{ codedNotation: '4a', position: 4.1, stepKind: 'exception', action: 'No student match <manual>', intention: 'manual match; rejoins step 4', actorName: 'Registrar' },
];

const citationRowOf = (referenceStableId, referenceName, citedStandard, citedIdentifier, citationState, extra = {}) => ({
	referenceStableId,
	referenceName,
	citedStandard,
	citedIdentifier,
	citationState,
	citedName: citationState === 'resolved' ? referenceName : null,
	citedSource: citationState === 'resolved' ? citedStandard : null,
	...extra,
});

const citationList = [
	citationRowOf('ref:person-id', 'Person Identifier', 'CEDS', 'P001572', 'resolved'),
	citationRowOf('ref:first-name', 'First Name', 'CEDS', 'P000115', 'resolved'),
	citationRowOf('ref:last-name', 'Last or Surname', 'CEDS', 'P000172', 'resolved'),
	citationRowOf('ref:course-title', 'Course Title', 'CEDS', 'P000067', 'resolved'),
	citationRowOf('ref:credits', 'Credits Earned Cumulative', 'CEDS', 'P000074', 'resolved'),
	citationRowOf('ref:gpa', 'Grade Point Average Cumulative', 'CEDS', 'P000128', 'resolved'),
	citationRowOf('ref:transcript-package', 'Transcript package', null, null, 'corpus', { referenceKind: 'artifact' }),
	citationRowOf('ref:delivery-method', 'Delivery Method', 'PESC', 'DeliveryMethod', 'gap', { referenceKind: 'orphan' }),
	citationRowOf('ref:pesc-academic-record', 'Academic Record', 'PESC', 'AcademicRecord', 'resolved', { citedName: 'Academic Record', citedSource: 'PESC' }),
	citationRowOf('ref:hold-reason', 'Hold Reason', 'CEDS', 'P009999', 'unresolved', { resolutionAnchor: 'graph' }),
	citationRowOf('ref:ferpa', 'FERPA directory information', 'CEDS', null, 'wholeStandard', { referenceKind: 'standardWholesale' }),
];

const linkRowOf = (codedNotation, dataEdgeType, referenceStableId, partHopCount = 0, namedDataName = '') => ({ codedNotation, dataEdgeType, referenceStableId, partHopCount, namedDataStableId: referenceStableId, namedDataName });

const stepDataLinkList = [
	linkRowOf('1', 'PRODUCES', 'ref:person-id'),
	linkRowOf('1', 'PRODUCES', 'ref:first-name'),
	linkRowOf('1', 'PRODUCES', 'ref:last-name'),
	linkRowOf('1', 'PRODUCES', 'ref:delivery-method'),
	linkRowOf('2', 'CONSUMES', 'ref:person-id'),
	linkRowOf('2', 'CONSUMES', 'ref:course-title'),
	linkRowOf('2', 'PRODUCES', 'ref:credits'),
	linkRowOf('2', 'PRODUCES', 'ref:gpa'),
	linkRowOf('2a', 'PRODUCES', 'ref:hold-reason'),
	linkRowOf('3', 'PRODUCES', 'ref:transcript-package', 0, 'Transcript package'),
	linkRowOf('3', 'PRODUCES', 'ref:pesc-academic-record', 1, 'Transcript package'),
	linkRowOf('3', 'PRODUCES', 'ref:course-title', 1, 'Transcript package'),
	linkRowOf('3', 'PRODUCES', 'ref:gpa', 1, 'Transcript package'),
	linkRowOf('4', 'CONSUMES', 'ref:transcript-package'),
	linkRowOf('4', 'CONSUMES', 'ref:person-id'),
	linkRowOf('4', 'PRODUCES', 'ref:credits'),
	linkRowOf('4a', 'CONSUMES', 'ref:first-name'),
	linkRowOf('4a', 'CONSUMES', 'ref:last-name'),
	// a step's data that is no reference: drawn as the data the step names
	{ codedNotation: '4a', dataEdgeType: 'PRODUCES', referenceStableId: null, partHopCount: 0, namedDataStableId: 'note:manual-match', namedDataName: 'Manual match note' },
];

module.exports = { useCase, contextBySection, stepList, citationList, stepDataLinkList };
