'use strict';

// openApiEmitter — GET openapi.json, written from the operation registry so the description and the behaviour cannot part (design section 2). Pure: registry in, document out.
//   openApiDocumentFor({ registry, routeBasePath, manifestLabel, inputCapByName }) → the OpenAPI 3.1 document

const OPENAPI_VERSION = '3.1.0';
const TYPE_SCHEMA_BY_INPUT_TYPE = Object.freeze({ text: { type: 'string' }, positiveInteger: { type: 'integer', minimum: 1 }, list: { type: 'array' }, object: { type: 'object' } });
const OPERATION_NAME_OF_HTTP_METHOD = Object.freeze({ GET: 'get', POST: 'post' });

const parameterOf = (inputField, inputCapByName) => ({
	name: inputField.name,
	in: 'query',
	required: inputField.required === true,
	description: inputField.description,
	schema: {
		...TYPE_SCHEMA_BY_INPUT_TYPE[inputField.type],
		...(inputField.maxLengthConfigName ? { maxLength: inputCapByName[inputField.maxLengthConfigName] } : {}),
		...(inputField.enum ? { enum: inputField.enum } : {}),
		...(inputField.maximum ? { maximum: inputField.maximum } : {}),
		...(inputField.defaultValue ? { default: inputField.defaultValue } : {}),
		...(inputField.jsonSchemaDetail || {}),
	},
});

// a GET's inputs are query parameters; a POST's are the named properties of one JSON body
const inputsOf = ({ registry, registryRow, inputCapByName }) => {
	const parameterList = [...registryRow.inputFieldList, ...(registryRow.requiresUriPromise ? registry.sharedInputFieldList : [])].map((inputField) => parameterOf(inputField, inputCapByName));
	if (registryRow.httpMethod === 'GET') {
		return { parameters: parameterList };
	}
	return {
		requestBody: {
			required: true,
			content: { 'application/json': { schema: {
				type: 'object',
				additionalProperties: false,
				required: parameterList.filter((oneParameter) => oneParameter.required).map((oneParameter) => oneParameter.name),
				properties: parameterList.reduce((soFar, oneParameter) => ({ ...soFar, [oneParameter.name]: { ...oneParameter.schema, description: oneParameter.description } }), {}),
			} } },
		},
	};
};

const refusalResponseListOf = ({ registry, registryRow }) => {
	const statusByName = { ...registry.verbRefusalHttpStatusByName, ...registry.envelopeRefusalHttpStatusByName };
	const shared = registryRow.requiresUriPromise ? ['manifestMismatch', 'uriPromiseUnavailable', 'goldenGraphNotReady', 'unknownInput', 'invalidInput', 'inputTooLong', 'queryFailed', 'busy', 'rateLimited'] : ['rateLimited', 'queryFailed'];
	const permissionNames = registryRow.permissionList.includes('public') ? [] : ['notAuthorized'];
	const refusalNameList = [...new Set([...registryRow.refusalNameList, ...shared, ...permissionNames])];
	const nameListByStatus = {};
	refusalNameList.forEach((refusalName) => {
		const httpStatus = statusByName[refusalName];
		nameListByStatus[httpStatus] = [...(nameListByStatus[httpStatus] || []), refusalName];
	});
	return Object.keys(nameListByStatus).reduce((soFar, httpStatus) => ({
		...soFar,
		[httpStatus]: {
			description: `Refused by name: ${nameListByStatus[httpStatus].sort().join(', ')}.`,
			content: { 'application/json': { schema: { $ref: '#/components/schemas/RefusalEnvelope' } } },
		},
	}), {});
};

const openApiDocumentFor = ({ registry, manifestLabel, inputCapByName }) => ({
	openapi: OPENAPI_VERSION,
	info: {
		title: 'EDUcore standards query API',
		version: `${registry.apiVersion}+${manifestLabel || 'manifestNotYetProven'}`,
		description: 'One service answering questions about education data standards. Every answer says which graph and manifest answered it, and every element and card carries its permanent URI.',
	},
	servers: [{ url: `/api/${registry.routeBasePath}` }],
	paths: registry.operationList.reduce((soFar, registryRow) => ({
		...soFar,
		[`/${registryRow.routeName}`]: {
			[OPERATION_NAME_OF_HTTP_METHOD[registryRow.httpMethod]]: {
				operationId: registryRow.operationName,
				summary: registryRow.description.split(/(?<=[.!?])\s/)[0],
				description: registryRow.description,
				...inputsOf({ registry, registryRow, inputCapByName }),
				responses: {
					200: { description: 'The answer.', content: { 'application/json': { schema: registryRow.bodyForm === 'envelope' ? { $ref: '#/components/schemas/Envelope' } : { type: 'object' } } } },
					...refusalResponseListOf({ registry, registryRow }),
				},
			},
		},
	}), {}),
	components: {
		schemas: {
			AnsweredFrom: {
				type: 'object',
				required: ['graphName', 'manifestRefId', 'manifestLabel', 'manifest', 'manifestByContent', 'manifestStandardList', 'builtAt', 'apiVersion', 'operation', 'instance'],
				properties: ['graphName', 'manifestRefId', 'manifestLabel', 'manifest', 'manifestByContent', 'manifestStandardList', 'builtAt', 'graphContractSha256', 'structuralVersion', 'embeddingModelVersion', 'instance', 'apiVersion', 'operation'].reduce((soFar, propertyName) => ({ ...soFar, [propertyName]: { type: 'string' } }), {}),
			},
			Envelope: {
				type: 'object',
				required: ['answeredFrom', 'answer', 'uriNote'],
				properties: { answeredFrom: { $ref: '#/components/schemas/AnsweredFrom' }, answer: { type: 'object' }, uriNote: { type: 'string' } },
			},
			RefusalEnvelope: {
				type: 'object',
				required: ['answer'],
				properties: {
					answeredFrom: { $ref: '#/components/schemas/AnsweredFrom' },
					answer: {
						type: 'object',
						required: ['refusedByName', 'refusalName', 'reason'],
						properties: { refusedByName: { type: 'string' }, refusalName: { type: 'string' }, reason: { type: 'string' }, validValueList: { type: 'array', items: {} } },
					},
				},
			},
		},
	},
});

module.exports = { openApiDocumentFor, parameterOf };
