<script setup>
// RaterRatingScreen — the rating screen (design: Main, rounds 1–2; no Practice), ONE copy for two hosts (revision 8):
// /rater/rate?item=N (ratingModeName 'rate': the rater's own item, saved) and the admin's preview inside the Mapping
// Survey tab (ratingModeName 'preview': a survey's item N, read-only). What differs between them is data,
// RATING_MODE_BY_NAME below: how the item is read, where Previous / Next go, which calls search and browse, and whether
// Save exists. The host supplies the frame (RaterShell, or the preview banner) and the item number. The element on the left (sticky at
// >= 1100px); the candidate list (whole page scrolls; the Best / Same / Class → Property heads stick while the list is
// in view) and the finder on the right; the answer bar sticky at the bottom, one line, with the note that grows on
// focus and stays open for Unsure. Best is ONE radio group across every card plus No match and Unsure.
// Revision 10: the finder lives in a drawer from the right (RaterFinderDrawer), over the list and never over the
// element. It opens from the two buttons above the element (the left column is what sticks, so they stay on screen),
// from a card's class name (Browse at that class), and from the quiet line at the foot of the list (Search).
// Revision 12: the server gathers each list's cards by CEDS property (card-property-identity.js; the rater's shuffle
// still places each group). This screen only draws it: each run of two or more suggested cards with the same property
// identity gets a quiet frame and a lead line ("Number of Credits Earned, in 7 classes"). Cards the rater adds stay at
// the top, ungrouped.
// Revision 15: inside a frame each card's Property line, the same on every card of the group, is gray (TQ: both lines
// on every card, the repeated one gray). The lead is unchanged. Singletons and added cards are full colour.
// Revision 14: the toolbar says "12 answered out of 50". Save and next on the last item goes to /rater/done, which lists
// what is left undone. An item opened from that list is in "left undone" mode (undoneSetItemNumberList, from the URL;
// 'rate' only): Previous and Next walk only that set, Save and next goes to the next one still unanswered, then back to
// the list, and a "Back to the list (N left)" link shows.
//
// Revision 18: the element panel's How to rate carries the rater's place (item, and the left-undone set) to the
// instructions page, whose "Back to rating" returns to it (composables/raterRatingPlace.js). The preview's does not:
// its place is in the admin page, which the instructions page does not link back to.
//
// The server judges every answer (rater-answer-rules.js); the checks here only explain the rules before the round trip.
import { ref, computed, watch, onMounted } from 'vue';
import { useRaterStore } from '@/stores/raterStore';
import { ratingPlaceQueryFrom, instructionsRouteOf } from '@/composables/raterRatingPlace';

// surveyName: the preview's survey (the rater's own survey comes from their account; 'rate' ignores it)
// undoneSetItemNumberList: the items of the left-undone list, ascending, in "left undone" mode; null (or absent) otherwise
const props = defineProps({
	ratingModeName: { type: String, required: true },
	itemNumber: { type: Number, required: true },
	surveyName: { type: String, required: false },
	undoneSetItemNumberList: { type: Array, required: false, default: null },
});

// how each host reads, moves and searches. canSave false means no write call can leave this screen.
const RATING_MODE_BY_NAME = Object.freeze({
	rate: {
		canSave: true,
		loadItem: async ({ raterStore, router, itemNumber }) => {
			if (!raterStore.isSignedIn && !raterStore.restoreSession()) {
				router.push('/rater');
				return false;
			}
			if (raterStore.isAdmin) {
				router.push({ path: '/admin', query: { tool: 'ceds-rater' } });
				return false;
			}
			const itemRead = await raterStore.loadItem(itemNumber);
			if (!itemRead && !raterStore.isSignedIn) {
				router.push('/rater');
				return false;
			}
			return true;
		},
		itemRouteOf: ({ itemNumber }) => ({ path: '/rater/rate', query: { item: itemNumber } }),
		undoneItemRouteOf: ({ itemNumber, undoneSetItemNumberList }) => ({ path: '/rater/rate', query: { item: itemNumber, set: 'undone', items: undoneSetItemNumberList.join('-') } }),
		instructionsRouteOf: ({ itemNumber, undoneSetItemNumberList }) => instructionsRouteOf(ratingPlaceQueryFrom({ itemNumber, undoneSetItemNumberList })),
		search: ({ raterStore, searchRequest }) => raterStore.search(searchRequest),
		browse: ({ raterStore, browseRequest }) => raterStore.browse(browseRequest),
	},
	// revision 8: the admin's preview inside /admin?tool=ceds-rater&view=preview&survey=S&item=N (the main login signs
	// every call; the host is the admin guard). The answer controls work on the page; nothing is sent to be saved.
	preview: {
		canSave: false,
		loadItem: ({ raterStore, surveyName, itemNumber }) => raterStore.adminPreviewItem({ surveyName, itemNumber }),
		itemRouteOf: ({ route, itemNumber }) => ({ query: { ...route.query, item: itemNumber } }),
		undoneItemRouteOf: null,
		instructionsRouteOf: () => instructionsRouteOf(null),
		search: ({ raterStore, searchRequest, surveyName }) => raterStore.adminPreviewSearch({ surveyName, ...searchRequest }),
		browse: ({ raterStore, browseRequest }) => raterStore.adminPreviewBrowse(browseRequest),
	},
});

const raterStore = useRaterStore();
const route = useRoute();
const router = useRouter();
const finderRef = ref(null);
const finderIsOpen = ref(false);
const finderFocusSelector = ref('');
const ratingMode = RATING_MODE_BY_NAME[props.ratingModeName];
if (!ratingMode) {
	throw new Error(`RaterRatingScreen: no rating mode '${props.ratingModeName}' (known: ${Object.keys(RATING_MODE_BY_NAME).join(', ')})`);
}
// a computed, not a constant: the page keeps this screen when the URL moves into or out of the mode
const isUndoneMode = computed(() => {
	if (props.undoneSetItemNumberList !== null && !ratingMode.undoneItemRouteOf) {
		throw new Error(`RaterRatingScreen: rating mode '${props.ratingModeName}' has no "left undone" mode`);
	}
	return props.undoneSetItemNumberList !== null;
});
// where the element panel's How to rate goes, carrying this place in 'rate'
const howToRateRoute = computed(() => ratingMode.instructionsRouteOf({ itemNumber: props.itemNumber, undoneSetItemNumberList: isUndoneMode.value ? props.undoneSetItemNumberList : null }));
// what the finder calls to search and browse, in this mode
const cardSource = Object.freeze({
	search: (searchRequest) => ratingMode.search({ raterStore, searchRequest, surveyName: props.surveyName }),
	browse: (browseRequest) => ratingMode.browse({ raterStore, browseRequest }),
});

// how the finder drawer opens on each tab: what the finder is told, and what takes focus
const FINDER_OPENING_BY_TAB_NAME = Object.freeze({
	search: { showTab: (finder) => finder.showSearch(), focusSelector: '[data-testid="rater-search-input"]' },
	browse: { showTab: (finder) => finder.showBrowse(), focusSelector: '[data-testid="rater-tab-browse"]' },
});

const NO_MATCH_CHOICE = 'noMatch';
const UNSURE_CHOICE = 'unsure';
const OTHER_ANSWER_LIST = Object.freeze([
	{ choiceName: NO_MATCH_CHOICE, title: 'No match in CEDS', description: 'Nothing in the list, or anywhere in CEDS, means the same thing. This is a real answer.' },
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
const itemNumber = computed(() => props.itemNumber);
const isLocked = computed(() => !!(raterStore.progress && raterStore.progress.finishedAt));
const familyStyle = computed(() => (item.value ? FAMILY_STYLE_BY_STANDARD[item.value.element.standard] || FAMILY_STYLE_BY_STANDARD.PESC : FAMILY_STYLE_BY_STANDARD.PESC));
const shownCardList = computed(() => (item.value ? addedCardList.value.map((card) => ({ card, isAdded: true })).concat(item.value.cardList.map((card) => ({ card, isAdded: false }))) : []));
const inListTupleIdList = computed(() => shownCardList.value.map((shownCard) => shownCard.card.cedsTupleId));
// the server's propertyIdentityOf, read here only to find the runs it made: P-id plus qualifiers, the class ignored
const propertyIdentityOf = (card) => [card.cedsId].concat(card.qualifierNameList.slice().sort()).join('|');
// one candidate row's props: an added card (top of the list) or a suggested one, in a property group's frame or not
const rowPropsOf = (card, isAdded, isInPropertyGroup) => ({
	card,
	isAdded,
	isInPropertyGroup,
	isBest: bestChoice.value === card.cedsTupleId,
	isSame: sameTupleIdList.value.includes(card.cedsTupleId),
	sameDisabled: !bestIsCard.value || bestChoice.value === card.cedsTupleId,
	readOnly: isLocked.value,
});
// the suggested cards as runs of one property, in the server's order: [{ cardList, leadText }] (leadText for runs of 2+)
const suggestedCardGroupList = computed(() => {
	if (!item.value) {
		return [];
	}
	const cardGroupList = item.value.cardList.reduce((soFar, card) => {
		const lastGroup = soFar[soFar.length - 1];
		if (lastGroup && lastGroup.propertyIdentity === propertyIdentityOf(card)) {
			lastGroup.cardList.push(card);
			return soFar;
		}
		return soFar.concat([{ propertyIdentity: propertyIdentityOf(card), cardList: [card] }]);
	}, []);
	return cardGroupList.map((cardGroup) => ({ ...cardGroup, leadText: cardGroup.cardList.length > 1 ? `${propertyLabelOf(cardGroup.cardList[0])}, in ${cardGroup.cardList.length} classes` : '' }));
});
const cardByTupleId = computed(() => shownCardList.value.reduce((soFar, shownCard) => ({ ...soFar, [shownCard.card.cedsTupleId]: shownCard.card }), {}));
const bestIsCard = computed(() => bestChoice.value !== null && bestChoice.value !== NO_MATCH_CHOICE && bestChoice.value !== UNSURE_CHOICE);
const progressPercent = computed(() => (raterStore.progress ? Math.round((100 * raterStore.progress.savedCount) / raterStore.progress.itemCount) : 0));
const allSaved = computed(() => raterStore.progress && raterStore.progress.savedCount === raterStore.progress.itemCount);
const unsavedCount = computed(() => (raterStore.progress ? raterStore.progress.itemCount - raterStore.progress.savedCount : 0));

const propertyLabelOf = (card) => `${card.propertyName}${card.qualifierNameList.length ? ` (${card.qualifierNameList.join(', ')})` : ''}`;
const labelOf = (card) => `${card.className} → ${propertyLabelOf(card)}`;

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
	const itemShown = await ratingMode.loadItem({ raterStore, router, surveyName: props.surveyName, itemNumber: itemNumber.value });
	if (!itemShown) {
		return;
	}
	finderIsOpen.value = false;
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

const openFinderOn = (tabName) => {
	const finderOpening = FINDER_OPENING_BY_TAB_NAME[tabName];
	if (!finderOpening) {
		throw new Error(`RaterRatingScreen: no finder tab '${tabName}' (known: ${Object.keys(FINDER_OPENING_BY_TAB_NAME).join(', ')})`);
	}
	finderOpening.showTab(finderRef.value);
	finderFocusSelector.value = finderOpening.focusSelector;
	finderIsOpen.value = true;
};

const browseClassOfCard = (card) => {
	finderRef.value.openClassFromCard(card);
	finderFocusSelector.value = FINDER_OPENING_BY_TAB_NAME.browse.focusSelector;
	finderIsOpen.value = true;
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

// where Previous / Next / Save and next go: 1..N, or, in "left undone" mode, the set (Done is the list, or Finish)
const routeToItem = (targetItemNumber) => (isUndoneMode.value ? ratingMode.undoneItemRouteOf({ itemNumber: targetItemNumber, undoneSetItemNumberList: props.undoneSetItemNumberList }) : ratingMode.itemRouteOf({ route, itemNumber: targetItemNumber }));
const previousItemNumber = computed(() => (isUndoneMode.value ? props.undoneSetItemNumberList.filter((setItemNumber) => setItemNumber < itemNumber.value).pop() || null : itemNumber.value > 1 ? itemNumber.value - 1 : null));
const nextSetItemNumber = computed(() => (isUndoneMode.value ? props.undoneSetItemNumberList.find((setItemNumber) => setItemNumber > itemNumber.value) || null : null));

const nextRoute = (progress) => {
	if (!isUndoneMode.value) {
		return itemNumber.value < progress.itemCount ? routeToItem(itemNumber.value + 1) : { path: '/rater/done' };
	}
	// the next one on the list still unanswered: after this item first, then from the top of the list
	const stillUndoneList = props.undoneSetItemNumberList.filter((setItemNumber) => setItemNumber !== itemNumber.value && !progress.savedItemNumberList.includes(setItemNumber));
	const nextUndoneItemNumber = stillUndoneList.find((setItemNumber) => setItemNumber > itemNumber.value) || stillUndoneList[0];
	return nextUndoneItemNumber ? routeToItem(nextUndoneItemNumber) : { path: '/rater/done' };
};

const saveAndNext = async () => {
	if (!ratingMode.canSave) {
		return;
	}
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

// the preview walks the survey without saving (Save is disabled there)
const goNext = () => {
	if (item.value && itemNumber.value < item.value.itemCount) {
		router.push(ratingMode.itemRouteOf({ route, itemNumber: itemNumber.value + 1 }));
	}
};

// "left undone" mode: Next moves on through the set without saving
const goNextInSet = () => {
	if (nextSetItemNumber.value) {
		router.push(routeToItem(nextSetItemNumber.value));
	}
};

const goPrevious = () => {
	if (previousItemNumber.value) {
		router.push(routeToItem(previousItemNumber.value));
	}
};

watch(() => [props.itemNumber, props.surveyName], loadCurrentItem);
onMounted(loadCurrentItem);
</script>

<template>
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
					<span class="rt-progress-text" data-testid="rater-progress-text">{{ raterStore.progress.savedCount }} answered out of {{ raterStore.progress.itemCount }}</span>
					<NuxtLink v-if="isUndoneMode" to="/rater/done" class="rt-done-link" data-testid="rater-back-to-list">Back to the list ({{ unsavedCount }} left)</NuxtLink>
					<NuxtLink v-if="ratingMode.canSave && allSaved && !isLocked" to="/rater/done" class="rt-done-link">All {{ raterStore.progress.itemCount }} saved: review or finish →</NuxtLink>
					<span v-if="isLocked" class="rt-locked-chip">Finished and sent: your answers are locked</span>
				</div>

				<div class="rt-columns">
					<div class="rt-stick rt-left" data-testid="rater-left-column">
						<div role="group" aria-label="Look further in CEDS" class="rt-finder-openers" data-testid="rater-finder-openers">
							<button type="button" class="rt-button-quiet rt-opener" aria-haspopup="dialog" :aria-expanded="finderIsOpen" data-testid="rater-open-search" @click="openFinderOn('search')">Search all of CEDS</button>
							<button type="button" class="rt-button-quiet rt-opener" aria-haspopup="dialog" :aria-expanded="finderIsOpen" data-testid="rater-open-browse" @click="openFinderOn('browse')">Browse CEDS</button>
						</div>
						<RaterElementPanel :element="item.element" :how-to-rate-route="howToRateRoute" class="rt-left-panel" />
					</div>

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
									v-for="addedCard in addedCardList"
									:key="addedCard.cedsTupleId"
									v-bind="rowPropsOf(addedCard, true, false)"
									@pick-best="pickBest(addedCard.cedsTupleId)"
									@toggle-same="toggleSame"
									@browse-class="browseClassOfCard"
								/>
								<template v-for="cardGroup in suggestedCardGroupList" :key="cardGroup.propertyIdentity">
									<div v-if="cardGroup.leadText" role="group" :aria-label="cardGroup.leadText" class="rt-prop-group" data-testid="rater-property-group" :data-member-count="cardGroup.cardList.length">
										<p class="rt-prop-group-lead" data-testid="rater-property-group-lead">{{ cardGroup.leadText }}</p>
										<RaterCandidateRow
											v-for="card in cardGroup.cardList"
											:key="card.cedsTupleId"
											v-bind="rowPropsOf(card, false, true)"
											@pick-best="pickBest(card.cedsTupleId)"
											@toggle-same="toggleSame"
											@browse-class="browseClassOfCard"
										/>
									</div>
									<RaterCandidateRow
										v-else
										v-bind="rowPropsOf(cardGroup.cardList[0], false, false)"
										@pick-best="pickBest(cardGroup.cardList[0].cedsTupleId)"
										@toggle-same="toggleSame"
										@browse-class="browseClassOfCard"
									/>
								</template>

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
							<p class="rt-cand-foot">None of these fit? <button type="button" class="rt-cand-foot-link" aria-haspopup="dialog" data-testid="rater-open-search-foot" @click="openFinderOn('search')">Search all of CEDS</button></p>
						</section>

						<RaterFinderDrawer :is-open="finderIsOpen" :focus-selector="finderFocusSelector" keep-visible-selector="[data-testid='rater-left-column']" labelled-by-id="findHead" @close="finderIsOpen = false">
							<RaterFinder :key="item.element.elementStableId" ref="finderRef" :card-source="cardSource" :element-stable-id="item.element.elementStableId" :in-list-tuple-id-list="inListTupleIdList" @add-card="addCard" @searched="rememberSearch" />
						</RaterFinderDrawer>
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
							<button type="button" class="rt-button-quiet" :disabled="!previousItemNumber" data-testid="rater-previous" @click="goPrevious">← Previous</button>
							<button v-if="isUndoneMode" type="button" class="rt-button-quiet" :disabled="!nextSetItemNumber" data-testid="rater-next-in-set" @click="goNextInSet">Next →</button>
							<button v-if="!ratingMode.canSave" type="button" class="rt-button-quiet" :disabled="!item || itemNumber >= item.itemCount" data-testid="rater-preview-next" @click="goNext">Next →</button>
							<button type="button" class="rt-button" :disabled="!ratingMode.canSave || raterStore.saving || isLocked" :title="ratingMode.canSave ? '' : 'Preview: nothing is saved'" data-testid="rater-save" @click="saveAndNext">{{ raterStore.saving ? 'Saving…' : 'Save and next' }}</button>
						</div>
					</div>
					<p v-if="answerMessage" role="alert" class="rt-answer-message" :class="answerMessageKind === 'error' ? 'rt-answer-message-error' : 'rt-answer-message-ok'" data-testid="rater-answer-message">{{ answerMessage }}</p>
				</section>
			</template>
		</main>
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
.rt-left { flex: 1 1 300px; min-width: 0; align-self: flex-start; display: flex; flex-direction: column; gap: 8px; }
/* the column sticks (rt-stick) only if it is shorter than the space above the answer bar; a tall element scrolls
   inside its own panel so the buttons above it never leave the screen (revision 10) */
@media (min-width: 1100px) {
	.rt-left { max-height: calc(100vh - 150px); }
	.rt-left-panel { flex: 0 1 auto; min-height: 0; overflow-y: auto; }
}
.rt-finder-openers { flex: 0 0 auto; display: flex; flex-wrap: wrap; gap: 8px; }
.rt-opener { flex: 1 1 auto; }
.rt-cand-foot { margin: 14px 0 0; font-size: 15px; color: #4B5563; }
.rt-cand-foot-link { border: 0; background: transparent; padding: 0; min-height: 32px; font: inherit; font-weight: 700; color: #072A6C; text-decoration: underline; text-underline-offset: 3px; cursor: pointer; }
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
/* revision 12: a property in several classes, framed quietly around its cards (not the Best / Same columns) */
.rt-prop-group { position: relative; display: flex; flex-direction: column; gap: 8px; padding: 6px 0 8px; }
.rt-prop-group::before { content: ''; position: absolute; top: 0; bottom: 0; left: 104px; right: -8px; border: 1px solid #D5DCE8; border-radius: 12px; background: #F6F8FC; pointer-events: none; }
.rt-prop-group > * { position: relative; }
.rt-prop-group-lead { margin: 0; padding-left: 116px; font-size: 13px; line-height: 1.35; color: #4B5563; }
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
