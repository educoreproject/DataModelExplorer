<script setup>
// /rater/rate?item=N — the rater's rating page: the rating screen (components/rater/RatingScreen.vue, shared since
// revision 8 with the admin's preview) in the rater frame. The screen reads the rater's item N and saves the answers.
// Revision 14: /rater/rate?item=N&set=undone&items=3-7-12 opens item N in "left undone" mode, where Previous / Next /
// Save and next walk only the items that were on the Done page's list (items, in item order). No set means 1..50; a
// set or items this page does not know is refused by name, never read as 1..50.
import { computed } from 'vue';

definePageMeta({ layout: false });
useHead({ title: 'Mapping Survey: rating' });

const UNDONE_SET_NAME = 'undone';
const ITEM_NUMBER_LIST_PATTERN = /^[1-9][0-9]*(-[1-9][0-9]*)*$/;

const route = useRoute();
const itemNumber = computed(() => Number(route.query.item) || 1);

// { undoneSetItemNumberList, refusalText }: the list is null outside the mode
const itemSetReading = computed(() => {
	const { set: setName, items: itemNumberText } = route.query;
	if (setName === undefined && itemNumberText === undefined) {
		return { undoneSetItemNumberList: null, refusalText: '' };
	}
	if (setName !== UNDONE_SET_NAME || typeof itemNumberText !== 'string' || !ITEM_NUMBER_LIST_PATTERN.test(itemNumberText)) {
		return { undoneSetItemNumberList: null, refusalText: `This link names an item set this page does not know (set=${JSON.stringify(setName)}, items=${JSON.stringify(itemNumberText)}). Open the list again from the Done page.` };
	}
	const undoneSetItemNumberList = Array.from(new Set(itemNumberText.split('-').map(Number))).sort((numberA, numberB) => numberA - numberB);
	return { undoneSetItemNumberList, refusalText: '' };
});
</script>

<template>
	<RaterShell>
		<main v-if="itemSetReading.refusalText" class="rt-set-refused">
			<p role="alert" class="rt-alert-error" data-testid="rater-set-refused">{{ itemSetReading.refusalText }}</p>
			<NuxtLink to="/rater/done" class="rt-button-quiet">Go to the Done page</NuxtLink>
		</main>
		<RaterRatingScreen v-else rating-mode-name="rate" :item-number="itemNumber" :undone-set-item-number-list="itemSetReading.undoneSetItemNumberList" />
	</RaterShell>
</template>

<style scoped>
.rt-set-refused { max-width: 760px; margin: 0 auto; padding: 56px clamp(16px, 3vw, 40px); display: flex; flex-direction: column; gap: 16px; align-items: flex-start; }
</style>
