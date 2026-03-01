#!/usr/bin/env node
'use strict';
process.noDeprecation = true;

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

const moduleFunction =
	({ moduleName } = {}) =>
	({ switchName } = {}) => {
		const toolSelector = {
			name: 'materializeDiagram',
			description: 'Generate graph visualization specification in Mermaid, Cytoscape, or DOT format',
			category: 'kg-materializer',
			priority: 75,
			capabilities: ['visualization', 'diagram', 'mermaid', 'cytoscape', 'graphviz'],
			parameters: {
				'view-spec': { type: 'string', description: 'Surfacing view spec path', required: true },
				output: { type: 'string', description: 'Output file path', required: false },
				'diagram-format': { type: 'string', description: 'mermaid|cytoscape|dot', required: false },
				center: { type: 'string', description: 'Center on a specific Thing', required: false },
			},
			situationTemplates: [
				'When creating a visual representation of the knowledge graph for a presentation',
				'When generating a Mermaid diagram for documentation',
				'When producing an interactive visualization for the web UI',
			],
			examples: [
				{ description: 'Mermaid diagram', command: 'ceds2 -materializeDiagram --view-spec=./surfacing-view.json --diagram-format=mermaid' },
				{ description: 'Cytoscape JSON', command: 'ceds2 -materializeDiagram --view-spec=./surfacing-view.json --diagram-format=cytoscape --output=./viz.json' },
			],
		};

		const getResult = () => toolSelector;
		return { getResult };
	};

module.exports = moduleFunction({ moduleName });
