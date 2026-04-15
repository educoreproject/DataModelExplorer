'use strict';
// Schema manifest for DataReference. Graph-wide deduped by canonicalized URL.
// Property edits affect every UseCase that HAS_DATA_REFERENCE this node.
// See nodeBuilder.js buildDataRefsFromSection.

module.exports = {
	label: 'DataReference',
	superLabel: 'UseCaseModel',
	idProperty: 'id',
	dedup: 'graphWide',

	properties: [
		{ name: 'name',        type: 'string',                   label: 'Name' },
		{ name: 'description', type: 'markdown',                 label: 'Description' },
		{ name: 'url',         type: 'url',                      label: 'URL' },

		{ name: 'slug',         type: 'string',  system: true },
		{ name: 'canonicalUrl', type: 'string',  system: true },
		{ name: 'hadCedsCode',  type: 'boolean', system: true },
		{ name: 'useCaseCount', type: 'integer', system: true, derived: true },
		{ name: 'searchText',   type: 'string',  system: true },
		{ name: 'embedding',    type: 'vector',  system: true }
	]
};
