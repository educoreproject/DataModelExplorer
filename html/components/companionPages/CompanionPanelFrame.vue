<script setup>
// One panel of a compiled companion page (SPEC-companionPages-102826, "The JEDx page"): its title, whom it serves and
// what it is best used for (DEV-122: "one panel per representation: which audience it serves ... and what it is best
// used for"), then the panel's own content in the slot.

defineProps({
	panelTitle: { type: String, required: true },
	audienceText: { type: String, required: true },
	bestUsedForText: { type: String, required: true },
	panelTestId: { type: String, required: true },
});
</script>

<template>
	<section class="companion-panel" :data-testid="panelTestId" :aria-label="panelTitle">
		<h2 class="companion-panel-title">{{ panelTitle }}</h2>
		<p class="companion-panel-lens"><span class="companion-panel-lens-label">For</span> {{ audienceText }} <span class="companion-panel-lens-label">· Best used for</span> {{ bestUsedForText }}</p>
		<slot />
	</section>
</template>

<style scoped>
.companion-panel {
	margin-top: 24px;
	background: #ffffff;
	border: 1px solid #e3e7ef;
	border-radius: 12px;
	padding: 16px 18px 18px;
	overflow-x: auto;
}
.companion-panel-title {
	margin: 0;
	padding-left: 10px;
	border-left: 5px solid #072a6c;
	font-size: 22px;
	font-weight: 700;
	color: #111827;
}
.companion-panel-lens {
	margin: 6px 0 12px;
	font-size: 14px;
	color: #4b5563;
}
.companion-panel-lens-label {
	font-size: 12px;
	font-weight: 700;
	text-transform: uppercase;
	letter-spacing: 0.04em;
	color: #6b7280;
}
</style>
