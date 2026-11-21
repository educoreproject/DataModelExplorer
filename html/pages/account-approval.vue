<script setup>
	// @concept: [[SecurityFirstPattern]]
	// account-approval — the page the approval request's link opens, /account-approval?userRefId=... (WORKORDER-adminApproval-
	// 112126 A5). Signed out, the auth middleware sends the approver through the login page and straight back here. It
	// shows one applicant with Approve and Decline, and the control that sends or suppresses the decline email, preset
	// from the server's adminApprovalEmailSuppress (A6). An account already decided shows who decided and when, and offers
	// only what may still be done (a declined account can be approved). The list of accounts waiting is beside it. The
	// server decides from the approver's STORED role and refuses anyone else by name; the page shows that refusal.
	import { useAccountApprovalStore } from '@/stores/accountApprovalStore';
	import { accountVocabulary } from '@/components/accountVocabulary.js';

	definePageMeta({ middleware: 'auth' });

	const approvalStore = useAccountApprovalStore();
	const route = useRoute();
	const router = useRouter();

	const userRefId = computed(() => String(route.query.userRefId || ''));
	const sendDeclineEmail = ref(true);
	// the decisions the server says may still be made on this account (its approvalDecisionByName)
	const decisionNameList = computed(() => approvalStore.applicant?.allowedDecisionNameList || []);
	const stateText = computed(() => accountVocabulary.accountStateTextByName[approvalStore.applicant?.accountState] || approvalStore.applicant?.accountState || '');
	const decidedText = computed(() => {
		const decision = approvalStore.latestDecision;
		return decision ? `${accountVocabulary.decisionTextByName[decision.decisionName] || decision.decisionName} by ${decision.deciderUsername}, ${new Date(decision.decidedAt).toLocaleString()}` : '';
	});

	const loadSelected = async () => {
		approvalStore.clearMessages();
		if (!userRefId.value) {
			approvalStore.applicant = null;
			return;
		}
		await approvalStore.loadApplicant(userRefId.value);
		sendDeclineEmail.value = !approvalStore.adminApprovalEmailSuppress;
	};

	onMounted(() => {
		loadSelected();
		approvalStore.loadPendingList();
	});
	watch(userRefId, loadSelected);

	const chooseApplicant = (applicantUserRefId) => router.replace({ query: { userRefId: applicantUserRefId } });

	const decide = async (decisionName) => {
		const isRecorded = await approvalStore.decide({ userRefId: userRefId.value, decisionName, sendDeclineEmail: sendDeclineEmail.value });
		if (isRecorded) {
			approvalStore.loadPendingList();
		}
	};
</script>

<template>
	<v-container class="approval-page">
		<v-row>
			<v-col cols="12" md="4">
				<v-card variant="outlined" data-testid="approval-pending-list">
					<v-card-title class="text-subtitle-1">{{ accountVocabulary.approvalPendingListTitle }}</v-card-title>
					<v-list density="compact">
						<v-list-item
							v-for="pendingApplicant in approvalStore.pendingApplicantList"
							:key="pendingApplicant.refId"
							:active="pendingApplicant.refId === userRefId"
							:title="pendingApplicant.username"
							:subtitle="`${pendingApplicant.first} ${pendingApplicant.last}`"
							:data-testid="`approval-pending-${pendingApplicant.username}`"
							@click="chooseApplicant(pendingApplicant.refId)"
						/>
						<v-list-item v-if="!approvalStore.pendingApplicantList.length" :subtitle="accountVocabulary.approvalPendingListEmptyText" data-testid="approval-pending-empty" />
					</v-list>
				</v-card>
			</v-col>
			<v-col cols="12" md="8">
				<v-card variant="outlined" class="pa-4" data-testid="approval-card">
					<h1 class="text-h6 mb-3">{{ accountVocabulary.approvalPageTitle }}</h1>
					<v-progress-linear v-if="approvalStore.loading" indeterminate class="mb-3" />
					<v-alert v-if="approvalStore.statusMsg" type="error" density="compact" class="mb-4" data-testid="approval-error">{{ approvalStore.statusMsg }}</v-alert>
					<v-alert v-if="approvalStore.noticeMsg" type="success" density="compact" class="mb-4" data-testid="approval-notice">{{ approvalStore.noticeMsg }}</v-alert>
					<p v-if="!userRefId" class="text-body-2" data-testid="approval-choose">{{ accountVocabulary.approvalChooseApplicantText }}</p>
					<template v-if="approvalStore.applicant">
						<v-table density="compact" class="mb-4" data-testid="approval-applicant">
							<tbody>
								<tr><th>{{ accountVocabulary.approvalUsernameLabel }}</th><td data-testid="approval-username">{{ approvalStore.applicant.username }}</td></tr>
								<tr><th>{{ accountVocabulary.approvalNameLabel }}</th><td>{{ approvalStore.applicant.first }} {{ approvalStore.applicant.last }}</td></tr>
								<tr><th>{{ accountVocabulary.approvalEmailLabel }}</th><td>{{ approvalStore.applicant.emailAdr }}</td></tr>
								<tr><th>{{ accountVocabulary.approvalSignedUpLabel }}</th><td>{{ approvalStore.applicant.createdAt }}</td></tr>
								<tr><th>{{ accountVocabulary.approvalStateLabel }}</th><td data-testid="approval-state">{{ stateText }}</td></tr>
								<tr v-if="decidedText"><th>{{ accountVocabulary.approvalDecidedLabel }}</th><td data-testid="approval-decided">{{ decidedText }}</td></tr>
							</tbody>
						</v-table>
						<v-checkbox
							v-if="decisionNameList.includes('decline')"
							v-model="sendDeclineEmail"
							:label="accountVocabulary.sendDeclineEmailLabel"
							density="compact"
							hide-details
							data-testid="approval-send-decline-email"
						/>
						<div class="decision-buttons mt-3">
							<v-btn v-if="decisionNameList.includes('approve')" color="primary" :loading="approvalStore.loading" data-testid="approval-approve" @click="decide('approve')">{{ accountVocabulary.approveButtonText }}</v-btn>
							<v-btn v-if="decisionNameList.includes('decline')" color="error" variant="outlined" :loading="approvalStore.loading" data-testid="approval-decline" @click="decide('decline')">{{ accountVocabulary.declineButtonText }}</v-btn>
						</div>
					</template>
				</v-card>
			</v-col>
		</v-row>
	</v-container>
</template>

<style scoped>
.approval-page {
	max-width: 1100px;
}
.decision-buttons {
	display: flex;
	gap: 12px;
}
th {
	text-align: left;
	width: 30%;
}
</style>
