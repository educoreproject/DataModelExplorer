<script setup>
import { ref, watch } from 'vue';
import { useDisplay } from 'vuetify';

// The sidebar stays put from 960 px wide up (a laptop, or the site beside another window): it is part of the page there,
// never an overlay that closes on a click. Narrower, it is an overlay the top bar's menu button opens; it starts closed so
// it does not cover a phone's page on load. Whenever the window becomes wide enough again, the sidebar comes back, even if
// it was closed as an overlay (its menu button is hidden at that width, so nothing else could reopen it).
const { mdAndUp } = useDisplay();
const drawerOpen = ref(mdAndUp.value);
watch(mdAndUp, (isWide) => {
	drawerOpen.value = isWide;
});
</script>

<template>
	<v-app>
		<AppSidebar v-model="drawerOpen" :permanent="mdAndUp" />
		<AppTopBar @toggle-drawer="drawerOpen = !drawerOpen" />
		<v-main class="d-flex flex-column">
			<div class="flex-grow-1">
				<slot />
			</div>
			<AppFooter />
		</v-main>
	</v-app>
</template>
