<script setup>
	import { useLoginStore } from '@/stores/loginStore';
	const LoginStore = useLoginStore();

	const router = useRouter();

	if (router?.currentRoute.value.query.logout) {
		LoginStore.logout();
	}
</script>

<template>

	<validUserOnly />
  <v-app>

    <generalNavSub />
    <v-main>
	<form_profile />
	</v-main>
	</v-app>
</template>

<style scoped>
</style>
