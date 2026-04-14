<script setup>
import { libraryEntries } from '@/data/library-entries';

// Group by category
const categories = computed(() => {
	const grouped = {};
	libraryEntries.forEach((entry) => {
		if (!grouped[entry.category]) grouped[entry.category] = [];
		grouped[entry.category].push(entry);
	});
	return Object.entries(grouped).map(([category, items]) => ({ category, items }));
});

const burdenColor = (burden) => {
	if (burden === 'low') return 'success';
	if (burden === 'medium') return 'warning';
	return 'error';
};

const expandedCards = ref([]);
</script>

<template>
	<v-container class="py-8" style="max-width: 1100px;">
		<h1 class="text-h4 font-weight-bold text-primary mb-2">Interoperability Specifications</h1>
		<p class="text-body-1 text-medium-emphasis mb-8">
			{{ libraryEntries.length }} education data specifications with implementation guidance, equity considerations, and cross-spec relationships.
		</p>

		<div v-for="group in categories" :key="group.category" class="mb-10">
			<h2 class="text-h6 font-weight-bold mb-4">{{ group.category }}</h2>
			<v-row>
				<v-col
					v-for="spec in group.items"
					:key="spec.id"
					cols="12"
				>
					<v-card variant="outlined" class="mb-2">
						<v-card-title class="d-flex align-center flex-wrap ga-2 pb-1">
							<span class="text-subtitle-1 font-weight-bold" style="flex: 1; min-width: 200px;">{{ spec.title }}</span>
							<v-chip size="x-small" :color="burdenColor(spec.implementationBurden)" variant="tonal">
								{{ spec.implementationBurden }} burden
							</v-chip>
							<v-chip size="x-small" :color="spec.accessLevel === 'open' ? 'success' : 'warning'" variant="tonal">
								{{ spec.accessLevel }}
							</v-chip>
						</v-card-title>

						<v-card-subtitle class="pb-2">
							{{ spec.owner }} &mdash; v{{ spec.version }}
						</v-card-subtitle>

						<v-card-text class="pt-0">
							<p class="text-body-2 mb-3">{{ spec.description }}</p>

							<!-- Tags -->
							<div class="mb-3">
								<v-chip
									v-for="tag in spec.tags.slice(0, 8)"
									:key="tag"
									size="x-small"
									variant="tonal"
									class="mr-1 mb-1"
								>
									{{ tag }}
								</v-chip>
							</div>

							<!-- Expandable details -->
							<v-expansion-panels variant="accordion" flat>
								<v-expansion-panel>
									<v-expansion-panel-title class="text-caption font-weight-bold px-0">
										Implementation Details
									</v-expansion-panel-title>
									<v-expansion-panel-text>
										<!-- Burden Rubric -->
										<div v-if="spec.burdenRubric" class="mb-4">
											<h4 class="text-caption font-weight-bold mb-2">Burden Rubric</h4>
											<v-table density="compact">
												<tbody>
													<tr v-for="(val, key) in spec.burdenRubric" :key="key">
														<td class="text-capitalize font-weight-medium" style="width: 120px;">{{ key }}</td>
														<td>
															<v-chip size="x-small" :color="burdenColor(val.level === 'moderate' ? 'medium' : val.level)" variant="tonal" class="mr-2">
																{{ val.level }}
															</v-chip>
															{{ val.note }}
														</td>
													</tr>
												</tbody>
											</v-table>
										</div>

										<!-- Required Capabilities -->
										<div v-if="spec.requiredCapabilities?.length" class="mb-4">
											<h4 class="text-caption font-weight-bold mb-1">Required Capabilities</h4>
											<ul class="text-body-2 pl-4">
												<li v-for="cap in spec.requiredCapabilities" :key="cap">{{ cap }}</li>
											</ul>
										</div>

										<!-- Implementation Guidance -->
										<div v-if="spec.implementationGuidance" class="mb-4">
											<h4 class="text-caption font-weight-bold mb-1">Guidance</h4>
											<p class="text-body-2">{{ spec.implementationGuidance }}</p>
										</div>

										<!-- Commonly Paired With -->
										<div v-if="spec.commonlyPairedWith?.length" class="mb-4">
											<h4 class="text-caption font-weight-bold mb-1">Commonly Paired With</h4>
											<v-list density="compact" class="py-0">
												<v-list-item v-for="paired in spec.commonlyPairedWith" :key="paired.id" class="px-0">
													<v-list-item-title class="text-body-2 font-weight-medium">{{ paired.id }}</v-list-item-title>
													<v-list-item-subtitle class="text-caption">{{ paired.rationale }}</v-list-item-subtitle>
												</v-list-item>
											</v-list>
										</div>

										<!-- Known Adopters -->
										<div v-if="spec.knownAdopters?.length" class="mb-4">
											<h4 class="text-caption font-weight-bold mb-1">Known Adopters</h4>
											<div>
												<v-chip
													v-for="adopter in spec.knownAdopters"
													:key="adopter"
													size="x-small"
													variant="outlined"
													class="mr-1 mb-1"
												>
													{{ adopter }}
												</v-chip>
											</div>
										</div>

										<!-- Privacy Considerations -->
										<div v-if="spec.privacyConsiderations" class="mb-4">
											<h4 class="text-caption font-weight-bold mb-1">Privacy Considerations</h4>
											<p class="text-body-2">
												<v-chip size="x-small" variant="tonal" class="mr-1"
													:color="spec.privacyConsiderations.level === 'low-concern' ? 'success' : spec.privacyConsiderations.level === 'medium-concern' ? 'warning' : 'error'"
												>
													{{ spec.privacyConsiderations.level }}
												</v-chip>
												{{ spec.privacyConsiderations.notes }}
											</p>
											<div v-if="spec.privacyConsiderations.regulations?.length" class="mt-1">
												<v-chip v-for="reg in spec.privacyConsiderations.regulations" :key="reg" size="x-small" variant="outlined" class="mr-1">{{ reg }}</v-chip>
											</div>
										</div>

										<!-- Equity Considerations -->
										<div v-if="spec.equityConsiderations" class="mb-4">
											<h4 class="text-caption font-weight-bold mb-1">Equity Considerations</h4>
											<p class="text-body-2">
												<v-chip size="x-small" variant="tonal" class="mr-1"
													:color="spec.equityConsiderations.level === 'low-concern' ? 'success' : 'warning'"
												>
													{{ spec.equityConsiderations.level }}
												</v-chip>
												{{ spec.equityConsiderations.notes }}
											</p>
										</div>

										<!-- Sample Payloads -->
										<div v-if="spec.samplePayloads?.length" class="mb-4">
											<h4 class="text-caption font-weight-bold mb-2">Sample Payloads</h4>
											<div v-for="payload in spec.samplePayloads" :key="payload.label" class="mb-2">
												<div class="text-caption text-medium-emphasis mb-1">{{ payload.label }}</div>
												<pre class="pa-3 rounded" style="background: #2d2d2d; color: #f8f8f2; font-size: 0.8rem; overflow-x: auto; max-height: 300px;">{{ payload.code }}</pre>
											</div>
										</div>

										<!-- Technical Doc Links -->
										<div v-if="spec.technicalDocLinks?.length">
											<h4 class="text-caption font-weight-bold mb-1">Documentation</h4>
											<div>
												<v-btn
													v-for="link in spec.technicalDocLinks"
													:key="link.url"
													:href="link.url"
													target="_blank"
													size="small"
													variant="text"
													class="mr-2"
													prepend-icon="mdi-open-in-new"
												>
													{{ link.label }}
												</v-btn>
											</div>
										</div>
									</v-expansion-panel-text>
								</v-expansion-panel>
							</v-expansion-panels>
						</v-card-text>
					</v-card>
				</v-col>
			</v-row>
		</div>
	</v-container>
</template>
