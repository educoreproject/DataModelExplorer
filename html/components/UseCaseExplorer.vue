<script setup>
// UseCaseExplorer.vue — read-oriented "Explore" view of a UseCase aggregate.
// Sibling to UseCaseForm. Renders prose-friendly typography, highlights
// share counts on children that are referenced by multiple UseCases.

const props = defineProps({
	current: { type: Object, required: true }
});

const fmtDate = (iso) => {
	if (!iso) { return ''; }
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) { return String(iso); }
	return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};

const sortedSteps = computed(() => {
	const arr = (props.current.steps || []).slice();
	arr.sort((a, b) => {
		const an = Number(a.properties?.stepNumber) || 0;
		const bn = Number(b.properties?.stepNumber) || 0;
		return an - bn;
	});
	return arr;
});

const primaryCategory = computed(() => {
	const cats = props.current.categories || [];
	const primary = cats.find((c) => c.isPrimary);
	return primary ? primary.name : (props.current.properties?.primaryCategory || '');
});

const secondaryCategories = computed(() => {
	return (props.current.categories || []).filter((c) => !c.isPrimary);
});

const asArray = (v) => (Array.isArray(v) ? v : (v ? [v] : []));
</script>

<template>
	<div class="ucx">
		<!-- Header card -->
		<v-card class="ucx-header mb-4" elevation="0">
			<h1 class="ucx-title">{{ current.properties?.name || '(untitled)' }}</h1>
			<div class="ucx-subtitle">
				<span v-if="current.systemProperties?.issueNumber">
					Issue
					<a
						v-if="current.systemProperties?.issueUrl"
						:href="current.systemProperties.issueUrl"
						target="_blank"
						rel="noopener"
					>#{{ current.systemProperties.issueNumber }}</a>
					<span v-else>#{{ current.systemProperties.issueNumber }}</span>
				</span>
				<span v-if="current.systemProperties?.author"> · Authored by {{ current.systemProperties.author }}</span>
				<span v-if="current.systemProperties?.updatedAt"> · Updated {{ fmtDate(current.systemProperties.updatedAt) }}</span>
			</div>

			<div class="ucx-glance">
				<div class="ucx-glance-col">
					<h4>Categories</h4>
					<div class="ucx-chiprow">
						<v-chip
							v-if="primaryCategory"
							color="primary"
							size="small"
							variant="flat"
						>{{ primaryCategory }}</v-chip>
						<v-chip
							v-for="cat in secondaryCategories"
							:key="cat.name"
							size="small"
							variant="tonal"
							color="primary"
						>{{ cat.name }}</v-chip>
						<span v-if="!primaryCategory && secondaryCategories.length === 0" class="text-grey">—</span>
					</div>
				</div>
				<div class="ucx-glance-col">
					<h4>Actors</h4>
					<div class="ucx-chiprow">
						<v-tooltip
							v-for="actor in current.actors"
							:key="actor.id"
							:text="actor.shareCount > 0
								? `Shared with ${actor.shareCount} other use case${actor.shareCount === 1 ? '' : 's'}`
								: 'Unique to this use case'"
							location="top"
						>
							<template #activator="{ props: tipProps }">
								<v-chip v-bind="tipProps" size="small" variant="tonal" color="primary">
									{{ actor.properties?.name || '(unnamed)' }}
									<span v-if="actor.shareCount > 0" class="ucx-share-pill">+{{ actor.shareCount }}</span>
								</v-chip>
							</template>
						</v-tooltip>
						<span v-if="!current.actors || current.actors.length === 0" class="text-grey">—</span>
					</div>
				</div>
			</div>
		</v-card>

		<!-- Introduction -->
		<v-card v-if="current.properties?.introduction" class="ucx-section mb-4" elevation="0">
			<h3>Introduction</h3>
			<div class="ucx-prose">{{ current.properties.introduction }}</div>
		</v-card>

		<!-- Objectives -->
		<v-card v-if="current.properties?.objectives" class="ucx-section mb-4" elevation="0">
			<h3>Objectives</h3>
			<div class="ucx-prose">{{ current.properties.objectives }}</div>
		</v-card>

		<!-- Outcomes (bullet list) -->
		<v-card v-if="asArray(current.properties?.outcomes).length" class="ucx-section mb-4" elevation="0">
			<h3>Outcomes</h3>
			<ul class="ucx-list">
				<li v-for="(item, i) in asArray(current.properties.outcomes)" :key="i">{{ item }}</li>
			</ul>
		</v-card>

		<!-- Dependencies -->
		<v-card v-if="asArray(current.properties?.dependencies).length" class="ucx-section mb-4" elevation="0">
			<h3>Dependencies</h3>
			<ul class="ucx-list">
				<li v-for="(item, i) in asArray(current.properties.dependencies)" :key="i">{{ item }}</li>
			</ul>
		</v-card>

		<!-- Scenario -->
		<v-card v-if="current.properties?.scenario" class="ucx-section mb-4" elevation="0">
			<h3>Scenario</h3>
			<div class="ucx-prose">{{ current.properties.scenario }}</div>
		</v-card>

		<!-- Key Concepts -->
		<v-card v-if="current.properties?.keyConcepts" class="ucx-section mb-4" elevation="0">
			<h3>Key Concepts</h3>
			<div class="ucx-prose">{{ current.properties.keyConcepts }}</div>
		</v-card>

		<!-- Steps -->
		<v-card v-if="sortedSteps.length" class="ucx-section mb-4" elevation="0">
			<h3>Steps</h3>
			<div
				v-for="step in sortedSteps"
				:key="step.id"
				class="ucx-step"
			>
				<div class="ucx-step-num">{{ step.properties?.stepNumber }}</div>
				<div class="ucx-step-text">{{ step.properties?.actionText || step.properties?.description || '' }}</div>
				<div v-if="step.properties?.actorName" class="ucx-step-actor">{{ step.properties.actorName }}</div>
			</div>
		</v-card>

		<!-- Data References -->
		<v-card v-if="current.dataRefs && current.dataRefs.length" class="ucx-section mb-4" elevation="0">
			<h3>Data References <span class="ucx-section-sub">(CEDS / SIF / other)</span></h3>
			<div
				v-for="ref in current.dataRefs"
				:key="ref.id"
				class="ucx-ref"
			>
				<div class="ucx-ref-main">
					<div class="ucx-ref-name">
						{{ ref.properties?.name || '(unnamed)' }}
						<a
							v-if="ref.properties?.url"
							:href="ref.properties.url"
							target="_blank"
							rel="noopener"
							class="ucx-ref-link"
						>open ↗</a>
					</div>
					<div v-if="ref.properties?.description" class="ucx-ref-desc">{{ ref.properties.description }}</div>
					<div v-if="ref.shareCount > 0" class="ucx-ref-shared">
						Shared with {{ ref.shareCount }} other use case{{ ref.shareCount === 1 ? '' : 's' }}
						<span class="ucx-share-pill">+{{ ref.shareCount }}</span>
					</div>
				</div>
			</div>
		</v-card>

		<!-- External References -->
		<v-card v-if="current.externalRefs && current.externalRefs.length" class="ucx-section mb-4" elevation="0">
			<h3>External References</h3>
			<div
				v-for="ref in current.externalRefs"
				:key="ref.id"
				class="ucx-ref"
			>
				<div class="ucx-ref-main">
					<div class="ucx-ref-name">
						{{ ref.properties?.name || '(unnamed)' }}
						<a
							v-if="ref.properties?.url"
							:href="ref.properties.url"
							target="_blank"
							rel="noopener"
							class="ucx-ref-link"
						>open ↗</a>
					</div>
					<div v-if="ref.properties?.description" class="ucx-ref-desc">{{ ref.properties.description }}</div>
					<div v-if="ref.shareCount > 0" class="ucx-ref-shared">
						Shared with {{ ref.shareCount }} other use case{{ ref.shareCount === 1 ? '' : 's' }}
						<span class="ucx-share-pill">+{{ ref.shareCount }}</span>
					</div>
				</div>
			</div>
		</v-card>

		<!-- CEDS / GitHub labels footer -->
		<v-card
			v-if="current.systemProperties?.cedsIds?.length || current.systemProperties?.githubLabels?.length"
			class="ucx-section mb-4"
			elevation="0"
		>
			<h3>Tags &amp; Identifiers</h3>
			<div v-if="current.systemProperties?.cedsIds?.length" class="mb-2">
				<strong class="ucx-label">CEDS IDs:</strong>
				<v-chip
					v-for="id in current.systemProperties.cedsIds"
					:key="id"
					size="x-small"
					variant="outlined"
					color="primary"
					class="ml-1"
				>{{ id }}</v-chip>
			</div>
			<div v-if="current.systemProperties?.githubLabels?.length">
				<strong class="ucx-label">GitHub Labels:</strong>
				<v-chip
					v-for="lbl in current.systemProperties.githubLabels"
					:key="lbl"
					size="x-small"
					variant="outlined"
					class="ml-1"
				>{{ lbl }}</v-chip>
			</div>
		</v-card>
	</div>
</template>

<style scoped>
.ucx {
	max-width: 920px;
}
.ucx-header {
	padding: 22px 26px;
	border: 1px solid #e0e0e0;
	border-radius: 6px;
	background: white;
}
.ucx-title {
	font-size: 26px;
	font-weight: 700;
	color: #1a237e;
	margin: 0 0 6px 0;
	line-height: 1.2;
}
.ucx-subtitle {
	font-size: 13px;
	color: #616161;
	margin-bottom: 14px;
}
.ucx-subtitle a {
	color: #3949ab;
	text-decoration: none;
}
.ucx-subtitle a:hover { text-decoration: underline; }
.ucx-glance {
	display: grid;
	grid-template-columns: 1fr 1fr;
	gap: 24px;
	padding-top: 14px;
	border-top: 1px solid #e0e0e0;
}
.ucx-glance-col h4 {
	font-size: 11px;
	font-weight: 700;
	color: #616161;
	text-transform: uppercase;
	letter-spacing: 0.6px;
	margin: 0 0 10px 0;
}
.ucx-chiprow {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}
.ucx-share-pill {
	background: #fff3e0;
	color: #ff6f00;
	font-size: 10px;
	font-weight: 700;
	padding: 1px 6px;
	border-radius: 8px;
	margin-left: 6px;
	border: 1px solid #ff6f00;
}
.ucx-section {
	padding: 20px 26px;
	border: 1px solid #e0e0e0;
	border-radius: 6px;
	background: white;
}
.ucx-section h3 {
	font-size: 14px;
	font-weight: 700;
	color: #1a237e;
	text-transform: uppercase;
	letter-spacing: 0.5px;
	margin: 0 0 12px 0;
	padding-bottom: 6px;
	border-bottom: 2px solid #1a237e;
	display: inline-block;
}
.ucx-section-sub {
	font-size: 12px;
	font-weight: 400;
	color: #616161;
	text-transform: none;
	letter-spacing: 0;
	margin-left: 4px;
}
.ucx-prose {
	font-size: 14px;
	line-height: 1.65;
	color: #424242;
	white-space: pre-wrap;
}
.ucx-list {
	padding-left: 22px;
	margin: 0;
}
.ucx-list li {
	font-size: 14px;
	line-height: 1.6;
	color: #424242;
	margin-bottom: 4px;
}
.ucx-step {
	display: grid;
	grid-template-columns: 40px 1fr auto;
	gap: 14px;
	padding: 10px 0;
	border-bottom: 1px solid #f0f0f0;
	align-items: start;
}
.ucx-step:last-child { border-bottom: none; }
.ucx-step-num {
	background: #3949ab;
	color: white;
	width: 30px;
	height: 30px;
	border-radius: 50%;
	display: flex;
	align-items: center;
	justify-content: center;
	font-weight: 700;
	font-size: 13px;
}
.ucx-step-text {
	font-size: 14px;
	line-height: 1.5;
	color: #424242;
}
.ucx-step-actor {
	font-size: 11px;
	color: #3949ab;
	background: #e8eaf6;
	padding: 3px 8px;
	border-radius: 10px;
	white-space: nowrap;
	align-self: center;
}
.ucx-ref {
	padding: 10px 0;
	border-bottom: 1px solid #f0f0f0;
	display: flex;
	justify-content: space-between;
	align-items: flex-start;
	gap: 14px;
}
.ucx-ref:last-child { border-bottom: none; }
.ucx-ref-main { flex: 1; }
.ucx-ref-name {
	font-weight: 600;
	font-size: 13px;
	color: #212121;
}
.ucx-ref-link {
	color: #3949ab;
	text-decoration: none;
	font-size: 11px;
	margin-left: 6px;
}
.ucx-ref-link:hover { text-decoration: underline; }
.ucx-ref-desc {
	font-size: 13px;
	color: #616161;
	line-height: 1.5;
	margin-top: 2px;
}
.ucx-ref-shared {
	font-size: 11px;
	color: #ff6f00;
	margin-top: 4px;
}
.ucx-label {
	font-size: 12px;
	color: #616161;
	margin-right: 6px;
}
</style>
