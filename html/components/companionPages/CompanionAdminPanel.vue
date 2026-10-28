<script setup>
// Administration of a compiled companion page (SPEC-companionPages-102826, "Administration"), shown only to admin and
// super users (the page decides; every endpoint here also refuses every other role):
//   - UPLOAD NEW DOCUMENT for a sourceRole and sourcePart: a file, its origin URL, origin note and document date. The
//     server computes size and sha256, stores the file and makes the row current; the page then re-reads its compile,
//     which recompiles.
//   - SOURCE HISTORY: every upload, newest first within each role and part, with its provenance and which compiles used
//     it. Any earlier version can be downloaded, or restored: its bytes and provenance uploaded again as a new current
//     row (nothing is ever overwritten, so the history keeps every row).
//   - COMPILE HISTORY: every compile, newest first, with what it was built from.
//   - ADD PAGE / EDIT PAGE: the whole registry record; the server refuses a record missing any column.
// Emits 'sources-changed' after an upload or restore, and 'page-saved' with the saved record.

import { computed, ref, watch } from 'vue';
import { useCompanionAdminStore } from '@/stores/companionAdminStore';
import { useCompanionPageStore } from '@/stores/companionPageStore';

const props = defineProps({
	pageRecord: { type: Object, required: true },
});
const emit = defineEmits(['sources-changed', 'page-saved']);

const adminStore = useCompanionAdminStore();
const companionPageStore = useCompanionPageStore();

const OTHER_PART_VALUE = '__otherPart';
const PAGE_FIELD_NAME_LIST = ['pageSlug', 'title', 'summary', 'audienceText', 'standardKey', 'subjectStableId', 'targetKind', 'externalUrl', 'compilerName', 'sortOrder', 'isActive'];
const NULLABLE_TEXT_FIELD_NAME_LIST = ['summary', 'audienceText', 'standardKey', 'subjectStableId', 'externalUrl', 'compilerName'];
const TARGET_KIND_OPTION_LIST = ['compiled', 'externalUrl'];

watch(
	() => props.pageRecord.pageSlug,
	(pageSlug) => adminStore.loadHistory(pageSlug),
	{ immediate: true },
);

// ================================================================================
// SOURCE HISTORY, grouped by role and part

const partNameOf = (sourceRecord) => `${sourceRecord.sourceRole}${sourceRecord.sourcePart ? ` ${sourceRecord.sourcePart}` : ''}`;

const compileListBySourceRefId = computed(() => {
	const compileListByRefId = {};
	adminStore.compileHistoryList.forEach((compileRecord) => (compileRecord.usedSourceRefIdList || []).forEach((sourceRefId) => (compileListByRefId[sourceRefId] ||= []).push(compileRecord)));
	return compileListByRefId;
});

const sourcePartGroupList = computed(() => {
	const groupByPartName = {};
	adminStore.sourceHistoryList.forEach((sourceRecord) => {
		const partName = partNameOf(sourceRecord);
		(groupByPartName[partName] ||= { partName, sourceRole: sourceRecord.sourceRole, sourcePart: sourceRecord.sourcePart, sourceList: [] }).sourceList.push(sourceRecord);
	});
	return Object.values(groupByPartName).sort((left, right) => left.partName.localeCompare(right.partName, undefined, { numeric: true }));
});

const compiledAtTextOf = (compiledAt) => new Date(compiledAt).toLocaleString();

// ================================================================================
// UPLOAD

const chosenPartName = ref(null);
const otherSourceRole = ref('');
const otherSourcePart = ref('');
const chosenFileList = ref([]);
const originUrl = ref('');
const originNote = ref('');
const documentDate = ref('');
const uploadDoneText = ref('');

const partOptionList = computed(() => [...sourcePartGroupList.value.map((partGroup) => ({ title: partGroup.partName, value: partGroup.partName })), { title: 'Another role or part…', value: OTHER_PART_VALUE }]);

const chosenFile = computed(() => (Array.isArray(chosenFileList.value) ? chosenFileList.value[0] : chosenFileList.value) || null);

const uploadTarget = computed(() => {
	if (chosenPartName.value === OTHER_PART_VALUE) return { sourceRole: otherSourceRole.value.trim(), sourcePart: otherSourcePart.value.trim() };
	const partGroup = sourcePartGroupList.value.find((oneGroup) => oneGroup.partName === chosenPartName.value);
	return partGroup ? { sourceRole: partGroup.sourceRole, sourcePart: partGroup.sourcePart } : null;
});

// the form names what is missing; the server checks the rest (patterns, extension, size, date) and says why it refuses
const uploadMissingList = computed(() =>
	[
		[!uploadTarget.value || !uploadTarget.value.sourceRole, 'a source role'],
		[!chosenFile.value, 'a file'],
		[!originNote.value.trim(), 'an origin note'],
		[!documentDate.value, 'a document date'],
	]
		.filter(([isMissing]) => isMissing)
		.map(([, missingText]) => missingText),
);

const submitUpload = async () => {
	uploadDoneText.value = '';
	const isUploaded = await adminStore.uploadSource({
		pageSlug: props.pageRecord.pageSlug,
		...uploadTarget.value,
		fileBlob: chosenFile.value,
		fileName: chosenFile.value.name,
		originUrl: originUrl.value.trim() || null,
		originNote: originNote.value.trim(),
		documentDate: documentDate.value,
	});
	if (!isUploaded) return;
	uploadDoneText.value = `${adminStore.lastUploadedSource.fileName} is now the current ${partNameOf(adminStore.lastUploadedSource)} (sha256 ${adminStore.lastUploadedSource.sha256.slice(0, 12)}).`;
	chosenFileList.value = [];
	await adminStore.loadHistory(props.pageRecord.pageSlug);
	emit('sources-changed');
};

const restoreSource = async (sourceRecord) => {
	uploadDoneText.value = '';
	const isRestored = await adminStore.restoreSource(sourceRecord);
	if (!isRestored) return;
	uploadDoneText.value = `${sourceRecord.fileName} (uploaded ${sourceRecord.uploadedAt}) is current again, as a new row.`;
	await adminStore.loadHistory(props.pageRecord.pageSlug);
	emit('sources-changed');
};

// ================================================================================
// ADD PAGE / EDIT PAGE

const pageFormRecord = ref(null);
const isNewPageForm = ref(false);

const openPageForm = (isNewPage) => {
	isNewPageForm.value = isNewPage;
	const startRecord = isNewPage ? { pageSlug: '', title: '', summary: null, audienceText: null, standardKey: null, subjectStableId: null, targetKind: 'compiled', externalUrl: null, compilerName: null, sortOrder: 10, isActive: true } : props.pageRecord;
	pageFormRecord.value = Object.fromEntries(PAGE_FIELD_NAME_LIST.map((fieldName) => [fieldName, startRecord[fieldName] === null ? '' : startRecord[fieldName]]));
};

const submitPageForm = async () => {
	const pageRecord = Object.fromEntries(
		PAGE_FIELD_NAME_LIST.map((fieldName) => {
			const fieldValue = pageFormRecord.value[fieldName];
			// an empty sort order goes as null, which the server refuses by name, rather than as Number('') = 0
			if (fieldName === 'sortOrder') return [fieldName, String(fieldValue).trim() === '' ? null : Number(fieldValue)];
			if (NULLABLE_TEXT_FIELD_NAME_LIST.includes(fieldName)) return [fieldName, String(fieldValue).trim() === '' ? null : String(fieldValue).trim()];
			return [fieldName, typeof fieldValue === 'string' ? fieldValue.trim() : fieldValue];
		}),
	);
	const isSaved = await adminStore.savePage(pageRecord);
	if (!isSaved) return;
	pageFormRecord.value = null;
	emit('page-saved', adminStore.lastSavedPage);
};
</script>

<template>
	<section class="admin-panel" data-testid="companion-admin" aria-label="Page administration">
		<h2 class="admin-title">Administration</h2>
		<p class="admin-note">Shown to admin and super users only.</p>
		<v-progress-linear v-if="adminStore.loading" indeterminate color="primary" />
		<v-alert v-if="adminStore.statusMsg" type="error" variant="tonal" density="compact" class="mb-3" data-testid="admin-error">{{ adminStore.statusMsg }}</v-alert>

		<h3 class="admin-subhead">Upload new document</h3>
		<div class="admin-upload-form" data-testid="admin-upload-form">
			<v-select v-model="chosenPartName" :items="partOptionList" label="Source role and part" density="compact" variant="outlined" hide-details data-testid="admin-upload-part" />
			<template v-if="chosenPartName === OTHER_PART_VALUE">
				<v-text-field v-model="otherSourceRole" label="Source role (e.g. dictionary)" density="compact" variant="outlined" hide-details data-testid="admin-upload-role" />
				<v-text-field v-model="otherSourcePart" label="Source part (empty for a single-file role)" density="compact" variant="outlined" hide-details data-testid="admin-upload-source-part" />
			</template>
			<v-file-input v-model="chosenFileList" label="File" density="compact" variant="outlined" hide-details show-size data-testid="admin-upload-file" />
			<v-text-field v-model="originUrl" label="Origin URL (where the file came from; optional)" density="compact" variant="outlined" hide-details data-testid="admin-upload-origin-url" />
			<v-text-field v-model="originNote" label="Origin note (who supplied it, which draft)" density="compact" variant="outlined" hide-details data-testid="admin-upload-origin-note" />
			<v-text-field v-model="documentDate" label="Document date" type="date" density="compact" variant="outlined" hide-details data-testid="admin-upload-document-date" />
			<div class="admin-upload-actions">
				<v-btn color="primary" :loading="adminStore.uploading" :disabled="uploadMissingList.length > 0" data-testid="admin-upload-submit" @click="submitUpload">Upload and make current</v-btn>
				<span v-if="uploadMissingList.length" class="admin-note">Still needed: {{ uploadMissingList.join(', ') }}.</span>
			</div>
		</div>
		<v-alert v-if="adminStore.uploadStatusMsg" type="error" variant="tonal" density="compact" class="mt-2" data-testid="admin-upload-error">{{ adminStore.uploadStatusMsg }}</v-alert>
		<v-alert v-if="uploadDoneText" type="success" variant="tonal" density="compact" class="mt-2" data-testid="admin-upload-done">{{ uploadDoneText }} The page has been re-read; it is rebuilt from the new sources.</v-alert>

		<h3 class="admin-subhead">Source history</h3>
		<p v-if="companionPageStore.downloadStatusMsg" class="admin-error-text">{{ companionPageStore.downloadStatusMsg }}</p>
		<div v-for="partGroup in sourcePartGroupList" :key="partGroup.partName" class="admin-history-group" :data-testid="`admin-history-${partGroup.sourceRole}-${partGroup.sourcePart || 'whole'}`">
			<h4 class="admin-history-part">{{ partGroup.partName }}</h4>
			<table class="companion-table">
				<tbody>
					<tr v-for="sourceRecord in partGroup.sourceList" :key="sourceRecord.refId" :class="{ 'admin-history-current': sourceRecord.isCurrent }" :data-testid="`admin-history-row-${sourceRecord.refId}`">
						<td class="admin-history-state">{{ sourceRecord.isCurrent ? 'current' : 'earlier' }}</td>
						<td>
							<strong>{{ sourceRecord.fileName }}</strong> · dated {{ sourceRecord.documentDate }} · {{ sourceRecord.byteSize.toLocaleString() }} bytes · sha256 <code :title="sourceRecord.sha256">{{ sourceRecord.sha256.slice(0, 12) }}</code>
							<span class="admin-history-provenance">Uploaded {{ sourceRecord.uploadedAt }} by {{ sourceRecord.uploadedBy }}<template v-if="sourceRecord.originUrl"> · from <a :href="sourceRecord.originUrl" target="_blank" rel="noopener noreferrer">{{ sourceRecord.originUrl }}</a></template></span>
							<span class="admin-history-provenance">{{ sourceRecord.originNote }}</span>
							<span class="admin-history-provenance">
								Used by
								<template v-if="(compileListBySourceRefId[sourceRecord.refId] || []).length">{{ compileListBySourceRefId[sourceRecord.refId].map((compileRecord) => compiledAtTextOf(compileRecord.compiledAt)).join(', ') }}</template>
								<template v-else>no stored compile</template>
							</span>
						</td>
						<td class="admin-history-actions">
							<v-btn size="small" variant="text" color="primary" @click="companionPageStore.downloadSource(sourceRecord)">Download</v-btn>
							<v-btn v-if="!sourceRecord.isCurrent" size="small" variant="tonal" color="primary" :loading="adminStore.uploading" :data-testid="`admin-restore-${sourceRecord.refId}`" @click="restoreSource(sourceRecord)">Restore as current</v-btn>
						</td>
					</tr>
				</tbody>
			</table>
		</div>

		<h3 class="admin-subhead">Compile history</h3>
		<table class="companion-table" data-testid="admin-compile-history">
			<thead>
				<tr>
					<th scope="col">Compiled</th>
					<th scope="col">Golden and contract</th>
					<th scope="col">Compiler</th>
					<th scope="col">Sources</th>
				</tr>
			</thead>
			<tbody>
				<tr v-for="compileRecord in adminStore.compileHistoryList" :key="compileRecord.refId">
					<td>{{ compiledAtTextOf(compileRecord.compiledAt) }}</td>
					<td><code>{{ compileRecord.graphName }}</code> · <code :title="compileRecord.graphContractSha256">{{ compileRecord.graphContractSha256.slice(0, 12) }}</code></td>
					<td>{{ compileRecord.compilerVersion }}</td>
					<td>{{ compileRecord.usedSourceRefIdList ? `${compileRecord.usedSourceRefIdList.length} source rows (proven by its source-set stamp)` : 'cannot be named: the rows current at its time do not hash to its source-set stamp' }}</td>
				</tr>
			</tbody>
		</table>

		<h3 class="admin-subhead">Pages</h3>
		<div class="admin-page-actions">
			<v-btn variant="tonal" color="primary" data-testid="admin-edit-page" @click="openPageForm(false)">Edit this page</v-btn>
			<v-btn variant="text" color="primary" data-testid="admin-add-page" @click="openPageForm(true)">Add a page</v-btn>
		</div>
		<div v-if="pageFormRecord" class="admin-page-form" data-testid="admin-page-form">
			<v-text-field v-model="pageFormRecord.pageSlug" label="Page slug (lower case, digits, hyphens)" :disabled="!isNewPageForm" density="compact" variant="outlined" hide-details data-testid="admin-page-slug" />
			<v-text-field v-model="pageFormRecord.title" label="Title" density="compact" variant="outlined" hide-details data-testid="admin-page-title" />
			<v-text-field v-model="pageFormRecord.summary" label="Summary" density="compact" variant="outlined" hide-details />
			<v-text-field v-model="pageFormRecord.audienceText" label="Audience" density="compact" variant="outlined" hide-details />
			<v-text-field v-model="pageFormRecord.standardKey" label="Standard (standardKey, e.g. jedx; empty for a site document)" density="compact" variant="outlined" hide-details />
			<v-text-field v-model="pageFormRecord.subjectStableId" label="Pinned to one node (stableId; optional)" density="compact" variant="outlined" hide-details />
			<v-select v-model="pageFormRecord.targetKind" :items="TARGET_KIND_OPTION_LIST" label="Target" density="compact" variant="outlined" hide-details />
			<v-text-field v-if="pageFormRecord.targetKind === 'externalUrl'" v-model="pageFormRecord.externalUrl" label="Outside URL" density="compact" variant="outlined" hide-details />
			<v-text-field v-if="pageFormRecord.targetKind === 'compiled'" v-model="pageFormRecord.compilerName" label="Compiler (e.g. jedxDictionary)" density="compact" variant="outlined" hide-details />
			<v-text-field v-model="pageFormRecord.sortOrder" label="Sort order" type="number" density="compact" variant="outlined" hide-details data-testid="admin-page-sort-order" />
			<v-switch v-model="pageFormRecord.isActive" label="Active (listed in the explorer)" color="primary" density="compact" hide-details />
			<div class="admin-page-actions">
				<v-btn color="primary" :loading="adminStore.saving" data-testid="admin-page-save" @click="submitPageForm">{{ isNewPageForm ? 'Add page' : 'Save page' }}</v-btn>
				<v-btn variant="text" @click="pageFormRecord = null">Cancel</v-btn>
			</div>
		</div>
		<v-alert v-if="adminStore.saveStatusMsg" type="error" variant="tonal" density="compact" class="mt-2" data-testid="admin-page-error">{{ adminStore.saveStatusMsg }}</v-alert>
		<v-alert v-if="adminStore.lastSavedPage" type="success" variant="tonal" density="compact" class="mt-2" data-testid="admin-page-saved">
			Saved <NuxtLink :to="`/explore/companion/${adminStore.lastSavedPage.pageSlug}`">{{ adminStore.lastSavedPage.title }}</NuxtLink>.
		</v-alert>
	</section>
</template>

<style scoped>
.admin-panel {
	margin-top: 32px;
	background: #fffaf0;
	border: 1px dashed #b26a00;
	border-radius: 12px;
	padding: 16px 18px 18px;
	overflow-x: auto;
}
.admin-title {
	margin: 0;
	font-size: 22px;
	font-weight: 700;
	color: #7a4100;
}
.admin-note {
	margin: 2px 0 8px;
	font-size: 13px;
	color: #6b7280;
}
.admin-subhead {
	margin: 18px 0 8px;
	font-size: 16px;
	font-weight: 700;
	color: #072a6c;
}
.admin-upload-form,
.admin-page-form {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(min(100%, 320px), 1fr));
	gap: 10px;
}
.admin-upload-actions,
.admin-page-actions {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 10px;
}
.admin-history-group {
	margin-top: 10px;
}
.admin-history-part {
	margin: 0 0 4px;
	font-size: 14px;
	font-weight: 700;
}
.admin-history-state {
	width: 70px;
	font-size: 12px;
	font-weight: 700;
	text-transform: uppercase;
	color: #6b7280;
}
.admin-history-current .admin-history-state {
	color: #0b6b4e;
}
.admin-history-provenance {
	display: block;
	font-size: 12.5px;
	color: #4b5563;
	overflow-wrap: anywhere;
}
.admin-history-actions {
	white-space: nowrap;
	width: 1%;
}
.admin-error-text {
	color: #9b1c1c;
}
</style>
