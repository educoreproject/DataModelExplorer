// @concept: [[SpecificationViewer]]
//
// Loads html/stores/specificationViewerStore.js outside Nuxt for tests: bundles
// it with esbuild, stubs the login store, the HR Open crosswalk and axios, and
// serves the REAL bundled spec files (data/spec-elements/) and concept snapshot
// from disk. Pinia is replaced by a minimal state/getters/actions object.
//
//   const { store, mod, storage } = await loadStore({ axios, storage })

import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

export const HTML = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIR = path.join(HTML, 'data', 'spec-elements');
const require = createRequire(import.meta.url);
const esbuild = require(path.join(HTML, 'node_modules/esbuild'));

const offline = async () => {
	throw new Error('offline');
};

export async function loadStore({ axios = { get: offline, post: offline, delete: offline }, storage = {}, login = {} } = {}) {
	globalThis.__svAxios = axios;
	globalThis.__svLogin = { authtoken: '', getAuthTokenProperty: {}, loggedInUser: {}, ...login };
	globalThis.__svManifest = JSON.parse(fs.readFileSync(path.join(DIR, 'manifest.json'), 'utf8'));
	const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.json') && f !== 'manifest.json');
	const loaderFor = (f) => async () => ({ default: JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')) });
	globalThis.__svStructure = Object.fromEntries(files.filter((f) => !f.endsWith('.codes.json')).map((f) => [f.replace(/\.json$/, ''), loaderFor(f)]));
	globalThis.__svCodes = Object.fromEntries(files.filter((f) => f.endsWith('.codes.json')).map((f) => [f.replace(/\.codes\.json$/, ''), loaderFor(f)]));

	const stubs = {
		'@/stores/loginStore': 'export const useLoginStore = () => globalThis.__svLogin;',
		'@/data/hr-open-crosswalk': 'export const hrOpenCrosswalk = []; export const hrOpenCrosswalkMeta = { elementCount: 0 };',
		'@/data/specElementFiles':
			'export const specElementManifest = globalThis.__svManifest; export const specElementLoaders = globalThis.__svStructure; export const specCodeLoaders = globalThis.__svCodes;',
		axios: 'export default globalThis.__svAxios;',
		yaml: 'export const parse = () => ({});',
	};
	const result = await esbuild.build({
		entryPoints: [path.join(HTML, 'stores/specificationViewerStore.js')],
		bundle: true,
		write: false,
		format: 'esm',
		platform: 'node',
		loader: { '.json': 'json' },
		plugins: [
			{
				name: 'stubs',
				setup(b) {
					b.onResolve({ filter: /.*/ }, (a) =>
						stubs[a.path] ? { path: a.path, namespace: 'stub' } : a.path.startsWith('@/') ? { path: path.join(HTML, a.path.slice(2)) } : undefined,
					);
					b.onLoad({ filter: /.*/, namespace: 'stub' }, (a) => ({ contents: stubs[a.path], loader: 'js' }));
				},
			},
		],
	});

	globalThis.defineStore = (_name, options) => () => {
		if (globalThis.__svStore) return globalThis.__svStore;
		const s = { ...options.state() };
		for (const [k, g] of Object.entries(options.getters || {})) Object.defineProperty(s, k, { get: () => g(s) });
		for (const [k, a] of Object.entries(options.actions || {})) s[k] = a.bind(s);
		globalThis.__svStore = s;
		return s;
	};
	globalThis.__svStore = null;
	globalThis.localStorage = { getItem: (k) => storage[k] ?? null, setItem: (k, v) => (storage[k] = v) };

	const mod = await import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64'));
	return { store: mod.useSpecificationViewerStore(), mod, storage };
}

export function makeAssert() {
	let failures = 0;
	const assert = (cond, msg) => {
		console.log(`${cond ? 'ok  ' : 'FAIL'} ${msg}`);
		if (!cond) failures++;
	};
	const done = () => {
		console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASSED');
		process.exit(failures ? 1 : 0);
	};
	return { assert, done };
}
