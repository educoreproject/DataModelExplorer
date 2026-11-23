<script setup>
	// @concept: [[JwtTokenManagement]]
	// @concept: [[ReactiveFormValidation]]
	import { useLoginStore } from '@/stores/loginStore';
	import { useAccountStore } from '@/stores/accountStore';
	import { accountVocabulary } from '@/components/accountVocabulary.js';
	import { sameSiteReturnPathOf } from '@/components/returnPathRules.js';
	const LoginStore = useLoginStore();
	const accountStore = useAccountStore();

	// "Create an account" only where the server says registration is on (WORKORDER-userRegistrationReset-112026)
	onMounted(() => accountStore.loadRegistrationOptions());

	const isResendSent = ref(false);
	// a resend asked for on this form (the store outlives the page, so its isMailNotSent may be another page's)
	const isResendTried = ref(false);
	const resendConfirmation = async () => {
		isResendTried.value = true;
		isResendSent.value = await accountStore.resendConfirmation(username.value.trim());
	};
	const { gitCommitHash } = useRuntimeConfig().public;

	const router = useRouter();
	const route = useRoute();

	const username = ref('');
	const password = ref('');
	const showPassword = ref(false);

	const usernameRules = [
		(value) => {
			if (value?.length > 0) return true;
			return 'User Name is required.';
		},
	];

	const passwordRules = [
		(value) => {
			if (value?.length > 0) return true;
			return 'Password is required.';
		},
	];

	const submitButton = async () => {
		LoginStore.loggedInUser.username = username.value;
		LoginStore.loggedInUser.password = password.value;

		const tmp = await LoginStore.login()
			.then((validLogin) => {
				if (LoginStore.validUser) {
					// back where the sign-in was asked for (the approval link, WORKORDER-adminApproval-112126 A5), only on this site
					router.push(sameSiteReturnPathOf(route.query.redirect) || '/');
				}
			})
			.catch((err) => {
				LoginStore.statusMsg = err.toString();
			});
	};
</script>

<template>
	<v-container>
		<!-- ⟪rosettaLoginPolish #13⟫ at phone width the container's own 16px is the side gutter: the outer padding starts at sm, and the card shrinks to fit below 340px -->
		<v-sheet class="px-0 py-6 pa-sm-12" color="transparent">
			<v-sheet
				class="mx-auto pa-6 pa-sm-10"
				width="100%"
				max-width="340"
				:elevation="2"
				rounded="lg"
				data-testid="login-card"
			>
				<!-- WORKORDER-accountMailFailureAndApprovalNotice-112326 M4: a sign-in refused because the account awaits approval
				     is set apart, not shown as an ordinary error -->
				<AccountApprovalNotice v-if="LoginStore.statusMsg && LoginStore.loginRefusalName === 'awaitingApproval'" :notice-text="LoginStore.statusMsg" data-testid="login-approval-notice" />
				<v-alert
					v-else-if="LoginStore.statusMsg"
					type="error"
					density="compact"
					class="mb-4"
				>
					{{ LoginStore.statusMsg }}
				</v-alert>
				<v-form fast-fail @submit.prevent>
					<v-text-field
						v-model="username"
						:rules="usernameRules"
						label="User Name"
						autocompleset="username"
						@keyup.enter="submitButton"
						autofocus
					>
					</v-text-field>

					<v-text-field
						:type="showPassword ? 'text' : 'password'"
						v-model="password"
						:rules="passwordRules"
						label="Password"
						autocompleset="password"
						:append-inner-icon="showPassword ? 'mdi-eye-off' : 'mdi-eye'"
						@click:append-inner="showPassword = !showPassword"
						@keyup.enter="submitButton"
					>
					</v-text-field>

					<v-btn class="mt-2" color="primary" @click="submitButton" block>Login</v-btn>
				</v-form>
				<!-- WORKORDER-userRegistrationReset-112026: an account awaiting confirmation is offered a new link -->
				<div v-if="LoginStore.loginRefusalName === 'emailNotConfirmed' && !isResendSent" class="mt-3">
					<v-btn variant="tonal" block :loading="accountStore.loading" data-testid="login-resend-confirmation" @click="resendConfirmation">{{ accountVocabulary.resendConfirmationButtonText }}</v-btn>
				</div>
				<v-alert v-if="isResendSent && accountStore.noticeMsg" type="success" density="compact" class="mt-3" data-testid="login-resend-notice">{{ accountStore.noticeMsg }}</v-alert>
				<!-- M3: the new link's mail did not go -->
				<v-alert v-if="isResendTried && !isResendSent && accountStore.isMailNotSent && accountStore.statusMsg" type="warning" density="compact" class="mt-3" data-testid="login-resend-mail-not-sent">{{ accountStore.statusMsg }}</v-alert>
				<!-- reset is always offered; registration only where it is on -->
				<div class="account-links mt-4">
					<NuxtLink to="/forgot-password" data-testid="login-forgot-password">{{ accountVocabulary.forgotPasswordLinkText }}</NuxtLink>
					<NuxtLink v-if="accountStore.registrationOptions.selfRegistrationEnabled" to="/register" data-testid="login-create-account">{{ accountVocabulary.createAccountLinkText }}</NuxtLink>
				</div>
			</v-sheet>
		</v-sheet>
		<div class="version-tag">build {{ gitCommitHash }}</div>
	</v-container>
</template>

<style scoped>
.account-links {
	display: flex;
	justify-content: space-between;
	flex-wrap: wrap;
	gap: 8px;
	font-size: 0.875rem;
}
.version-tag {
	font-size: 8pt;
	color: #bbb;
	text-align: center;
	font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}
</style>
