<script setup>
// RaterFinder — "Find more candidates": Search all of CEDS (words, meaning, or a CEDS ID such as P001572) and Browse
// CEDS (the 8 concepts → a concept's classes → a class's properties as cards). Every result card has "+ Add to
// candidates" or "✓ In your list". Loading, empty and error states as designed.
//
// foundBy, recorded for every added card (SPEC §5): 'search'; 'browseFromCard' when Browse was opened from a card's
// class link (openClassFromCard, called by the page); 'browseFromConcept' when the rater walked down from a concept.
// SPEC vs DESIGN (logged): the design has one search box; the spec has three search kinds. The box keeps the design's
// wording, a CEDS ID typed into it is always an ID search, and a two-way choice picks words or meaning for the rest.
import { ref, computed } from 'vue';

// cardSource: { search(searchRequest), browse(browseRequest) } -> { answer } | { refusal }, given by the rating screen:
// the rater's own calls, or the admin preview's (revision 8)
const props = defineProps({
	cardSource: { type: Object, required: true },
	elementStableId: { type: String, required: true },
	inListTupleIdList: { type: Array, required: true },
});
const emit = defineEmits(['add-card', 'searched']);

const CEDS_ID_PATTERN = /^\s*P\d{6}\s*$/i;
const SEARCH_MODE_LABEL_BY_NAME = Object.freeze({ words: 'by words', meaning: 'by meaning' });

const tabName = ref('search');
const queryText = ref('');
const searchMode = ref('words');
const searchState = ref('idle');
const searchResultList = ref([]);
const searchNote = ref('');
const ranQueryText = ref('');
const browseState = ref('idle');
const browseEntryName = ref('browseFromConcept');
const conceptAnswer = ref(null);
const chosenConceptName = ref('');
const classListAnswer = ref(null);
const classAnswer = ref(null);
const finderErrorText = ref('');
const addedMessage = ref('');

const inListSet = computed(() => new Set(props.inListTupleIdList));
const labelOf = (card) => `${card.className} → ${card.propertyName}${card.qualifierNameList.length ? ` (${card.qualifierNameList.join(', ')})` : ''}`;

const runSearch = async () => {
	const trimmedText = queryText.value.trim();
	if (trimmedText === '') {
		return;
	}
	const effectiveMode = CEDS_ID_PATTERN.test(trimmedText) ? 'cedsId' : searchMode.value;
	searchState.value = 'loading';
	ranQueryText.value = trimmedText;
	emit('searched', trimmedText);
	const { answer, refusal } = await props.cardSource.search({ elementStableId: props.elementStableId, searchMode: effectiveMode, queryText: trimmedText });
	if (refusal) {
		finderErrorText.value = refusal.refusalText;
		searchState.value = ['cedsIdInvalid', 'queryTextEmpty'].includes(refusal.refusalName) ? 'refused' : 'error';
		return;
	}
	searchResultList.value = answer.cardList;
	searchNote.value = answer.searchNote || '';
	searchState.value = answer.cardList.length === 0 ? 'empty' : 'results';
};

const loadConcepts = async () => {
	browseState.value = 'loading';
	chosenConceptName.value = '';
	classListAnswer.value = null;
	classAnswer.value = null;
	const { answer, refusal } = await props.cardSource.browse({ browseMode: 'concepts' });
	if (refusal) {
		finderErrorText.value = refusal.refusalText;
		browseState.value = 'error';
		return;
	}
	conceptAnswer.value = answer;
	browseState.value = 'concepts';
};

const openConcept = async (conceptName) => {
	browseState.value = 'loading';
	browseEntryName.value = 'browseFromConcept';
	chosenConceptName.value = conceptName;
	classAnswer.value = null;
	const { answer, refusal } = await props.cardSource.browse({ browseMode: 'classesOfConcept', conceptName });
	if (refusal) {
		finderErrorText.value = refusal.refusalText;
		browseState.value = 'error';
		return;
	}
	classListAnswer.value = answer;
	browseState.value = 'classes';
};

const openClass = async (classCedsId, entryName) => {
	browseState.value = 'loading';
	browseEntryName.value = entryName;
	const { answer, refusal } = await props.cardSource.browse({ browseMode: 'propertiesOfClass', classCedsId });
	if (refusal) {
		finderErrorText.value = refusal.refusalText;
		browseState.value = 'error';
		return;
	}
	classAnswer.value = answer;
	chosenConceptName.value = answer.conceptName || chosenConceptName.value;
	browseState.value = 'properties';
};

const showSearch = () => {
	tabName.value = 'search';
};
const showBrowse = () => {
	tabName.value = 'browse';
	if (browseState.value === 'idle') {
		loadConcepts();
	}
};

// called by the page when a card's class name is clicked
const openClassFromCard = (card) => {
	tabName.value = 'browse';
	openClass(card.classCedsId, 'browseFromCard');
	const finderSection = document.getElementById('finder');
	if (finderSection) {
		finderSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}
};
defineExpose({ openClassFromCard });

const retryBrowse = () => {
	if (classAnswer.value || browseEntryName.value === 'browseFromCard') {
		loadConcepts();
		return;
	}
	if (chosenConceptName.value) {
		openConcept(chosenConceptName.value);
		return;
	}
	loadConcepts();
};

const addCard = (card, foundBy) => {
	emit('add-card', card, foundBy);
	addedMessage.value = `${labelOf(card)} is now at the top of your list.`;
};

const resultFoundBy = computed(() => browseEntryName.value);
const classIntroText = computed(() => (classListAnswer.value ? `${chosenConceptName.value}: ${classListAnswer.value.classList.length} CEDS classes. Pick one to see its properties.` : ''));
</script>

<template>
	<section id="finder" aria-labelledby="findHead" class="rt-panel rt-finder" data-testid="rater-finder">
		<div class="rt-finder-top">
			<div>
				<h2 id="findHead" class="rt-finder-head">Find more candidates</h2>
				<p class="rt-finder-sub">The right answer may not be in the list. Anything you add joins the top of the list.</p>
			</div>
			<div role="tablist" aria-label="Find more candidates" class="rt-tabs">
				<button type="button" role="tab" :aria-selected="tabName === 'search'" class="rt-tab" :class="{ 'rt-tab-on': tabName === 'search' }" data-testid="rater-tab-search" @click="showSearch">Search all of CEDS</button>
				<button type="button" role="tab" :aria-selected="tabName === 'browse'" class="rt-tab" :class="{ 'rt-tab-on': tabName === 'browse' }" data-testid="rater-tab-browse" @click="showBrowse">Browse CEDS</button>
			</div>
		</div>

		<div v-if="addedMessage" role="status" class="rt-added-status">
			<span>{{ addedMessage }}</span>
			<a href="#candidates" class="rt-added-jump">Go to the list ↑</a>
		</div>

		<div v-if="tabName === 'search'" role="tabpanel" aria-label="Search all of CEDS">
			<form class="rt-search-form" @submit.prevent="runSearch">
				<label class="rt-search-label">Words, a meaning, or a CEDS ID such as P001572
					<input v-model="queryText" type="search" class="rt-search-input" data-testid="rater-search-input" />
				</label>
				<fieldset class="rt-search-mode" aria-label="Search">
					<label v-for="(modeLabel, modeName) in SEARCH_MODE_LABEL_BY_NAME" :key="modeName" class="rt-search-mode-option" :class="{ 'rt-search-mode-on': searchMode === modeName }">
						<input v-model="searchMode" type="radio" name="searchMode" :value="modeName" class="rt-sr" :data-testid="`rater-search-mode-${modeName}`" />{{ modeLabel }}
					</label>
				</fieldset>
				<button type="submit" class="rt-button" data-testid="rater-search-submit">Search</button>
			</form>
			<p class="rt-search-hint">A CEDS ID (P and six digits) always looks up that element. Otherwise: by words finds cards holding your words; by meaning finds cards that mean what you typed.</p>

			<div v-if="searchState === 'loading'" aria-busy="true" aria-label="Searching" class="rt-skeleton-list">
				<span v-for="skeletonPosition in 3" :key="skeletonPosition" class="rt-skeleton" :style="{ animationDelay: `${skeletonPosition * 0.15}s` }"></span>
				<span class="rt-finder-muted">Searching CEDS…</span>
			</div>
			<div v-else-if="searchState === 'error'" role="alert" class="rt-finder-error" data-testid="rater-finder-error">
				<span class="rt-serif rt-finder-error-head">The standards graph did not answer</span>
				<span class="rt-finder-muted">Your answer so far is safe. The server could not reach CEDS just now. Try again in a moment.</span>
				<span class="rt-finder-muted rt-small">{{ finderErrorText }}</span>
				<button type="button" class="rt-button" @click="runSearch">Try again</button>
			</div>
			<p v-else-if="searchState === 'refused'" role="alert" class="rt-alert-error rt-gap">{{ finderErrorText }}</p>
			<div v-else-if="searchState === 'empty'" class="rt-finder-empty" data-testid="rater-finder-empty">
				<b>Nothing in CEDS matches “{{ ranQueryText }}”.</b> Try fewer words, a different word for the same idea, the other search, or a CEDS ID such as P001572. You can also browse CEDS by concept.
			</div>
			<template v-else-if="searchState === 'results'">
				<p class="rt-finder-muted rt-gap">Cards for “{{ ranQueryText }}”.<span v-if="searchNote"> {{ searchNote }}</span></p>
				<div class="rt-result-list" data-testid="rater-search-results">
					<article v-for="card in searchResultList" :key="card.cedsTupleId" class="rt-result" data-testid="rater-search-result">
						<div class="rt-result-text">
							<RaterCardTitle :card="card" @browse-class="openClass(card.classCedsId, 'browseFromCard')" />
							<p class="rt-result-definition">{{ card.definition }}</p>
							<span class="rt-mono rt-result-id">{{ card.cedsId ? `CEDS ID ${card.cedsId}` : 'CEDS ID not listed' }}</span>
						</div>
						<button v-if="!inListSet.has(card.cedsTupleId)" type="button" class="rt-button-teal" :aria-label="`Add ${labelOf(card)} to candidates`" data-testid="rater-add-card" @click="addCard(card, 'search')">+ Add to candidates</button>
						<span v-else class="rt-in-list">✓ In your list</span>
					</article>
				</div>
			</template>
		</div>

		<div v-else role="tabpanel" aria-label="Browse CEDS">
			<nav aria-label="Browse path" class="rt-browse-path">
				<ol>
					<li><button type="button" class="rt-crumb" :class="{ 'rt-crumb-on': browseState === 'concepts' }" :aria-current="browseState === 'concepts' ? 'page' : undefined" data-testid="rater-browse-crumb-all" @click="loadConcepts">All concepts</button></li>
					<li v-if="chosenConceptName"><span aria-hidden="true" class="rt-crumb-sep">›</span><button type="button" class="rt-crumb" :class="{ 'rt-crumb-on': browseState === 'classes' }" :aria-current="browseState === 'classes' ? 'page' : undefined" @click="openConcept(chosenConceptName)">{{ chosenConceptName }}</button></li>
					<li v-if="classAnswer && browseState === 'properties'"><span aria-hidden="true" class="rt-crumb-sep">›</span><button type="button" class="rt-crumb rt-crumb-on" aria-current="page">{{ classAnswer.className }}</button></li>
				</ol>
			</nav>

			<div v-if="browseState === 'loading'" aria-busy="true" aria-label="Loading" class="rt-skeleton-grid">
				<span v-for="skeletonPosition in 3" :key="skeletonPosition" class="rt-skeleton rt-skeleton-tall" :style="{ animationDelay: `${skeletonPosition * 0.15}s` }"></span>
			</div>
			<div v-else-if="browseState === 'error'" role="alert" class="rt-finder-error">
				<span class="rt-serif rt-finder-error-head">The standards graph did not answer</span>
				<span class="rt-finder-muted">Your answer so far is safe. The server could not reach CEDS just now. Try again in a moment.</span>
				<span class="rt-finder-muted rt-small">{{ finderErrorText }}</span>
				<button type="button" class="rt-button" @click="retryBrowse">Try again</button>
			</div>
			<template v-else-if="browseState === 'concepts' && conceptAnswer">
				<p class="rt-finder-muted rt-gap-bottom">CEDS groups its classes into {{ conceptAnswer.conceptList.length }} concepts. Pick one.</p>
				<div class="rt-tile-grid">
					<button v-for="concept in conceptAnswer.conceptList" :key="concept.conceptName" type="button" class="rt-tile" data-testid="rater-browse-concept" @click="openConcept(concept.conceptName)">
						<span class="rt-tile-top"><b>{{ concept.conceptName }}</b><span class="rt-finder-muted rt-small">{{ concept.classCount === 1 ? '1 class' : `${concept.classCount} classes` }}</span></span>
						<span class="rt-tile-text">{{ concept.conceptDefinition }}</span>
					</button>
				</div>
			</template>
			<template v-else-if="browseState === 'classes' && classListAnswer">
				<p class="rt-finder-muted rt-gap-bottom">{{ classIntroText }}</p>
				<div v-if="classListAnswer.classList.length === 0" class="rt-finder-empty">{{ chosenConceptName }} has no classes in CEDS. That is CEDS’s own structure, not a fault. Go back to all concepts and pick another.</div>
				<div class="rt-tile-grid rt-tile-grid-wide">
					<button v-for="cedsClass in classListAnswer.classList" :key="cedsClass.classCedsId" type="button" class="rt-tile" data-testid="rater-browse-class" @click="openClass(cedsClass.classCedsId, 'browseFromConcept')">
						<b>{{ cedsClass.className }}</b>
						<span class="rt-tile-text">{{ cedsClass.classDefinition || 'No class definition in CEDS.' }}</span>
					</button>
				</div>
			</template>
			<template v-else-if="browseState === 'properties' && classAnswer">
				<div class="rt-class-banner"><b>{{ classAnswer.className }}</b>: {{ classAnswer.classDefinition || 'No class definition in CEDS.' }}</div>
				<div v-if="classAnswer.cardList.length === 0" class="rt-finder-empty">This class has no properties in CEDS.</div>
				<div class="rt-result-list">
					<article v-for="card in classAnswer.cardList" :key="card.cedsTupleId" class="rt-result" data-testid="rater-browse-property">
						<div class="rt-result-text">
							<RaterCardTitle :card="card" :class-is-button="false" />
							<p class="rt-result-definition">{{ card.definition }}</p>
							<span class="rt-mono rt-result-id">{{ card.cedsId ? `CEDS ID ${card.cedsId}` : 'CEDS ID not listed' }}</span>
						</div>
						<button v-if="!inListSet.has(card.cedsTupleId)" type="button" class="rt-button-teal" :aria-label="`Add ${labelOf(card)} to candidates`" data-testid="rater-add-card" @click="addCard(card, resultFoundBy)">+ Add to candidates</button>
						<span v-else class="rt-in-list">✓ In your list</span>
					</article>
				</div>
			</template>
		</div>
	</section>
</template>

<style scoped>
.rt-finder { padding: 16px; }
.rt-finder-top { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px 16px; margin-bottom: 12px; }
.rt-finder-head { margin: 0; font-size: 20px; font-weight: 700; color: #111827; }
.rt-finder-sub { margin: 2px 0 0; font-size: 14px; color: #4B5563; }
.rt-tabs { display: inline-flex; background: #E7ECF6; border-radius: 10px; padding: 3px; }
.rt-tab { min-height: 40px; padding: 0 16px; border: 0; border-radius: 8px; font: inherit; font-size: 15px; font-weight: 600; cursor: pointer; background: transparent; color: #072A6C; }
.rt-tab-on { background: #FFFFFF; box-shadow: 0 1px 2px rgba(7, 42, 108, 0.18); }
.rt-added-status { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; background: #E0F6F6; border: 1px solid #9ED9DA; border-radius: 8px; padding: 8px 12px; margin-bottom: 12px; font-size: 14px; }
.rt-added-jump { font-weight: 700; color: #005E61 !important; }
.rt-search-form { display: flex; flex-wrap: wrap; gap: 8px; align-items: flex-end; }
.rt-search-label { flex: 1 1 320px; display: flex; flex-direction: column; gap: 4px; font-size: 14px; font-weight: 600; color: #374151; }
.rt-search-input { min-height: 44px; box-sizing: border-box; padding: 0 12px; border: 1px solid #C9D3E8; border-radius: 8px; font: inherit; font-size: 16px; font-weight: 400; background: #FFFFFF; color: #111827; }
.rt-search-mode { border: 0; margin: 0; padding: 3px; display: inline-flex; background: #E7ECF6; border-radius: 10px; }
.rt-search-mode-option { min-height: 38px; display: inline-flex; align-items: center; padding: 0 12px; border-radius: 8px; font-size: 14px; font-weight: 600; color: #072A6C; cursor: pointer; }
.rt-search-mode-on { background: #FFFFFF; box-shadow: 0 1px 2px rgba(7, 42, 108, 0.18); }
.rt-search-mode-option:focus-within { outline: 3px solid #072A6C; outline-offset: 2px; box-shadow: 0 0 0 6px #FFAB40; }
.rt-search-hint { margin: 6px 0 0; font-size: 13px; color: #4B5563; }
.rt-skeleton-list { display: flex; flex-direction: column; gap: 8px; margin-top: 12px; }
.rt-skeleton-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 8px; }
.rt-skeleton { display: block; height: 76px; border-radius: 10px; background: #EEF0F4; animation: rtPulse 1.2s ease-in-out infinite; }
.rt-skeleton-tall { height: 96px; }
.rt-finder-muted { font-size: 14px; color: #4B5563; }
.rt-small { font-size: 13px; }
.rt-gap { margin: 12px 0 8px; }
.rt-gap-bottom { margin: 0 0 8px; }
.rt-finder-error { display: flex; flex-direction: column; align-items: center; gap: 10px; text-align: center; padding: 28px 16px; margin-top: 12px; background: #FBF2F3; border-radius: 10px; }
.rt-finder-error-head { font-size: 24px; color: #072A6C; }
.rt-finder-empty { margin-top: 12px; padding: 20px 16px; border: 1px dashed #9CA3AF; border-radius: 10px; font-size: 15px; color: #374151; line-height: 1.5; }
.rt-result-list { display: flex; flex-direction: column; gap: 8px; }
.rt-result { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: 8px 16px; border: 2px solid #DCE2EC; border-radius: 10px; padding: 12px 16px; }
.rt-result-text { flex: 1 1 420px; min-width: 0; }
.rt-result-definition { margin: 6px 0 0; font-size: 15px; line-height: 1.5; color: #1F2937; }
.rt-result-id { font-size: 13px; color: #4B5563; }
.rt-in-list { min-height: 44px; display: inline-flex; align-items: center; padding: 0 12px; font-size: 14px; font-weight: 600; color: #4B5563; }
.rt-browse-path { border: 1px solid #E3E7EF; border-radius: 10px; padding: 4px 8px; margin-bottom: 12px; }
.rt-browse-path ol { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; align-items: center; gap: 4px; font-size: 14px; }
.rt-browse-path li { display: flex; align-items: center; gap: 4px; }
.rt-crumb-sep { color: #9CA3AF; padding: 0 2px; }
.rt-crumb { min-height: 36px; padding: 0 10px; border: 0; border-radius: 8px; font: inherit; font-size: 14px; cursor: pointer; background: transparent; color: #072A6C; text-decoration: underline; }
.rt-crumb-on { background: #E0F6F6; color: #005E61; font-weight: 700; text-decoration: none; }
.rt-tile-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 8px; }
.rt-tile-grid-wide { grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); }
.rt-tile { text-align: left; display: flex; flex-direction: column; gap: 4px; padding: 12px 14px; border: 2px solid #DCE2EC; border-radius: 10px; background: #FFFFFF; font: inherit; color: #111827; cursor: pointer; min-height: 96px; }
.rt-tile b { font-size: 17px; color: #005E61; }
.rt-tile-top { display: flex; justify-content: space-between; gap: 8px; width: 100%; }
.rt-tile-text { font-size: 14px; line-height: 1.4; color: #374151; }
.rt-class-banner { background: #E0F6F6; border-radius: 10px; padding: 10px 14px; margin-bottom: 10px; font-size: 14px; line-height: 1.45; }
.rt-class-banner b { color: #005E61; }
</style>
