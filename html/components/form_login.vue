<script setup>
	// @concept: [[JwtTokenManagement]]
	// @concept: [[ReactiveFormValidation]]
	import { useLoginStore } from '@/stores/loginStore';
	const LoginStore = useLoginStore();
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
					const redirect = route.query.redirect || '/explore/use-cases';
					router.push(redirect);
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
				<v-alert
					v-if="LoginStore.statusMsg"
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
			</v-sheet>
		</v-sheet>
		<div class="version-tag">build {{ gitCommitHash }}</div>
	</v-container>
</template>

<style scoped>
.version-tag {
	font-size: 8pt;
	color: #bbb;
	text-align: center;
	font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}
</style>
