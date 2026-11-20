'use strict';
// useCaseModelFixture — the use-case standard (UseCase 1.0, standardKind useCaseCorpus) as the graph held it on 2026-11-20, read
// through the standard-data-model mapper's three useCase* queries: its kinds of node, each kind's own properties (bookkeeping aside)
// and the relationships leaving each kind. Used by data-model-diagram.test.js, which needs no graph.

const standard = { stableId: 'UseCase', source: 'UseCase', name: 'UseCase', version: '1.0', standardKind: 'useCaseCorpus' };

// role|nodeCount
const kindText = 'DmeActor|21 DmeCondition|30 DmeDataReference|21 DmeEvent|5 DmeExternalReference|29 DmeResource|9 DmeSubject|6 DmeUseCase|7 DmeUserStory|55 DmeValueDriver|7';

// role: propertyName|nodeWithCount|type ...
const keyTextByRole = {
	DmeActor: 'name|21|string stableId|21|string actorKind|14|string',
	DmeCondition: 'name|30|string stableId|30|string',
	DmeDataReference: 'name|17|string referenceKind|21|string origin|6|string stableId|21|string linkageStatus|7|string citedIdentifier|7|string',
	DmeEvent: 'name|5|string stableId|5|string',
	DmeExternalReference: 'name|26|string linkageStatus|26|string citedIdentifier|26|string referenceKind|29|string stableId|29|string citedStableId|26|string citedStandard|29|string resolutionAnchor|29|string',
	DmeResource: 'name|9|string stableId|9|string url|9|string',
	DmeSubject: 'name|5|string stableId|6|string',
	DmeUseCase: 'formatVersion|7|string scope|7|string shortName|7|string editorialExplanation|7|string frequency|4|string primaryActorToken|7|string level|7|string name|7|string orderingAsserted|7|boolean stableId|7|string openIssuesJson|4|string keyConceptsJson|4|string',
	DmeUserStory: 'name|55|string stableId|55|string intention|55|string actorToken|55|string benefit|7|string',
	DmeValueDriver: 'name|7|string stableId|7|string motivation|7|string',
};

// fromRole|relationshipName|toRole (empty: a node of another standard)|fromNodeCount|mostPerNode|relationshipCount
const relationshipText = [
	'DmeSubject|COMPRISES|DmeExternalReference|3|19|33', 'DmeSubject|COMPRISES|DmeDataReference|1|1|1', 'DmeSubject|HAS_CONSTITUENT|DmeSubject|1|3|3', 'DmeSubject|GOVERNS|DmeExternalReference|1|2|2',
	'DmeUseCase|TRIGGERED_BY|DmeEvent|7|1|7', 'DmeUseCase|SIBLING|DmeUseCase|5|2|8', 'DmeUseCase|PARENT|DmeUseCase|2|1|2', 'DmeUseCase|HAS_SUBJECT|DmeSubject|7|1|7',
	'DmeUseCase|HAS_STEP|DmeUserStory|7|15|73', 'DmeUseCase|HAS_PRIMARY_ACTOR|DmeActor|7|1|7', 'DmeUseCase|HAS_ACTOR|DmeActor|7|6|33', 'DmeUseCase|GUARANTEES|DmeCondition|7|5|27',
	'DmeUseCase|ASSUMES|DmeCondition|7|4|24', 'DmeUseCase|ALIGNS_WITH|DmeValueDriver|7|4|19', 'DmeUseCase|REQUIRES_ARTIFACT|DmeDataReference|2|1|2', 'DmeUseCase|REQUIRES|DmeExternalReference|4|7|25',
	'DmeUseCase|INCLUDES|DmeUseCase|1|2|2', 'DmeUseCase|HAS_RESOURCE|DmeResource|4|3|9', 'DmeUseCase|HAS_INTERESTED_PARTY|DmeActor|5|3|10', 'DmeUseCase|DUPLICATE|DmeUseCase|2|1|2',
	'DmeUseCase|INVOKES|DmeUseCase|1|2|2', 'DmeUseCase|CHILD|DmeUseCase|1|2|2', 'DmeUseCase|REQUIRES_STANDARD|DmeExternalReference|2|1|2', 'DmeUseCase|REQUIRES_ORPHAN|DmeDataReference|2|6|12',
	'DmeUserStory|PRODUCES|DmeDataReference|8|1|8', 'DmeUserStory|PERFORMED_BY|DmeActor|55|1|55', 'DmeUserStory|CONSUMES|DmeDataReference|14|2|15', 'DmeUserStory|CONSUMES|DmeExternalReference|10|18|46',
	'DmeUserStory|PRODUCES|DmeSubject|5|1|5', 'DmeUserStory|CONSUMES|DmeSubject|4|2|5', 'DmeUserStory|PRODUCES|DmeExternalReference|3|1|3', 'DmeExternalReference|DECLARED_CORRESPONDENCE||26|1|26',
];

const sampleValueByType = { string: 'text', boolean: true, integer: 1 };

const kindRecordList = kindText.split(' ').map((oneLine) => {
	const [role, nodeCount] = oneLine.split('|');
	return { role, nodeCount: Number(nodeCount) };
});
const keyRecordList = Object.entries(keyTextByRole).flatMap(([role, keyText]) =>
	keyText.split(' ').map((oneLine) => {
		const [propertyName, nodeWithCount, typeName] = oneLine.split('|');
		return { role, propertyName, nodeWithCount: Number(nodeWithCount), sampleValue: sampleValueByType[typeName] };
	}),
);
const relationshipRecordList = relationshipText.map((oneLine) => {
	const [fromRole, relationshipName, toRole, fromNodeCount, mostPerNode, relationshipCount] = oneLine.split('|');
	return { fromRole, relationshipName, toRole: toRole || null, fromNodeCount: Number(fromNodeCount), mostPerNode: Number(mostPerNode), relationshipCount: Number(relationshipCount) };
});

module.exports = { standard, kindRecordList, keyRecordList, relationshipRecordList };
