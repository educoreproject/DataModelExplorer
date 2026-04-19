import { useUserDataStore } from '@/stores/userDataStore';

export default defineNuxtRouteMiddleware((to) => {
	const userDataStore = useUserDataStore();
	if (!userDataStore.validUser) {
		return navigateTo({ path: '/login', query: { redirect: to.fullPath } });
	}
});
