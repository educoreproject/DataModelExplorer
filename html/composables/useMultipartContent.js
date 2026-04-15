// composables/useMultipartContent.js
//
// Processes <control> content: detects multipart JSON format,
// resolves cid: references against typed attachments.

import JSON5 from 'json5';
import { renderDot } from '~/composables/useVizRenderer.js';

/**
 * Renderer dispatch map. Each renderer takes attachment content and
 * returns a DOM element (or a Promise of one).
 */
const renderers = {
	dot: async (content) => {
		return await renderDot(content);
	},
	svg: async (content) => {
		const parser = new DOMParser();
		const doc = parser.parseFromString(content, 'image/svg+xml');
		const svg = doc.documentElement;
		svg.setAttribute('width', '100%');
		svg.setAttribute('height', 'auto');
		return svg;
	},
};

/**
 * Attempts to parse control content as multipart JSON.
 * Returns null if content is legacy raw HTML.
 *
 * @param {string} raw - The content extracted from inside <control> tags
 * @returns {Object|null} - Parsed { html, attachments } or null for legacy
 */
export function parseMultipartContent(raw) {
	const trimmed = raw.trim();

	// Quick heuristic: multipart content starts with {
	if (!trimmed.startsWith('{')) return null;

	// Use JSON5: accepts strict JSON plus single-quoted strings, unquoted keys,
	// trailing commas, and comments. This tolerates the pseudo-JSON form the
	// prompt spec has historically shown the model. Anything still unparseable
	// is treated as legacy plain-HTML control content.
	try {
		const parsed = JSON5.parse(trimmed);
		if (parsed.html && typeof parsed.html === 'string') {
			return {
				html: parsed.html,
				attachments: parsed.attachments || {},
			};
		}
	} catch (e) {
		// Not parseable — treat as legacy HTML
	}

	return null;
}

/**
 * Resolves cid: references in a DOM container against the attachments map.
 * Finds all <img src="cid:..."> elements and replaces them with rendered
 * content from the matching attachment.
 *
 * @param {HTMLElement} container - The DOM element containing injected HTML
 * @param {Object} attachments - Map of { id: { type, content } }
 * @returns {Promise<string[]>} - Array of error messages (empty if all succeeded)
 */
export async function resolveCidReferences(container, attachments) {
	const errors = [];
	const cidImages = container.querySelectorAll('img[src^="cid:"]');

	const promises = Array.from(cidImages).map(async (img) => {
		const cidId = img.getAttribute('src').replace('cid:', '');
		const attachment = attachments[cidId];

		if (!attachment) {
			const msg = `Attachment not found: cid:${cidId}`;
			errors.push(msg);
			img.replaceWith(createErrorPlaceholder(msg));
			return;
		}

		const renderer = renderers[attachment.type];
		if (!renderer) {
			const msg = `No renderer for type: ${attachment.type}`;
			errors.push(msg);
			img.replaceWith(createErrorPlaceholder(msg));
			return;
		}

		try {
			// Show loading state
			const loading = document.createElement('div');
			loading.textContent = `Rendering ${attachment.type}...`;
			loading.style.cssText = 'color: #888; font-style: italic; padding: 8px;';
			img.replaceWith(loading);

			const rendered = await renderer(attachment.content);

			// Wrap in a container div for styling
			const wrapper = document.createElement('div');
			wrapper.className = 'cid-rendered-content';
			wrapper.dataset.cidId = cidId;
			wrapper.dataset.cidType = attachment.type;
			wrapper.title = 'Click to enlarge';
			wrapper.addEventListener('click', () => {
				wrapper.classList.toggle('cid-fullscreen');
			});
			wrapper.appendChild(rendered);

			loading.replaceWith(wrapper);
		} catch (err) {
			const msg = `Render failed for cid:${cidId}: ${err.message}`;
			errors.push(msg);
			// Replace loading indicator with error
			const existing = container.querySelector(`[data-cid-id="${cidId}"]`) ||
				container.querySelector(`div`); // fallback to loading div
			if (existing) {
				existing.replaceWith(createErrorPlaceholder(msg));
			}
		}
	});

	await Promise.all(promises);
	return errors;
}

/**
 * Creates an error placeholder element for failed renders.
 */
function createErrorPlaceholder(message) {
	const el = document.createElement('div');
	el.className = 'cid-render-error';
	el.style.cssText =
		'border: 1px solid #e74c3c; background: #fdf0ef; color: #c0392b; ' +
		'padding: 8px 12px; border-radius: 4px; font-size: 12px; margin: 4px 0;';
	el.textContent = message;
	return el;
}

/**
 * Checks if a renderer exists for the given type.
 */
export function hasRenderer(type) {
	return type in renderers;
}

/**
 * Returns the list of supported renderer types.
 */
export function supportedTypes() {
	return Object.keys(renderers);
}
