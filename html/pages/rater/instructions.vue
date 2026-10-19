<script setup>
// /rater/instructions — plain reading page (design: Instructions). Revision 16: the text is TQ's own, approved
// (DRAFT-raterInstructionsSimple-101626.md), rendered word for word: its three headings, the four choices as a list,
// the three things to watch as a numbered list, its bold and the code-styled Staff.BirthDate. It replaced the four
// worked examples of DRAFT-workedExamplesAndPracticeNotes-101326.md (one of them leaked a survey answer) and their
// "tqii will revise" attribution. Do not reword it here; change the draft with TQ and copy it again.
// Revision 18: opened from a rating item, the URL carries that item (?item=N, and &set=undone&items=… in "left undone"
// mode), and all three "Back to rating" links return to it. The query is checked against the signed-in rater's item
// count (composables/raterRatingPlace.js); with no query, or one that names no place, they go to /rater/rate as before.
import { computed, onMounted } from 'vue';
import { useRaterStore } from '@/stores/raterStore';
import { ratingPlaceQueryOf, ratingRouteOf } from '@/composables/raterRatingPlace';

definePageMeta({ layout: false });
useHead({ title: 'Mapping Survey: instructions' });

const raterStore = useRaterStore();
const route = useRoute();
const ratingRoute = computed(() => ratingRouteOf(ratingPlaceQueryOf({ routeQuery: route.query, itemCount: raterStore.progress ? raterStore.progress.itemCount : null })));

onMounted(async () => {
	if (!raterStore.isSignedIn) {
		raterStore.restoreSession();
	}
	// opened fresh (a reload, a pasted link) the store has no progress, so the item count the query is checked against
	// is read first; until then, and if it cannot be read, Back goes to /rater/rate
	if (raterStore.isSignedIn && !raterStore.progress && Object.keys(route.query).length > 0) {
		await raterStore.loadProgress();
	}
});
</script>

<template>
	<RaterShell :show-instructions-link="false" :show-rating-link="true" :rating-route="ratingRoute">
		<main class="rt-ins-main">
			<nav aria-label="On this page" class="rt-panel rt-ins-toc">
				<span class="rt-ins-toc-head">On this page</span>
				<ol>
					<li><a href="#how">How to rate</a></li>
					<li><a href="#answer">Your answer</a></li>
					<li><a href="#watch">Three things to watch</a></li>
				</ol>
				<NuxtLink :to="ratingRoute" class="rt-ins-back">Back to rating</NuxtLink>
			</nav>

			<article class="rt-panel rt-ins-article" data-testid="rater-instructions">
				<h1 id="how" class="rt-serif rt-ins-title">How to rate</h1>
				<p>You will see 50 elements from Ed-Fi, SIF and PESC, one at a time. Under each is a list of CEDS cards. A card is one CEDS property in one class. Choose the card that means the same thing as the element, in the same context.</p>

				<h2 id="answer" class="rt-ins-h2">Your answer</h2>
				<p>Often more than one card is very, very close to correct. To help identify those, the survey asks for the one card you think is the very best and, if there are any, the others that are just as right ('Same').</p>
				<p>Your choices:</p>
				<ul class="rt-ins-list">
					<li><b>Best:</b> the card that fits best. One per element.</li>
					<li><b>Same:</b> optional. Any other card that is just as right.</li>
					<li><b>No match in CEDS:</b> nothing in CEDS means the same thing. This is a real answer. Do not settle for the nearest card.</li>
					<li><b>Unsure:</b> you cannot decide. Say why in the note.</li>
				</ul>

				<h2 id="watch" class="rt-ins-h2">Three things to watch</h2>
				<p>You probably know this, but please keep in mind:</p>
				<ol class="rt-ins-list">
					<li><b>Meaning, not wording.</b> Ed-Fi <code>Staff.BirthDate</code> is CEDS Person Birth › Birthdate. The words differ and the person is a staff member, but the meaning is the same.</li>
					<li><b>The class matters.</b> CEDS often files one property under several classes. Those cards are grouped together. Choose the class that matches what owns the element in its own standard.</li>
					<li><b>The answer may not be in the list.</b> Use <b>Search all of CEDS</b> or <b>Browse CEDS</b> to find a card and add it.</li>
				</ol>

				<p>The order of the list means nothing. It is intentionally randomized.</p>

				<NuxtLink :to="ratingRoute" class="rt-ins-back">Back to rating</NuxtLink>
			</article>
		</main>
	</RaterShell>
</template>

<style scoped>
.rt-ins-main { max-width: 1100px; margin: 0 auto; padding: 28px clamp(16px, 3vw, 40px) 64px; box-sizing: border-box; display: flex; flex-wrap: wrap; gap: 20px; align-items: flex-start; }
.rt-ins-toc { flex: 1 1 220px; padding: 16px; display: flex; flex-direction: column; gap: 8px; font-size: 14px; position: sticky; top: 12px; }
.rt-ins-toc-head { font-weight: 700; color: #4B5563; text-transform: uppercase; font-size: 12px; letter-spacing: 0.05em; }
.rt-ins-toc ol { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 4px; }
.rt-ins-back { font-weight: 700; margin-top: 8px; display: inline-block; }
.rt-ins-article { flex: 999 1 560px; min-width: 0; padding: 28px 32px; font-size: 16px; line-height: 1.6; color: #1F2937; }
.rt-ins-title { margin: 0; font-size: 36px; color: #072A6C; }
.rt-ins-list { margin: 0 0 8px; padding-left: 24px; display: flex; flex-direction: column; gap: 6px; }
.rt-ins-h2 { font-size: 22px; font-weight: 700; margin: 24px 0 8px; color: #111827; }
.rt-ins-article code { font-family: ui-monospace, Menlo, monospace; font-size: 14px; background: #F3F5FA; padding: 0 4px; border-radius: 4px; }
</style>
