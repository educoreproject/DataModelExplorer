<script setup>
// RaterFinderDrawer — revision 10 (WORKORDER-RATER10): a panel from the right that holds the finder (its slot) over the
// candidate list, never over the element on the left, so the rater keeps reading the element while searching. About half
// the viewport wide, pushed right of the element column when that column is wider; the whole viewport below 1100px,
// where the columns stack (the same breakpoint as rt-stick in raterArea.css).
// Closes on Esc, its ✕ and a pointer press outside it; each emits 'close' and the host sets isOpen false. Focus moves to
// focusSelector inside the drawer on open and back to whatever had focus before (the opener) on close. Tab wraps inside
// it while it is open. It is not modal: nothing outside is dimmed or locked, the element stays readable.
// Host: components/rater/RatingScreen.vue (both rating modes, so the admin preview has it too). No store, no API.
import { ref, watch, nextTick, onBeforeUnmount } from 'vue';

const props = defineProps({
	isOpen: { type: Boolean, required: true },
	focusSelector: { type: String, required: true },
	keepVisibleSelector: { type: String, required: true },
	labelledById: { type: String, required: true },
});
const emit = defineEmits(['close']);

const STACKED_VIEWPORT_MAX_WIDTH = 1099;
const DRAWER_GAP_PX = 16;
const FOCUSABLE_SELECTOR = 'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

const drawerElement = ref(null);
const drawerLeftPx = ref(0);
let openerElement = null;
let outsidePressTarget = null;

const placeDrawer = () => {
	if (window.innerWidth <= STACKED_VIEWPORT_MAX_WIDTH) {
		drawerLeftPx.value = 0;
		return;
	}
	const keepVisibleElement = document.querySelector(props.keepVisibleSelector);
	if (!keepVisibleElement) {
		throw new Error(`RaterFinderDrawer: nothing matches keepVisibleSelector '${props.keepVisibleSelector}'`);
	}
	drawerLeftPx.value = Math.round(Math.max(window.innerWidth / 2, keepVisibleElement.getBoundingClientRect().right + DRAWER_GAP_PX));
};

const closeOnEscape = (keyEvent) => {
	if (keyEvent.key === 'Escape') {
		emit('close');
	}
};

const wrapTab = (keyEvent) => {
	if (keyEvent.key !== 'Tab' || !drawerElement.value) {
		return;
	}
	const focusableList = Array.from(drawerElement.value.querySelectorAll(FOCUSABLE_SELECTOR)).filter((focusable) => focusable.offsetParent !== null);
	if (focusableList.length === 0) {
		return;
	}
	const firstFocusable = focusableList[0];
	const lastFocusable = focusableList[focusableList.length - 1];
	if (keyEvent.shiftKey && document.activeElement === firstFocusable) {
		keyEvent.preventDefault();
		lastFocusable.focus();
		return;
	}
	if (!keyEvent.shiftKey && document.activeElement === lastFocusable) {
		keyEvent.preventDefault();
		firstFocusable.focus();
	}
};

const closeOnOutsidePress = (pointerEvent) => {
	if (drawerElement.value && !drawerElement.value.contains(pointerEvent.target)) {
		outsidePressTarget = pointerEvent.target;
		emit('close');
	}
};

const listenWhileOpen = () => {
	document.addEventListener('keydown', closeOnEscape);
	document.addEventListener('keydown', wrapTab);
	document.addEventListener('pointerdown', closeOnOutsidePress, true);
	window.addEventListener('resize', placeDrawer);
};

const stopListening = () => {
	document.removeEventListener('keydown', closeOnEscape);
	document.removeEventListener('keydown', wrapTab);
	document.removeEventListener('pointerdown', closeOnOutsidePress, true);
	window.removeEventListener('resize', placeDrawer);
};

// the host names what takes focus; a selector that matches nothing is the host's mistake, said by name
const focusInside = () => {
	const focusTarget = drawerElement.value.querySelector(props.focusSelector);
	if (!focusTarget) {
		throw new Error(`RaterFinderDrawer: nothing inside the drawer matches focusSelector '${props.focusSelector}'`);
	}
	focusTarget.focus();
};

const openDrawer = async () => {
	openerElement = document.activeElement;
	placeDrawer();
	listenWhileOpen();
	await nextTick();
	focusInside();
};

// a press outside on something focusable (the note, a link) keeps the focus it gives; a press on plain text would
// leave focus on the page body, so focus goes back to the opener once the press has finished moving it
const returnFocus = (focusElement, pressTarget) => {
	if (!focusElement || !focusElement.isConnected) {
		return;
	}
	if (!pressTarget) {
		focusElement.focus();
		return;
	}
	if (pressTarget.closest && pressTarget.closest(FOCUSABLE_SELECTOR)) {
		return;
	}
	setTimeout(() => focusElement.focus(), 0);
};

const closeDrawer = () => {
	stopListening();
	returnFocus(openerElement, outsidePressTarget);
	openerElement = null;
	outsidePressTarget = null;
};

watch(
	() => props.isOpen,
	(isOpenNow) => (isOpenNow ? openDrawer() : closeDrawer())
);
// a new focus target while open (another opener pressed: Search, then Browse) moves focus there too
watch(
	() => props.focusSelector,
	async () => {
		if (!props.isOpen) {
			return;
		}
		await nextTick();
		focusInside();
	}
);
onBeforeUnmount(stopListening);
</script>

<template>
	<div v-show="props.isOpen" ref="drawerElement" role="dialog" aria-modal="false" :aria-labelledby="props.labelledById" tabindex="-1" class="rt-drawer" :style="{ left: `${drawerLeftPx}px` }" data-testid="rater-finder-drawer">
		<button type="button" class="rt-drawer-close" aria-label="Close the search panel" data-testid="rater-finder-close" @click="emit('close')">✕</button>
		<slot />
	</div>
</template>

<style scoped>
.rt-drawer { position: fixed; top: 0; right: 0; bottom: 0; z-index: 1010; overflow-y: auto; overscroll-behavior: contain; background: var(--rt-page, #F8F9FC); border-left: 1px solid #C9D3E8; box-shadow: -10px 0 28px rgba(7, 42, 108, 0.18); box-sizing: border-box; padding: 12px; }
.rt-drawer:focus { outline: none; }
.rt-drawer-close { position: absolute; top: 14px; right: 16px; z-index: 1; width: 44px; height: 44px; border: 1px solid #C9D3E8; border-radius: 8px; background: #FFFFFF; color: #072A6C; font: inherit; font-size: 20px; font-weight: 700; cursor: pointer; }
</style>
