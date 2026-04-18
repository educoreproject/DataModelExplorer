<script setup>
	// @concept: [[JwtTokenManagement]]
	// @concept: [[ReactiveFormValidation]]
	import { useUserDataStore } from '@/stores/userDataStore';
	const userDataStore = useUserDataStore();
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
		userDataStore.loggedInUser.username = username.value;
		userDataStore.loggedInUser.password = password.value;

		const tmp = await userDataStore.login()
			.then((validLogin) => {
				if (userDataStore.validUser) {
					const redirect = route.query.redirect || '/';
					router.push(redirect);
				}
			})
			.catch((err) => {
				userDataStore.statusMsg = err.toString();
			});
	};
</script>

<template>
	<v-container>
		<v-sheet class="pa-12" color="transparent">
			<v-sheet
				class="mx-auto pa-10"
				width="340"
				:elevation="2"
				rounded="lg"
			>
				<v-alert
					v-if="userDataStore.statusMsg"
					type="error"
					density="compact"
					class="mb-4"
				>
					{{ userDataStore.statusMsg }}
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
