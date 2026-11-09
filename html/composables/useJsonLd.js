// @concept: [[DataModelExplorer]]
// useJsonLd(key, buildJsonLd): one page's Schema.org JSON-LD, kept current as the page's data arrives. buildJsonLd answers
// the object (or null while there is nothing to describe); the page's script tag is keyed so it replaces itself rather than
// piling up. The text is escaped for a <script> element: '<' is written <, so a name from the graph holding
// '</script>' cannot end the tag early. The site-wide Organization and WebSite are in nuxt.config.ts.

export const jsonLdTextOf = (jsonLdObject) => JSON.stringify(jsonLdObject).replace(/</g, '\\u003c');

// the page's own absolute address (the site is a single-page app, so this is known only in the browser)
export const absoluteUrlOf = (routePath) => (typeof window === 'undefined' ? `https://educore.org${routePath}` : `${window.location.origin}${routePath}`);

export const useJsonLd = (key, buildJsonLd) => {
	useHead(() => {
		const jsonLdObject = buildJsonLd();
		if (!jsonLdObject) return {};
		return { script: [{ key: `jsonld-${key}`, type: 'application/ld+json', innerHTML: jsonLdTextOf({ '@context': 'https://schema.org', ...jsonLdObject }) }] };
	});
};
