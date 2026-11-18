<script setup>
// AppFooter (BD 2026-11-18): the small line at the foot of every page: the project, then links to the Privacy Policy, the
// Terms of Service and the support address. A page that fills the window itself (the AI Explorer chat) has none, so the
// footer never pushes it into a page scroll.
const FULL_WINDOW_PATH_LIST = Object.freeze(['/dm/explorer']);
const route = useRoute();
const isShown = computed(() => !FULL_WINDOW_PATH_LIST.includes(route.path));
const footerLinkList = [
	{ text: 'Privacy Policy', to: '/privacy', testId: 'footer-privacy' },
	{ text: 'Terms of Service', to: '/terms', testId: 'footer-terms' },
];
const SUPPORT_EMAIL_ADDRESS = 'support@educore.org';
</script>

<template>
	<footer v-if="isShown" class="app-footer text-caption text-medium-emphasis" data-testid="app-footer">
		<span>&copy; 2026 EDUcore Project</span>
		<template v-for="oneLink in footerLinkList" :key="oneLink.to">
			<span class="app-footer-sep" aria-hidden="true">&middot;</span>
			<NuxtLink :to="oneLink.to" :data-testid="oneLink.testId">{{ oneLink.text }}</NuxtLink>
		</template>
		<span class="app-footer-sep" aria-hidden="true">&middot;</span>
		<a :href="`mailto:${SUPPORT_EMAIL_ADDRESS}`">Contact</a>
	</footer>
</template>

<style scoped>
.app-footer {
	display: flex;
	flex-wrap: wrap;
	justify-content: center;
	align-items: center;
	gap: 4px 8px;
	padding: 20px 16px 24px;
	border-top: 1px solid rgba(0, 0, 0, 0.08);
	margin-top: 24px;
}

.app-footer a {
	color: inherit;
	text-decoration: none;
}

.app-footer a:hover {
	text-decoration: underline;
}
</style>
