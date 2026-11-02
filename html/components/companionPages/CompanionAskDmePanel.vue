<script setup>
// The JEDx page's Ask DME panel (SPEC-companionPages-102826): links that open the Data Model Explorer with a fixed prompt
// about one JEDx object filled in, not sent (/dm/explorer?prefillPrompt=). Only prompts whose five runs agreed are
// listed (data/jedxCompanionAskDmePromptList.ts), each with the record of that test.

import { jedxCompanionAskDmePromptList } from '@/data/jedxCompanionAskDmePromptList';

const DME_EXPLORER_PATH = '/dm/explorer';

const explorerLinkOf = (askDmePrompt) => ({ path: DME_EXPLORER_PATH, query: { prefillPrompt: askDmePrompt.promptText } });
</script>

<template>
	<div class="ask-dme-panel">
		<p class="ask-dme-note">Each link opens the Data Model Explorer with the question filled in. Read it, then press Submit. The answer is the DME's own, read from the graph at that moment.</p>
		<p v-if="!jedxCompanionAskDmePromptList.length" class="ask-dme-note" data-testid="ask-dme-none">No prompt has passed the five-run consistency test yet.</p>
		<ul class="ask-dme-list">
			<li v-for="askDmePrompt in jedxCompanionAskDmePromptList" :key="askDmePrompt.jedxObjectName" class="ask-dme-item" :data-testid="`ask-dme-${askDmePrompt.jedxObjectName}`">
				<NuxtLink :to="explorerLinkOf(askDmePrompt)" class="ask-dme-link">Ask about <code>{{ askDmePrompt.jedxObjectName }}</code> ›</NuxtLink>
				<span class="ask-dme-prompt">“{{ askDmePrompt.promptText }}”</span>
				<span class="ask-dme-record">{{ askDmePrompt.consistencyRecord.agreedRunCount }} of {{ askDmePrompt.consistencyRecord.runCount }} runs agreed on {{ askDmePrompt.consistencyRecord.goldenName }}, {{ askDmePrompt.consistencyRecord.testedOn }}</span>
			</li>
		</ul>
	</div>
</template>

<style scoped>
.ask-dme-note {
	margin: 0 0 8px;
	font-size: 14px;
	color: #4b5563;
}
.ask-dme-list {
	margin: 0;
	padding: 0;
	list-style: none;
	display: flex;
	flex-direction: column;
	gap: 10px;
}
.ask-dme-item {
	display: flex;
	flex-direction: column;
	gap: 2px;
	border: 1px solid #e3e7ef;
	border-radius: 10px;
	padding: 10px 12px;
	background: #fbfcfe;
}
.ask-dme-link {
	font-weight: 700;
	color: #072a6c;
	text-decoration: none;
}
.ask-dme-prompt {
	font-size: 14px;
}
.ask-dme-record {
	font-size: 12px;
	color: #6b7280;
}
</style>
