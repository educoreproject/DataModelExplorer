<script setup>
import { useSearchStore } from '@/stores/searchStore';
import { useRouter } from 'vue-router';
import { ref } from 'vue';

const searchStore = useSearchStore();
const router = useRouter();
const searchText = ref('');

const handleSearch = () => {
	const q = searchText.value.trim();
	if (!q) return;

	searchStore.search(q);
	router.push({ path: '/search', query: { q } });
};

const handleKeydown = (event) => {
	if (event.key === 'Enter' && !event.shiftKey) {
		event.preventDefault();
		handleSearch();
	}
};
</script>

<template>
	<v-text-field
		v-model="searchText"
		placeholder="Search data models..."
		variant="outlined"
		density="compact"
		hide-details
		single-line
		prepend-inner-icon="mdi-magnify"
		clearable
		class="search-bar"
		@keydown="handleKeydown"
		@click:append-inner="handleSearch"
	/>
</template>

<style scoped>
.search-bar {
	max-width: 400px;
	min-width: 250px;
	width: 100%;
}
</style>
