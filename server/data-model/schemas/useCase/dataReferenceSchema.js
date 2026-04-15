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
		{ name: 'name',       type: 'string',                   label: 'Name' },
		{ name: 'definition', type: 'markdown',                 label: 'Definition' },
		{ name: 'url',        type: 'url',                      label: 'URL' },

		{ name: 'slug',         type: 'string', system: true },
		{ name: 'canonicalUrl', type: 'string', system: true },
		{ name: 'searchText',   type: 'string', system: true },
		{ name: 'embedding',    type: 'vector', system: true }
	]
};
