import axios from 'axios';
import { useLoginStore } from '@/stores/loginStore';

export default defineNuxtPlugin((nuxtApp) => {
	const router = useRouter();

	router.afterEach((to) => {
		const loginStore = useLoginStore();
		if (!loginStore.validUser) return;

		axios.post('/api/pageActivity', {
			pagePath: to.fullPath,
			userRefId: loginStore.loggedInUser.refId,
		}, {
			headers: {
				'Content-Type': 'application/json',
				...loginStore.getAuthTokenProperty,
			},
		}).catch(() => {});
	});
});
