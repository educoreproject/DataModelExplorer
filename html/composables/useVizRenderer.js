// composables/useVizRenderer.js
//
// Singleton Graphviz WASM renderer using @viz-js/viz.
// Lazy-initializes on first render call.

import * as Viz from '@viz-js/viz';
import { ref } from 'vue';

let vizInstance = null;
let vizPromise = null;

export const vizLoading = ref(false);

/**
 * Returns the singleton Viz instance, initializing on first call.
 * Subsequent calls return the same promise/instance.
 */
async function getVizInstance() {
	if (vizInstance) return vizInstance;
	if (vizPromise) return vizPromise;

	vizLoading.value = true;
	vizPromise = Viz.instance().then((viz) => {
		vizInstance = viz;
		vizPromise = null;
		vizLoading.value = false;
		return viz;
	});

	return vizPromise;
}

/**
 * Renders a .dot string to an SVG element.
 *
 * @param {string} dotString - Graphviz DOT source
 * @param {Object} [options] - Optional render options
 * @param {string} [options.engine='dot'] - Layout engine (dot, neato, fdp, etc.)
 * @returns {Promise<SVGSVGElement>} - Rendered SVG element
 * @throws {Error} - If rendering fails (malformed .dot, etc.)
 */
export async function renderDot(dotString, options = {}) {
	const viz = await getVizInstance();
	const engine = options.engine || 'dot';

	const result = viz.render(dotString, { engine, format: 'svg' });

	if (result.status !== 'success') {
		const errors = result.errors?.map((e) => e.message).join('; ') || 'Unknown render error';
		throw new Error(`Graphviz render failed: ${errors}`);
	}

	// Parse the SVG string into a DOM element
	const parser = new DOMParser();
	const doc = parser.parseFromString(result.output, 'image/svg+xml');
	const svg = doc.documentElement;

	// Make it responsive
	svg.setAttribute('width', '100%');
	svg.setAttribute('height', 'auto');
	svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

	return svg;
}

/**
 * Check if viz-js is loaded and ready.
 * @returns {boolean}
 */
export function isVizReady() {
	return vizInstance !== null;
}
