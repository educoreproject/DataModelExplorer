<script setup>
// The states a level can be in besides its rows: loading (pulsing grey bubbles) and error (the graph did not
// answer, with the server's reason underneath and Try again).

defineProps({
	stateName: { type: String, required: true, validator: (stateName) => ['loading', 'error'].includes(stateName) },
	detailText: { type: String, default: '' },
});
const emit = defineEmits(['retry']);

// bubble positions for the loading picture: x%, y%, diameter%
const LOADING_BUBBLE_LIST = [
	[50, 46, 14], [22, 22, 8], [78, 22, 8], [15, 60, 7], [85, 60, 7], [34, 82, 6], [66, 82, 6],
];
</script>

<template>
	<div v-if="stateName === 'loading'" aria-busy="true" aria-label="Loading this level" class="state-canvas" data-testid="state-loading">
		<span
			v-for="(oneBubble, bubbleIndex) in LOADING_BUBBLE_LIST"
			:key="bubbleIndex"
			class="state-bubble"
			:style="{ left: `${oneBubble[0]}%`, top: `${oneBubble[1]}%`, width: `${oneBubble[2]}%` }"
		/>
		<span class="state-loading-text">Loading this level…</span>
	</div>
	<div v-else role="alert" class="state-error" data-testid="state-error">
		<span class="state-error-title">The standards graph did not answer</span>
		<span class="state-error-text">Nothing is wrong with what you clicked. The server could not answer this request. Try again, or go back with the breadcrumb.</span>
		<code v-if="detailText" class="state-error-detail" data-testid="state-error-detail">{{ detailText }}</code>
		<v-btn color="primary" data-testid="retry" @click="emit('retry')">Try again</v-btn>
	</div>
</template>

<style scoped>
@keyframes explorerPulse {
	0%,
	100% {
		opacity: 0.45;
	}
	50% {
		opacity: 1;
	}
}
.state-canvas {
	position: relative;
	width: 100%;
	aspect-ratio: 1000 / 620;
	background: radial-gradient(#e3e7ef 1px, transparent 1px) 0 0 / 20px 20px;
	border-radius: 8px;
}
.state-bubble {
	position: absolute;
	transform: translate(-50%, -50%);
	aspect-ratio: 1;
	border-radius: 50%;
	background: #e3e7ef;
	animation: explorerPulse 1.2s ease-in-out infinite;
}
.state-loading-text {
	position: absolute;
	left: 50%;
	bottom: 4%;
	transform: translateX(-50%);
	font-size: 14px;
	color: #6b7280;
}
.state-error {
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: 12px;
	text-align: center;
	min-height: 420px;
	padding: 32px;
	background: #fbf2f3;
	border-radius: 8px;
}
.state-error-title {
	font-family: 'DM Serif Display', Georgia, serif;
	font-size: 26px;
	color: #072a6c;
}
.state-error-text {
	font-size: 15px;
	color: #4b5563;
	max-width: 52ch;
}
.state-error-detail {
	font-size: 12px;
	color: #b00020;
	max-width: 80ch;
	white-space: pre-wrap;
	overflow-wrap: anywhere;
}
</style>
