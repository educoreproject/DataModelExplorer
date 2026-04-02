<script setup>
import { useLoginStore } from '@/stores/loginStore';
const LoginStore = useLoginStore();
const router = useRouter();

// Auth guard
onMounted(() => {
	if (!LoginStore.validUser) {
		router.push({ path: '/', query: { redirect: '/profile/edit' } });
	}
});
</script>

<template>
	<v-app>
		<generalNavSub />
		<v-main style="padding-top: 65px">
			<SubPageNav
				:model-value="'edit'"
				:tabs="[
					{ label: 'Profile', value: 'edit', to: '/profile/edit' },
					{ label: 'Sessions', value: 'sessions', to: '/profile/sessions' },
				]"
			/>
			<form_profile />
		</v-main>
	</v-app>
</template>
