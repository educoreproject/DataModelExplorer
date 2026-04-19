import { useLoginStore } from '@/stores/loginStore';

export default defineNuxtRouteMiddleware((to) => {
	const loginStore = useLoginStore();
	if (!loginStore.validUser) {
		return navigateTo({ path: '/login', query: { redirect: to.fullPath } });
	}
});
