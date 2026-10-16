<script setup>
// /rater — the CEDS Rater sign-in (design: SignIn). A rater goes straight to the first unrated item (or the Done page
// when all are saved); an admin goes to the CEDS Rater tab of the main admin page, already logged in on the main site
// (revision 6: raterStore.signIn hands an admin's sign-in to loginStore). No self sign-up: accounts are made by the admin.
import { ref, onMounted } from 'vue';
import { useRaterStore } from '@/stores/raterStore';

definePageMeta({ layout: false });
useHead({ title: 'Mapping Survey: sign in' });

const raterStore = useRaterStore();
const router = useRouter();
const raterUserName = ref('');
const password = ref('');

const goOnward = async () => {
	if (raterStore.isAdmin) {
		router.push({ path: '/admin', query: { tool: 'ceds-rater' } });
		return;
	}
	const progressRead = await raterStore.loadProgress();
	if (!progressRead) {
		return;
	}
	if (raterStore.progress.finishedAt || raterStore.progress.nextUnratedItemNumber === null) {
		router.push('/rater/done');
		return;
	}
	router.push({ path: '/rater/rate', query: { item: raterStore.progress.nextUnratedItemNumber } });
};

const signIn = async () => {
	if (await raterStore.signIn({ raterUserName: raterUserName.value, password: password.value })) {
		await goOnward();
	}
};

onMounted(async () => {
	if (raterStore.restoreSession()) {
		await goOnward();
	}
});
</script>

<template>
	<RaterShell :show-account="false">
		<main class="rt-signin-main">
			<div class="rt-signin-intro">
				<h1 class="rt-serif rt-signin-title">Help us check how well data standards line up</h1>
				<p class="rt-signin-text">You will look at 50 elements, one at a time, mixed from Ed-Fi, SIF and PESC, and say which CEDS element means the same thing. About two minutes an item. Your answers become the yardstick we measure our software against. After you sign in you go straight to your next item.</p>
				<div class="rt-signin-chips">
					<span class="rt-std-chip" style="background: #E6F4EC; color: #1E7A4C">Ed-Fi</span>
					<span class="rt-std-chip" style="background: #F1EBF8; color: #6B3FA0">SIF</span>
					<span class="rt-std-chip" style="background: #E7ECF6; color: #072A6C">PESC</span>
					<span aria-hidden="true" style="color: #6B7280; font-weight: 700">→</span>
					<span class="rt-std-chip" style="background: #E0F6F6; color: #005E61">CEDS</span>
				</div>
			</div>

			<section aria-labelledby="signHead" class="rt-panel rt-signin-card">
				<h2 id="signHead" class="rt-signin-head">Sign in</h2>
				<p v-if="raterStore.statusMsg" role="alert" class="rt-alert-error" data-testid="rater-signin-error">{{ raterStore.statusMsg }}</p>
				<form class="rt-signin-form" @submit.prevent="signIn">
					<label class="rt-field-label">Name
						<input v-model="raterUserName" type="text" autocomplete="username" class="rt-field" data-testid="rater-signin-name" />
					</label>
					<label class="rt-field-label">Password
						<input v-model="password" type="password" autocomplete="current-password" class="rt-field" data-testid="rater-signin-password" />
					</label>
					<button type="submit" class="rt-button rt-signin-button" :disabled="raterStore.loading" data-testid="rater-signin-submit">Sign in</button>
				</form>
				<p class="rt-signin-note">Accounts are made by the project’s organizer. If you have forgotten your password, ask the person who invited you; they can reset it.</p>
			</section>
		</main>
	</RaterShell>
</template>

<style scoped>
.rt-signin-main { flex: 1 1 auto; display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 48px; padding: 56px clamp(16px, 4vw, 48px); box-sizing: border-box; }
.rt-signin-intro { flex: 0 1 460px; display: flex; flex-direction: column; gap: 16px; }
.rt-signin-title { margin: 0; font-size: 42px; line-height: 1.1; color: #072A6C; }
.rt-signin-text { margin: 0; font-size: 17px; line-height: 1.6; color: #374151; }
.rt-signin-chips { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.rt-std-chip { border-radius: 999px; padding: 3px 12px; font-size: 13px; font-weight: 700; }
.rt-signin-card { flex: 0 1 420px; padding: 28px; display: flex; flex-direction: column; gap: 16px; }
.rt-signin-head { margin: 0; font-size: 22px; font-weight: 700; }
.rt-signin-form { display: flex; flex-direction: column; gap: 16px; }
.rt-signin-button { min-height: 48px; font-size: 17px; }
.rt-signin-note { margin: 0; font-size: 14px; line-height: 1.5; color: #4B5563; }
</style>
