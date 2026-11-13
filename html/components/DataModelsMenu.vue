<script setup>
// DataModelsMenu.vue — the options menu under the Data Models title (TQ 2026-11-08: a hamburger that "opens menu of
// options, starts with certification"). The items are data (data/dataModelsMenuItemList.ts); the page the visitor is on
// is shown as current and not offered as a link.

import { useRoute, useRouter } from 'vue-router';
import { dataModelsMenuItemList } from '@/data/dataModelsMenuItemList';

const route = useRoute();
const router = useRouter();
</script>

<template>
	<v-menu location="bottom start">
		<template #activator="{ props: activatorProps }">
			<v-btn v-bind="activatorProps" icon="mdi-menu" variant="text" size="small" density="comfortable" title="Data Models options" data-testid="data-models-menu-button" />
		</template>
		<v-list density="compact" min-width="280">
			<v-list-item
				v-for="menuItem in dataModelsMenuItemList"
				:key="menuItem.menuItemName"
				:prepend-icon="menuItem.iconName"
				:title="menuItem.titleText"
				:subtitle="menuItem.subtitleText"
				:active="route.path === menuItem.routePath"
				:data-testid="`data-models-menu-${menuItem.menuItemName}`"
				@click="route.path !== menuItem.routePath && router.push(menuItem.routePath)"
			/>
		</v-list>
	</v-menu>
</template>
