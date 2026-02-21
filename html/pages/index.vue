<script setup>
	import { useLoginStore } from '@/stores/loginStore';
	const LoginStore = useLoginStore();
	import { useRouter } from 'vue-router';
	const router = useRouter();

	if (router?.currentRoute.value.query.logout) {
		LoginStore.logout();
	} else if (LoginStore.validUser) {
		router.push('/library');
	}
</script>

<template>
	<v-app>
		<generalNavSub />
		<v-main>
			<form_login />
		</v-main>
	</v-app>
</template>

<style scoped>
</style>
