<script setup>
	// @concept: [[SecurityFirstPattern]]
	// pending-approvals — the /admin tool that lists every account waiting for an administrator's approval
	// (WORKORDER-approvalMailPolish-112126 P4), so an approver who has lost the approval email can still find the
	// applicant. Each row links to that applicant's approval page, /account-approval?userRefId=..., where the decision is
	// made. The list is the server's listPendingApprovals (admin by STORED role; anyone else is refused by name and the
	// refusal is shown here). It reads the list again each time it opens; admin.vue reads it once on its own mount, for
	// the count on the tab.
	import { useAccountApprovalStore } from '@/stores/accountApprovalStore';
	import { accountVocabulary } from '@/components/accountVocabulary.js';

	const approvalStore = useAccountApprovalStore();

	onMounted(() => {
		approvalStore.loadPendingList();
	});

	const approvalPageRouteOf = (userRefId) => ({ path: '/account-approval', query: { userRefId } });
	// createdAt is SQLite's CURRENT_TIMESTAMP, UTC written without a zone ('2026-11-21 19:24:59'); read bare, a browser would
	// take it as local time. Anything else is shown exactly as the server sent it.
	const SQLITE_UTC_TIMESTAMP_PATTERN = /^(\d{4}-\d\d-\d\d) (\d\d:\d\d:\d\d)$/;
	const signedUpTextOf = (createdAt) => {
		const timestampMatch = String(createdAt || '').match(SQLITE_UTC_TIMESTAMP_PATTERN);
		return timestampMatch ? new Date(`${timestampMatch[1]}T${timestampMatch[2]}Z`).toLocaleString() : String(createdAt || '');
	};
</script>

<template>
	<v-card variant="outlined" class="ma-4 pending-approvals" min-width="640" data-testid="pending-approvals">
		<v-card-title class="d-flex align-center">
			<v-icon class="mr-2">mdi-account-clock</v-icon>
			<span>{{ accountVocabulary.pendingApprovalsTitle }}</span>
			<v-chip v-if="approvalStore.pendingApplicantList.length" size="small" color="warning" variant="flat" class="ml-3" data-testid="pending-approvals-count">{{ approvalStore.pendingApplicantList.length }}</v-chip>
			<v-spacer />
			<v-btn variant="text" size="small" prepend-icon="mdi-refresh" :loading="approvalStore.pendingListLoading" data-testid="pending-approvals-refresh" @click="approvalStore.loadPendingList()">{{ accountVocabulary.pendingApprovalsRefreshText }}</v-btn>
		</v-card-title>
		<v-card-text>
			<v-alert v-if="approvalStore.pendingListStatusMsg" type="error" density="compact" class="mb-3" data-testid="pending-approvals-error">{{ approvalStore.pendingListStatusMsg }}</v-alert>
			<v-table v-if="approvalStore.pendingApplicantList.length" density="compact" data-testid="pending-approvals-table">
				<thead>
					<tr>
						<th>{{ accountVocabulary.approvalUsernameLabel }}</th>
						<th>{{ accountVocabulary.approvalNameLabel }}</th>
						<th>{{ accountVocabulary.approvalEmailLabel }}</th>
						<th>{{ accountVocabulary.approvalSignedUpLabel }}</th>
						<th></th>
					</tr>
				</thead>
				<tbody>
					<tr v-for="pendingApplicant in approvalStore.pendingApplicantList" :key="pendingApplicant.refId" :data-testid="`pending-approvals-row-${pendingApplicant.username}`">
						<td>{{ pendingApplicant.username }}</td>
						<td>{{ pendingApplicant.first }} {{ pendingApplicant.last }}</td>
						<td>{{ pendingApplicant.emailAdr }}</td>
						<td>{{ signedUpTextOf(pendingApplicant.createdAt) }}</td>
						<td>
							<v-btn :to="approvalPageRouteOf(pendingApplicant.refId)" size="small" color="primary" variant="tonal" :data-testid="`pending-approvals-review-${pendingApplicant.username}`">{{ accountVocabulary.pendingApprovalsReviewText }}</v-btn>
						</td>
					</tr>
				</tbody>
			</v-table>
			<p v-else-if="!approvalStore.pendingListLoading && !approvalStore.pendingListStatusMsg" class="text-body-2" data-testid="pending-approvals-empty">{{ accountVocabulary.approvalPendingListEmptyText }}</p>
		</v-card-text>
	</v-card>
</template>

<style scoped>
	.pending-approvals th {
		text-align: left;
	}
</style>
