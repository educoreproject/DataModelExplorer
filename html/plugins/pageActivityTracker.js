import axios from 'axios';
import { useUserDataStore } from '@/stores/userDataStore';

export default defineNuxtPlugin((nuxtApp) => {
	const router = useRouter();

	router.afterEach((to) => {
		const userDataStore = useUserDataStore();
		if (!userDataStore.validUser) return;

		axios.post('/api/pageActivity', {
			pagePath: to.fullPath,
			userRefId: userDataStore.loggedInUser.refId,
		}, {
			headers: {
				'Content-Type': 'application/json',
				...userDataStore.getAuthTokenProperty,
			},
		}).catch(() => {});
	});
});
