<script setup>
import { useUseCaseStore } from '@/stores/useCaseStore';
import { useLoginStore } from '@/stores/loginStore';
const ucStore = useUseCaseStore();
const loginStore = useLoginStore();

const route = useRoute();

const userRoles = computed(() =>
	(loginStore.loggedInUser?.role || '').split(',').map((r) => r.trim()).filter(Boolean)
);
const canEditUseCases = computed(() =>
	userRoles.value.includes('admin') || userRoles.value.includes('super')
);
const showUseCaseButton = computed(() => loginStore.validUser);
const useCaseButtonLabel = computed(() => (canEditUseCases.value ? 'View / Edit' : 'View All'));
const useCaseButtonIcon = computed(() => (canEditUseCases.value ? 'mdi-pencil' : 'mdi-eye-outline'));

// Pre-expand the topic from query param (e.g., /explore/use-cases?topic=all-learning-counts)
const expandedPanels = ref([]);

onMounted(() => {
	const topicId = route.query.topic;
	if (topicId) {
		const idx = ucStore.taxonomy.findIndex((t) => t.id === topicId);
		if (idx >= 0) expandedPanels.value = [idx];
	}
});

const totalUseCases = computed(() => ucStore.useCaseCount);

// Resolve a use case ID to its full object from the store
const resolveUc = (ucId) => ucStore.useCaseById(ucId);

const labelColor = (tag) => {
	const map = {
		LER: 'purple',
		Workforce: 'blue',
		'Administration / Operations': 'orange',
		Military: 'green',
		'Human Services': 'pink',
	};
	return map[tag] || 'grey';
};
</script>

<template>
	<v-container class="py-8" style="max-width: 1000px;">
		<div class="d-flex align-center ga-3 mb-2">
			<h1 class="text-h4 font-weight-bold text-primary">Use Cases</h1>
			<v-btn
				v-if="showUseCaseButton"
				color="primary"
				variant="outlined"
				size="small"
				:prepend-icon="useCaseButtonIcon"
				to="/uc/editor"
			>
				{{ useCaseButtonLabel }}
			</v-btn>
		</div>
		<p class="text-body-1 text-medium-emphasis mb-6">
			{{ totalUseCases }} use cases organized by topic and value driver, mapped to GitHub issues.
		</p>

		<v-expansion-panels v-model="expandedPanels" variant="accordion" multiple>
			<v-expansion-panel
				v-for="topic in ucStore.taxonomy"
				:key="topic.id"
			>
				<v-expansion-panel-title>
					<div class="d-flex align-center ga-3">
						<span class="text-h6">{{ topic.icon }}</span>
						<div>
							<span class="font-weight-bold">{{ topic.label }}</span>
							<div class="text-caption text-medium-emphasis">{{ topic.subtitle }}</div>
						</div>
						<v-chip size="x-small" variant="tonal" class="ml-auto">
							{{ topic.children.reduce((s, sub) => s + sub.children.length, 0) }}
						</v-chip>
					</div>
				</v-expansion-panel-title>

				<v-expansion-panel-text>
					<div
						v-for="driver in topic.children"
						:key="driver.id"
						class="mb-5"
					>
						<h4 class="text-subtitle-2 font-weight-bold text-medium-emphasis mb-2" style="border-bottom: 1px solid #eee; padding-bottom: 4px;">
							{{ driver.label }}
							<v-chip size="x-small" variant="text" class="ml-1">{{ driver.children.length }}</v-chip>
						</h4>
						<v-list density="compact" class="py-0">
							<v-list-item
								v-for="ucId in driver.children"
								:key="ucId"
								class="px-0"
								:to="`/explore/use-cases/${ucId}`"
							>
								<template #prepend>
									<a
										v-if="resolveUc(ucId)?.githubIssue"
										:href="`https://github.com/educoreproject/educore_use_cases/issues/${resolveUc(ucId).githubIssue}`"
										target="_blank"
										class="text-caption text-primary mr-2"
										style="text-decoration: none;"
										@click.stop
									>
										#{{ resolveUc(ucId).githubIssue }}
									</a>
								</template>
								<v-list-item-title class="text-body-2">{{ resolveUc(ucId)?.title || ucId }}</v-list-item-title>
								<v-list-item-subtitle v-if="resolveUc(ucId)?.cedsDomains?.length" class="text-caption">
									CEDS: {{ resolveUc(ucId).cedsDomains.join(', ') }}
								</v-list-item-subtitle>
								<template #append>
									<div class="d-flex ga-1">
										<v-chip
											v-for="tag in (resolveUc(ucId)?.tags || [])"
											:key="tag"
											size="x-small"
											:color="labelColor(tag)"
											variant="tonal"
										>
											{{ tag }}
										</v-chip>
									</div>
								</template>
							</v-list-item>
						</v-list>
					</div>
				</v-expansion-panel-text>
			</v-expansion-panel>
		</v-expansion-panels>
	</v-container>
</template>
