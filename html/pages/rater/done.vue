<script setup>
// /rater/done — "All 50 rated" (design: Done): Review my answers, or Finish and send (with a lock confirmation), then
// Thank you. A rater who has already finished sees Thank you. A rater who reaches it with items unsaved sees what is
// left undone (revision 14): how many, and each one (item number, standard, element name) as a link that opens it in
// "left undone" mode (/rater/rate?item=N&set=undone&items=…, read by pages/rater/rate.vue), where Previous and Next
// walk only these items.
import { ref, computed, onMounted } from 'vue';
import { useRaterStore } from '@/stores/raterStore';

definePageMeta({ layout: false });
useHead({ title: 'Mapping Survey: all rated' });

const raterStore = useRaterStore();
const router = useRouter();
const isConfirming = ref(false);

const progress = computed(() => raterStore.progress);
const isFinished = computed(() => !!(progress.value && progress.value.finishedAt));
const unsavedCount = computed(() => (progress.value ? progress.value.itemCount - progress.value.savedCount : 0));
const undoneSetItemsText = computed(() => (progress.value ? progress.value.unsavedItemList.map((unsavedItem) => unsavedItem.itemNumber).join('-') : ''));
const undoneItemRouteOf = (itemNumber) => ({ path: '/rater/rate', query: { item: itemNumber, set: 'undone', items: undoneSetItemsText.value } });

const finishAndSend = async () => {
	if (await raterStore.finish()) {
		isConfirming.value = false;
	}
};

const signOut = () => {
	raterStore.signOut();
	router.push('/rater');
};

onMounted(async () => {
	if (!raterStore.isSignedIn && !raterStore.restoreSession()) {
		router.push('/rater');
		return;
	}
	await raterStore.loadProgress();
});
</script>

<template>
	<RaterShell>
		<main class="rt-done-main">
			<section aria-labelledby="doneHead" class="rt-panel rt-done-card" data-testid="rater-done">
				<template v-if="progress && isFinished">
					<div role="status" class="rt-done-stack">
						<h1 id="doneHead" class="rt-serif rt-done-title" data-testid="rater-thank-you">Thank you</h1>
						<p class="rt-done-text">Your {{ progress.itemCount }} answers are in and locked. They become part of the yardstick every mapping judge is measured against.</p>
						<button type="button" class="rt-button-quiet rt-done-signout" @click="signOut">Sign out</button>
					</div>
				</template>
				<template v-else-if="progress && unsavedCount > 0">
					<div class="rt-done-stack" data-testid="rater-left-undone">
						<h1 id="doneHead" class="rt-serif rt-done-title">{{ unsavedCount }} left undone</h1>
						<p class="rt-done-text" data-testid="rater-left-undone-count">{{ progress.savedCount }} answered out of {{ progress.itemCount }}. {{ unsavedCount === 1 ? 'This one has' : `These ${unsavedCount} have` }} no saved answer yet. Finish and send opens when all {{ progress.itemCount }} are answered.</p>
						<ol class="rt-undone-list" aria-label="Left undone" data-testid="rater-left-undone-list">
							<li v-for="unsavedItem in progress.unsavedItemList" :key="unsavedItem.itemNumber">
								<NuxtLink :to="undoneItemRouteOf(unsavedItem.itemNumber)" class="rt-undone-link" :data-testid="`rater-left-undone-item-${unsavedItem.itemNumber}`">
									<span class="rt-undone-number">Item {{ unsavedItem.itemNumber }}</span>
									<span class="rt-undone-standard">{{ unsavedItem.standard }}</span>
									<span class="rt-undone-name">{{ unsavedItem.name }}</span>
								</NuxtLink>
							</li>
						</ol>
						<NuxtLink :to="undoneItemRouteOf(progress.unsavedItemList[0].itemNumber)" class="rt-button rt-done-link" data-testid="rater-left-undone-start">Start with item {{ progress.unsavedItemList[0].itemNumber }}</NuxtLink>
					</div>
				</template>
				<template v-else-if="progress">
					<div class="rt-done-stack">
						<h1 id="doneHead" class="rt-serif rt-done-title">All {{ progress.itemCount }} rated</h1>
						<span aria-hidden="true" class="rt-done-bar"><span></span></span>
						<p class="rt-done-text">You can still go back and change any answer. When you are happy with them, finish to send them in. After that they are locked.</p>
						<div class="rt-done-actions">
							<NuxtLink :to="{ path: '/rater/rate', query: { item: 1 } }" class="rt-button-quiet rt-done-link" data-testid="rater-review">Review my answers</NuxtLink>
							<button type="button" class="rt-button rt-done-big" data-testid="rater-finish" @click="isConfirming = true">Finish and send</button>
						</div>
						<div v-if="isConfirming" role="alertdialog" aria-label="Finish" class="rt-done-confirm">
							<span>Once you finish, your answers are locked. Finish now?</span>
							<span class="rt-done-confirm-buttons">
								<button type="button" class="rt-button-quiet" @click="isConfirming = false">Not yet</button>
								<button type="button" class="rt-button" :disabled="raterStore.saving" data-testid="rater-finish-confirm" @click="finishAndSend">Yes, finish and send</button>
							</span>
						</div>
						<p v-if="raterStore.statusMsg" role="alert" class="rt-alert-error">{{ raterStore.statusMsg }}</p>
					</div>
				</template>
				<p v-else-if="raterStore.statusMsg" role="alert" class="rt-alert-error">{{ raterStore.statusMsg }}</p>
			</section>
		</main>
	</RaterShell>
</template>

<style scoped>
.rt-done-main { max-width: 760px; margin: 0 auto; padding: 56px clamp(16px, 3vw, 40px) 64px; box-sizing: border-box; }
.rt-done-card { padding: 32px; display: flex; flex-direction: column; gap: 16px; }
.rt-done-stack { display: flex; flex-direction: column; gap: 16px; }
.rt-done-title { margin: 0; font-size: 36px; line-height: 1.15; color: #072A6C; }
.rt-done-text { margin: 0; font-size: 17px; line-height: 1.6; color: #374151; }
.rt-done-bar { position: relative; display: block; width: 100%; height: 10px; background: #E3E7EF; border-radius: 5px; overflow: hidden; }
.rt-done-bar span { position: absolute; inset: 0; background: #072A6C; }
.rt-done-actions { display: flex; flex-wrap: wrap; gap: 10px; }
.rt-done-link { min-height: 48px; display: inline-flex; align-items: center; text-decoration: none; align-self: flex-start; }
.rt-done-big { min-height: 48px; }
.rt-done-signout { align-self: flex-start; min-height: 48px; }
.rt-done-confirm { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; background: #FFF6E8; border: 1px solid #F5C77E; border-radius: 10px; padding: 12px 16px; font-size: 15px; }
.rt-done-confirm-buttons { display: flex; gap: 8px; }
.rt-undone-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.rt-undone-link { display: grid; grid-template-columns: 76px 64px minmax(0, 1fr); align-items: baseline; gap: 12px; min-height: 44px; padding: 8px 12px; box-sizing: border-box; border: 1px solid #C9D3E8; border-radius: 8px; color: #072A6C; text-decoration: none; font-size: 16px; }
.rt-undone-link:hover { background: #E7ECF6; }
.rt-undone-number { font-weight: 700; }
.rt-undone-standard { color: #4B5563; font-size: 14px; }
.rt-undone-name { font-weight: 600; overflow-wrap: anywhere; }
</style>
