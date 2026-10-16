<script setup>
// RaterPreviewPanel — revision 8 (WORKORDER-RATER8): the Mapping Survey tab's preview of the REAL rating page, survey
// by survey and item by item, at /admin?tool=ceds-rater&view=preview&survey=S&item=N. It renders inside /admin so it
// keeps the main-site login (memory-only: a new browser tab would arrive signed out).
// The page is the raters' own (components/rater/RatingScreen.vue in its 'preview' mode): the same element panel, cards,
// answer controls and finder, read from /api/raterAdmin's preview actions. Read-only: Save is disabled and the screen
// sends no write call; the server would refuse an admin token on every rater write path anyway.
// Host: components/tools/ceds-rater-admin.vue (the admin guard). Reads `survey` and `item` from the URL and passes them
// on as given: a missing or wrong one is refused by the server by name and shown, never replaced. Emits 'back'.
import { computed } from 'vue';

const emit = defineEmits(['back']);
const route = useRoute();

const surveyName = computed(() => `${route.query.survey === undefined ? '' : route.query.survey}`);
const itemNumber = computed(() => Number(route.query.item));
</script>

<template>
	<div class="rt-preview" data-testid="rater-preview">
		<div class="rt-preview-top">
			<button type="button" class="rt-button-quiet" data-testid="rater-preview-back" @click="emit('back')">← Back to Mapping Survey</button>
			<p role="note" class="rt-preview-banner" data-testid="rater-preview-banner">
				<b>Preview: nothing is saved.</b> Survey {{ surveyName }}, item {{ route.query.item }}, as a rater sees it. The cards are in a fixed preview order; each rater gets their own shuffle.
			</p>
		</div>
		<RaterRatingScreen rating-mode-name="preview" :survey-name="surveyName" :item-number="itemNumber" />
	</div>
</template>

<style scoped>
.rt-preview { display: flex; flex-direction: column; gap: 8px; }
.rt-preview-top { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 16px; padding: 0 clamp(16px, 3vw, 40px); }
.rt-preview-banner { flex: 1 1 320px; margin: 0; background: #FFF6E8; border: 1px solid #E69B00; color: #5A3700; border-radius: 8px; padding: 8px 12px; font-size: 15px; line-height: 1.4; }
</style>
