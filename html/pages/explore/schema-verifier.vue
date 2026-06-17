<script setup>
// @concept: [[SchemaVerifier]]
// Reference Library → Schema Verifier.
//
// A better-than-spreadsheet view of the JEDx ↔ HR Open data dictionary, plus an
// OpenAPI loader that breaks any schema into its component parts and resolves
// every property against CEDS (live EDUcore graph) and HR Open (bundled crosswalk).

import { ref, computed } from 'vue';
import { useSchemaVerifierStore } from '@/stores/schemaVerifierStore';

const store = useSchemaVerifierStore();

const mode = ref('crosswalk'); // 'crosswalk' | 'openapi'

// ── Crosswalk mode state ───────────────────────────────────────────
const activeSectionId = ref(store.crosswalk[0]?.id || 'I');
const activeSection = computed(() =>
	store.crosswalk.find((s) => s.id === activeSectionId.value) || store.crosswalk[0],
);
const crosswalkSearch = ref('');
const selectedElement = ref(null);

const filteredElements = computed(() => {
	const els = activeSection.value?.elements || [];
	const q = crosswalkSearch.value.trim().toLowerCase();
	if (!q) return els;
	return els.filter(
		(e) =>
			e.name.toLowerCase().includes(q) ||
			e.id.toLowerCase().includes(q) ||
			e.hrOpenProperty.toLowerCase().includes(q),
	);
});

function selectElement(el) {
	selectedElement.value = el;
}

// ── OpenAPI mode state ─────────────────────────────────────────────
const pasteText = ref('');
const urlText = ref('');
const activeComponentName = ref(null);
const selectedProperty = ref(null);
const fileInput = ref(null);

const activeComponent = computed(() =>
	store.api?.components.find((c) => c.name === activeComponentName.value) || null,
);

function doLoadText() {
	if (store.loadOpenApiText(pasteText.value)) {
		activeComponentName.value = store.api.components[0]?.name || null;
		selectedProperty.value = null;
	}
}
async function doLoadUrl() {
	if (await store.loadOpenApiUrl(urlText.value)) {
		activeComponentName.value = store.api.components[0]?.name || null;
		selectedProperty.value = null;
	}
}
function onFile(e) {
	const file = e.target.files?.[0];
	if (!file) return;
	const reader = new FileReader();
	reader.onload = () => {
		pasteText.value = reader.result;
		doLoadText();
	};
	reader.readAsText(file);
}
function resetApi() {
	store.clearApi();
	activeComponentName.value = null;
	selectedProperty.value = null;
	pasteText.value = '';
}
function selectComponent(name) {
	activeComponentName.value = name;
	selectedProperty.value = null;
}

// A compact JEDx-flavoured sample so the tool is explorable with one click.
const SAMPLE = JSON.stringify(
	{
		openapi: '3.0.3',
		info: { title: 'JEDx Employer Reporting (sample)', version: '0.1.0' },
		components: {
			schemas: {
				Organization: {
					type: 'object',
					description: 'An employing organization.',
					required: ['legalName'],
					properties: {
						legalName: { type: 'string', description: 'Legal name of the organization.' },
						tradeNames: { type: 'array', items: { type: 'string' } },
						federalEmployerIdentificationNumber: { type: 'string', description: 'FEIN / EIN.' },
						organizationType: { type: 'string' },
						operatingStatus: { type: 'string' },
					},
				},
				Job: {
					type: 'object',
					properties: {
						organizationJobId: { type: 'string' },
						jobTitle: { type: 'string', description: 'Job title.' },
						jobCategoryCode: { type: 'string' },
					},
				},
				Worker: {
					type: 'object',
					properties: {
						workerIdentification: { type: 'string' },
						socialSecurityNumber: { type: 'string' },
						firstName: { type: 'string' },
						lastName: { type: 'string' },
						birthDate: { type: 'string', format: 'date' },
					},
				},
			},
		},
	},
	null,
	2,
);
function loadSample() {
	pasteText.value = SAMPLE;
	doLoadText();
}
</script>

<template>
	<v-container class="py-8" style="max-width: 1240px;">
		<!-- Header -->
		<div class="d-flex align-center flex-wrap ga-3 mb-1">
			<h1 class="text-h4 font-weight-bold text-primary">Schema Verifier</h1>
			<v-chip color="indigo" variant="tonal" size="small" prepend-icon="mdi-graph-outline">
				EDUcore knowledge graph
			</v-chip>
		</div>
		<p class="text-body-1 text-medium-emphasis mb-5">
			Break a schema into its component parts and see, property by property, which elements in
			<strong>CEDS</strong> and <strong>HR Open</strong> are equivalent. CEDS and cross-standard
			matches are resolved live from the EDUcore graph; HR Open comes from the JEDx data dictionary
			crosswalk ({{ store.crosswalkMeta.elementCount }} mapped elements).
		</p>

		<!-- Mode toggle -->
		<v-btn-toggle v-model="mode" mandatory color="primary" variant="outlined" density="comfortable" class="mb-6">
			<v-btn value="crosswalk" prepend-icon="mdi-table-large">JEDx ↔ HR Open Crosswalk</v-btn>
			<v-btn value="openapi" prepend-icon="mdi-code-json">Load OpenAPI Schema</v-btn>
		</v-btn-toggle>

		<!-- ════════════════════ CROSSWALK MODE ════════════════════ -->
		<template v-if="mode === 'crosswalk'">
			<!-- Section tabs -->
			<v-tabs
				v-model="activeSectionId"
				color="primary"
				show-arrows
				density="comfortable"
				class="mb-4 section-tabs"
			>
				<v-tab v-for="s in store.crosswalk" :key="s.id" :value="s.id">
					<span class="font-weight-bold mr-1">{{ s.id }}.</span> {{ s.label }}
					<v-chip size="x-small" variant="tonal" class="ml-2">{{ s.count }}</v-chip>
				</v-tab>
			</v-tabs>

			<v-row>
				<!-- Element list -->
				<v-col cols="12" md="6" lg="5">
					<v-text-field
						v-model="crosswalkSearch"
						prepend-inner-icon="mdi-magnify"
						placeholder="Filter elements in this section…"
						variant="outlined"
						density="compact"
						hide-details
						clearable
						class="mb-3"
					/>
					<v-card variant="outlined" class="element-list">
						<v-list density="compact" nav>
							<v-list-item
								v-for="el in filteredElements"
								:key="el.id"
								:active="selectedElement?.id === el.id"
								color="primary"
								@click="selectElement(el)"
							>
								<template #prepend>
									<span
										class="text-caption text-medium-emphasis mono mr-2"
										:style="{ paddingLeft: `${el.depth * 12}px`, minWidth: '64px' }"
									>{{ el.id }}</span>
								</template>
								<v-list-item-title class="text-body-2">{{ el.name }}</v-list-item-title>
								<v-list-item-subtitle class="mono" style="font-size: 0.72rem;">
									{{ el.hrOpenProperty }}
								</v-list-item-subtitle>
							</v-list-item>
							<v-list-item v-if="!filteredElements.length">
								<v-list-item-title class="text-caption text-medium-emphasis">
									No elements match.
								</v-list-item-title>
							</v-list-item>
						</v-list>
					</v-card>
				</v-col>

				<!-- Detail -->
				<v-col cols="12" md="6" lg="7">
					<v-card v-if="selectedElement" variant="outlined">
						<v-card-item>
							<div class="d-flex align-center flex-wrap ga-2">
								<v-chip size="small" color="primary" variant="tonal">{{ selectedElement.id }}</v-chip>
								<span class="text-h6 font-weight-bold">{{ selectedElement.name }}</span>
							</div>
						</v-card-item>
						<v-card-text>
							<p v-if="selectedElement.definition" class="text-body-2 mb-4">
								{{ selectedElement.definition }}
							</p>
							<v-alert
								v-if="selectedElement.revisionNotes"
								type="info"
								variant="tonal"
								density="compact"
								icon="mdi-comment-question-outline"
								class="mb-4 text-body-2"
							>
								{{ selectedElement.revisionNotes }}
							</v-alert>

							<SchemaEquivalents
								:term="selectedElement.name"
								:hr-open-seed="selectedElement"
							/>
						</v-card-text>
					</v-card>

					<v-card v-else variant="flat" color="grey-lighten-4" class="pa-10 text-center" rounded="lg">
						<v-icon size="42" color="grey" class="mb-3">mdi-gesture-tap</v-icon>
						<p class="text-body-2 text-medium-emphasis mb-0">
							Select an element to see its HR Open mapping and live CEDS equivalents.
						</p>
					</v-card>
				</v-col>
			</v-row>
		</template>

		<!-- ════════════════════ OPENAPI MODE ════════════════════ -->
		<template v-else>
			<!-- Loader -->
			<v-card v-if="!store.hasApi" variant="outlined" class="mb-4">
				<v-card-text>
					<div class="d-flex align-center flex-wrap ga-2 mb-3">
						<v-btn color="primary" variant="tonal" prepend-icon="mdi-flask-outline" @click="loadSample">
							Load sample (JEDx-flavoured)
						</v-btn>
						<v-btn variant="text" prepend-icon="mdi-upload" @click="fileInput?.click()">
							Upload file
						</v-btn>
						<input ref="fileInput" type="file" accept=".json,.yaml,.yml,.txt" hidden @change="onFile" />
					</div>

					<v-textarea
						v-model="pasteText"
						label="Paste an OpenAPI 3 / Swagger 2 document (JSON or YAML)"
						variant="outlined"
						rows="8"
						auto-grow
						class="mono-area mb-2"
						hide-details
					/>
					<div class="d-flex align-center flex-wrap ga-2 mb-3">
						<v-btn color="primary" prepend-icon="mdi-code-braces" :disabled="!pasteText.trim()" @click="doLoadText">
							Parse schema
						</v-btn>
					</div>

					<v-divider class="my-3" />
					<div class="d-flex align-center flex-wrap ga-2">
						<v-text-field
							v-model="urlText"
							placeholder="…or load from a URL (https://…/openapi.json)"
							variant="outlined"
							density="compact"
							hide-details
							style="min-width: 320px; flex: 1;"
						/>
						<v-btn variant="tonal" prepend-icon="mdi-cloud-download-outline" :disabled="!urlText.trim()" @click="doLoadUrl">
							Fetch
						</v-btn>
					</div>

					<v-alert v-if="store.loadError" type="error" variant="tonal" density="compact" class="mt-3">
						{{ store.loadError }}
					</v-alert>
				</v-card-text>
			</v-card>

			<!-- Loaded schema -->
			<template v-else>
				<div class="d-flex align-center flex-wrap ga-2 mb-3">
					<div>
						<span class="text-h6 font-weight-bold">{{ store.api.title }}</span>
						<span v-if="store.api.version" class="text-medium-emphasis ml-2">v{{ store.api.version }}</span>
					</div>
					<v-chip size="small" variant="tonal">{{ store.api.componentCount }} schemas</v-chip>
					<v-spacer />
					<v-btn variant="text" size="small" prepend-icon="mdi-refresh" @click="resetApi">
						Load a different schema
					</v-btn>
				</div>

				<!-- Component (schema) tabs -->
				<v-tabs
					:model-value="activeComponentName"
					color="primary"
					show-arrows
					density="comfortable"
					class="mb-4 section-tabs"
					@update:model-value="selectComponent"
				>
					<v-tab v-for="c in store.api.components" :key="c.name" :value="c.name">
						{{ c.name }}
						<v-chip size="x-small" variant="tonal" class="ml-2">{{ c.propertyCount }}</v-chip>
					</v-tab>
				</v-tabs>

				<v-row v-if="activeComponent">
					<!-- Property list -->
					<v-col cols="12" md="6" lg="5">
						<p v-if="activeComponent.description" class="text-body-2 text-medium-emphasis mb-2">
							{{ activeComponent.description }}
						</p>
						<v-card variant="outlined" class="element-list">
							<v-list density="compact" nav>
								<v-list-item
									v-for="p in activeComponent.properties"
									:key="p.name"
									:active="selectedProperty?.name === p.name"
									color="primary"
									@click="selectedProperty = p"
								>
									<v-list-item-title class="text-body-2 d-flex align-center">
										<span class="mono">{{ p.name }}</span>
										<v-icon v-if="p.required" size="12" color="error" class="ml-1" title="required">mdi-asterisk</v-icon>
									</v-list-item-title>
									<v-list-item-subtitle style="font-size: 0.72rem;">
										{{ p.type }}<span v-if="p.format"> · {{ p.format }}</span>
									</v-list-item-subtitle>
								</v-list-item>
								<v-list-item v-if="!activeComponent.properties.length">
									<v-list-item-title class="text-caption text-medium-emphasis">
										This schema has no direct properties.
									</v-list-item-title>
								</v-list-item>
							</v-list>
						</v-card>
					</v-col>

					<!-- Property detail -->
					<v-col cols="12" md="6" lg="7">
						<v-card v-if="selectedProperty" variant="outlined">
							<v-card-item>
								<div class="d-flex align-center flex-wrap ga-2">
									<span class="text-h6 font-weight-bold mono">{{ selectedProperty.name }}</span>
									<v-chip size="x-small" variant="tonal">{{ selectedProperty.type }}</v-chip>
									<v-chip v-if="selectedProperty.required" size="x-small" color="error" variant="tonal">required</v-chip>
								</div>
							</v-card-item>
							<v-card-text>
								<p v-if="selectedProperty.description" class="text-body-2 mb-2">
									{{ selectedProperty.description }}
								</p>
								<div v-if="selectedProperty.enum" class="mb-3">
									<span class="text-caption font-weight-bold mr-1">Allowed:</span>
									<v-chip v-for="v in selectedProperty.enum" :key="v" size="x-small" variant="outlined" class="mr-1 mb-1">
										{{ v }}
									</v-chip>
								</div>
								<v-divider class="mb-4" />
								<SchemaEquivalents :term="selectedProperty.name" />
							</v-card-text>
						</v-card>

						<v-card v-else variant="flat" color="grey-lighten-4" class="pa-10 text-center" rounded="lg">
							<v-icon size="42" color="grey" class="mb-3">mdi-gesture-tap</v-icon>
							<p class="text-body-2 text-medium-emphasis mb-0">
								Select a property to find its CEDS and HR Open equivalents.
							</p>
						</v-card>
					</v-col>
				</v-row>
			</template>
		</template>
	</v-container>
</template>

<style scoped>
.mono {
	font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
}
.mono-area :deep(textarea) {
	font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
	font-size: 0.8rem;
	line-height: 1.5;
}
.element-list {
	max-height: 560px;
	overflow-y: auto;
}
.section-tabs {
	border-bottom: 1px solid rgba(0, 0, 0, 0.08);
}
</style>
