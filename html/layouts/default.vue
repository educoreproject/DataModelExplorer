<script setup>
import { ref } from 'vue';
import { useDisplay } from 'vuetify';

const { lgAndUp } = useDisplay();
const drawerOpen = ref(true);
</script>

<template>
	<v-app>
		<AppSidebar v-model="drawerOpen" :permanent="lgAndUp" />
		<AppTopBar @toggle-drawer="drawerOpen = !drawerOpen" />
		<v-main>
			<slot />
		</v-main>
	</v-app>
</template>
