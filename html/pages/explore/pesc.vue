<script setup>
// @concept: [[DataModelExplorer]]
// Explore → PESC Explorer, kept for its links (DEV-123). The explorer now opens on every standards family at
// /explore/graphicModelExplorer; this route sends a visitor there entered at PESC, with any ?path= it carried, so every
// shared /explore/pesc link still lands on its screen. The explorer page itself rewrites a path that does not begin
// at the families catalog, so the rule lives in one place (explorerVocabulary's explorerPathOf).

definePageMeta({
	middleware: [
		(to) =>
			navigateTo(
				{ path: '/explore/graphicModelExplorer', query: { path: typeof to.query.path === 'string' && to.query.path !== '' ? to.query.path : 'family:PESC' } },
				{ replace: true },
			),
	],
});
</script>

<template>
	<div data-testid="pesc-explorer-redirect" />
</template>
