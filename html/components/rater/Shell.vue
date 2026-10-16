<script setup>
// RaterShell — the CEDS Rater's frame (design: DESIGN-raterToolLook-101426): navy app bar with the EduCore wordmark,
// "Mapping Survey" (named CEDS Rater until revision 8), the signed-in name and account links, then the page. It also carries the rater area's shared styles
// (colours, focus ring, sticky helpers; assets/css/raterArea.css since revision 6), unscoped and all prefixed rt-, so
// every rater page looks the same.
import { useRaterStore } from '@/stores/raterStore';
// the shared rt- styles; imported, not <style src>, which breaks the production build beside a scoped block
import '@/assets/css/raterArea.css';

const props = defineProps({
	areaLabel: { type: String, default: 'Mapping Survey' },
	showInstructionsLink: { type: Boolean, default: true },
	showRatingLink: { type: Boolean, default: false },
	showAccount: { type: Boolean, default: true },
});

const raterStore = useRaterStore();
const router = useRouter();

const signOut = () => {
	raterStore.signOut();
	router.push('/rater');
};
</script>

<template>
	<v-app class="rt-app">
		<header class="rt-appbar">
			<div class="rt-appbar-brand">
				<span class="rt-wordmark">EduCore</span>
				<span class="rt-area" data-testid="rater-area-label">{{ props.areaLabel }}</span>
			</div>
			<nav v-if="props.showAccount && raterStore.isSignedIn" aria-label="Account" class="rt-appbar-nav">
				<span class="rt-signed-in">Signed in as <b>{{ raterStore.raterUserName }}</b></span>
				<NuxtLink v-if="props.showRatingLink" to="/rater/rate" class="rt-appbar-link" data-testid="rater-link-rating">Back to rating</NuxtLink>
				<NuxtLink v-if="props.showInstructionsLink" to="/rater/instructions" class="rt-appbar-link" data-testid="rater-link-instructions">Instructions</NuxtLink>
				<a href="#" class="rt-appbar-link" data-testid="rater-sign-out" @click.prevent="signOut">Sign out</a>
			</nav>
		</header>
		<v-main class="rt-main-wrap">
			<slot />
		</v-main>
	</v-app>
</template>
