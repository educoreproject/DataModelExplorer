<script setup>
import { getUseCaseById, getStandardsForUseCase, getDomainLabel, getDomainIcon } from '@/data/resolvers';
import { useCaseTaxonomy, useCaseCedsDomains } from '@/data/use-case-taxonomy';

const route = useRoute();
const ucId = route.params.id;

const useCase = computed(() => getUseCaseById(ucId));
const standards = computed(() => getStandardsForUseCase(ucId));

// Sibling stories in same driver/subcategory
const siblingStories = computed(() => {
	if (!useCase.value) return [];
	for (const cat of useCaseTaxonomy) {
		for (const sub of cat.children) {
			if (sub.id === useCase.value.subcategoryId) {
				return sub.children.filter((uc) => uc.id !== ucId && uc.githubIssue);
			}
		}
	}
	return [];
});

const activeTab = ref('overview');
const tabs = [
	{ id: 'overview', label: 'Overview' },
	{ id: 'tchart', label: 'T-Chart' },
	{ id: 'swimlane', label: 'Swimlane' },
	{ id: 'standards', label: 'Standards Map' },
];

// Standards multi-select
const selectedStandardIds = ref([]);

function toggleStandard(id) {
	const idx = selectedStandardIds.value.indexOf(id);
	if (idx >= 0) {
		selectedStandardIds.value.splice(idx, 1);
	} else {
		selectedStandardIds.value.push(id);
	}
}

function isSelected(id) {
	return selectedStandardIds.value.includes(id);
}

function createImplementationPlan() {
	const uc = useCase.value;
	const selectedSpecs = standards.value
		.filter((s) => selectedStandardIds.value.includes(s.entry.id))
		.map((s) => s.entry.title);

	const prompt = encodeURIComponent(
		`Create an implementation plan for the "${uc.label}" use case (under ${uc.subcategoryLabel} / ${uc.categoryLabel}). ` +
		`CEDS domains involved: ${uc.cedsDomains.map(getDomainLabel).join(', ')}. ` +
		`The selected interoperability standards to include are: ${selectedSpecs.join('; ')}. ` +
		`For each standard, describe what role it plays in this use case, what data elements are needed, ` +
		`implementation steps, dependencies between standards, and a recommended phased approach.`
	);

	navigateTo({
		path: '/dm/personas',
		query: { prompt, useCase: uc.label },
	});
}

function burdenColor(burden) {
	if (burden === 'low') return 'success';
	if (burden === 'medium') return 'warning';
	return 'error';
}

// Swimlane steps (procedural from use case context)
const swimlaneActors = computed(() => {
	if (!useCase.value) return [];
	return [
		{ label: useCase.value.subcategoryLabel, desc: 'Primary actor driving this use case', color: '#1e40af' },
		{ label: 'System', desc: 'Automated processing and validation', color: '#7c3aed' },
		{ label: 'Verifier', desc: 'Credential verification and trust', color: '#15803d' },
	];
});

const swimlaneSteps = computed(() => {
	if (!useCase.value) return [];
	const uc = useCase.value;
	const domains = uc.cedsDomains || [];
	return [
		{ actorIdx: 0, action: `Initiate ${uc.label}`, dataIn: 'Request or trigger event' },
		{ actorIdx: 1, action: 'Validate inputs against CEDS domains', dataOut: domains.slice(0, 2).map(getDomainLabel).join(', ') || 'Validation result' },
		{ actorIdx: 0, action: 'Provide required credentials and documentation', dataIn: 'Source documents' },
		{ actorIdx: 1, action: 'Process and map to interoperability standards', dataIn: 'Raw data', dataOut: 'Structured records' },
		{ actorIdx: 2, action: 'Verify credential authenticity and claims', dataIn: 'Structured records', dataOut: 'Verification result' },
		{ actorIdx: 1, action: 'Update records and generate output', dataOut: 'Final LER / credential artifact' },
		{ actorIdx: 0, action: 'Receive and review results' },
	];
});
</script>

<template>
	<v-container v-if="useCase" class="py-6" style="max-width: 1100px;">
		<!-- Header -->
		<div class="text-caption text-medium-emphasis mb-1">
			USER STORY #{{ useCase.githubIssue || '—' }}
		</div>
		<h1 class="text-h4 font-weight-bold mb-4">{{ useCase.label }}</h1>

		<!-- Tabs -->
		<v-tabs v-model="activeTab" class="mb-6">
			<v-tab v-for="tab in tabs" :key="tab.id" :value="tab.id">
				{{ tab.label }}
			</v-tab>
		</v-tabs>

		<!-- ═══════════════════════════════════════════════════════════ -->
		<!-- OVERVIEW TAB -->
		<!-- ═══════════════════════════════════════════════════════════ -->
		<div v-if="activeTab === 'overview'">
			<!-- Hero card -->
			<v-card variant="flat" color="grey-lighten-4" class="pa-6 mb-6" rounded="lg">
				<v-chip size="small" color="primary" variant="flat" class="mb-3">SYSTEMATIC FRAMEWORK</v-chip>
				<h2 class="text-h5 font-weight-bold mb-2">{{ useCase.label }}</h2>
				<p class="text-body-1 text-medium-emphasis mb-3">
					Use case under <strong>{{ useCase.subcategoryLabel }}</strong> within the {{ useCase.categoryLabel }} topic, linking stakeholder needs to interoperable ecosystem nodes.
				</p>
				<div>
					<v-chip
						v-for="tag in (useCase.tags || [])"
						:key="tag"
						size="small"
						variant="outlined"
						class="mr-1"
					>{{ tag }}</v-chip>
				</div>
				<div class="mt-4 d-flex ga-3 flex-wrap">
					<v-btn
						v-if="useCase.githubIssue"
						:href="`https://github.com/educoreproject/educore_use_cases/issues/${useCase.githubIssue}`"
						target="_blank"
						color="grey-darken-3"
						prepend-icon="mdi-github"
					>
						View on GitHub
					</v-btn>
				</div>
			</v-card>

			<!-- Actor + CEDS Domains row -->
			<v-row class="mb-6">
				<v-col cols="12" md="4">
					<v-card variant="outlined" class="pa-5 h-100">
						<div class="d-flex align-center mb-2">
							<v-icon class="mr-2" color="primary">mdi-account-circle-outline</v-icon>
							<div>
								<div class="font-weight-bold">{{ useCase.subcategoryLabel }}</div>
								<div class="text-caption text-medium-emphasis">Primary Actor</div>
							</div>
						</div>
						<p class="text-body-2 text-medium-emphasis mb-3">
							Responsible for initiating and managing use cases in this domain.
						</p>
						<v-chip size="small" variant="tonal" color="primary">{{ useCase.categoryLabel }}</v-chip>
					</v-card>
				</v-col>
				<v-col cols="12" md="8">
					<div class="text-overline text-medium-emphasis mb-2">CEDS DOMAINS</div>
					<v-row dense>
						<v-col
							v-for="domain in useCase.cedsDomains"
							:key="domain"
							cols="6"
							sm="4"
						>
							<v-card variant="outlined" class="pa-3 text-center">
								<div class="text-body-2 font-weight-medium">{{ getDomainLabel(domain) }}</div>
							</v-card>
						</v-col>
					</v-row>
				</v-col>
			</v-row>

			<!-- Related User Stories -->
			<div v-if="siblingStories.length" class="mb-6">
				<div class="text-overline text-medium-emphasis mb-2">RELATED USER STORIES</div>
				<v-list density="compact" variant="outlined" rounded class="py-0">
					<v-list-item
						v-for="story in siblingStories"
						:key="story.id"
						:to="`/explore/use-cases/${story.id}`"
					>
						<v-list-item-title>{{ story.label }}</v-list-item-title>
						<template #append>
							<span class="text-caption text-medium-emphasis">#{{ story.githubIssue }}</span>
						</template>
					</v-list-item>
				</v-list>
			</div>
		</div>

		<!-- ═══════════════════════════════════════════════════════════ -->
		<!-- T-CHART TAB -->
		<!-- ═══════════════════════════════════════════════════════════ -->
		<div v-if="activeTab === 'tchart'">
			<h2 class="text-h5 font-weight-bold mb-1">T-Chart</h2>
			<p class="text-body-2 text-medium-emphasis mb-6">
				T-shaped view showing the use case within the topic context (vertical) and implementation specifics (horizontal).
			</p>

			<v-row>
				<!-- Left stem: Topic → Driver → Use Case -->
				<v-col cols="12" md="3">
					<div class="tchart-stem">
						<div class="tchart-level" style="background: #1e293b;">
							<div class="text-overline" style="color: rgba(255,255,255,0.6);">TOPIC</div>
							<div class="text-body-2 font-weight-bold" style="color: #fff;">{{ useCase.categoryLabel }}</div>
						</div>
						<div class="tchart-level" style="background: #1d4ed8;">
							<div class="text-overline" style="color: rgba(255,255,255,0.6);">VALUE DRIVER</div>
							<div class="text-body-2 font-weight-bold" style="color: #fff;">{{ useCase.subcategoryLabel }}</div>
						</div>
						<div class="tchart-level" style="background: #5B3FD3;">
							<div class="text-overline" style="color: rgba(255,255,255,0.6);">USE CASE</div>
							<div class="text-body-2 font-weight-bold" style="color: #fff;">{{ useCase.label }}</div>
						</div>
					</div>
				</v-col>

				<!-- Right bar: User Stories + Domains -->
				<v-col cols="12" md="9">
					<!-- Sibling user stories -->
					<div v-if="siblingStories.length" class="mb-6">
						<div class="text-overline text-medium-emphasis mb-2">USER STORIES — EXECUTABLE UNITS</div>
						<v-row dense>
							<v-col
								v-for="story in siblingStories"
								:key="story.id"
								cols="12"
								sm="6"
							>
								<v-card
									variant="outlined"
									class="pa-3"
									:to="`/explore/use-cases/${story.id}`"
									hover
								>
									<div class="d-flex align-start ga-2">
										<v-chip size="x-small" color="success" variant="flat">#{{ story.githubIssue }}</v-chip>
										<span class="text-body-2">{{ story.label }}</span>
									</div>
								</v-card>
							</v-col>
						</v-row>
					</div>

					<!-- Data Domains -->
					<div class="mb-6">
						<div class="text-overline text-medium-emphasis mb-2">DATA DOMAINS</div>
						<div class="d-flex ga-2 flex-wrap">
							<v-chip
								v-for="domain in useCase.cedsDomains"
								:key="domain"
								variant="flat"
								color="grey-darken-3"
								text-color="white"
								size="small"
							>
								{{ getDomainLabel(domain) }}
							</v-chip>
						</div>
					</div>

					<!-- Hierarchy Context -->
					<div>
						<div class="text-overline text-medium-emphasis mb-2">HIERARCHY CONTEXT</div>
						<ul class="text-body-2 pl-4">
							<li><strong>Topic:</strong> {{ useCase.categoryLabel }}</li>
							<li><strong>Driver:</strong> {{ useCase.subcategoryLabel }}</li>
							<li><strong>Domains:</strong> {{ useCase.cedsDomains.map(getDomainLabel).join(', ') }}</li>
						</ul>
					</div>
				</v-col>
			</v-row>
		</div>

		<!-- ═══════════════════════════════════════════════════════════ -->
		<!-- SWIMLANE TAB -->
		<!-- ═══════════════════════════════════════════════════════════ -->
		<div v-if="activeTab === 'swimlane'">
			<h2 class="text-h5 font-weight-bold mb-1">Swimlane Diagram</h2>
			<p class="text-body-2 text-medium-emphasis mb-4">
				Process-oriented view — who does what, with what data.
			</p>

			<!-- Legend -->
			<div class="d-flex ga-4 flex-wrap mb-4">
				<div v-for="actor in swimlaneActors" :key="actor.label" class="d-flex align-center ga-1">
					<div :style="{ width: '10px', height: '10px', borderRadius: '50%', background: actor.color }" />
					<span class="text-caption font-weight-bold">{{ actor.label }}</span>
					<span class="text-caption text-medium-emphasis">— {{ actor.desc }}</span>
				</div>
			</div>

			<!-- Swimlane table -->
			<div class="swimlane-table" style="overflow-x: auto;">
				<table style="width: 100%; border-collapse: collapse;">
					<thead>
						<tr>
							<th class="swimlane-header" style="width: 40px;">#</th>
							<th
								v-for="actor in swimlaneActors"
								:key="actor.label"
								class="swimlane-header"
								:style="{ background: actor.color, color: '#fff' }"
							>
								{{ actor.label }}
							</th>
						</tr>
					</thead>
					<tbody>
						<tr v-for="(step, idx) in swimlaneSteps" :key="idx" class="swimlane-row">
							<td class="swimlane-cell text-center font-weight-bold text-medium-emphasis">{{ idx + 1 }}</td>
							<td
								v-for="(actor, aIdx) in swimlaneActors"
								:key="aIdx"
								class="swimlane-cell"
								:class="{ 'swimlane-active': step.actorIdx === aIdx }"
								:style="step.actorIdx === aIdx ? { borderLeft: `3px solid ${actor.color}`, background: `${actor.color}08` } : {}"
							>
								<template v-if="step.actorIdx === aIdx">
									<div class="font-weight-bold text-body-2 mb-1">{{ step.action }}</div>
									<div v-if="step.dataIn" class="d-flex align-center ga-1 mb-1">
										<v-chip size="x-small" color="info" variant="flat">IN</v-chip>
										<span class="text-caption">{{ step.dataIn }}</span>
									</div>
									<div v-if="step.dataOut" class="d-flex align-center ga-1">
										<v-chip size="x-small" color="success" variant="flat">OUT</v-chip>
										<span class="text-caption">{{ step.dataOut }}</span>
									</div>
								</template>
							</td>
						</tr>
					</tbody>
				</table>
			</div>

			<!-- Connected User Stories -->
			<div v-if="siblingStories.length" class="mt-6">
				<div class="text-overline text-medium-emphasis mb-2">CONNECTED USER STORIES</div>
				<v-list density="compact" variant="outlined" rounded class="py-0">
					<v-list-item
						v-for="story in siblingStories"
						:key="story.id"
						:to="`/explore/use-cases/${story.id}`"
					>
						<v-list-item-title class="text-body-2">{{ story.label }}</v-list-item-title>
						<template #append>
							<span class="text-caption text-medium-emphasis">#{{ story.githubIssue }}</span>
						</template>
					</v-list-item>
				</v-list>
			</div>
		</div>

		<!-- ═══════════════════════════════════════════════════════════ -->
		<!-- STANDARDS MAP TAB -->
		<!-- ═══════════════════════════════════════════════════════════ -->
		<div v-if="activeTab === 'standards'">
			<div class="d-flex align-center justify-space-between mb-2">
				<h2 class="text-h5 font-weight-bold">Standards & Data Mappings</h2>
				<v-btn variant="text" size="small" to="/explore/standards">VIEW ALL SPECS</v-btn>
			</div>
			<p class="text-body-2 text-medium-emphasis mb-4">
				Select the standards you want to include, then generate an implementation plan with the AI Explorer.
			</p>

			<!-- CTA button -->
			<v-btn
				v-if="selectedStandardIds.length"
				color="primary"
				size="large"
				prepend-icon="mdi-rocket-launch"
				class="mb-6"
				@click="createImplementationPlan"
			>
				Create my implementation plan ({{ selectedStandardIds.length }} standard{{ selectedStandardIds.length > 1 ? 's' : '' }})
			</v-btn>

			<!-- Standard cards (selectable) -->
			<v-row v-if="standards.length">
				<v-col
					v-for="(std, idx) in standards"
					:key="std.entry.id"
					cols="12"
					sm="6"
				>
					<v-card
						:variant="isSelected(std.entry.id) ? 'flat' : 'outlined'"
						:color="isSelected(std.entry.id) ? 'primary' : undefined"
						:class="['pa-5 h-100 standard-card', { 'standard-selected': isSelected(std.entry.id) }]"
						@click="toggleStandard(std.entry.id)"
						style="cursor: pointer;"
					>
						<div class="d-flex align-center justify-space-between mb-1">
							<div class="text-h4 font-weight-light" :class="isSelected(std.entry.id) ? '' : 'text-medium-emphasis'" style="opacity: 0.3;">
								{{ String(idx + 1).padStart(2, '0') }}
							</div>
							<v-icon v-if="isSelected(std.entry.id)" color="white">mdi-check-circle</v-icon>
							<v-icon v-else color="grey-lighten-1">mdi-checkbox-blank-circle-outline</v-icon>
						</div>
						<h3 class="text-subtitle-1 font-weight-bold mt-1 mb-2">{{ std.entry.title }}</h3>
						<div class="d-flex ga-1 flex-wrap mb-2">
							<v-chip
								v-for="md in std.matchedDomains.slice(0, 3)"
								:key="md.domain"
								size="x-small"
								:variant="isSelected(std.entry.id) ? 'flat' : 'tonal'"
							>
								{{ getDomainLabel(md.domain) }}
							</v-chip>
							<v-chip
								size="x-small"
								:color="isSelected(std.entry.id) ? 'white' : burdenColor(std.entry.implementationBurden)"
								:variant="isSelected(std.entry.id) ? 'outlined' : 'flat'"
							>
								{{ std.entry.implementationBurden }} burden
							</v-chip>
						</div>
						<p class="text-caption" :class="isSelected(std.entry.id) ? '' : 'text-medium-emphasis'">
							{{ std.entry.owner }}
						</p>
					</v-card>
				</v-col>
			</v-row>

			<!-- Bottom CTA (visible when scrolled past cards) -->
			<div v-if="selectedStandardIds.length" class="mt-6 text-center">
				<v-btn
					color="primary"
					size="large"
					prepend-icon="mdi-rocket-launch"
					@click="createImplementationPlan"
				>
					Create my implementation plan
				</v-btn>
				<div class="text-caption text-medium-emphasis mt-2">
					{{ selectedStandardIds.length }} standard{{ selectedStandardIds.length > 1 ? 's' : '' }} selected
				</div>
			</div>

			<v-alert v-else-if="!standards.length" type="info" variant="tonal" class="mt-4">
				No standards mapped to this use case's CEDS domains yet.
			</v-alert>
		</div>
	</v-container>

	<!-- Not found -->
	<v-container v-else class="py-12 text-center">
		<v-icon size="64" color="grey">mdi-alert-circle-outline</v-icon>
		<h2 class="text-h5 mt-4">Use case not found</h2>
		<v-btn to="/explore/use-cases" variant="text" class="mt-4">Back to Use Cases</v-btn>
	</v-container>
</template>

<style scoped>
.tchart-stem {
	display: flex;
	flex-direction: column;
	border-radius: 8px;
	overflow: hidden;
}

.tchart-level {
	padding: 16px;
}

.swimlane-header {
	padding: 10px 12px;
	text-align: center;
	font-size: 0.85rem;
	font-weight: 600;
	background: #f1f5f9;
}

.swimlane-row {
	border-bottom: 1px solid #f1f5f9;
}

.swimlane-cell {
	padding: 12px;
	vertical-align: top;
	min-height: 60px;
}

.swimlane-active {
	min-width: 180px;
}

.standard-card {
	transition: all 0.15s ease;
}

.standard-card:hover {
	box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
}

.standard-selected {
	border: 2px solid rgb(var(--v-theme-primary));
}
</style>
