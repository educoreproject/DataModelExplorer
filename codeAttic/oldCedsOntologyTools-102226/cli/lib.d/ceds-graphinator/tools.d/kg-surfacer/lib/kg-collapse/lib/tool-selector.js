#!/usr/bin/env node
'use strict';
process.noDeprecation = true;

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

const moduleFunction =
	({ moduleName } = {}) =>
	({ switchName } = {}) => {
		const toolSelector = {
			name: 'kgCollapse',
			description: 'Preview what happens when a Connection class is collapsed into a named edge',
			category: 'kg-surfacer',
			parameters: {
				className: { type: 'string', description: 'Connection class name to collapse', required: true },
				classification: { type: 'string', description: 'Stage 1 artifact path', required: true },
				naming: { type: 'string', description: 'Stage 2 artifact path', required: true },
			},
			situationTemplates: [
				'When previewing the impact of collapsing a Connection class',
				'When checking for property loss or edge conflicts before surfacing',
				'When understanding how a Connection becomes a named relationship',
			],
			examples: [
				{ description: 'Preview collapse', command: 'ceds2 -kgCollapse "K12 Student Enrollment" --classification=./classification.json --naming=./naming.json --json' },
			],
		};

		const getResult = () => toolSelector;
		return { getResult };
	};

module.exports = moduleFunction({ moduleName });
