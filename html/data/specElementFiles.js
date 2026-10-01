// @concept: [[SchemaVerifier]]
//
// Bundled structure of every specification in the EDUcore graph: one JSON file
// per spec under ./spec-elements/, each listing every class and property with
// its dotted path (Person.Contact.Address.street), so the Schema Verifier can
// show any spec by its own sections without a live graph round-trip.
//
// The files are code-split — `import.meta.glob` gives one lazy loader per file
// and a spec's file is fetched only when that spec is opened. The manifest
// (counts only) is small and loaded eagerly for the spec picker.
//
// Regenerate from the graph when standards are re-forged; see the `origin`
// field inside each file.

import manifest from './spec-elements/manifest.json';

const loaders = import.meta.glob('./spec-elements/*.json');

export const specElementManifest = manifest;

// source code -> () => Promise<{ default: specFile }>
export const specElementLoaders = Object.fromEntries(
	Object.entries(loaders)
		.filter(([file]) => !file.endsWith('/manifest.json'))
		.map(([file, load]) => [file.split('/').pop().replace(/\.json$/, ''), load]),
);
