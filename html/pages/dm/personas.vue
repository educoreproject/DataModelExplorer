<script setup>
definePageMeta({ middleware: 'auth' });

import { personas } from '@/data/personas';

const route = useRoute();

// If we arrived with a prompt (from "Create implementation plan"), forward it through persona selection
const pendingPrompt = computed(() => route.query.prompt || '');
const useCaseLabel = computed(() => route.query.useCase || '');

function selectPersona(persona) {
	const query = {};
	if (pendingPrompt.value) {
		query.prompt = pendingPrompt.value;
		query.persona = persona.id;
	}
	navigateTo({ path: '/dm/explorer', query });
}
</script>

<template>
	<v-container class="py-12" style="max-width: 900px;">
		<div class="text-center mb-8">
			<h1 class="text-h4 font-weight-bold text-primary mb-3">Data Model Explorer</h1>
			<p v-if="useCaseLabel" class="text-body-1 text-medium-emphasis" style="max-width: 600px; margin: 0 auto;">
				Building an implementation plan for <strong>{{ useCaseLabel }}</strong>. First, select your role so the explorer can tailor its response.
			</p>
			<p v-else class="text-body-1 text-medium-emphasis" style="max-width: 600px; margin: 0 auto;">
				Let me help you find the right starting point. What's your primary role?
			</p>
		</div>

		<v-row>
			<v-col
				v-for="persona in personas"
				:key="persona.id"
				cols="12"
				sm="6"
				md="4"
			>
				<v-card
					class="persona-card pa-5 text-center h-100"
					variant="outlined"
					hover
					@click="selectPersona(persona)"
				>
					<v-icon size="48" color="primary" class="mb-3">{{ persona.icon }}</v-icon>
					<h3 class="text-subtitle-1 font-weight-bold mb-1">{{ persona.title }}</h3>
					<p class="text-body-2 text-medium-emphasis">{{ persona.description }}</p>
				</v-card>
			</v-col>
		</v-row>
	</v-container>
</template>

<style scoped>
.persona-card {
	transition: border-color 0.2s, box-shadow 0.2s;
	cursor: pointer;
}

.persona-card:hover {
	border-color: rgb(var(--v-theme-primary));
	box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
}
</style>
