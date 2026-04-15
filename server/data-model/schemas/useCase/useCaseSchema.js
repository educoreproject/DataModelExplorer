'use strict';
// Schema manifest for the UseCase root node.
// Drives the Use Case Editor's DynamicForm: which properties are editable,
// which are read-only-for-display, and which are system-managed (hidden).
// Property list derived from graphForge/system/code/cli/lib.d/forge-usecases/lib/nodeBuilder.js.

module.exports = {
	label: 'UseCase',
	superLabel: 'UseCaseModel',
	idProperty: 'id',
	idPrefix: 'usecase-',

	properties: [
		{ name: 'name',            type: 'string',       required: true,  label: 'Name' },
		{ name: 'introduction',    type: 'markdown',                      label: 'Introduction' },
		{ name: 'objectives',      type: 'markdown',                      label: 'Objectives' },
		{ name: 'scenario',        type: 'markdown',                      label: 'Scenario' },
		{ name: 'keyConcepts',     type: 'markdown',                      label: 'Key Concepts' },
		{ name: 'dependencies',    type: 'stringArray',                   label: 'Dependencies' },
		{ name: 'outcomes',        type: 'stringArray',                   label: 'Outcomes' },
		{ name: 'primaryCategory', type: 'string',                        label: 'Primary Category' },

		{ name: 'author',          type: 'string',       readOnly: true,  label: 'Author' },
		{ name: 'issueNumber',     type: 'integer',      readOnly: true,  label: 'Issue #' },
		{ name: 'issueUrl',        type: 'url',          readOnly: true,  label: 'Issue URL' },
		{ name: 'githubLabels',    type: 'stringArray',  readOnly: true,  label: 'GitHub Labels' },
		{ name: 'cedsIds',         type: 'stringArray',  readOnly: true,  label: 'CEDS IDs',
			help: 'Derived from prose by the forge. Read-only here.' },
		{ name: 'createdAt',       type: 'datetime',     readOnly: true,  label: 'Created' },
		{ name: 'updatedAt',       type: 'datetime',     readOnly: true,  label: 'Updated' },

		{ name: 'description',          type: 'markdown', system: true },
		{ name: 'searchText',           type: 'string',   system: true },
		{ name: 'embedding',            type: 'vector',   system: true },
		{ name: 'actorCount',           type: 'integer',  system: true, derived: true },
		{ name: 'stepCount',            type: 'integer',  system: true, derived: true },
		{ name: 'dataReferenceCount',   type: 'integer',  system: true, derived: true },
		{ name: 'cedsReferenceCount',   type: 'integer',  system: true, derived: true },
		{ name: 'referenceCount',       type: 'integer',  system: true, derived: true }
	],

	children: [
		{ label: 'UseCaseStep',       via: 'HAS_STEP',           editable: true,
			schema: 'useCaseStep',       order: 'stepNumber',       idPrefix: 'usecase-<issueNumber>-step-' },
		{ label: 'UseCaseActor',      via: 'INVOLVES_ACTOR',     editable: true,
			schema: 'useCaseActor',      idPrefix: 'usecase-actor-', dedup: 'graphWide' },
		{ label: 'DataReference',     via: 'HAS_DATA_REFERENCE', editable: true,
			schema: 'dataReference',     idPrefix: 'dataref-',       dedup: 'graphWide' },
		{ label: 'ExternalReference', via: 'HAS_REFERENCE',      editable: true,
			schema: 'externalReference', idPrefix: 'externref-',     dedup: 'graphWide' }
	],

	associations: [
		{ label: 'UseCaseCategory', via: 'CATEGORIZED_AS',
			editable: false,          picker: 'multiSelectExisting',
			edgeProperties: [
				{ name: 'isPrimary', type: 'boolean', label: 'Primary' }
			]
		}
	]
};
