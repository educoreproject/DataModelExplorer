'use strict';
// Schema manifest for UseCaseActor. Graph-wide deduped by slug(name).
// Property edits affect every UseCase that INVOLVES_ACTOR this node.
// See nodeBuilder.js buildActorsFromTable.

module.exports = {
	label: 'UseCaseActor',
	superLabel: 'UseCaseModel',
	idProperty: 'id',
	dedup: 'graphWide',

	properties: [
		{ name: 'name', type: 'string', required: true, label: 'Actor Name' },
		{ name: 'role', type: 'string',                 label: 'Role' },

		{ name: 'slug',       type: 'string', system: true },
		{ name: 'searchText', type: 'string', system: true },
		{ name: 'embedding',  type: 'vector', system: true }
	]
};
