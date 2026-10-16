<script setup>
// /rater/rate?item=N — the rater's rating page: the rating screen (components/rater/RatingScreen.vue, shared since
// revision 8 with the admin's preview) in the rater frame. The screen reads the rater's item N and saves the answers.
import { computed } from 'vue';

definePageMeta({ layout: false });
useHead({ title: 'Mapping Survey: rating' });

const route = useRoute();
const itemNumber = computed(() => Number(route.query.item) || 1);
</script>

<template>
	<RaterShell>
		<RaterRatingScreen rating-mode-name="rate" :item-number="itemNumber" />
	</RaterShell>
</template>
