<script setup>
// @concept: [[DocumentLibrary]]
import { useLoginStore } from '@/stores/loginStore';
import { useLibraryStore } from '@/stores/libraryStore';
import { ref, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';

const LoginStore = useLoginStore();
const libraryStore = useLibraryStore();
const router = useRouter();
const route = useRoute();

const newWindowDocName = ref('');
const openInNewWindow = ref(false);

// Auth guard + deep-link support
onMounted(async () => {
	if (!LoginStore.validUser) {
		router.push({ path: '/', query: { redirect: route.fullPath } });
		return;
	}
	await libraryStore.fetchCatalog();

	// Auto-open document from ?doc= query parameter
	const docParam = route.query.doc;
	if (docParam && libraryStore.catalog.length) {
		const match = libraryStore.catalog.find(d => d.filename === docParam);
		if (match) {
			handleDocClick(match);
		}
	}
});

const handleDocClick = (doc) => {
	// Update URL with ?doc= for bookmarkability
	router.replace({ query: { doc: doc.filename } });

	if (openInNewWindow.value) {
		newWindowDocName.value = doc.displayName;
		libraryStore.currentPage = null;
		libraryStore.openInNewWindow(doc.filename);
	} else {
		newWindowDocName.value = '';
		libraryStore.fetchPage(doc.filename);
	}
};
</script>

<template>
	<v-app>
		<generalNavSub />
		<v-main style="padding-top: 65px;">
			<v-container fluid class="fill-height pa-0">
				<v-row no-gutters class="fill-height">
					<!-- Left sidebar: catalog -->
					<v-col cols="3" class="sidebar">
						<v-list density="compact" nav>
							<v-list-item @click="openInNewWindow = !openInNewWindow">
								<v-list-item-title>
									Open in new window
									<v-icon size="small" class="ml-1">
										{{ openInNewWindow ? 'mdi-checkbox-marked' : 'mdi-checkbox-blank-outline' }}
									</v-icon>
								</v-list-item-title>
							</v-list-item>
							<v-divider />
							<v-list-item
								v-for="doc in libraryStore.sortedCatalog"
								:key="doc.anchor"
								:active="doc.filename === libraryStore.currentFilename"
								@click="handleDocClick(doc)"
							>
								<v-list-item-title>{{ doc.displayName }}</v-list-item-title>
								<v-tooltip v-if="doc.tooltip" activator="parent">
									{{ doc.tooltip }}
								</v-tooltip>
							</v-list-item>
						</v-list>
					</v-col>

					<!-- Right panel: content -->
					<v-col cols="9" class="content-panel">
						<v-progress-linear
							v-if="libraryStore.loading"
							indeterminate
							color="primary"
						/>
						<iframe
							v-else-if="libraryStore.currentPage && !newWindowDocName"
							:srcdoc="libraryStore.currentPage.content"
							class="document-iframe"
							frameborder="0"
						/>
						<div v-else-if="newWindowDocName" class="placeholder text-medium-emphasis text-subtitle-1 d-flex justify-center align-center fill-height">
							Document '{{ newWindowDocName }}' opened in new window
						</div>
						<div v-else class="placeholder text-medium-emphasis text-subtitle-1 d-flex justify-center align-center fill-height">
							Select a document from the sidebar
						</div>
					</v-col>
				</v-row>
			</v-container>
		</v-main>
	</v-app>
</template>

<style scoped>
.sidebar {
	border-right: 1px solid rgba(0, 0, 0, 0.12);
	background-color: #f9f9f6;
	overflow-y: auto;
	max-height: calc(100vh - 120px);
}
.content-panel {
	overflow: hidden;
}
.document-iframe {
	width: 100%;
	height: calc(100vh - 120px);
	border: none;
}
.placeholder {
	min-height: calc(100vh - 120px);
}
</style>
