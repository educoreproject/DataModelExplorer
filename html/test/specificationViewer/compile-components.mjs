#!/usr/bin/env node
// @concept: [[SpecificationViewer]]
//
// Compiles the Specification Viewer's single-file components (script + template)
// with @vue/compiler-sfc, so template and script mistakes surface without a
// running Nuxt dev server. Also fails on names a template reads that its
// <script setup> never declares (the usual typo).
//
//   node html/test/specificationViewer/compile-components.mjs
//
// Exit 0 and one "ok" per file means every component compiled.

import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HTML = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(import.meta.url);
const { parse, compileScript, compileTemplate } = require(path.join(HTML, 'node_modules/@vue/compiler-sfc'));

const FILES = [
	'components/MappingTransformDialog.vue',
	'components/CuratedMappings.vue',
	'components/TargetFieldSearch.vue',
	'components/CedsConcepts.vue',
	'components/SchemaEquivalents.vue',
	'components/SpecCrossMappings.vue',
	'components/SpecElementDetail.vue',
	'pages/explore/specification-viewer.vue',
	'pages/explore/schema-verifier.vue',
].filter((rel) => fs.existsSync(path.join(HTML, rel)));

let failed = false;
for (const rel of FILES) {
	const source = fs.readFileSync(path.join(HTML, rel), 'utf8');
	const { descriptor, errors } = parse(source, { filename: rel });
	if (errors.length) {
		failed = true;
		console.log(`FAIL ${rel}: ${errors.map((e) => e.message).join('; ')}`);
		continue;
	}
	const id = 'x' + Math.random().toString(36).slice(2, 8);
	try {
		const script = compileScript(descriptor, { id, inlineTemplate: false });
		const tpl = compileTemplate({
			source: descriptor.template.content,
			filename: rel,
			id,
			compilerOptions: { bindingMetadata: script.bindings },
		});
		if (tpl.errors.length) {
			failed = true;
			console.log(`FAIL ${rel}: ${tpl.errors.map((e) => e.message || e).join('; ')}`);
			continue;
		}
		const unbound = [...new Set([...tpl.code.matchAll(/_ctx\.([A-Za-z_$][\w$]*)/g)].map((m) => m[1]))].filter((n) => n !== '$event');
		if (unbound.length) {
			failed = true;
			console.log(`FAIL ${rel}: template reads undeclared ${unbound.join(', ')}`);
		} else {
			console.log(`ok   ${rel}`);
		}
	} catch (err) {
		failed = true;
		console.log(`FAIL ${rel}: ${err.message}`);
	}
}
process.exit(failed ? 1 : 0);
