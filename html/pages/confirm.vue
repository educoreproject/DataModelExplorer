<script setup>
	// confirm — the page the emailed confirmation link opens (?token=...) (WORKORDER-userRegistrationReset-112026). It
	// confirms at once; on success the server has activated the account and signed it in, and the page goes home. A bad
	// or expired link offers a new one by user name or email address. Where an administrator must approve new accounts
	// (WORKORDER-adminApproval-112126) the confirmed account is not signed in: the page says it is out for approval.
	import { useAccountStore } from '@/stores/accountStore';
	import { accountVocabulary } from '@/components/accountVocabulary.js';

	definePageMeta({ layout: 'blank' });

	const accountStore = useAccountStore();
	const route = useRoute();
	const router = useRouter();

	const tokenText = computed(() => String(route.query.token || ''));
	const isWorking = ref(true);
	const identifier = ref('');
	const isResendSent = ref(false);

	onMounted(async () => {
		accountStore.clearMessages();
		if (!tokenText.value) {
			isWorking.value = false;
			return;
		}
		const isSignedIn = await accountStore.confirmRegistration(tokenText.value);
		isWorking.value = false;
		if (isSignedIn) {
			router.push('/');
		}
	});

	const resendConfirmation = async () => {
		// WORKORDER-accountMailLooseEnds-112326 E2: a request is in flight (up to the server's 10 s mail budget); a second
		// press, Enter or Space does nothing until it answers
		if (accountStore.loading || !identifier.value.trim()) {
			return;
		}
		isResendSent.value = await accountStore.resendConfirmation(identifier.value.trim());
	};
</script>

<template>
	<div class="account-page">
		<NuxtLink to="/" class="account-header" aria-label="EDUcore home">
			<img src="/educore-logo.png" alt="EDUcore" class="account-logo" />
		</NuxtLink>
		<v-container>
			<v-sheet class="mx-auto my-6 pa-6 pa-sm-10" width="100%" max-width="420" :elevation="2" rounded="lg" data-testid="confirm-card">
				<h1 class="text-h6 mb-3">{{ accountVocabulary.confirmTitle }}</h1>
				<p v-if="isWorking" class="text-body-2" data-testid="confirm-working">{{ accountVocabulary.confirmWorkingText }}</p>
				<template v-else>
					<!-- WORKORDER-accountMailFailureAndApprovalNotice-112326: M4 what succeeded (address confirmed), then the approval
					     block on its own; M3 a new link whose mail did not go is a warning of its own -->
					<template v-if="accountStore.isAwaitingApproval">
						<v-alert type="success" density="compact" class="mb-4" data-testid="confirm-confirmed">{{ accountStore.noticeMsg }}</v-alert>
						<AccountApprovalNotice :heading-text="accountVocabulary.approvalNoticeHeadingText" :notice-text="accountVocabulary.approvalNoticeText" data-testid="confirm-awaiting-approval" />
					</template>
					<v-alert v-if="accountStore.statusMsg && accountStore.isMailNotSent" type="warning" density="compact" class="mb-4" data-testid="confirm-mail-not-sent">{{ accountStore.statusMsg }}</v-alert>
					<v-alert v-else-if="accountStore.statusMsg" type="error" density="compact" class="mb-4" data-testid="confirm-error">{{ accountStore.statusMsg }}</v-alert>
					<p v-if="!tokenText" class="text-body-2 mb-4" data-testid="confirm-no-token">{{ accountVocabulary.missingTokenText }}</p>
					<v-alert v-if="isResendSent && accountStore.noticeMsg" type="success" density="compact" class="mb-4" data-testid="confirm-resend-notice">{{ accountStore.noticeMsg }}</v-alert>
					<template v-if="!isResendSent && !accountStore.isAwaitingApproval">
						<p class="text-body-2 mb-3">{{ accountVocabulary.confirmIdentifierPromptText }}</p>
						<v-text-field v-model="identifier" :label="accountVocabulary.identifierLabel" autocomplete="username" data-testid="confirm-identifier" @keyup.enter="resendConfirmation" />
						<v-btn color="primary" block :loading="accountStore.loading" data-testid="confirm-resend" @click="resendConfirmation">{{ accountVocabulary.resendConfirmationButtonText }}</v-btn>
					</template>
				</template>
				<div class="mt-4 text-center">
					<NuxtLink to="/login">{{ accountVocabulary.backToSignInText }}</NuxtLink>
				</div>
			</v-sheet>
		</v-container>
	</div>
</template>

<style scoped>
.account-page {
	min-height: 100vh;
	background: #fafaf8;
}
.account-header {
	display: block;
	padding: 24px;
	text-align: center;
	background: #fff;
	border-bottom: 1px solid rgba(0, 0, 0, 0.06);
}
.account-logo {
	max-width: 180px;
	height: auto;
}
</style>
