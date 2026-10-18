<script setup>
// RaterRatingPages — the "Rating pages" strip at the top of the Mapping Survey tab's raters view (WORKORDER-RATER7):
// links to the rater pages an admin can usefully open, each in a new tab, and the full sign-in URL for this site with a
// Copy button, since that URL goes into invitations. Rendered by RaterAdminPanel; no props, no events, no API call.
//
// What each link shows a signed-in admin (observed, devlog revision 7): the main login is memory-only, so the new tab is
// not logged in. /rater shows the rater sign-in form, exactly what a rater sees. /rater/instructions needs no sign-in.
// /rater/rate and /rater/done are left out: without a rater session both send the visitor to /rater.
import { ref, onMounted } from 'vue';

const RATING_PAGE_LIST = Object.freeze([
	{ pageName: 'signIn', pageTitle: 'Rater sign-in', pagePath: '/rater', pageNote: 'Send raters here. Opened from here it shows the sign-in a rater sees.', isCopyable: true },
	{ pageName: 'instructions', pageTitle: 'Instructions', pagePath: '/rater/instructions', pageNote: 'How to rate. Readable without signing in.', isCopyable: false },
]);

// the origin is the browser's, read after mount: the generated build is prerendered where there is no window
const siteOrigin = ref('');
const copyNotice = ref('');

const fullUrlOf = (ratingPage) => `${siteOrigin.value}${ratingPage.pagePath}`;

const copyUrl = async (ratingPage) => {
	try {
		await navigator.clipboard.writeText(fullUrlOf(ratingPage));
		copyNotice.value = 'Copied.';
	} catch (clipboardError) {
		copyNotice.value = 'The browser would not copy; select the address and copy it by hand.';
	}
};

onMounted(() => {
	siteOrigin.value = window.location.origin;
});
</script>

<template>
	<section aria-labelledby="ratingPagesHead" class="rt-panel rt-rating-pages" data-testid="rating-pages-strip">
		<h2 id="ratingPagesHead" class="rt-rating-pages-head">Rating pages</h2>
		<ul class="rt-rating-pages-list">
			<li v-for="ratingPage in RATING_PAGE_LIST" :key="ratingPage.pageName" class="rt-rating-page">
				<a :href="ratingPage.pagePath" target="_blank" rel="noopener" class="rt-rating-page-link" :data-testid="`rating-page-link-${ratingPage.pageName}`">{{ ratingPage.pageTitle }}</a>
				<code class="rt-mono rt-rating-page-url" :data-testid="`rating-page-url-${ratingPage.pageName}`">{{ fullUrlOf(ratingPage) }}</code>
				<button v-if="ratingPage.isCopyable" type="button" class="rt-rating-page-copy" :data-testid="`rating-page-copy-${ratingPage.pageName}`" @click="copyUrl(ratingPage)">Copy</button>
				<span v-if="ratingPage.isCopyable && copyNotice" role="status" data-testid="rating-page-copied">{{ copyNotice }}</span>
				<span class="rt-rating-page-note">{{ ratingPage.pageNote }}</span>
			</li>
		</ul>
	</section>
</template>

<style scoped>
.rt-rating-pages { margin: 16px 0 0; padding: 12px 16px; }
.rt-rating-pages-head { margin: 0 0 6px; font-size: 16px; }
.rt-rating-pages-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.rt-rating-page { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; font-size: 14px; }
.rt-rating-page-link { color: #072A6C; font-weight: 700; min-width: 110px; }
.rt-rating-page-url { color: #1F2937; overflow-wrap: anywhere; }
.rt-rating-page-note { color: #4B5563; }
.rt-rating-page-copy { min-height: 32px; padding: 0 10px; border: 1px solid #C9D3E8; background: #FFFFFF; color: #072A6C; border-radius: 8px; font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; }
</style>
