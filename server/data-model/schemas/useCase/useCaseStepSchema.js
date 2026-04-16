'use strict';
// Schema manifest for UseCaseStep. Steps are UseCase-owned (not graph-wide-deduped);
// identity is usecase-<issueNumber>-step-<stepNumber>. See nodeBuilder.js buildStepNodes.

module.exports = {
	label: 'UseCaseStep',
	superLabel: 'UseCaseModel',
	idProperty: 'id',

	properties: [
		{ name: 'stepNumber', type: 'integer',  required: true, label: 'Step #' },
		{ name: 'actionText', type: 'markdown',                 label: 'Action' },
		{ name: 'actorName',  type: 'string',                   label: 'Actor Name',
			help: 'Plain-text name of the actor who performs this step. The PERFORMED_BY edge is derived from this.' },
		{ name: 'name',       type: 'string',                   label: 'Name',
			help: 'Short display label. Auto-generated from stepNumber + actionText if left blank.' },
		{ name: 'description', type: 'markdown',                label: 'Description' },

		{ name: 'searchText',  type: 'string', system: true },
		{ name: 'embedding',   type: 'vector', system: true }
	]
};
