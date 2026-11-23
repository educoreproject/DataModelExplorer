<script setup>
	// forgot-password — ask for a reset link by user name or email address (WORKORDER-userRegistrationReset-112026, R4).
	// The server answers the same words whether or not an account matched; this page shows them as they come.
	import { useAccountStore } from '@/stores/accountStore';
	import { accountVocabulary } from '@/components/accountVocabulary.js';

	definePageMeta({ layout: 'blank' });

	const accountStore = useAccountStore();
	const identifier = ref('');
	const isSent = ref(false);

	const identifierRules = [(identifierText) => (identifierText?.trim().length > 0 ? true : accountVocabulary.requiredText)];

	onMounted(() => accountStore.clearMessages());

	const submitRequest = async () => {
		if (!identifier.value.trim()) {
			return;
		}
		isSent.value = await accountStore.requestPasswordReset(identifier.value.trim());
	};
</script>

<template>
	<div class="account-page">
		<NuxtLink to="/" class="account-header" aria-label="EDUcore home">
			<img src="/educore-logo.png" alt="EDUcore" class="account-logo" />
		</NuxtLink>
		<v-container>
			<v-sheet class="mx-auto my-6 pa-6 pa-sm-10" width="100%" max-width="420" :elevation="2" rounded="lg" data-testid="forgot-password-card">
				<h1 class="text-h6 mb-3">{{ accountVocabulary.forgotPasswordTitle }}</h1>
				<!-- WORKORDER-accountMailFailureAndApprovalNotice-112326 M3: the reset mail did not go; say so rather than leave them waiting -->
				<v-alert v-if="accountStore.statusMsg && accountStore.isMailNotSent" type="warning" density="compact" class="mb-4" data-testid="forgot-password-mail-not-sent">{{ accountStore.statusMsg }}</v-alert>
				<v-alert v-else-if="accountStore.statusMsg" type="error" density="compact" class="mb-4" data-testid="forgot-password-error">{{ accountStore.statusMsg }}</v-alert>
				<v-alert v-if="isSent && accountStore.noticeMsg" type="success" density="compact" class="mb-4" data-testid="forgot-password-notice">{{ accountStore.noticeMsg }}</v-alert>
				<template v-if="!isSent">
					<p class="text-body-2 mb-4">{{ accountVocabulary.forgotPasswordIntroText }}</p>
					<v-form @submit.prevent="submitRequest">
						<v-text-field v-model="identifier" :rules="identifierRules" :label="accountVocabulary.identifierLabel" autocomplete="username" autofocus data-testid="forgot-password-identifier" @keyup.enter="submitRequest" />
						<v-btn class="mt-2" color="primary" block :loading="accountStore.loading" data-testid="forgot-password-submit" @click="submitRequest">{{ accountVocabulary.sendResetLinkButtonText }}</v-btn>
					</v-form>
				</template>
				<div class="mt-4 text-center">
					<NuxtLink to="/login" data-testid="forgot-password-back">{{ accountVocabulary.backToSignInText }}</NuxtLink>
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
