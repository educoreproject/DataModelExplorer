<script setup>
import { useCaseTaxonomy, useCaseCedsDomains } from '@/data/use-case-taxonomy';

const route = useRoute();

// Pre-expand the topic from query param (e.g., /explore/use-cases?topic=sedm)
const expandedPanels = ref([]);

onMounted(() => {
	const topicId = route.query.topic;
	if (topicId) {
		const idx = filteredTaxonomy.value.findIndex((t) => t.id === topicId);
		if (idx >= 0) expandedPanels.value = [idx];
	}
});

// Only show topics/drivers/use-cases that have at least one complete item
const filteredTaxonomy = computed(() => {
	return useCaseTaxonomy
		.map(topic => {
			const filteredChildren = topic.children
				.map(driver => ({
					...driver,
					children: driver.children.filter(uc => uc.complete),
				}))
				.filter(driver => driver.children.length > 0);
			return { ...topic, children: filteredChildren };
		})
		.filter(topic => topic.children.length > 0);
});

const totalComplete = computed(() =>
	filteredTaxonomy.value.reduce(
		(sum, cat) => sum + cat.children.reduce((s, sub) => s + sub.children.length, 0),
		0,
	),
);

const totalAll = computed(() =>
	useCaseTaxonomy.reduce(
		(sum, cat) => sum + cat.children.reduce((s, sub) => s + sub.children.length, 0),
		0,
	),
);

const labelColor = (tag) => {
	const map = {
		LER: 'purple',
		'P20W+LER': 'indigo',
		SEDM: 'orange',
		Workforce: 'blue',
		'Administration / Operations': 'orange',
		Military: 'green',
		'Human Services': 'pink',
	};
	return map[tag] || 'grey';
};

const cedsDomainsFor = (ucId) => {
	return useCaseCedsDomains[ucId] || [];
};
</script>

<template>
	<v-container class="py-8" style="max-width: 1000px;">
		<h1 class="text-h4 font-weight-bold text-primary mb-2">Use Cases</h1>
		<p class="text-body-1 text-medium-emphasis mb-6">
			{{ totalComplete }} completed use cases out of {{ totalAll }} total, organized by topic and value driver.
		</p>

		<v-expansion-panels v-model="expandedPanels" variant="accordion" multiple>
			<v-expansion-panel
				v-for="topic in filteredTaxonomy"
				:key="topic.id"
			>
				<v-expansion-panel-title>
					<div class="d-flex align-center ga-3">
						<span class="text-h6">{{ topic.icon }}</span>
						<div>
							<span class="font-weight-bold">{{ topic.label }}</span>
							<div class="text-caption text-medium-emphasis">{{ topic.subtitle }}</div>
						</div>
						<v-chip size="x-small" color="success" variant="tonal" class="ml-auto">
							{{ topic.children.reduce((s, sub) => s + sub.children.length, 0) }} complete
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
						</h4>
						<v-list density="compact" class="py-0">
							<v-list-item
								v-for="uc in driver.children"
								:key="uc.id"
								class="px-0"
								:to="`/explore/use-cases/${uc.id}`"
							>
								<template #prepend>
									<v-icon size="small" color="success" class="mr-2">mdi-check-circle</v-icon>
									<a
										v-if="uc.githubIssue"
										:href="`https://github.com/educoreproject/educore_use_cases/issues/${uc.githubIssue}`"
										target="_blank"
										class="text-caption text-primary mr-2"
										style="text-decoration: none;"
										@click.stop
									>
										#{{ uc.githubIssue }}
									</a>
								</template>
								<v-list-item-title class="text-body-2">{{ uc.label }}</v-list-item-title>
								<v-list-item-subtitle v-if="cedsDomainsFor(uc.id).length" class="text-caption">
									CEDS: {{ cedsDomainsFor(uc.id).join(', ') }}
								</v-list-item-subtitle>
								<template #append>
									<div class="d-flex ga-1">
										<v-chip
											v-for="tag in (uc.tags || [])"
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
