<script setup>
// /rater/rate?item=N — the rating screen (design: Main, rounds 1–2; no Practice). The element on the left (sticky at
// >= 1100px); the candidate list (whole page scrolls; the Best / Same / Class → Property heads stick while the list is
// in view) and the finder on the right; the answer bar sticky at the bottom, one line, with the note that grows on
// focus and stays open for Unsure. Best is ONE radio group across every card plus No match and Unsure.
//
// The server judges every answer (rater-answer-rules.js); the checks here only explain the rules before the round trip.
import { ref, computed, watch, onMounted } from 'vue';
import { useRaterStore } from '@/stores/raterStore';

definePageMeta({ layout: false });
useHead({ title: 'CEDS Rater: rating' });

const raterStore = useRaterStore();
const route = useRoute();
const router = useRouter();
const finderRef = ref(null);

const NO_MATCH_CHOICE = 'noMatch';
const UNSURE_CHOICE = 'unsure';
const OTHER_ANSWER_LIST = Object.freeze([
	{ choiceName: NO_MATCH_CHOICE, title: 'No match in CEDS', description: 'Nothing in the list, or anywhere in CEDS, means the same thing. This is a real answer, and often the right one.' },
	{ choiceName: UNSURE_CHOICE, title: 'Unsure', description: 'You cannot decide, or cannot tell what the element means. Say why in the note; that is useful to us.' },
]);
const FAMILY_STYLE_BY_STANDARD = Object.freeze({
	'Ed-Fi': { ink: '#1E7A4C', tint: '#E6F4EC' },
	SIF: { ink: '#6B3FA0', tint: '#F1EBF8' },
	PESC: { ink: '#072A6C', tint: '#E7ECF6' },
});

const bestChoice = ref(null);
const sameTupleIdList = ref([]);
const noteText = ref('');
const addedCardList = ref([]);
const searchesTyped = ref([]);
const itemStartedAt = ref(Date.now());
const answerMessage = ref('');
const answerMessageKind = ref('');

const item = computed(() => raterStore.item);
const itemNumber = computed(() => Number(route.query.item) || 1);
const isLocked = computed(() => !!(raterStore.progress && raterStore.progress.finishedAt));
const familyStyle = computed(() => (item.value ? FAMILY_STYLE_BY_STANDARD[item.value.element.standard] || FAMILY_STYLE_BY_STANDARD.PESC : FAMILY_STYLE_BY_STANDARD.PESC));
const shownCardList = computed(() => (item.value ? addedCardList.value.map((card) => ({ card, isAdded: true })).concat(item.value.cardList.map((card) => ({ card, isAdded: false }))) : []));
const inListTupleIdList = computed(() => shownCardList.value.map((shownCard) => shownCard.card.cedsTupleId));
const cardByTupleId = computed(() => shownCardList.value.reduce((soFar, shownCard) => ({ ...soFar, [shownCard.card.cedsTupleId]: shownCard.card }), {}));
const bestIsCard = computed(() => bestChoice.value !== null && bestChoice.value !== NO_MATCH_CHOICE && bestChoice.value !== UNSURE_CHOICE);
const progressPercent = computed(() => (raterStore.progress ? Math.round((100 * raterStore.progress.savedCount) / raterStore.progress.itemCount) : 0));
const allSaved = computed(() => raterStore.progress && raterStore.progress.savedCount === raterStore.progress.itemCount);

const labelOf = (card) => `${card.className} → ${card.propertyName}${card.qualifierNameList.length ? ` (${card.qualifierNameList.join(', ')})` : ''}`;

const summaryText = computed(() => {
	if (bestChoice.value === NO_MATCH_CHOICE) {
		return 'No match in CEDS.';
	}
	if (bestChoice.value === UNSURE_CHOICE) {
		return noteText.value.trim() ? 'Unsure, with a note.' : 'Unsure. Write a note to say why.';
	}
	if (bestIsCard.value && cardByTupleId.value[bestChoice.value]) {
		const sameText = sameTupleIdList.value.length ? ` · Same: ${sameTupleIdList.value.map((cedsTupleId) => labelOf(cardByTupleId.value[cedsTupleId])).join('; ')}` : '';
		return `Best: ${labelOf(cardByTupleId.value[bestChoice.value])}${sameText}`;
	}
	return 'nothing chosen yet.';
});
const summaryColor = computed(() => (bestIsCard.value ? '#005E61' : bestChoice.value ? '#072A6C' : '#4B5563'));
const noteRequiredMissing = computed(() => bestChoice.value === UNSURE_CHOICE && !noteText.value.trim());

const resetAnswer = () => {
	const savedAnswer = item.value ? item.value.savedAnswer : null;
	bestChoice.value = savedAnswer ? (savedAnswer.answerKind === 'cards' ? savedAnswer.bestCedsTupleId : savedAnswer.answerKind) : null;
	sameTupleIdList.value = savedAnswer ? savedAnswer.sameCedsTupleIdList.slice() : [];
	noteText.value = savedAnswer ? savedAnswer.note || '' : '';
	addedCardList.value = savedAnswer ? savedAnswer.addedCardList.slice().reverse() : [];
	searchesTyped.value = [];
	itemStartedAt.value = Date.now();
	answerMessage.value = '';
	answerMessageKind.value = '';
};

const loadCurrentItem = async () => {
	if (!raterStore.isSignedIn && !raterStore.restoreSession()) {
		router.push('/rater');
		return;
	}
	if (raterStore.isAdmin) {
		router.push('/rater/admin');
		return;
	}
	const itemRead = await raterStore.loadItem(itemNumber.value);
	if (!itemRead && !raterStore.isSignedIn) {
		router.push('/rater');
		return;
	}
	resetAnswer();
	window.scrollTo({ top: 0 });
};

const pickBest = (choiceName) => {
	bestChoice.value = choiceName;
	answerMessage.value = '';
	if (choiceName === NO_MATCH_CHOICE || choiceName === UNSURE_CHOICE) {
		sameTupleIdList.value = [];
		return;
	}
	sameTupleIdList.value = sameTupleIdList.value.filter((cedsTupleId) => cedsTupleId !== choiceName);
};

const toggleSame = (card, isTicked) => {
	answerMessage.value = '';
	const otherTupleIdList = sameTupleIdList.value.filter((cedsTupleId) => cedsTupleId !== card.cedsTupleId);
	sameTupleIdList.value = isTicked && bestIsCard.value && bestChoice.value !== card.cedsTupleId ? otherTupleIdList.concat([card.cedsTupleId]) : otherTupleIdList;
};

const addCard = (card, foundBy) => {
	if (inListTupleIdList.value.includes(card.cedsTupleId)) {
		return;
	}
	addedCardList.value = [{ ...card, foundBy }].concat(addedCardList.value);
};

const rememberSearch = (searchText) => {
	searchesTyped.value = searchesTyped.value.concat([searchText]);
};

const browseClassOfCard = (card) => {
	if (finderRef.value) {
		finderRef.value.openClassFromCard(card);
	}
};

// the same three rules the server applies, said before the round trip
const localRefusalText = () => {
	if (!bestChoice.value && sameTupleIdList.value.length) {
		return 'You ticked Same, but no card is Best yet. Choose one card as Best.';
	}
	if (!bestChoice.value) {
		return 'Choose a Best card, No match in CEDS, or Unsure before you save.';
	}
	if (noteRequiredMissing.value) {
		return 'Unsure needs a note. Say what is making it hard to decide.';
	}
	return '';
};

const nextRoute = (progress) => {
	if (progress.nextUnratedItemNumber === null) {
		return itemNumber.value < progress.itemCount ? { path: '/rater/rate', query: { item: itemNumber.value + 1 } } : { path: '/rater/done' };
	}
	return { path: '/rater/rate', query: { item: itemNumber.value < progress.itemCount ? itemNumber.value + 1 : progress.nextUnratedItemNumber } };
};

const saveAndNext = async () => {
	const refusalText = localRefusalText();
	if (refusalText) {
		answerMessage.value = refusalText;
		answerMessageKind.value = 'error';
		return;
	}
	const answerSubmission = {
		elementStableId: item.value.element.elementStableId,
		answerKind: bestIsCard.value ? 'cards' : bestChoice.value,
		bestCedsTupleId: bestIsCard.value ? bestChoice.value : null,
		sameCedsTupleIdList: bestIsCard.value ? sameTupleIdList.value : [],
		addedCardList: addedCardList.value.slice().reverse().map((card) => ({ cedsTupleId: card.cedsTupleId, foundBy: card.foundBy })),
		note: noteText.value,
		searchesTyped: searchesTyped.value,
		secondsOnItem: Math.round((Date.now() - itemStartedAt.value) / 1000),
	};
	const saved = await raterStore.saveAnswer(answerSubmission);
	if (!saved) {
		answerMessage.value = raterStore.statusMsg;
		answerMessageKind.value = 'error';
		return;
	}
	router.push(nextRoute(raterStore.progress));
};

const goPrevious = () => {
	if (itemNumber.value > 1) {
		router.push({ path: '/rater/rate', query: { item: itemNumber.value - 1 } });
	}
};

watch(() => route.query.item, loadCurrentItem);
onMounted(loadCurrentItem);
</script>

<template>
	<RaterShell>
		<main class="rt-main">
			<h1 class="rt-sr">Find the CEDS match</h1>

			<div v-if="!item && raterStore.statusMsg" role="alert" class="rt-alert-error">{{ raterStore.statusMsg }}</div>

			<template v-if="item">
				<div class="rt-panel rt-toolbar">
					<nav aria-label="Breadcrumb">
						<ol class="rt-crumbs">
							<li><span class="rt-crumb-survey"><span aria-hidden="true" class="rt-dot" style="background: #072A6C"></span>Survey {{ item.surveyName }}</span></li>
							<li aria-hidden="true" class="rt-crumb-sep">›</li>
							<li><span aria-current="page" class="rt-crumb-item" :style="{ background: familyStyle.tint, color: familyStyle.ink }" data-testid="rater-item-crumb"><span aria-hidden="true" class="rt-dot" :style="{ background: familyStyle.ink }"></span>Item {{ item.itemNumber }} of {{ item.itemCount }}</span></li>
						</ol>
					</nav>
					<span aria-hidden="true" class="rt-progress"><span class="rt-progress-fill" :style="{ width: `${progressPercent}%` }"></span></span>
					<span class="rt-progress-text" data-testid="rater-progress-text">{{ raterStore.progress.savedCount }} saved, {{ raterStore.progress.itemCount - raterStore.progress.savedCount }} to go</span>
					<NuxtLink v-if="allSaved && !isLocked" to="/rater/done" class="rt-done-link">All {{ raterStore.progress.itemCount }} saved: review or finish →</NuxtLink>
					<span v-if="isLocked" class="rt-locked-chip">Finished and sent: your answers are locked</span>
				</div>

				<div class="rt-columns">
					<RaterElementPanel :element="item.element" />

					<div class="rt-right">
						<section id="candidates" aria-labelledby="candHead" class="rt-panel rt-candidates">
							<div class="rt-cand-head">
								<div class="rt-cand-head-top">
									<h2 id="candHead" class="rt-cand-title">CEDS candidates</h2>
									<span class="rt-cand-shuffled">Shuffled on purpose; the order means nothing. {{ shownCardList.length }} cards.</span>
								</div>
								<div aria-hidden="true" class="rt-cand-columns" data-testid="rater-column-heads">
									<span class="rt-center">Best</span>
									<span class="rt-center">Same</span>
									<span class="rt-cand-columns-card">Class → Property</span>
								</div>
							</div>

							<div role="radiogroup" aria-label="Best match" class="rt-cand-list" data-testid="rater-candidate-list">
								<RaterCandidateRow
									v-for="shownCard in shownCardList"
									:key="shownCard.card.cedsTupleId"
									:card="shownCard.card"
									:is-added="shownCard.isAdded"
									:is-best="bestChoice === shownCard.card.cedsTupleId"
									:is-same="sameTupleIdList.includes(shownCard.card.cedsTupleId)"
									:same-disabled="!bestIsCard || bestChoice === shownCard.card.cedsTupleId"
									:read-only="isLocked"
									@pick-best="pickBest(shownCard.card.cedsTupleId)"
									@toggle-same="toggleSame"
									@browse-class="browseClassOfCard"
								/>

								<div class="rt-other-divider">
									<span></span><span></span>
									<span class="rt-other-divider-text">Or answer without a card</span>
								</div>

								<div v-for="otherAnswer in OTHER_ANSWER_LIST" :key="otherAnswer.choiceName" class="rt-other-row" :data-testid="`rater-other-${otherAnswer.choiceName}`">
									<label class="rt-other-control">
										<input type="radio" name="best" :aria-label="otherAnswer.title" :checked="bestChoice === otherAnswer.choiceName" :disabled="isLocked" :data-testid="`rater-choice-${otherAnswer.choiceName}`" @change="pickBest(otherAnswer.choiceName)" />
									</label>
									<span></span>
									<div class="rt-other-card" :class="{ 'rt-other-card-on': bestChoice === otherAnswer.choiceName }">
										<div class="rt-other-title-line">
											<span class="rt-other-title">{{ otherAnswer.title }}</span>
											<span v-if="bestChoice === otherAnswer.choiceName" class="rt-chip rt-chip-answer">Your answer</span>
										</div>
										<p class="rt-other-description">{{ otherAnswer.description }}</p>
									</div>
								</div>
							</div>
						</section>

						<RaterFinder :key="item.element.elementStableId" ref="finderRef" :element-stable-id="item.element.elementStableId" :in-list-tuple-id-list="inListTupleIdList" @add-card="addCard" @searched="rememberSearch" />
					</div>
				</div>

				<section aria-label="Your answer" class="rt-answer-bar" data-testid="rater-answer-bar">
					<div class="rt-answer-line">
						<p class="rt-answer-summary" :title="summaryText" data-testid="rater-answer-summary"><b>Your answer:</b> <span :style="{ color: summaryColor, fontWeight: 600 }">{{ summaryText }}</span></p>
						<label class="rt-note-label">
							<span class="rt-sr">{{ bestChoice === 'unsure' ? 'Note (required for Unsure)' : 'Note (optional)' }}</span>
							<textarea v-model="noteText" class="rt-note" :class="{ 'rt-note-open': bestChoice === 'unsure', 'rt-note-missing': noteRequiredMissing }" :placeholder="bestChoice === 'unsure' ? 'Note (required for Unsure)…' : 'Note (optional): anything we should know about this one…'" :disabled="isLocked" data-testid="rater-note"></textarea>
						</label>
						<div class="rt-answer-buttons">
							<button type="button" class="rt-button-quiet" :disabled="itemNumber <= 1" data-testid="rater-previous" @click="goPrevious">← Previous</button>
							<button type="button" class="rt-button" :disabled="raterStore.saving || isLocked" data-testid="rater-save" @click="saveAndNext">{{ raterStore.saving ? 'Saving…' : 'Save and next' }}</button>
						</div>
					</div>
					<p v-if="answerMessage" role="alert" class="rt-answer-message" :class="answerMessageKind === 'error' ? 'rt-answer-message-error' : 'rt-answer-message-ok'" data-testid="rater-answer-message">{{ answerMessage }}</p>
				</section>
			</template>
		</main>
	</RaterShell>
</template>

<style scoped>
.rt-main { max-width: 1600px; margin: 0 auto; padding: 12px clamp(16px, 3vw, 40px) 0; box-sizing: border-box; }
.rt-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 20px; border-radius: 10px; padding: 6px 12px; margin-bottom: 12px; }
.rt-crumbs { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; align-items: center; gap: 4px; font-size: 14px; }
.rt-crumb-survey { display: inline-flex; align-items: center; gap: 6px; min-height: 32px; padding: 0 8px; color: #374151; }
.rt-crumb-sep { color: #9CA3AF; }
.rt-crumb-item { display: inline-flex; align-items: center; gap: 6px; min-height: 32px; padding: 0 10px; border-radius: 8px; font-weight: 700; }
.rt-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
.rt-progress { position: relative; display: inline-block; width: 200px; height: 10px; background: #E3E7EF; border-radius: 5px; overflow: hidden; }
.rt-progress-fill { position: absolute; left: 0; top: 0; bottom: 0; background: #072A6C; }
.rt-progress-text { font-size: 14px; color: #4B5563; }
.rt-done-link { font-size: 14px; font-weight: 700; }
.rt-locked-chip { border-radius: 999px; padding: 2px 10px; font-size: 13px; font-weight: 700; background: #E7ECF6; color: #072A6C; }
.rt-columns { display: flex; flex-wrap: wrap; gap: 16px; align-items: flex-start; }
.rt-right { flex: 999 1 640px; min-width: 0; display: flex; flex-direction: column; gap: 16px; }
.rt-candidates { padding: 0 16px 16px; }
.rt-cand-head { position: sticky; top: 0; z-index: 3; background: #FFFFFF; border-radius: 12px 12px 0 0; padding-top: 12px; }
.rt-cand-head-top { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 2px 16px; }
.rt-cand-title { margin: 0; font-size: 19px; font-weight: 700; color: #111827; }
.rt-cand-shuffled { font-size: 14px; color: #4B5563; }
.rt-cand-columns { display: grid; grid-template-columns: 56px 56px minmax(0, 1fr); margin-top: 6px; border-bottom: 1px solid #E3E7EF; padding-bottom: 6px; font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #4B5563; }
.rt-center { text-align: center; }
.rt-cand-columns-card { padding-left: 4px; }
.rt-cand-list { display: flex; flex-direction: column; gap: 8px; padding-top: 10px; }
.rt-other-divider { display: grid; grid-template-columns: 56px 56px minmax(0, 1fr); margin-top: 8px; padding-top: 10px; border-top: 1px solid #E3E7EF; }
.rt-other-divider-text { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #4B5563; }
.rt-other-row { display: grid; grid-template-columns: 56px 56px minmax(0, 1fr); align-items: stretch; }
.rt-other-control { display: flex; justify-content: center; align-items: flex-start; padding-top: 14px; cursor: pointer; }
.rt-other-card { border-radius: 10px; padding: 9px 14px; box-sizing: border-box; background: #FFFFFF; border: 2px solid #C9D3E8; }
.rt-other-card-on { background: #E7ECF6; border: 2px solid #072A6C; }
.rt-other-title-line { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 10px; }
.rt-other-title { font-size: 17px; font-weight: 700; color: #072A6C; }
.rt-chip-answer { background: #072A6C; color: #FFFFFF; }
.rt-other-description { margin: 4px 0 0; font-size: 15px; line-height: 1.45; color: #1F2937; }
.rt-answer-bar { position: sticky; bottom: 0; z-index: 5; margin-top: 16px; background: #FFFFFF; border: 1px solid #C9D3E8; border-bottom: 0; border-radius: 12px 12px 0 0; box-shadow: 0 -6px 18px rgba(7, 42, 108, 0.1); padding: 10px 16px; box-sizing: border-box; }
.rt-answer-line { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 16px; }
.rt-answer-summary { flex: 1 1 260px; min-width: 0; margin: 0; font-size: 15px; line-height: 1.35; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.rt-note-label { flex: 2 1 280px; min-width: 0; display: block; }
.rt-note { display: block; box-sizing: border-box; width: 100%; height: 44px; padding: 10px 12px; border-radius: 8px; font: inherit; font-size: 15px; line-height: 1.4; color: #111827; background: #FFFFFF; resize: none; border: 1px solid #C9D3E8; transition: height 0.15s ease; }
.rt-note:focus, .rt-note-open { height: 96px; }
.rt-note-missing { border: 2px solid #9B1C1C; }
.rt-answer-buttons { display: flex; gap: 8px; flex-wrap: wrap; }
.rt-answer-message { margin: 6px 0 0; font-size: 15px; font-weight: 600; }
.rt-answer-message-error { color: #9B1C1C; }
.rt-answer-message-ok { color: #005E61; }
</style>
