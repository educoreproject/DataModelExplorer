// @concept: [[SpecificationViewer]]
//
// Bundled structure of every specification in the EDUcore graph, built by
// html/scripts/specificationViewer/build-spec-models.cjs from the graph's own
// structural edges (root -HAS_CLASS-> class -HAS_PROPERTY-> property, nested
// classes, SUBCLASS_OF taxonomies, message levels, SIF element trees …):
//
//   spec-elements/<SPEC>.json        classes and properties with their trails
//   spec-elements/<SPEC>.codes.json  the spec's code lists (only some specs)
//   spec-elements/manifest.json      counts and profile per spec
//
// Both kinds of file are code-split — `import.meta.glob` gives one lazy loader
// per file, fetched only when a spec is opened (structure) or a property with a
// code list is selected (codes). The manifest is small and loaded eagerly for
// the spec picker.

import manifest from './spec-elements/manifest.json';

const loaders = import.meta.glob('./spec-elements/*.json');

export const specElementManifest = manifest;

const byName = (suffix) =>
	Object.fromEntries(
		Object.entries(loaders)
			.filter(([file]) => !file.endsWith('/manifest.json'))
			.filter(([file]) => (suffix ? file.endsWith(suffix) : !/\.codes\.json$/.test(file)))
			.map(([file, load]) => [file.split('/').pop().replace(suffix || '.json', ''), load]),
	);

// source code -> () => Promise<{ default: specFile }>
export const specElementLoaders = byName('');
// source code -> () => Promise<{ default: { sets: { <setStableId>: [name, [[value, description?], …]] } } }>
export const specCodeLoaders = byName('.codes.json');
