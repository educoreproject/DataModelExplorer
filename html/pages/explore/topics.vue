<script setup>
import { useUseCaseStore } from '@/stores/useCaseStore';
const ucStore = useUseCaseStore();

const topicCards = computed(() =>
	ucStore.taxonomy.map((topic) => ({
		...topic,
		driverCount: topic.children.length,
		useCaseCount: topic.children.reduce((sum, driver) => sum + driver.children.length, 0),
	})),
);
</script>

<template>
	<v-container class="py-8" style="max-width: 1000px;">
		<h1 class="text-h4 font-weight-bold text-primary mb-2">Topics</h1>
		<p class="text-body-1 text-medium-emphasis mb-8">
			Explore the key areas driving education data interoperability.
		</p>

		<v-row>
			<v-col
				v-for="topic in topicCards"
				:key="topic.id"
				cols="12"
				sm="6"
			>
				<v-card
					class="pa-6 h-100"
					variant="outlined"
					:to="`/explore/use-cases?topic=${topic.id}`"
					hover
				>
					<div class="d-flex align-center mb-3">
						<span class="text-h4 mr-3">{{ topic.icon }}</span>
						<h2 class="text-h6 font-weight-bold">{{ topic.label }}</h2>
					</div>
					<p class="text-body-2 text-medium-emphasis mb-4">{{ topic.subtitle }}</p>
					<div class="d-flex ga-4 text-caption text-medium-emphasis mb-3">
						<span><strong>{{ topic.driverCount }}</strong> value drivers</span>
						<span><strong>{{ topic.useCaseCount }}</strong> use cases</span>
					</div>
					<div>
						<v-chip
							v-for="driver in topic.children"
							:key="driver.id"
							size="small"
							variant="tonal"
							class="mr-1 mb-1"
						>
							{{ driver.label }}
						</v-chip>
					</div>
				</v-card>
			</v-col>
		</v-row>
	</v-container>
</template>
