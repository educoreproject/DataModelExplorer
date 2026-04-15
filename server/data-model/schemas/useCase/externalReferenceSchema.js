'use strict';
// Schema manifest for ExternalReference. Graph-wide deduped by canonicalized URL.
// Property edits affect every UseCase that HAS_REFERENCE this node.
// See nodeBuilder.js buildExternalRefsFromSection.

module.exports = {
	label: 'ExternalReference',
	superLabel: 'UseCaseModel',
	idProperty: 'id',
	dedup: 'graphWide',

	properties: [
		{ name: 'title', type: 'string', required: true, label: 'Title' },
		{ name: 'url',   type: 'url',                    label: 'URL' },

		{ name: 'slug',         type: 'string', system: true },
		{ name: 'canonicalUrl', type: 'string', system: true },
		{ name: 'searchText',   type: 'string', system: true },
		{ name: 'embedding',    type: 'vector', system: true }
	]
};
