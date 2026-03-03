<script setup>
import { useLoginStore } from '@/stores/loginStore';
import { useGraphinatorStore } from '@/stores/graphinatorStore';
import { ref, onMounted, onUnmounted, nextTick, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';

const LoginStore = useLoginStore();
const graphStore = useGraphinatorStore();
const router = useRouter();
const route = useRoute();

// -------------------------------------------------------------------------
// Tab configuration

const activeTab = ref('ceds');

const graphinatorTabs = [
	{ label: 'CEDS', value: 'ceds', icon: 'mdi-graph' },
];

// -------------------------------------------------------------------------
// User input

const promptText = ref('');

// -------------------------------------------------------------------------
// Panel refs for auto-scroll

const stdoutPanel = ref(null);
const stderrPanel = ref(null);

watch(() => graphStore.stdout, () => {
	nextTick(() => {
		if (stdoutPanel.value) {
			stdoutPanel.value.scrollTop = stdoutPanel.value.scrollHeight;
		}
	});
});

watch(() => graphStore.stderr, () => {
	nextTick(() => {
		if (stderrPanel.value) {
			stderrPanel.value.scrollTop = stderrPanel.value.scrollHeight;
		}
	});
});

// -------------------------------------------------------------------------
// Auth guard + WebSocket connection

onMounted(() => {
	if (!LoginStore.validUser) {
		router.push({ path: '/', query: { redirect: route.fullPath } });
		return;
	}
	graphStore.connect();
});

onUnmounted(() => {
	graphStore.disconnect();
});

// -------------------------------------------------------------------------
// Submit handler

const submitPrompt = () => {
	const text = promptText.value.trim();
	if (!text) return;
	graphStore.sendPrompt(text);
};
</script>

<template>
	<v-app>
		<generalNavSub />
		<v-main style="padding-top: 65px">
			<SubPageNav v-model="activeTab" :tabs="graphinatorTabs" />

			<!-- ============================================================ -->
			<!-- CEDS TAB -->
			<!-- ============================================================ -->
			<v-container v-show="activeTab === 'ceds'" fluid class="pa-4 graphinator-container">
				<!-- Top row: stdout + stderr panels -->
				<div class="output-row">
					<div class="output-panel">
						<div class="panel-header">STDOUT</div>
						<div ref="stdoutPanel" class="panel-content">
							<pre v-if="graphStore.stdout">{{ graphStore.stdout }}</pre>
							<span v-else class="text-medium-emphasis">Response will appear here...</span>
						</div>
					</div>
					<div class="output-panel">
						<div class="panel-header">STDERR</div>
						<div ref="stderrPanel" class="panel-content">
							<pre v-if="graphStore.stderr">{{ graphStore.stderr }}</pre>
							<span v-else class="text-medium-emphasis">Diagnostics will appear here...</span>
						</div>
					</div>
				</div>

				<!-- Bottom row: user input -->
				<div class="input-row">
					<v-textarea
						v-model="promptText"
						placeholder="Enter your prompt..."
						variant="outlined"
						rows="3"
						auto-grow
						hide-details
						@keyup.ctrl.enter="submitPrompt"
						class="input-field"
					/>
					<v-btn
						color="primary"
						@click="submitPrompt"
						:loading="graphStore.loading"
						:disabled="!graphStore.connected || !promptText.trim()"
						size="large"
						class="ml-3 submit-btn"
					>
						Submit
					</v-btn>
				</div>

				<!-- Status alert -->
				<v-alert
					v-if="graphStore.statusMsg"
					type="warning"
					density="compact"
					class="mt-2"
					closable
					@click:close="graphStore.statusMsg = ''"
				>
					{{ graphStore.statusMsg }}
				</v-alert>

				<!-- Connection indicator -->
				<div class="connection-status">
					<v-chip
						:color="graphStore.connected ? 'success' : 'error'"
						size="small"
						variant="flat"
					>
						{{ graphStore.connected ? 'Connected' : 'Disconnected' }}
					</v-chip>
				</div>
			</v-container>
		</v-main>
	</v-app>
</template>

<style scoped>
.graphinator-container {
	display: flex;
	flex-direction: column;
	height: calc(100vh - 130px);
}

.output-row {
	display: flex;
	gap: 12px;
	flex: 1;
	min-height: 0;
}

.output-panel {
	flex: 1;
	display: flex;
	flex-direction: column;
	border: 1px solid rgba(0, 0, 0, 0.12);
	border-radius: 4px;
	overflow: hidden;
}

.panel-header {
	background: #f5f5f5;
	padding: 6px 12px;
	font-weight: 600;
	font-size: 0.8rem;
	text-transform: uppercase;
	letter-spacing: 0.5px;
	color: #666;
	border-bottom: 1px solid rgba(0, 0, 0, 0.12);
}

.panel-content {
	flex: 1;
	overflow-y: auto;
	padding: 12px;
	background: #f9f9f6;
	min-height: 0;
}

.panel-content pre {
	font-family: 'Courier New', Courier, monospace;
	font-size: 0.85rem;
	line-height: 1.5;
	margin: 0;
	white-space: pre-wrap;
	word-wrap: break-word;
	color: #1a1a1a;
}

.input-row {
	display: flex;
	align-items: flex-start;
	padding-top: 12px;
	flex-shrink: 0;
}

.input-field {
	flex: 1;
}

.submit-btn {
	align-self: stretch;
	min-height: 56px;
}

.connection-status {
	display: flex;
	justify-content: flex-end;
	padding-top: 8px;
	flex-shrink: 0;
}
</style>
