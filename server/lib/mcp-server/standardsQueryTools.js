'use strict';

// standardsQueryTools — the MCP door of the standards query service (DESIGN-standardsQueryService-110326 section 3). One tool per registry row whose doorList holds 'mcp'; no tool holds
// a query or a rule of its own, and gate G2.1 proves a tool's text is the route's body byte for byte.
//
//   toolFactsFromRegistry({ registry, providerToolList }) → { toolSpecList, instructionLineList } : once, at mount. A row that breaks the door's contract throws here, by name.
//   registerStandardsQueryTools({ server, toolSpecList, getAuth, accessPointsDotD, logToolCall, xLog }) : once per session.
//
// THE INPUT SCHEMA IS ADVERTISED, NOT ENFORCED. The model is shown required and enum from the registry, but the SDK parses against a loose object, because the SDK's own check would
// answer a bad enum with its own text and silently strip an unknown field, where the route answers invalidInput or unknownInput by name. Every refusal stays the core's, on both doors.
// z.looseObject({}).meta(...) is what makes the two differ: zod copies meta into the JSON Schema the SDK publishes, and parses by the empty shape alone.

const crypto = require('crypto');
const z = require('zod');
const { admitRequest } = require('../standards-query/admitRequest');
const { parameterOf } = require('../standards-query/openApiEmitter');

const moduleName = 'standardsQueryTools';
const MCP_DOOR_NAME = 'mcp';
const PUBLIC_PERMISSION_NAME = 'public';
const STANDARDS_QUERY_ACCESS_POINT_NAME = 'standards-query';
const SUCCESS_HTTP_STATUS = 200;
const CLI_VERB_IN_COMMAND_PATTERN = / -([A-Za-z]+)$/;
const TYPES_A_URL_WOULD_MAKE_TEXT = Object.freeze(['number', 'boolean']);

const inputSchemaOfFieldList = (inputFieldList) => z.looseObject({}).meta({
	properties: inputFieldList.reduce((soFar, inputField) => {
		const { description, schema } = parameterOf(inputField, {});
		return { ...soFar, [inputField.name]: { ...schema, description } };
	}, {}),
	required: inputFieldList.filter((inputField) => inputField.required === true).map((inputField) => inputField.name),
	additionalProperties: false,
});

// answers and refusals are the CLI's text, which askMilo also reads and gate G1.1 holds byte-identical, so they keep the CLI's tool names; this line tells a model what those names mean here
const internalNameLineOf = ({ mcpRowList, providerToolList }) => {
	const toolNameByCliVerb = mcpRowList.filter((registryRow) => registryRow.cliVerb).reduce((soFar, registryRow) => ({ ...soFar, [registryRow.cliVerb]: registryRow.mcpToolName }), {});
	const pairTextList = providerToolList.map((providerTool) => {
		const verbMatch = providerTool.cli.command.match(CLI_VERB_IN_COMMAND_PATTERN);
		const toolName = verbMatch && toolNameByCliVerb[verbMatch[1]];
		return toolName ? `${providerTool.definition.name} is ${toolName}` : '';
	}).filter(Boolean);
	return `Some text inside an answer names a tool by its internal name. Read: ${pairTextList.join(', ')}.`;
};

const toolFactsFromRegistry = ({ registry, providerToolList }) => {
	const mcpRowList = registry.operationList.filter((registryRow) => registryRow.doorList.includes(MCP_DOOR_NAME));
	const brokenRowList = mcpRowList.filter((registryRow) => !registryRow.mcpToolName || !registryRow.permissionList.includes(PUBLIC_PERMISSION_NAME));
	if (brokenRowList.length > 0) {
		// the MCP door tests admission, not the route's permission list: a restricted row here would be open to any OAuth user
		throw new Error(`${moduleName}: every row on the mcp door needs mcpToolName and permissionList holding '${PUBLIC_PERMISSION_NAME}'; these do not: ${brokenRowList.map((registryRow) => registryRow.operationName).join(', ')}`);
	}
	return {
		toolSpecList: mcpRowList.map((registryRow) => ({
			toolName: registryRow.mcpToolName,
			operationName: registryRow.operationName,
			registryRow,
			description: registryRow.description,
			inputSchema: inputSchemaOfFieldList([...registryRow.inputFieldList, ...(registryRow.requiresUriPromise ? registry.sharedInputFieldList : [])]),
		})),
		instructionLineList: [...registry.mcpInstructionLineList, internalNameLineOf({ mcpRowList, providerToolList })],
	};
};

// a URL makes every input text, so the core takes text; a model sends page: 2. Anything else stays as sent, for the core to refuse as invalidInput.
const coreInputOf = (toolArguments) => Object.keys(toolArguments).reduce((soFar, inputName) => {
	const argumentValue = toolArguments[inputName];
	return { ...soFar, [inputName]: TYPES_A_URL_WOULD_MAKE_TEXT.includes(typeof argumentValue) ? String(argumentValue) : argumentValue };
}, {});

const toolResultOf = (bodyText, isRefused) => ({ content: [{ type: 'text', text: bodyText }], ...(isRefused ? { isError: true } : {}) });
const shellRefusalOf = (refusalName, reason) => toolResultOf(JSON.stringify({ answer: { refusedByName: STANDARDS_QUERY_ACCESS_POINT_NAME, refusalName, reason } }), true);

const registerStandardsQueryTools = ({ server, toolSpecList, getAuth, accessPointsDotD, logToolCall, xLog }) => {
	toolSpecList.forEach(({ toolName, operationName, registryRow, description, inputSchema }) => {
		server.registerTool(toolName, { description, inputSchema, annotations: { readOnlyHint: true } }, (toolArguments) => new Promise((resolve) => {
			const mcpAuth = getAuth();
			logToolCall(toolName, mcpAuth);
			const failedWith = (failureText) => {
				const errorRefId = crypto.randomBytes(6).toString('hex');
				xLog.error(`${moduleName}: ${toolName} failed (${errorRefId}): ${failureText}`);
				resolve(shellRefusalOf('queryFailed', `the request failed (${errorRefId})`));
			};
			admitRequest({ door: MCP_DOOR_NAME, credential: mcpAuth, operationName, registryRow }, (admitError, admission) => {
				if (admitError) {
					failedWith(admitError);
					return;
				}
				if (admission.refusal) {
					resolve(shellRefusalOf(admission.refusal.refusalName, admission.refusal.reason));
					return;
				}
				accessPointsDotD[STANDARDS_QUERY_ACCESS_POINT_NAME]({ operationName, input: coreInputOf(toolArguments), principal: admission.principal }, (accessPointError, standardsAnswer) => {
					if (accessPointError) {
						failedWith(accessPointError);
						return;
					}
					resolve(toolResultOf(standardsAnswer.bodyText, standardsAnswer.httpStatus !== SUCCESS_HTTP_STATUS));
				});
			});
		}));
	});
};

module.exports = { toolFactsFromRegistry, registerStandardsQueryTools };
