<script setup>
	// register — a visitor creates their own account (WORKORDER-userRegistrationReset-112026, R1, R3). The user name stays
	// separate from the email address. Where the server requires confirmation the page then says "check your email";
	// where it does not, the visitor is signed in and goes home. The server's refusals are shown as they arrive.
	import { useAccountStore } from '@/stores/accountStore';
	import { accountVocabulary } from '@/components/accountVocabulary.js';

	definePageMeta({ layout: 'blank' });

	const MINIMUM_PASSWORD_LENGTH = 12;
	const USERNAME_PATTERN = /^[a-zA-Z0-9_-]+$/;
	const EMAIL_ADDRESS_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

	const accountStore = useAccountStore();
	const router = useRouter();

	const username = ref('');
	const first = ref('');
	const last = ref('');
	const emailAdr = ref('');
	const password = ref('');
	const confirmPassword = ref('');
	// A8 (WORKORDER-adminApproval-112126): an optional note for the approvers, at most this long (the server's limit too)
	const MAXIMUM_COMMENT_LENGTH = 1000;
	const applicationComment = ref('');
	const commentRules = [(commentText) => (String(commentText || '').length <= MAXIMUM_COMMENT_LENGTH ? true : accountVocabulary.applicationCommentTooLongText)];
	const showPassword = ref(false);
	const isRegistered = ref(false);

	const requiredRule = (fieldText) => (String(fieldText || '').trim().length > 0 ? true : accountVocabulary.requiredText);
	const usernameRules = [requiredRule, (usernameText) => (USERNAME_PATTERN.test(usernameText || '') ? true : accountVocabulary.usernameHintText)];
	const emailRules = [requiredRule, (emailText) => (EMAIL_ADDRESS_PATTERN.test(String(emailText || '').trim()) ? true : accountVocabulary.emailNotValidText)];
	const passwordRules = [(passwordText) => (passwordText?.length >= MINIMUM_PASSWORD_LENGTH ? true : accountVocabulary.passwordTooShortText)];
	const confirmRules = [(passwordText) => (passwordText === password.value ? true : accountVocabulary.passwordsDifferText)];

	const isFormReady = computed(
		() =>
			USERNAME_PATTERN.test(username.value) &&
			first.value.trim() &&
			last.value.trim() &&
			EMAIL_ADDRESS_PATTERN.test(emailAdr.value.trim()) &&
			password.value.length >= MINIMUM_PASSWORD_LENGTH &&
			password.value === confirmPassword.value &&
			applicationComment.value.length <= MAXIMUM_COMMENT_LENGTH,
	);

	onMounted(() => {
		accountStore.clearMessages();
		accountStore.loadRegistrationOptions();
	});

	const submitRegistration = async () => {
		if (!isFormReady.value) {
			return;
		}
		const isAccepted = await accountStore.registerUser({ username: username.value.trim(), password: password.value, first: first.value.trim(), last: last.value.trim(), emailAdr: emailAdr.value.trim(), applicationComment: applicationComment.value.trim() });
		if (!isAccepted) {
			return;
		}
		// confirmation required, or (WORKORDER-adminApproval-112126) the account now waits for an approver: say so, stay here
		if (accountStore.registrationOptions.requireEmailConfirmation || accountStore.isAwaitingApproval) {
			isRegistered.value = true;
			return;
		}
		router.push('/');
	};
</script>

<template>
	<div class="account-page">
		<NuxtLink to="/" class="account-header" aria-label="EDUcore home">
			<img src="/educore-logo.png" alt="EDUcore" class="account-logo" />
		</NuxtLink>
		<v-container>
			<v-sheet class="mx-auto my-6 pa-6 pa-sm-10" width="100%" max-width="460" :elevation="2" rounded="lg" data-testid="register-card">
				<h1 class="text-h6 mb-3">{{ accountVocabulary.registerTitle }}</h1>
				<!-- M3, M6: the confirmation mail did not go, so nothing was created; a warning of its own -->
				<v-alert v-if="accountStore.statusMsg && accountStore.isMailNotSent" type="warning" density="compact" class="mb-4" data-testid="register-mail-not-sent">{{ accountStore.statusMsg }}</v-alert>
				<v-alert v-else-if="accountStore.statusMsg" type="error" density="compact" class="mb-4" data-testid="register-error">{{ accountStore.statusMsg }}</v-alert>
				<!-- after sign-up (WORKORDER-accountMailFailureAndApprovalNotice-112326 M4): what succeeded, then the approval block
				     on its own; a confirmation mail that failed is a refusal (statusMsg above) and the form stays to try again -->
				<template v-if="isRegistered && accountStore.noticeMsg">
					<v-alert type="success" density="compact" class="mb-4" data-testid="register-notice">{{ accountStore.noticeMsg }}</v-alert>
					<AccountApprovalNotice v-if="accountStore.isApprovalNotice" :heading-text="accountVocabulary.approvalNoticeHeadingText" :notice-text="accountVocabulary.approvalNoticeText" data-testid="register-approval-notice-after" />
				</template>
				<p v-if="accountStore.registrationOptions.isLoaded && !accountStore.registrationOptions.selfRegistrationEnabled" class="text-body-2" data-testid="register-closed">
					{{ accountVocabulary.registrationClosedText }}
				</p>
				<template v-else-if="!isRegistered">
					<p class="text-body-2 mb-4">{{ accountVocabulary.registerIntroText }}</p>
					<AccountApprovalNotice v-if="accountStore.registrationOptions.requireAdminApproval" :heading-text="accountVocabulary.registerApprovalNoticeHeadingText" :notice-text="accountVocabulary.registerApprovalNoticeText" data-testid="register-approval-notice" />
					<v-form @submit.prevent="submitRegistration">
						<v-text-field v-model="username" :rules="usernameRules" :label="accountVocabulary.usernameLabel" :hint="accountVocabulary.usernameHintText" autocomplete="username" autofocus data-testid="register-username" />
						<v-text-field v-model="first" :rules="[requiredRule]" :label="accountVocabulary.firstNameLabel" autocomplete="given-name" data-testid="register-first" />
						<v-text-field v-model="last" :rules="[requiredRule]" :label="accountVocabulary.lastNameLabel" autocomplete="family-name" data-testid="register-last" />
						<v-text-field v-model="emailAdr" :rules="emailRules" :label="accountVocabulary.emailLabel" type="email" autocomplete="email" data-testid="register-email" />
						<v-text-field
							v-model="password"
							:type="showPassword ? 'text' : 'password'"
							:rules="passwordRules"
							:label="accountVocabulary.passwordLabel"
							autocomplete="new-password"
							:append-inner-icon="showPassword ? 'mdi-eye-off' : 'mdi-eye'"
							data-testid="register-password"
							@click:append-inner="showPassword = !showPassword"
						/>
						<v-text-field v-model="confirmPassword" :type="showPassword ? 'text' : 'password'" :rules="confirmRules" :label="accountVocabulary.confirmPasswordLabel" autocomplete="new-password" data-testid="register-password-confirm" @keyup.enter="submitRegistration" />
						<v-textarea
							v-model="applicationComment"
							:rules="commentRules"
							:label="accountVocabulary.applicationCommentLabel"
							:hint="accountVocabulary.applicationCommentHintText"
							:counter="MAXIMUM_COMMENT_LENGTH"
							rows="3"
							auto-grow
							data-testid="register-application-comment"
						/>
						<v-btn class="mt-2" color="primary" block :disabled="!isFormReady" :loading="accountStore.loading" data-testid="register-submit" @click="submitRegistration">{{ accountVocabulary.registerButtonText }}</v-btn>
					</v-form>
				</template>
				<div class="mt-4 text-center">
					<NuxtLink to="/login" data-testid="register-back">{{ accountVocabulary.backToSignInText }}</NuxtLink>
				</div>
			</v-sheet>
		</v-container>
		<!-- the personal-information notice, as on the login page (PLAN-userRegistrationReset-112026 4.7) -->
		<div class="account-notice"><SiteNoticePiiNotice /></div>
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
.account-notice {
	max-width: 480px;
	margin: 0 auto 24px;
	padding: 0 16px;
}
</style>
