<script setup>
import { taxonomy, useCases, stats } from '@/data/github-use-cases';
import { useLoginStore } from '@/stores/loginStore';

const loginStore = useLoginStore();
const route = useRoute();

// Role-aware entry to the editor
const userRoles = computed(() =>
	(loginStore.loggedInUser?.role || '').split(',').map((r) => r.trim()).filter(Boolean)
);
const canEditUseCases = computed(() =>
	userRoles.value.includes('admin') || userRoles.value.includes('super')
);
const showUseCaseButton = computed(() => loginStore.validUser);
const useCaseButtonLabel = computed(() => (canEditUseCases.value ? 'View / Edit' : 'View All'));
const useCaseButtonIcon = computed(() => (canEditUseCases.value ? 'mdi-pencil' : 'mdi-eye-outline'));

// Checkbox: off = vetted only; on = vetted + partially-vetted ("under review").
// Unvetted items are never shown on this page.
const showUnvetted = ref(false);

// Index use cases by id for fast lookup
const useCaseById = computed(() => {
	const map = new Map();
	for (const uc of useCases) map.set(uc.id, uc);
	return map;
});

// Taxonomy filtered to only include use cases matching the current visibility.
const visibleTaxonomy = computed(() => {
	return taxonomy
		.map((topic) => {
			const subs = topic.children
				.map((sub) => {
					const visible = sub.children.filter((ucId) => {
						const uc = useCaseById.value.get(ucId);
						if (!uc) return false;
						if (uc.status === 'unvetted') return false; // never shown here
						if (uc.status === 'partially-vetted') return showUnvetted.value;
						return true; // vetted always visible
					});
					return { ...sub, children: visible };
				})
				.filter((sub) => sub.children.length > 0);
			return { ...topic, children: subs };
		})
		.filter((topic) => topic.children.length > 0);
});

// Total displayed in the page subtitle tracks visibility: vetted only by default,
// or vetted + partially-vetted when the checkbox is on.
const displayedTotal = computed(() =>
	showUnvetted.value ? stats.vetted + stats.partiallyVetted : stats.vetted,
);

// Pre-expand a topic via ?topic=sedm or ?topic=p20w-ler
const expandedPanels = ref([]);
onMounted(() => {
	const topicId = route.query.topic;
	if (topicId) {
		const idx = visibleTaxonomy.value.findIndex((t) => t.id === topicId);
		if (idx >= 0) expandedPanels.value = [idx];
	}
});

// Status → icon + color
function statusIcon(status) {
	if (status === 'vetted') return { icon: 'mdi-check-circle', color: 'success' };
	if (status === 'partially-vetted') return { icon: 'mdi-circle-outline', color: 'warning' };
	return { icon: 'mdi-circle-outline', color: 'grey' };
}

// Row-level opacity so partially-vetted reads as "under review" and unvetted as a draft.
function rowOpacity(status) {
	if (status === 'partially-vetted') return 0.6;
	if (status === 'unvetted') return 0.45;
	return 1;
}
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

		<div class="d-flex align-center ga-2 flex-wrap text-body-1 text-medium-emphasis mb-2">
			<span>{{ displayedTotal }} use cases across SEDM and P20W+LER topics.</span>
			<v-chip size="small" color="success" variant="tonal">{{ stats.vetted }} vetted</v-chip>
			<v-chip size="small" color="warning" variant="tonal">{{ stats.partiallyVetted }} partially vetted</v-chip>
		</div>

		<v-checkbox
			v-model="showUnvetted"
			label="Show use cases under review"
			density="compact"
			hide-details
			class="mb-4"
		/>

		<v-expansion-panels v-model="expandedPanels" variant="accordion" multiple>
			<v-expansion-panel
				v-for="topic in visibleTaxonomy"
				:key="topic.id"
			>
				<v-expansion-panel-title>
					<div class="d-flex align-center ga-3 w-100">
						<span class="text-h6">{{ topic.icon }}</span>
						<div class="flex-grow-1">
							<span class="font-weight-bold">{{ topic.label }}</span>
							<div class="text-caption text-medium-emphasis">{{ topic.subtitle }}</div>
						</div>
						<v-chip size="x-small" variant="tonal">
							{{ topic.children.reduce((s, sub) => s + sub.children.length, 0) }}
						</v-chip>
					</div>
				</v-expansion-panel-title>

				<v-expansion-panel-text>
					<div
						v-for="sub in topic.children"
						:key="sub.id"
						class="mb-5"
					>
						<h4
							class="text-subtitle-2 font-weight-bold text-medium-emphasis mb-2"
							style="border-bottom: 1px solid #eee; padding-bottom: 4px;"
						>
							{{ sub.label }}
							<v-chip size="x-small" variant="text" class="ml-1">{{ sub.children.length }}</v-chip>
						</h4>
						<v-list density="compact" class="py-0">
							<v-list-item
								v-for="ucId in sub.children"
								:key="ucId"
								class="px-0"
								:to="`/explore/use-cases/${ucId}`"
								:style="{ opacity: rowOpacity(useCaseById.get(ucId)?.status) }"
							>
								<template #prepend>
									<v-icon
										:color="statusIcon(useCaseById.get(ucId)?.status).color"
										size="small"
										class="mr-2"
									>
										{{ statusIcon(useCaseById.get(ucId)?.status).icon }}
									</v-icon>
									<a
										v-if="useCaseById.get(ucId)?.githubIssue"
										:href="`https://github.com/educoreproject/educore_use_cases/issues/${useCaseById.get(ucId).githubIssue}`"
										target="_blank"
										class="text-caption text-primary mr-2"
										style="text-decoration: none;"
										@click.stop
									>
										#{{ useCaseById.get(ucId).githubIssue }}
									</a>
								</template>
								<v-list-item-title class="text-body-2">
									{{ useCaseById.get(ucId)?.title || ucId }}
								</v-list-item-title>
								<v-list-item-subtitle
									v-if="useCaseById.get(ucId)?.cedsDomains?.length"
									class="text-caption"
								>
									CEDS: {{ useCaseById.get(ucId).cedsDomains.join(', ') }}
								</v-list-item-subtitle>
							</v-list-item>
						</v-list>
					</div>
				</v-expansion-panel-text>
			</v-expansion-panel>
		</v-expansion-panels>
	</v-container>
</template>
