<script setup>
// @concept: [[ManifestEditor]]
// @concept: [[ManifestComposer]]
// @concept: [[CollaborationAccess]]
import { ref, computed, onMounted } from 'vue';
import { useManifestEditorStore } from '@/stores/manifestEditorStore';

const store = useManifestEditorStore();

// Browse (read) vs Compose (derive a new manifest)
const mode = ref('browse');

// Currently selected manifest (browse mode)
const selectedManifestKey = ref(null);

// Short-hash helper for display (content-addressed keys are long)
const shortKey = (key) => (key ? `${key.slice(0, 12)}…` : '');

// Honest gap rendering: null human fields render as a dash, never fabricated.
const orDash = (value) =>
	value === undefined || value === null || value === '' ? '—' : value;

const blockTypeOrder = ['standard', 'reference', 'mapping'];
const typeRank = { standard: 0, reference: 1, mapping: 2 };

const blocksGrouped = computed(() =>
	blockTypeOrder.map((type) => ({
		type,
		blocks: store.blocks.filter((block) => block.type === type),
	})),
);

const members = computed(() => store.currentManifest?.members || []);

// ---------------------------------------------------------------------------
// BROWSE actions

const selectManifest = async (manifestKey) => {
	selectedManifestKey.value = manifestKey;
	store.validation = null;
	await store.showManifest(manifestKey);
	await store.listAssignments(manifestKey);
};

// ---------------------------------------------------------------------------
// VALIDATE

const runValidate = async () => {
	if (!selectedManifestKey.value) return;
	await store.validateManifest(selectedManifestKey.value);
};

// Legacy verdicts carry a `reason`; treat as an honest info state, not an error.
const isLegacyVerdict = computed(
	() => !!(store.validation && store.validation.reason),
);

// ---------------------------------------------------------------------------
// BUILD GRAPH

const buildDestination = ref('');
const buildOwner = ref('');
const buildResult = ref(null);

const runBuildGraph = async () => {
	if (!selectedManifestKey.value || !buildDestination.value) return;
	const { success, result } = await store.buildGraph({
		manifest: selectedManifestKey.value,
		destination: buildDestination.value,
		owner: buildOwner.value || undefined,
	});
	if (success) buildResult.value = result;
};

// ---------------------------------------------------------------------------
// COLLABORATORS (mutable side-metadata; never mints a new manifest)

const userToAdd = ref(null);

const userLabel = (user) =>
	user
		? `${user.username}${user.first || user.last ? ` (${[user.first, user.last].filter(Boolean).join(' ')})` : ''}`
		: '';

const userById = computed(() => {
	const index = {};
	store.users.forEach((user) => {
		index[user.refId] = user;
	});
	return index;
});

const assignableUsers = computed(() => {
	const assignedIds = new Set(store.assignments.map((a) => a.userId));
	return store.users
		.filter((user) => !assignedIds.has(user.refId))
		.map((user) => ({ value: user.refId, title: userLabel(user) }));
});

const addCollaborator = async () => {
	if (!userToAdd.value || !selectedManifestKey.value) return;
	await store.assignUser(selectedManifestKey.value, userToAdd.value);
	userToAdd.value = null;
};

const removeCollaborator = async (userId) => {
	if (!selectedManifestKey.value) return;
	await store.unassignUser(selectedManifestKey.value, userId);
};

// ---------------------------------------------------------------------------
// COMPOSER (derive a new manifest) -- membership-only; order is derived.

const composerSet = ref([]); // array of blockIds
const composerBase = ref(null); // manifestKey or null (genesis)
const composerLabel = ref('');
const composerNote = ref('');
const composerResult = ref(null);
const composerVerdict = ref(null);

const resolve = (blockId) => store.blockById[blockId];

// Add a block AND, transitively, every block in its requires[] that exists in the
// catalog. Because a mapping's requires[] names its source standard + the reference
// block (and, in coming rebuilds, possibly more), this auto-satisfies requires-closure
// and auto-adds the reference block on the first mapping -- no positional assumptions.
const addBlockWithDeps = (blockId) => {
	if (!blockId) return;
	const seen = new Set(composerSet.value);
	const stack = [blockId];
	while (stack.length) {
		const id = stack.pop();
		if (seen.has(id)) continue;
		const block = resolve(id);
		if (!block) continue; // unknown id -> skip (can't satisfy; validity will flag)
		seen.add(id);
		(block.requires || []).forEach((reqId) => {
			if (!seen.has(reqId)) stack.push(reqId);
		});
	}
	composerSet.value = Array.from(seen);
};

const removeBlock = (blockId) => {
	composerSet.value = composerSet.value.filter((id) => id !== blockId);
};

const clearComposer = () => {
	composerSet.value = [];
	composerBase.value = null;
	composerLabel.value = '';
	composerNote.value = '';
	composerResult.value = null;
	composerVerdict.value = null;
};

// Resolved set blocks, sorted into a valid linearization (standards -> reference ->
// mappings). The server computes the authoritative topological order on save; this is
// a faithful preview.
const composerMembers = computed(() =>
	composerSet.value
		.map(resolve)
		.filter(Boolean)
		.slice()
		.sort((a, b) => (typeRank[a.type] ?? 9) - (typeRank[b.type] ?? 9)),
);

// Per-type "add" selectors: catalog blocks of a type not already in the set.
const addOptionsByType = (type) => {
	const inSet = new Set(composerSet.value);
	return store.blocks
		.filter((block) => block.type === type && !inSet.has(block.blockId))
		.map((block) => ({
			value: block.blockId,
			title: `${orDash(block.subject)} · ${orDash(block.version)} · ${shortKey(block.blockId)}`,
		}));
};
const addStandardId = ref(null);
const addReferenceId = ref(null);
const addMappingId = ref(null);

const onAddStandard = () => {
	addBlockWithDeps(addStandardId.value);
	addStandardId.value = null;
};
const onAddReference = () => {
	addBlockWithDeps(addReferenceId.value);
	addReferenceId.value = null;
};
const onAddMapping = () => {
	addBlockWithDeps(addMappingId.value);
	addMappingId.value = null;
};

// --- client-side validity mirror (server -validate stays authoritative on save) ---

const setIds = computed(() => new Set(composerSet.value));

const requiresSatisfied = computed(() =>
	composerMembers.value.every((block) =>
		(block.requires || []).every((reqId) => setIds.value.has(reqId)),
	),
);

const referenceCount = computed(
	() => composerMembers.value.filter((b) => b.type === 'reference').length,
);
const mappingCount = computed(
	() => composerMembers.value.filter((b) => b.type === 'mapping').length,
);

// Exactly one reference block whenever any mapping is present.
const oneReferenceOk = computed(
	() => mappingCount.value === 0 || referenceCount.value === 1,
);

const validityReason = computed(() => {
	if (!composerSet.value.length) return 'Add at least one block.';
	if (!requiresSatisfied.value)
		return 'A block requires another block that is not in the set (add its standard/reference).';
	if (mappingCount.value > 0 && referenceCount.value === 0)
		return 'A mapping needs the CEDS reference block (add it).';
	if (referenceCount.value > 1)
		return 'A manifest may contain only one reference block.';
	return '';
});

const composerValid = computed(
	() =>
		composerSet.value.length > 0 &&
		requiresSatisfied.value &&
		oneReferenceOk.value,
);

const saveComposer = async () => {
	if (!composerValid.value) return;
	composerResult.value = null;
	composerVerdict.value = null;

	const { success, result } = await store.combineManifest({
		base: composerBase.value || undefined,
		set: composerSet.value,
		label: composerLabel.value || undefined,
		note: composerNote.value || undefined,
	});
	if (!success) return;

	composerResult.value = result;
	// Validate the freshly-derived manifest (server-authoritative).
	const newKey = result && (result.manifestKey || result.manifest);
	if (newKey) {
		const { verdict } = await store.validateManifest(newKey);
		composerVerdict.value = verdict;
	}
};

// ---------------------------------------------------------------------------
// Initial load

onMounted(async () => {
	await store.listManifests();
	await store.listBlocks();
	await store.loadUsers();
});
</script>

<template>
	<v-container fluid class="manifest-editor-container">
		<!-- Mode toggle + loading + status -->
		<div class="d-flex align-center mb-2">
			<v-btn-toggle v-model="mode" mandatory density="compact" variant="outlined">
				<v-btn value="browse" size="small">
					<v-icon start>mdi-format-list-bulleted</v-icon> Browse
				</v-btn>
				<v-btn value="compose" size="small">
					<v-icon start>mdi-plus-box</v-icon> New / Derive
				</v-btn>
			</v-btn-toggle>
			<v-spacer />
			<v-progress-circular
				v-if="store.loading"
				indeterminate
				size="20"
				width="2"
				color="primary"
			/>
		</div>

		<v-alert
			v-if="store.statusMsg"
			:type="isLegacyVerdict ? 'info' : 'error'"
			density="compact"
			class="mb-3"
			closable
			@click:close="store.clearStatus()"
		>
			{{ store.statusMsg }}
		</v-alert>

		<!-- ================= BROWSE MODE ================= -->
		<v-row v-if="mode === 'browse'" no-gutters class="fill-height">
			<!-- LEFT: manifest list -->
			<v-col cols="auto" class="list-column">
				<v-card variant="outlined" class="h-100">
					<v-card-title class="text-subtitle-1 d-flex align-center">
						<v-icon class="mr-2">mdi-file-tree</v-icon>
						Manifests
						<v-spacer />
						<v-chip size="x-small">{{ store.manifests.length }}</v-chip>
					</v-card-title>
					<v-divider />
					<v-list density="compact" class="manifest-list">
						<v-list-item
							v-for="manifest in store.manifests"
							:key="manifest.manifestKey"
							:active="selectedManifestKey === manifest.manifestKey"
							@click="selectManifest(manifest.manifestKey)"
						>
							<v-list-item-title>{{ orDash(manifest.label) }}</v-list-item-title>
							<v-list-item-subtitle>
								<code>{{ shortKey(manifest.manifestKey) }}</code>
								<span class="ml-2 text-medium-emphasis">
									{{ orDash(manifest.createdAt) }}
								</span>
							</v-list-item-subtitle>
						</v-list-item>
						<v-list-item v-if="!store.manifests.length && !store.loading">
							<v-list-item-subtitle>No manifests yet.</v-list-item-subtitle>
						</v-list-item>
					</v-list>
				</v-card>
			</v-col>

			<!-- RIGHT: membership + validate + build + collaborators + catalog -->
			<v-col class="detail-column">
				<v-card variant="outlined" class="h-100 detail-card">
					<v-card-title class="text-subtitle-1">
						<template v-if="store.currentManifest">
							{{ orDash(store.currentManifest.label) }}
							<code class="ml-2 text-caption">
								{{ shortKey(store.currentManifest.manifestKey) }}
							</code>
						</template>
						<template v-else>Select a manifest</template>
					</v-card-title>
					<v-divider />

					<v-card-text>
						<template v-if="store.currentManifest">
							<div
								v-if="store.currentManifest.note"
								class="text-body-2 text-medium-emphasis mb-3"
							>
								{{ store.currentManifest.note }}
							</div>

							<!-- Membership -->
							<div class="text-overline mb-1">Blocks (derived build order)</div>
							<v-table density="compact" class="mb-4">
								<thead>
									<tr>
										<th class="text-left">#</th>
										<th class="text-left">Type</th>
										<th class="text-left">Subject</th>
										<th class="text-left">Version</th>
										<th class="text-left">Block</th>
									</tr>
								</thead>
								<tbody>
									<tr v-for="(member, index) in members" :key="member.blockId">
										<td>{{ index + 1 }}</td>
										<td><v-chip size="x-small" label>{{ member.type }}</v-chip></td>
										<td>{{ orDash(member.subject) }}</td>
										<td>{{ orDash(member.version) }}</td>
										<td><code>{{ shortKey(member.blockId) }}</code></td>
									</tr>
									<tr v-if="!members.length">
										<td colspan="5" class="text-medium-emphasis">
											No blocks in this manifest.
										</td>
									</tr>
								</tbody>
							</v-table>

							<!-- Validate -->
							<div class="d-flex align-center mb-2">
								<v-btn size="small" variant="tonal" @click="runValidate">
									<v-icon start>mdi-check-decagram</v-icon> Validate
								</v-btn>
								<template v-if="store.validation">
									<v-chip
										v-if="store.validation.wellFormed"
										color="success"
										size="small"
										class="ml-3"
									>
										well-formed
									</v-chip>
									<v-chip
										v-else-if="isLegacyVerdict"
										color="info"
										size="small"
										class="ml-3"
									>
										legacy — not validatable
									</v-chip>
									<v-chip v-else color="error" size="small" class="ml-3">
										not well-formed
									</v-chip>
								</template>
							</div>
							<ul
								v-if="store.validation && store.validation.violations?.length"
								class="text-body-2 text-error mb-4"
							>
								<li v-for="(v, i) in store.validation.violations" :key="i">
									{{ typeof v === 'string' ? v : JSON.stringify(v) }}
								</li>
							</ul>

							<!-- Build Graph -->
							<div class="text-overline mb-1">Build graph from this manifest</div>
							<div class="d-flex align-center ga-2 mb-2">
								<v-text-field
									v-model="buildDestination"
									label="Destination"
									density="compact"
									hide-details
									style="max-width: 220px"
								/>
								<v-text-field
									v-model="buildOwner"
									label="Owner (optional)"
									density="compact"
									hide-details
									style="max-width: 180px"
								/>
								<v-btn
									size="small"
									color="primary"
									:disabled="!buildDestination"
									@click="runBuildGraph"
								>
									<v-icon start>mdi-graph</v-icon> Build
								</v-btn>
							</div>
							<div
								v-if="buildResult"
								class="text-body-2 text-medium-emphasis mb-4"
							>
								Built → {{ orDash(buildResult.destination) }}
								<span v-if="buildResult.location">
									@ {{ buildResult.location }}</span
								>
								· nodes {{ orDash(buildResult.nodesMerged) }} · edges
								{{ orDash(buildResult.edgesMerged) }} · danglingRefs
								{{ orDash(buildResult.danglingRefs) }}
							</div>

							<!-- Collaborators -->
							<div class="text-overline mb-1">
								Collaborators (access — one manifest, many users)
							</div>
							<div class="d-flex align-center ga-2 mb-2">
								<v-select
									v-model="userToAdd"
									:items="assignableUsers"
									item-title="title"
									item-value="value"
									label="Add collaborator"
									density="compact"
									hide-details
									style="max-width: 320px"
								/>
								<v-btn
									size="small"
									variant="tonal"
									:disabled="!userToAdd"
									@click="addCollaborator"
								>
									<v-icon start>mdi-account-plus</v-icon> Add
								</v-btn>
							</div>
							<v-chip
								v-for="assignment in store.assignments"
								:key="assignment.refId || assignment.userId"
								class="mr-2 mb-2"
								closable
								@click:close="removeCollaborator(assignment.userId)"
							>
								{{ userLabel(userById[assignment.userId]) || assignment.userId }}
							</v-chip>
							<span
								v-if="!store.assignments.length"
								class="text-body-2 text-medium-emphasis"
							>
								No collaborators assigned.
							</span>

							<v-divider class="my-4" />
						</template>

						<!-- Block catalog (opaque; metadata only) -->
						<div class="text-overline mb-1">Block Catalog</div>
						<v-expansion-panels variant="accordion" multiple>
							<v-expansion-panel v-for="group in blocksGrouped" :key="group.type">
								<v-expansion-panel-title>
									<v-chip size="x-small" label class="mr-2">{{ group.type }}</v-chip>
									{{ group.blocks.length }} block(s)
								</v-expansion-panel-title>
								<v-expansion-panel-text>
									<v-table density="compact">
										<thead>
											<tr>
												<th class="text-left">Subject</th>
												<th class="text-left">Version</th>
												<th class="text-left">Block</th>
											</tr>
										</thead>
										<tbody>
											<tr v-for="block in group.blocks" :key="block.blockId">
												<td>{{ orDash(block.subject) }}</td>
												<td>{{ orDash(block.version) }}</td>
												<td><code>{{ shortKey(block.blockId) }}</code></td>
											</tr>
											<tr v-if="!group.blocks.length">
												<td colspan="3" class="text-medium-emphasis">
													None available.
												</td>
											</tr>
										</tbody>
									</v-table>
								</v-expansion-panel-text>
							</v-expansion-panel>
						</v-expansion-panels>
					</v-card-text>
				</v-card>
			</v-col>
		</v-row>

		<!-- ================= COMPOSE MODE ================= -->
		<v-card v-else variant="outlined">
			<v-card-title class="text-subtitle-1 d-flex align-center">
				<v-icon class="mr-2">mdi-plus-box</v-icon>
				Compose a new manifest
				<v-chip class="ml-3" size="x-small" color="info" label>
					saving derives a NEW immutable manifest
				</v-chip>
			</v-card-title>
			<v-divider />
			<v-card-text>
				<v-row>
					<!-- Left: add blocks -->
					<v-col cols="12" md="5">
						<v-select
							v-model="composerBase"
							:items="[
								{ value: null, title: 'Genesis (no base)' },
								...store.manifests.map((m) => ({
									value: m.manifestKey,
									title: `${m.label || '—'} · ${shortKey(m.manifestKey)}`,
								})),
							]"
							item-title="title"
							item-value="value"
							label="Base (optional)"
							density="compact"
							class="mb-3"
						/>

						<div class="text-overline mb-1">Add blocks</div>
						<div class="d-flex ga-2 mb-2">
							<v-select
								v-model="addStandardId"
								:items="addOptionsByType('standard')"
								item-title="title"
								item-value="value"
								label="standard"
								density="compact"
								hide-details
							/>
							<v-btn icon size="small" variant="tonal" @click="onAddStandard">
								<v-icon>mdi-plus</v-icon>
							</v-btn>
						</div>
						<div class="d-flex ga-2 mb-2">
							<v-select
								v-model="addReferenceId"
								:items="addOptionsByType('reference')"
								item-title="title"
								item-value="value"
								label="reference"
								density="compact"
								hide-details
							/>
							<v-btn icon size="small" variant="tonal" @click="onAddReference">
								<v-icon>mdi-plus</v-icon>
							</v-btn>
						</div>
						<div class="d-flex ga-2 mb-2">
							<v-select
								v-model="addMappingId"
								:items="addOptionsByType('mapping')"
								item-title="title"
								item-value="value"
								label="mapping (auto-adds its standard + reference)"
								density="compact"
								hide-details
							/>
							<v-btn icon size="small" variant="tonal" @click="onAddMapping">
								<v-icon>mdi-plus</v-icon>
							</v-btn>
						</div>

						<v-text-field
							v-model="composerLabel"
							label="Label"
							density="compact"
							class="mt-3"
						/>
						<v-textarea
							v-model="composerNote"
							label="Note (optional)"
							density="compact"
							rows="2"
							auto-grow
						/>
					</v-col>

					<!-- Right: current set + validity + save -->
					<v-col cols="12" md="7">
						<div class="d-flex align-center mb-1">
							<div class="text-overline">
								Set — {{ composerMembers.length }} block(s), derived order
							</div>
							<v-spacer />
							<v-btn size="x-small" variant="text" @click="clearComposer">
								Clear
							</v-btn>
						</div>
						<v-table density="compact" class="mb-3">
							<thead>
								<tr>
									<th class="text-left">#</th>
									<th class="text-left">Type</th>
									<th class="text-left">Subject</th>
									<th class="text-left">Version</th>
									<th class="text-left">Block</th>
									<th></th>
								</tr>
							</thead>
							<tbody>
								<tr v-for="(block, index) in composerMembers" :key="block.blockId">
									<td>{{ index + 1 }}</td>
									<td><v-chip size="x-small" label>{{ block.type }}</v-chip></td>
									<td>{{ orDash(block.subject) }}</td>
									<td>{{ orDash(block.version) }}</td>
									<td><code>{{ shortKey(block.blockId) }}</code></td>
									<td>
										<v-btn
											icon
											size="x-small"
											variant="text"
											@click="removeBlock(block.blockId)"
										>
											<v-icon>mdi-close</v-icon>
										</v-btn>
									</td>
								</tr>
								<tr v-if="!composerMembers.length">
									<td colspan="6" class="text-medium-emphasis">
										No blocks selected.
									</td>
								</tr>
							</tbody>
						</v-table>

						<v-alert
							:type="composerValid ? 'success' : 'warning'"
							density="compact"
							class="mb-3"
						>
							<template v-if="composerValid">
								Valid composition — requires satisfied,
								{{ referenceCount }} reference, {{ mappingCount }} mapping(s).
							</template>
							<template v-else>{{ validityReason }}</template>
						</v-alert>

						<v-btn
							color="primary"
							:disabled="!composerValid || store.loading"
							@click="saveComposer"
						>
							<v-icon start>mdi-content-save</v-icon>
							Save (derive manifest)
						</v-btn>

						<div v-if="composerResult" class="mt-3 text-body-2">
							Created manifest
							<code>{{
								shortKey(composerResult.manifestKey || composerResult.manifest)
							}}</code>
							<template v-if="composerVerdict">
								<v-chip
									v-if="composerVerdict.wellFormed"
									color="success"
									size="small"
									class="ml-2"
									>well-formed</v-chip
								>
								<v-chip
									v-else-if="composerVerdict.reason"
									color="info"
									size="small"
									class="ml-2"
									>legacy — not validatable</v-chip
								>
								<v-chip v-else color="error" size="small" class="ml-2"
									>not well-formed</v-chip
								>
							</template>
						</div>
					</v-col>
				</v-row>
			</v-card-text>
		</v-card>
	</v-container>
</template>

<style scoped>
.manifest-editor-container {
	height: calc(100vh - 200px);
	padding: 0;
	max-width: none;
	overflow-y: auto;
}
.fill-height {
	height: 100%;
}
.list-column {
	flex: 0 0 340px;
	width: 340px;
	min-width: 340px;
	max-width: 340px;
}
.detail-column {
	flex: 1 1 auto;
	min-width: 0;
	margin-left: 16px;
}
.h-100 {
	height: 100%;
}
.detail-card {
	overflow-y: auto;
	max-height: calc(100vh - 240px);
}
.manifest-list {
	overflow-y: auto;
	max-height: calc(100vh - 280px);
}
</style>
