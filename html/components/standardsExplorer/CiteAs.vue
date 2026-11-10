<script setup>
// ⟪explorerUris⟫ The Cite as line, in the design of the /edc human page's: the node's EDUcore URI in monospace with a Copy button, and a link that opens
// the URI (its w3id address) in a new tab. A standard also links its manifest listing of elements. A node whose stableId is another publisher's IRI
// (uriKind ownIri) is cited by that IRI, and the line says it is not an EDUcore page. The panel draws this only for a node that carries a uri.
// ⟪meaningsPolish⟫ uriIsTheLink (the walk profile's citesUriAsLink): the URI itself is the link to its page, and the separate open link is not drawn, so
// the panel shows one Open link (punch-list item 2). The Standards Explorer passes false and draws exactly as before.

import { ref } from 'vue';
import { citeAsVocabulary } from '@/components/standardsExplorer/explorerVocabulary';

const props = defineProps({
	uri: { type: String, required: true },
	uriKind: { type: String, required: true },
	elementListUri: { type: String, default: '' },
	uriIsTheLink: { type: Boolean, required: true },
});

const COPIED_SHOWN_MILLISECONDS = 1500;
const copyState = ref('idle');

const copyUri = async () => {
	try {
		await navigator.clipboard.writeText(props.uri);
		copyState.value = 'copied';
		setTimeout(() => (copyState.value = 'idle'), COPIED_SHOWN_MILLISECONDS);
	} catch (error) {
		copyState.value = 'failed';
	}
};
</script>

<template>
	<div class="cite" data-testid="detail-cite">
		<div class="cite-row">
			<span class="cite-label">{{ citeAsVocabulary.citeLabel }}</span>
			<a v-if="uriIsTheLink" :href="uri" target="_blank" rel="noopener" class="cite-uri" data-testid="detail-cite-uri"><code>{{ uri }}</code></a>
			<code v-else class="cite-uri" data-testid="detail-cite-uri">{{ uri }}</code>
			<button type="button" class="cite-copy" data-testid="detail-cite-copy" @click="copyUri">{{ copyState === 'copied' ? citeAsVocabulary.copiedText : copyState === 'failed' ? citeAsVocabulary.copyFailedText : citeAsVocabulary.copyText }}</button>
		</div>
		<div v-if="!uriIsTheLink || elementListUri" class="cite-links">
			<a v-if="!uriIsTheLink" :href="uri" target="_blank" rel="noopener" data-testid="detail-cite-open">{{ uriKind === 'ownIri' ? citeAsVocabulary.openOwnIriText : citeAsVocabulary.openPageText }} ↗</a>
			<a v-if="elementListUri" :href="elementListUri" target="_blank" rel="noopener" data-testid="detail-cite-element-list">{{ citeAsVocabulary.listElementsText }} ↗</a>
		</div>
		<p v-if="uriKind === 'ownIri'" class="cite-note">{{ citeAsVocabulary.ownIriNoteText }}</p>
	</div>
</template>

<style scoped>
.cite {
	border: 1px solid #e3e7ef;
	border-radius: 10px;
	padding: 12px;
	display: flex;
	flex-direction: column;
	gap: 8px;
	background: #fbfcfe;
}
.cite-row {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
}
.cite-label {
	font-weight: 700;
	color: #072a6c;
	font-size: 14px;
}
.cite-uri {
	flex: 1 1 14rem;
	min-width: 0;
	font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
	font-size: 13px;
	background: #eef1f7;
	border-radius: 4px;
	padding: 5px 8px;
	overflow-wrap: anywhere;
	word-break: break-word;
}
.cite-copy {
	font: inherit;
	font-size: 13px;
	font-weight: 600;
	border: 1px solid #00b5b8;
	color: #072a6c;
	background: transparent;
	border-radius: 6px;
	padding: 3px 11px;
	cursor: pointer;
}
.cite-links {
	display: flex;
	flex-wrap: wrap;
	gap: 14px;
	font-size: 14px;
}
.cite-note {
	margin: 0;
	font-size: 13px;
	color: #6b7280;
}
</style>
