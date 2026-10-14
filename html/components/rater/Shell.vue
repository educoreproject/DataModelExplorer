<script setup>
// RaterShell — the CEDS Rater's frame (design: DESIGN-raterToolLook-101426): navy app bar with the EduCore wordmark,
// "CEDS Rater", the signed-in name and account links, then the page. It also carries the rater area's shared styles
// (colours, focus ring, sticky helpers), unscoped and all prefixed rt-, so every rater page looks the same.
import { useRaterStore } from '@/stores/raterStore';

const props = defineProps({
	areaLabel: { type: String, default: 'CEDS Rater' },
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
				<span class="rt-area">{{ props.areaLabel }}</span>
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

<style>
.rt-app {
	--rt-navy: #072A6C;
	--rt-teal: #00797C;
	--rt-teal-dark: #005E61;
	--rt-teal-tint: #E0F6F6;
	--rt-teal-line: #9ED9DA;
	--rt-amber: #B26A00;
	--rt-ink: #111827;
	--rt-muted: #4B5563;
	--rt-line: #E3E7EF;
	--rt-card-line: #DCE2EC;
	--rt-page: #F8F9FC;
	--rt-error: #9B1C1C;
	background: var(--rt-page) !important;
	font-family: 'Open Sans', system-ui, sans-serif;
	color: var(--rt-ink);
	font-size: 16px;
}
.rt-app a { color: var(--rt-navy); }
.rt-app a:hover { color: var(--rt-teal); }
.rt-app button:focus-visible,
.rt-app input:focus-visible,
.rt-app textarea:focus-visible,
.rt-app a:focus-visible,
.rt-app summary:focus-visible {
	outline: 3px solid var(--rt-navy);
	outline-offset: 2px;
	box-shadow: 0 0 0 6px #FFAB40;
}
.rt-app input[type='radio'],
.rt-app input[type='checkbox'] { width: 22px; height: 22px; margin: 0; accent-color: var(--rt-teal); cursor: pointer; }
.rt-app input:disabled { cursor: not-allowed; opacity: 0.45; }
.rt-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
@keyframes rtPulse { 0%, 100% { opacity: 0.45; } 50% { opacity: 1; } }
@media (min-width: 1100px) { .rt-stick { position: sticky; top: 12px; } }

.rt-appbar { background: var(--rt-navy); color: #FFFFFF; padding: 10px 24px; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; }
.rt-appbar-brand { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; }
.rt-wordmark { font-family: 'DM Serif Display', Georgia, serif; font-size: 24px; }
.rt-area { font-size: 15px; opacity: 0.9; }
.rt-appbar-nav { display: flex; align-items: center; gap: 18px; font-size: 14px; flex-wrap: wrap; }
.rt-signed-in { opacity: 0.9; }
.rt-app .rt-appbar-link { color: #FFFFFF; }
.rt-app .rt-appbar-link:hover { color: #E0F6F6; }
.rt-main-wrap { background: var(--rt-page); }

.rt-button { min-height: 44px; padding: 0 20px; border: 0; background: var(--rt-navy); color: #FFFFFF; border-radius: 8px; font: inherit; font-weight: 700; cursor: pointer; }
.rt-button:disabled { opacity: 0.55; cursor: not-allowed; }
.rt-app a.rt-button { color: #FFFFFF; text-decoration: none; display: inline-flex; align-items: center; }
.rt-app a.rt-button-quiet { text-decoration: none; display: inline-flex; align-items: center; }
.rt-button-quiet { min-height: 44px; padding: 0 16px; border: 1px solid #C9D3E8; background: #FFFFFF; color: var(--rt-navy); border-radius: 8px; font: inherit; font-weight: 700; cursor: pointer; }
.rt-button-teal { min-height: 44px; padding: 0 16px; border: 1px solid var(--rt-teal); background: #FFFFFF; color: var(--rt-teal-dark); border-radius: 8px; font: inherit; font-weight: 700; cursor: pointer; }
.rt-panel { background: #FFFFFF; border: 1px solid var(--rt-line); border-radius: 12px; box-sizing: border-box; }
.rt-serif { font-family: 'DM Serif Display', Georgia, serif; font-weight: 400; }
.rt-chip { border-radius: 999px; padding: 1px 10px; font-size: 12px; font-weight: 700; }
.rt-qualifier { border-radius: 6px; padding: 1px 8px; font-size: 15px; font-weight: 700; background: var(--rt-teal-tint); color: var(--rt-teal-dark); border: 1px solid var(--rt-teal-line); }
.rt-mono { font-family: ui-monospace, Menlo, monospace; }
.rt-field-label { display: flex; flex-direction: column; gap: 6px; font-size: 15px; font-weight: 600; color: #374151; }
.rt-field { min-height: 48px; box-sizing: border-box; padding: 0 12px; border: 1px solid #C9D3E8; border-radius: 8px; font: inherit; font-size: 17px; font-weight: 400; color: var(--rt-ink); background: #FFFFFF; }
.rt-alert-error { margin: 0; background: #FBF2F3; border: 1px solid #E8B4B8; border-radius: 8px; padding: 10px 12px; font-size: 15px; color: var(--rt-error); }
.rt-alert-ok { margin: 0; background: var(--rt-teal-tint); border: 1px solid var(--rt-teal-line); border-radius: 8px; padding: 10px 12px; font-size: 15px; color: var(--rt-teal-dark); }
</style>
