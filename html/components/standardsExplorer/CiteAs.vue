<script setup>
// ⟪explorerUris⟫ The Cite as line, in the design of the /edc human page's: the node's EDUcore URI in monospace with a Copy button, and a link that opens
// the URI (its w3id address) in a new tab. A standard also links its manifest listing of elements. A node whose stableId is another publisher's IRI
// (uriKind ownIri) is cited by that IRI, and the line says it is not an EDUcore page. The panel draws this only for a node that carries a uri.

import { ref } from 'vue';

const props = defineProps({
	uri: { type: String, required: true },
	uriKind: { type: String, required: true },
	elementListUri: { type: String, default: '' },
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
			<span class="cite-label">Cite as</span>
			<code class="cite-uri" data-testid="detail-cite-uri">{{ uri }}</code>
			<button type="button" class="cite-copy" data-testid="detail-cite-copy" @click="copyUri">{{ copyState === 'copied' ? 'Copied' : copyState === 'failed' ? 'Copy failed' : 'Copy' }}</button>
		</div>
		<div class="cite-links">
			<a :href="uri" target="_blank" rel="noopener" data-testid="detail-cite-open">{{ uriKind === 'ownIri' ? 'Open its own IRI' : 'Open its page' }} ↗</a>
			<a v-if="elementListUri" :href="elementListUri" target="_blank" rel="noopener" data-testid="detail-cite-element-list">List its elements ↗</a>
		</div>
		<p v-if="uriKind === 'ownIri'" class="cite-note">Another publisher's IRI: what this node is, not an EDUcore page.</p>
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
