<script setup>
import { ref, computed } from 'vue';

const props = defineProps({
	// The content to download — required
	content: { type: String, default: '' },

	// Override file type: 'md', 'html', 'txt', etc.
	// If omitted, component sniffs the content to decide.
	fileType: { type: String, default: '' },

	// Fallback filename (no extension) when generateFilename is absent or fails
	fallbackName: { type: String, default: 'download' },

	// Async callback: (contentSnippet) => Promise<string|null>
	// Caller provides the AI naming logic — component stays decoupled.
	generateFilename: { type: Function, default: null },

	// Tooltip text
	title: { type: String, default: 'Download' },

	// Icon name (Vuetify mdi icon)
	icon: { type: String, default: 'mdi-download' },
});

const generating = ref(false);

const hasContent = computed(() => props.content && props.content.trim().length > 0);

// Sniff content to determine file type when not explicitly set
const resolvedFileType = computed(() => {
	if (props.fileType) return props.fileType;
	const trimmed = props.content.trim();
	if (trimmed.startsWith('<') || trimmed.startsWith('{')) return 'html';
	return 'md';
});

const mimeTypes = {
	md: 'text/markdown',
	html: 'text/html',
	txt: 'text/plain',
};

const resolvedMimeType = computed(() => mimeTypes[resolvedFileType.value] || 'text/plain');

const handleDownload = async () => {
	if (!hasContent.value) return;

	let filename = props.fallbackName;

	// If caller provided a filename generator, use it
	if (props.generateFilename) {
		generating.value = true;
		try {
			const snippet = props.content.slice(0, 500);
			const suggested = await props.generateFilename(snippet);
			if (suggested) {
				// Clean up — AI might add quotes, extensions, or punctuation
				filename = suggested.replace(/['"`.]/g, '').trim();
			}
		} catch (err) {
			console.warn('[DownloadButton] generateFilename failed, using fallback:', err);
		} finally {
			generating.value = false;
		}
	}

	const blob = new Blob([props.content], { type: resolvedMimeType.value });
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement('a');
	anchor.href = url;
	anchor.download = `${filename}.${resolvedFileType.value}`;
	anchor.click();
	URL.revokeObjectURL(url);
};
</script>

<template>
	<v-btn
		icon
		variant="text"
		size="x-small"
		class="download-button"
		:title="title"
		:disabled="!hasContent"
		:loading="generating"
		@click="handleDownload"
	>
		<v-icon size="small">{{ icon }}</v-icon>
	</v-btn>
</template>

<style scoped>
.download-button {
	opacity: 0.6;
}
.download-button:hover {
	opacity: 1;
}
</style>
