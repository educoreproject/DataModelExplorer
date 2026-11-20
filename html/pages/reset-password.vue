<script setup>
	// reset-password — the page the emailed link opens (?token=...): a new password, twice (WORKORDER-userRegistrationReset-112026).
	// On success the server has ended every earlier session and signed this one in; the page goes home.
	import { useAccountStore } from '@/stores/accountStore';
	import { accountVocabulary } from '@/components/accountVocabulary.js';

	definePageMeta({ layout: 'blank' });

	const MINIMUM_PASSWORD_LENGTH = 12;
	const accountStore = useAccountStore();
	const route = useRoute();
	const router = useRouter();

	const tokenText = computed(() => String(route.query.token || ''));
	const newPassword = ref('');
	const confirmPassword = ref('');
	const showPassword = ref(false);

	const passwordRules = [(passwordText) => (passwordText?.length >= MINIMUM_PASSWORD_LENGTH ? true : accountVocabulary.passwordTooShortText)];
	const confirmRules = [(passwordText) => (passwordText === newPassword.value ? true : accountVocabulary.passwordsDifferText)];

	onMounted(() => accountStore.clearMessages());

	const submitPassword = async () => {
		if (newPassword.value.length < MINIMUM_PASSWORD_LENGTH || newPassword.value !== confirmPassword.value) {
			return;
		}
		const isSignedIn = await accountStore.completePasswordReset({ token: tokenText.value, password: newPassword.value });
		if (isSignedIn) {
			router.push('/');
		}
	};
</script>

<template>
	<div class="account-page">
		<NuxtLink to="/" class="account-header" aria-label="EDUcore home">
			<img src="/educore-logo.png" alt="EDUcore" class="account-logo" />
		</NuxtLink>
		<v-container>
			<v-sheet class="mx-auto my-6 pa-6 pa-sm-10" width="100%" max-width="420" :elevation="2" rounded="lg" data-testid="reset-password-card">
				<h1 class="text-h6 mb-3">{{ accountVocabulary.resetPasswordTitle }}</h1>
				<v-alert v-if="accountStore.statusMsg" type="error" density="compact" class="mb-4" data-testid="reset-password-error">{{ accountStore.statusMsg }}</v-alert>
				<template v-if="tokenText">
					<p class="text-body-2 mb-4">{{ accountVocabulary.resetPasswordIntroText }}</p>
					<v-form @submit.prevent="submitPassword">
						<v-text-field
							v-model="newPassword"
							:type="showPassword ? 'text' : 'password'"
							:rules="passwordRules"
							:label="accountVocabulary.newPasswordLabel"
							autocomplete="new-password"
							:append-inner-icon="showPassword ? 'mdi-eye-off' : 'mdi-eye'"
							autofocus
							data-testid="reset-password-new"
							@click:append-inner="showPassword = !showPassword"
						/>
						<v-text-field
							v-model="confirmPassword"
							:type="showPassword ? 'text' : 'password'"
							:rules="confirmRules"
							:label="accountVocabulary.confirmPasswordLabel"
							autocomplete="new-password"
							data-testid="reset-password-confirm"
							@keyup.enter="submitPassword"
						/>
						<v-btn class="mt-2" color="primary" block :loading="accountStore.loading" data-testid="reset-password-submit" @click="submitPassword">{{ accountVocabulary.savePasswordButtonText }}</v-btn>
					</v-form>
				</template>
				<p v-else class="text-body-2" data-testid="reset-password-no-token">{{ accountVocabulary.missingTokenText }}</p>
				<div class="mt-4 text-center">
					<NuxtLink to="/forgot-password" data-testid="reset-password-new-link">{{ accountVocabulary.forgotPasswordLinkText }}</NuxtLink>
					&nbsp;·&nbsp;
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
