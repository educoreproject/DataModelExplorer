'use strict';

// aboutDocument — GET about and the bare root: the service explaining itself to a stranger. Pure: registry and config in, document out. Operations, inputs and limits are generated, so they cannot part
// from what runs; the prose is the registry's aboutText, beside the MCP instruction lines. Gate G5 (standards-query-registry.test.js) holds every entry to a row and every row to an entry, and the
// live test runs every worked example against what its entry says.
//
//   aboutDocumentFor({ registry, inputCapByName, doorLimitValues, publicInstanceName, principal })
//     → { answer, listsGatedOperation }. An operation with a permission list that is not public is listed only for a site user holding one of those roles, the one principal that can call it.

const PUBLIC_PERMISSION_NAME = 'public';
const SITE_USER_PRINCIPAL_KIND = 'siteUser';
const EDC_BASE_TOKEN = '{edcBaseUrl}';

const mayCall = (registryRow, principal) => registryRow.permissionList.includes(PUBLIC_PERMISSION_NAME) || (principal.kind === SITE_USER_PRINCIPAL_KIND && registryRow.permissionList.includes(principal.role));

const GET_METHOD_NAME = 'GET';
const RETRIEVAL_RETENTION_TOKEN = '{strangerVectorRetentionDays}';

// the input of a GET is the url's query; the input of a POST is its body, shown beside the url
const exampleUrlOf = ({ registry, registryRow, publicInstanceName }) => {
	const queryText = (registryRow.httpMethod === GET_METHOD_NAME ? new URLSearchParams(registryRow.aboutEntry.exampleInput) : new URLSearchParams()).toString().replace(/%3A/g, ':').replace(/%2F/g, '/'); // both are legal in a query, and a reader can read them
	return `https://${publicInstanceName}/${registry.publicRouteBasePath}/${registryRow.routeName}${queryText ? `?${queryText}` : ''}`;
};

// an input's description is written once, in sharedInputDescriptionByName, under the wording most operations use; an operation whose wording differs carries its own
const sharedInputDescriptionsOf = (registryRowList) => {
	const countByNameAndDescription = {};
	registryRowList.flatMap((registryRow) => registryRow.inputFieldList).forEach(({ name, description }) => {
		countByNameAndDescription[name] = { ...countByNameAndDescription[name], [description]: ((countByNameAndDescription[name] || {})[description] || 0) + 1 };
	});
	return Object.keys(countByNameAndDescription).sort().reduce((soFar, inputName) => {
		const [commonestDescription] = Object.entries(countByNameAndDescription[inputName]).sort((left, right) => right[1] - left[1])[0];
		return { ...soFar, [inputName]: commonestDescription };
	}, {});
};

// an entry may say plainly what its operation does not do and what becomes of what you send. The numbers in those sentences are the config's; with no config the sentence is absent rather than a guess.
const plainStatementsOf = ({ registryRow, rosettaFuseValues }) => ({
	...(registryRow.aboutEntry.whatThisDoesNot ? { whatThisDoesNot: registryRow.aboutEntry.whatThisDoesNot } : {}),
	...(registryRow.aboutEntry.whatHappensToYourText && rosettaFuseValues ? { whatHappensToYourText: registryRow.aboutEntry.whatHappensToYourText.replace(RETRIEVAL_RETENTION_TOKEN, String(rosettaFuseValues.strangerVectorRetentionDays)) } : {}),
});

const operationEntryOf = ({ registry, registryRow, publicInstanceName, sharedInputDescriptionByName, rosettaFuseValues }) => {
	const ownWordingFieldList = registryRow.inputFieldList.filter((inputField) => sharedInputDescriptionByName[inputField.name] !== inputField.description);
	const nameListWhere = (isWanted) => registryRow.inputFieldList.filter(isWanted).map((inputField) => inputField.name);
	return {
		operation: registryRow.routeName,
		...(registryRow.httpMethod === GET_METHOD_NAME ? {} : { method: registryRow.httpMethod }),
		...(registryRow.mcpToolName ? {} : { isOnMcp: false }),
		...(registryRow.mcpToolName && registryRow.mcpToolName !== `${registry.mcpToolPrefix}${registryRow.routeName}` ? { mcpTool: registryRow.mcpToolName } : {}),
		forWhat: registryRow.aboutEntry.forWhat,
		...plainStatementsOf({ registryRow, rosettaFuseValues }),
		...(nameListWhere((inputField) => inputField.required === true).length > 0 ? { requiredInputList: nameListWhere((inputField) => inputField.required === true) } : {}),
		...(nameListWhere((inputField) => inputField.required !== true).length > 0 ? { optionalInputList: nameListWhere((inputField) => inputField.required !== true) } : {}),
		...(ownWordingFieldList.length > 0 ? { ownInputDescriptionByName: ownWordingFieldList.reduce((soFar, inputField) => ({ ...soFar, [inputField.name]: inputField.description }), {}) } : {}),
		...(registryRow.aboutEntry.slowWhen ? { slowWhen: registryRow.aboutEntry.slowWhen } : {}),
		...(registryRow.pageSize ? { rowsPerPage: registryRow.pageSize } : {}),
		exampleUrl: exampleUrlOf({ registry, registryRow, publicInstanceName }),
		...(registryRow.httpMethod === GET_METHOD_NAME ? {} : { exampleBody: registryRow.aboutEntry.exampleInput }),
		exampleShows: registryRow.aboutEntry.exampleShows,
	};
};

// an instance with no session limits refuses every new MCP session by name, and that is the limit in force
const mcpSessionLimitsOf = ({ sessionCapPerSub, sessionIdleTtlSeconds }) => (sessionCapPerSub > 0 && sessionIdleTtlSeconds > 0
	? { mcpSessionsPerAccount: sessionCapPerSub, mcpIdleSeconds: sessionIdleTtlSeconds }
	: { mcpSessions: 'not configured here, so MCP refuses new sessions' });

const limitsInForceOf = ({ registry, inputCapByName, doorLimitValues }) => ({
	requestsPerMinutePerAddress: inputCapByName.requestsPerMinute,
	requestsPerSecondPerAddress: inputCapByName.burstPerSecond,
	queriesAtOnce: inputCapByName.inFlightMax,
	nameScansAtOnce: registry.operationList.filter((registryRow) => registryRow.scanInFlightMax).reduce((soFar, registryRow) => ({ ...soFar, [registryRow.routeName]: registryRow.scanInFlightMax }), {}),
	queryCharacters: inputCapByName.maxQueryChars,
	patternCharacters: inputCapByName.maxPatternChars,
	embeddingTokensPerDay: inputCapByName.dailyEmbeddingTokenCeiling,
	...mcpSessionLimitsOf(doorLimitValues),
	retrieval: doorLimitValues.rosettaFuseValues ? {
		fieldsPerSubmission: doorLimitValues.rosettaFuseValues.maxFieldListLength,
		nameCharacters: doorLimitValues.rosettaFuseValues.maxFieldNameChars,
		definitionCharacters: doorLimitValues.rosettaFuseValues.maxFieldDefinitionChars,
		documentDepth: doorLimitValues.rosettaFuseValues.maxDocumentDepth,
		bodySize: registry.operationList.find((registryRow) => registryRow.bodyLimitText).bodyLimitText,
		bodySizeOnMcp: registry.operationList.find((registryRow) => registryRow.mcpBodyLimitText).mcpBodyLimitText,
		atOnce: doorLimitValues.rosettaFuseValues.retrievalInFlightMax,
		newTextTokensPerRequest: doorLimitValues.rosettaFuseValues.retrievalMaxTokensPerRequest,
		newTextTokensPerDay: doorLimitValues.rosettaFuseValues.retrievalDailyTokenCeiling,
	} : registry.aboutText.retrievalUnconfiguredLine,
});

const aboutDocumentFor = ({ registry, inputCapByName, doorLimitValues, publicInstanceName, principal }) => {
	const listedRowList = registry.operationList.filter((registryRow) => mayCall(registryRow, principal));
	const sharedInputDescriptionByName = sharedInputDescriptionsOf(listedRowList);
	const edcBaseUrl = `https://${publicInstanceName}${doorLimitValues.edcPublicPathPrefix}`;
	return {
		listsGatedOperation: listedRowList.some((registryRow) => !registryRow.permissionList.includes(PUBLIC_PERMISSION_NAME)),
		answer: {
			whatThisIs: registry.aboutText.whatThisIs,
			howToReadAnAnswer: registry.aboutText.howToReadAnAnswer,
			operationNote: registry.aboutText.operationNoteLine,
			operationList: listedRowList.map((registryRow) => operationEntryOf({ registry, registryRow, publicInstanceName, sharedInputDescriptionByName, rosettaFuseValues: doorLimitValues.rosettaFuseValues })),
			sharedInputDescriptionByName,
			limitsInForce: limitsInForceOf({ registry, inputCapByName, doorLimitValues }),
			whereToLookNext: {
				machineDescription: `https://${publicInstanceName}/${registry.publicRouteBasePath}/openapi.json`,
				whatAUriResolvesTo: doorLimitValues.edcPublicPathPrefix ? registry.aboutText.uriResolvesToLine.replace(EDC_BASE_TOKEN, edcBaseUrl) : registry.aboutText.uriNotResolvedHereLine,
			},
		},
	};
};

module.exports = { aboutDocumentFor };
