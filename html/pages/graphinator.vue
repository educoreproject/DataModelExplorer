<script setup>
import { useLoginStore } from '@/stores/loginStore';
import { useGraphinatorStore } from '@/stores/graphinatorStore';
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { marked } from 'marked';
import { parseMultipartContent, resolveCidReferences } from '~/composables/useMultipartContent.js';
import { vizLoading } from '~/composables/useVizRenderer.js';
import axios from 'axios';

// Configure marked for streaming-friendly rendering
marked.setOptions({
	breaks: true,
	gfm: true,
});

const LoginStore = useLoginStore();
const graphStore = useGraphinatorStore();
const router = useRouter();
const route = useRoute();

// -------------------------------------------------------------------------
// Split stdout into response text and control HTML
//
// The AI model can embed <control>...</control> tags inline in its output.
// Everything inside those tags is routed to the right panel as raw HTML.
// Everything outside is rendered as markdown in the left STDOUT panel.
// During streaming, an unclosed <control> tag is buffered until it closes.

const splitContent = computed(() => {
	const raw = graphStore.stdout;
	if (!raw) return { response: '', control: '' };

	let response = '';
	let control = '';
	let lastIndex = 0;

	const controlTagRegex = /<control[^>]*>([\s\S]*?)<\/control>/g;
	let match;

	while ((match = controlTagRegex.exec(raw)) !== null) {
		response += raw.slice(lastIndex, match.index);
		control += match[1];
		lastIndex = match.index + match[0].length;
	}

	// Handle remaining text after last complete block
	const remaining = raw.slice(lastIndex);

	// Check for unclosed <control> tag — buffer it until it closes
	const unclosedIndex = remaining.indexOf('<control>');
	if (unclosedIndex !== -1) {
		response += remaining.slice(0, unclosedIndex);
	} else {
		response += remaining;
	}

	return { response, control };
});

const renderedStdout = computed(() => {
	if (!splitContent.value.response) return '';
	return marked.parse(splitContent.value.response);
});

// Persist control HTML in store so it survives across turns.
// Detects multipart JSON and resolves CID references for embedded diagrams.
watch(
	() => splitContent.value.control,
	async (newControl) => {
		if (!newControl) return;

		const multipart = parseMultipartContent(newControl);

		if (multipart) {
			// Multipart JSON: inject HTML then resolve CID references
			multipartMode.value = true;

			await nextTick(); // Ensure DOM is ready

			if (controlPanelRef.value) {
				controlPanelRef.value.innerHTML = multipart.html;
				const errors = await resolveCidReferences(
					controlPanelRef.value,
					multipart.attachments
				);
				if (errors.length > 0) {
					console.warn('[Graphinator] CID resolution errors:', errors);
				}
			}

			// Also store the raw for form scraping compatibility
			graphStore.controlHtml = multipart.html;
		} else {
			// Legacy raw HTML
			multipartMode.value = false;
			graphStore.controlHtml = newControl;
		}
	}
);

// -------------------------------------------------------------------------
// Tab configuration

const activeTab = ref('ceds');

const graphinatorTabs = [
	{ label: 'CEDS', value: 'ceds', icon: 'mdi-graph' },
];

// -------------------------------------------------------------------------
// User input with history

const promptText = ref('');
const promptHistory = ref([]);
const historyIndex = ref(-1);
const promptInput = ref(null);

// -------------------------------------------------------------------------
// Settings panel

const showSettings = ref(false);

const modelOptions = [
	{ title: 'Opus', value: 'opus' },
	{ title: 'Sonnet', value: 'sonnet' },
	{ title: 'Haiku', value: 'haiku' },
];

const perspectiveOptions = [0, 1, 2, 3, 4, 5, 6, 7];

// availableTools comes from the server via WebSocket config channel (graphStore.availableTools)

const promptOptions = [
	{ title: 'Graphinator', value: 'graphinator' },
	{ title: 'Default', value: 'default' },
	{ title: 'White Paper', value: 'whitePaper' },
	{ title: 'Interrogator', value: 'interrogator' },
];

// -------------------------------------------------------------------------
// Keyboard handling

const handleKeydown = (event) => {
	if (event.key === 'Enter' && !event.shiftKey) {
		event.preventDefault();
		submitPrompt();
		return;
	}
	if (event.key === 'ArrowUp' && promptText.value === '') {
		event.preventDefault();
		if (promptHistory.value.length === 0) return;
		if (historyIndex.value < promptHistory.value.length - 1) {
			historyIndex.value++;
		}
		promptText.value = promptHistory.value[historyIndex.value];
	}
	if (event.key === 'ArrowDown' && historyIndex.value >= 0) {
		event.preventDefault();
		historyIndex.value--;
		promptText.value = historyIndex.value >= 0 ? promptHistory.value[historyIndex.value] : '';
	}
};

// -------------------------------------------------------------------------
// Panel refs for auto-scroll

const stdoutPanel = ref(null);
const stderrPanel = ref(null);
const controlPanel = ref(null);
const controlPanelRef = ref(null);
const outputRow = ref(null);
const multipartMode = ref(false);

// -------------------------------------------------------------------------
// Download support

const generateAiFilename = async (snippet) => {
	const prompt = `Given this content, suggest a short camelCase filename (no extension, max 40 chars). Reply with ONLY the filename, nothing else.\n\n${snippet}`;
	try {
		const response = await axios.post(
			'/api/askmilo-utility',
			{ prompt, model: 'haiku' },
			{ headers: { ...LoginStore.getAuthTokenProperty } },
		);
		return response.data.response;
	} catch (err) {
		console.warn('[Graphinator] AI filename generation failed:', err);
		return null;
	}
};


// -------------------------------------------------------------------------
// Draggable column divider

const leftPanelPct = ref(50);
const dragging = ref(false);

const startDrag = (event) => {
	event.preventDefault();
	dragging.value = true;
	document.addEventListener('mousemove', onDrag);
	document.addEventListener('mouseup', stopDrag);
};

const onDrag = (event) => {
	if (!outputRow.value) return;
	const rect = outputRow.value.getBoundingClientRect();
	const pct = ((event.clientX - rect.left) / rect.width) * 100;
	leftPanelPct.value = Math.min(85, Math.max(15, pct));
};

const stopDrag = () => {
	dragging.value = false;
	document.removeEventListener('mousemove', onDrag);
	document.removeEventListener('mouseup', stopDrag);
};

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

watch(() => graphStore.controlHtml, () => {
	nextTick(() => {
		if (controlPanel.value) {
			controlPanel.value.scrollTop = controlPanel.value.scrollHeight;
		}
	});
});


// -------------------------------------------------------------------------
// Heartbeat staleness tracking

const now = ref(Date.now());
let nowTimer = null;

const heartbeatStatus = computed(() => {
	if (!graphStore.loading) return '';
	if (!graphStore.lastHeartbeat) return 'waiting...';
	const gap = Math.round((now.value - graphStore.lastHeartbeat) / 1000);
	if (gap < 10) return 'active';
	return `no activity ${gap}s`;
});

const heartbeatStale = computed(() => {
	if (!graphStore.loading || !graphStore.lastHeartbeat) return false;
	return (now.value - graphStore.lastHeartbeat) > 15000;
});

// -------------------------------------------------------------------------
// Auth guard + WebSocket connection

onMounted(() => {
	if (!LoginStore.validUser) {
		router.push({ path: '/', query: { redirect: route.fullPath } });
		return;
	}
	// Delay WebSocket connect so the page renders first (debug: lets you see console errors)
	setTimeout(() => graphStore.connect(), 1500);
	// Focus the input field after WebSocket connect delay
	setTimeout(() => {
		if (promptInput.value) promptInput.value.focus();
	}, 1600);
});

onUnmounted(() => {
	graphStore.disconnect();
	if (nowTimer) clearInterval(nowTimer);
});

watch(() => graphStore.loading, (loading) => {
	if (loading) {
		nowTimer = setInterval(() => { now.value = Date.now(); }, 1000);
	} else {
		if (nowTimer) { clearInterval(nowTimer); nowTimer = null; }
	}
});

// -------------------------------------------------------------------------
// Scrape form values from control panel on submit

const scrapeControlData = () => {
	if (!controlPanel.value) return null;
	const forms = controlPanel.value.querySelectorAll('form');
	const inputs = controlPanel.value.querySelectorAll('input, select, textarea');
	if (forms.length === 0 && inputs.length === 0) return null;

	const data = {};

	// Scrape named forms
	forms.forEach((form) => {
		const name = form.getAttribute('name') || form.id || form.dataset.name || 'default';
		data[name] = Object.fromEntries(new FormData(form));
	});

	// Scrape loose inputs not inside a form
	inputs.forEach((el) => {
		if (el.closest('form')) return; // already captured above
		const key = el.name || el.id || el.dataset.name;
		if (!key) return;
		if (!data['default']) data['default'] = {};
		if (el.type === 'checkbox' || el.type === 'radio') {
			data['default'][key] = el.checked;
		} else {
			data['default'][key] = el.value;
		}
	});

	return Object.keys(data).length > 0 ? data : null;
};

// -------------------------------------------------------------------------
// Submit handler

const submitPrompt = () => {
	const text = promptText.value.trim();
	if (!text) return;
	promptHistory.value.unshift(text);
	historyIndex.value = -1;
	promptText.value = '';
	const controlData = scrapeControlData();
	const prompt = controlData
		? `[CONTROL_STATE: ${JSON.stringify(controlData)}]\n\n${text}`
		: text;
	graphStore.sendPrompt(prompt);
};

const onNewSessionToggle = (checked) => {
	if (checked) {
		graphStore.startNewSession();
		multipartMode.value = false;
		if (controlPanelRef.value) {
			controlPanelRef.value.innerHTML = '';
		}
	}
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
				<!-- Top row: left column (stdout + stderr) | divider | right panel -->
				<div ref="outputRow" class="output-row" :class="{ 'is-dragging': dragging }">
					<div class="left-column" :style="{ flex: `0 0 calc(${leftPanelPct}% - 4px)` }">
						<div class="output-panel" :class="{ 'panel-loading': graphStore.loading }" style="flex: 1; min-height: 0;">
							<div class="panel-header">
								STDOUT
								<DownloadButton
									:content="splitContent.response"
									:generate-filename="generateAiFilename"
									fallback-name="graphinator-output"
									file-type="md"
									title="Download as Markdown"
								/>
								<span v-if="graphStore.loading" class="loading-indicator" :class="{ 'loading-stale': heartbeatStale }">
								Still working. Don't give up. ({{ heartbeatStatus }})
							</span>
							</div>
							<div ref="stdoutPanel" class="panel-content prose">
								<div v-if="splitContent.response" v-html="renderedStdout"></div>
								<div v-else class="welcome-text">
									<h2>Welcome to the Graphinator</h2>
									<p>Presently we have tools demonstrating:</p>
									<ol>
										<li><strong>Graph database integration</strong> &mdash; structured ontology lookup</li>
										<li><strong>External website as RAG source</strong> &mdash; live documentation search</li>
										<li><strong>Body of text files converted to an AI-searchable source</strong> &mdash; semantic vector search</li>
										<li><strong>Integration of HTML and diagrams in results</strong> &mdash; rich control panel rendering</li>
									</ol>
									<p>You can try these with these queries:</p>
									<ol>
										<li><em>Tell me about the CEDS student object</em></li>
										<li><em>What HTTP verbs are supported by the SIF Infrastructure?</em></li>
										<li><em>Is there any reason I should respect TQ?</em> <span style="font-size: 0.85em; color: #888;">(no really, do it)</span></li>
										<li><em>Draw a diagram of a circle and a square with an arrow pointing at the square. Show it with a caption that says, "Got the point?"</em></li>
									</ol>
								</div>
							</div>
						</div>
						<div class="output-panel stderr-panel">
							<div class="panel-header">STDERR</div>
							<div ref="stderrPanel" class="panel-content">
								<pre v-if="graphStore.stderr" v-html="graphStore.stderr"></pre>
								<span v-else class="text-medium-emphasis">Diagnostics...</span>
							</div>
						</div>
					</div>
					<div class="column-divider" @mousedown="startDrag"></div>
					<div class="output-panel" :style="{ flex: `0 0 calc(${100 - leftPanelPct}% - 4px)` }">
						<div class="panel-header">
							{{ graphStore.controlHtml ? 'CONTROL' : '' }}
							<DownloadButton
								v-if="graphStore.controlHtml"
								:content="graphStore.controlHtml"
								fallback-name="graphinator-control"
								file-type="html"
								title="Download as HTML"
							/>
						</div>
						<div ref="controlPanel" class="panel-content control-content">
							<div v-if="vizLoading" style="text-align: center; padding: 12px; color: #888;">
								Loading diagram renderer...
							</div>
							<div ref="controlPanelRef" v-show="multipartMode"></div>
							<div v-if="!multipartMode && graphStore.controlHtml" v-html="graphStore.controlHtml"></div>
							<span v-if="!multipartMode && !graphStore.controlHtml" class="text-medium-emphasis">No control content</span>
						</div>
					</div>
				</div>

				<!-- Bottom: input + controls side by side -->
				<div class="input-row">
					<v-textarea
						ref="promptInput"
						v-model="promptText"
						placeholder="Enter your prompt... (Shift+Enter for newline)"
						variant="outlined"
						rows="3"
						auto-grow
						hide-details
						@keydown="handleKeydown"
						class="input-field"
					/>
					<div class="input-controls">
						<div class="controls-row">
							<v-checkbox
								v-model="graphStore.settings.newSession"
								label="New Session"
								density="compact"
								@update:modelValue="onNewSessionToggle"
								hide-details
								color="primary"
								class="new-session-checkbox"
							/>
						</div>
						<div class="controls-row">
							<v-menu v-model="showSettings" :close-on-content-click="false" location="top">
								<template v-slot:activator="{ props }">
									<v-btn
										icon
										v-bind="props"
										variant="text"
										size="small"
										class="settings-btn"
										:color="showSettings ? 'primary' : undefined"
									>
										<v-icon>mdi-cog</v-icon>
									</v-btn>
								</template>
						<v-card min-width="340" max-width="420" class="settings-card">
							<v-card-title class="text-subtitle-1 font-weight-bold pb-1">
								Pipeline Settings
							</v-card-title>
							<v-card-text class="pt-2">
								<!-- Basic controls -->
								<v-select
									v-model="graphStore.settings.model"
									:items="modelOptions"
									label="Model"
									density="compact"
									variant="outlined"
									hide-details
									class="mb-3"
								/>
								<!-- All controls -->
								<div class="mt-2">
									<v-select
										v-model="graphStore.settings.agentModel"
										:items="modelOptions"
										label="Agent Model"
										density="compact"
										variant="outlined"
										hide-details
										class="mb-3"
									/>
									<div class="text-caption text-medium-emphasis mb-1">Tools</div>
									<div class="tools-grid mb-3">
										<v-checkbox
											v-for="tool in graphStore.availableTools"
											:key="tool"
											v-model="graphStore.settings.tools"
											:label="tool"
											:value="tool"
											density="compact"
											hide-details
											color="primary"
										/>
									</div>
									<v-select
										v-model="graphStore.settings.promptName"
										:items="promptOptions"
										label="Prompt"
										density="compact"
										variant="outlined"
										hide-details
										class="mb-3"
									/>
									<div class="d-flex align-center ga-3 mb-1">
										<v-select
											v-model="graphStore.settings.perspectives"
											:items="perspectiveOptions"
											label="Perspectives"
											density="compact"
											variant="outlined"
											hide-details
											style="max-width: 140px"
										/>
										<v-switch
											v-model="graphStore.settings.summarize"
											label="Summarize"
											density="compact"
											hide-details
											:disabled="graphStore.settings.perspectives === 0"
											color="primary"
										/>
									</div>
									<v-switch
										v-model="graphStore.settings.serialFanOut"
										label="Serial Fan-Out"
										density="compact"
										hide-details
										color="primary"
									/>
								</div>
								</v-card-text>
							</v-card>
							</v-menu>
							<v-btn
								color="primary"
								@click="submitPrompt"
								:loading="graphStore.loading"
								:disabled="!graphStore.connected || !promptText.trim()"
								size="large"
								class="ml-2 submit-btn"
							>
								Submit
							</v-btn>
						</div>
					</div>
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
	flex: 1;
	min-height: 0;
}

.output-row.is-dragging {
	cursor: col-resize;
	user-select: none;
}

.left-column {
	display: flex;
	flex-direction: column;
	min-height: 0;
	gap: 6px;
}

.output-panel {
	display: flex;
	flex-direction: column;
	border: 1px solid rgba(0, 0, 0, 0.12);
	border-radius: 4px;
	overflow: hidden;
	min-width: 0;
}

.stderr-panel {
	flex: 0 0 auto;
	max-height: 110px;
}

.panel-loading {
	border-color: #1976d2;
	animation: pulse-border 2s ease-in-out infinite;
}

@keyframes pulse-border {
	0%, 100% { border-color: #1976d2; }
	50% { border-color: #64b5f6; }
}

.loading-indicator {
	float: right;
	color: #d27619;
	font-weight: 400;
	font-style: italic;
	animation: pulse-text 2s ease-in-out infinite;
}

@keyframes pulse-text {
	0%, 100% { opacity: 1; }
	50% { opacity: 0.4; }
}

.loading-stale {
	color: #c62828;
	animation: none;
	font-weight: 600;
}

.column-divider {
	flex: 0 0 8px;
	cursor: col-resize;
	background: transparent;
	position: relative;
}

.column-divider::after {
	content: '';
	position: absolute;
	top: 0;
	bottom: 0;
	left: 3px;
	width: 2px;
	background: rgba(0, 0, 0, 0.12);
	transition: background 0.15s;
}

.column-divider:hover::after,
.is-dragging .column-divider::after {
	background: rgba(0, 0, 0, 0.4);
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

/* STDERR keeps raw pre styling */
.panel-content pre {
	font-family: 'Courier New', Courier, monospace;
	font-size: 0.85rem;
	line-height: 1.5;
	margin: 0;
	white-space: pre-wrap;
	word-wrap: break-word;
	color: #1a1a1a;
}

/* Prose styles for rendered markdown in STDOUT */
.prose :deep(h1) { font-size: 1.4rem; font-weight: 700; margin: 0.8em 0 0.4em; }
.prose :deep(h2) { font-size: 1.2rem; font-weight: 600; margin: 0.7em 0 0.3em; }
.prose :deep(h3) { font-size: 1.05rem; font-weight: 600; margin: 0.6em 0 0.3em; }
.prose :deep(p) { margin: 0.4em 0; line-height: 1.6; }
.prose :deep(ul), .prose :deep(ol) { margin: 0.4em 0; padding-left: 1.5em; }
.prose :deep(li) { margin: 0.2em 0; line-height: 1.5; }
.prose :deep(code) {
	font-family: 'Courier New', Courier, monospace;
	font-size: 0.85em;
	background: rgba(0, 0, 0, 0.06);
	padding: 0.15em 0.3em;
	border-radius: 3px;
}
.prose :deep(pre) {
	background: #2d2d2d;
	color: #f8f8f2;
	padding: 0.8em 1em;
	border-radius: 4px;
	overflow-x: auto;
	margin: 0.5em 0;
}
.prose :deep(pre code) {
	background: none;
	padding: 0;
	color: inherit;
}
.prose :deep(blockquote) {
	border-left: 3px solid rgba(0, 0, 0, 0.2);
	margin: 0.5em 0;
	padding: 0.3em 0.8em;
	color: #555;
}
.prose :deep(table) {
	border-collapse: collapse;
	margin: 0.5em 0;
	width: 100%;
}
.prose :deep(th), .prose :deep(td) {
	border: 1px solid rgba(0, 0, 0, 0.12);
	padding: 0.4em 0.6em;
	text-align: left;
}
.prose :deep(th) {
	background: #f0f0f0;
	font-weight: 600;
}
.prose :deep(hr) {
	border: none;
	border-top: 1px solid rgba(0, 0, 0, 0.12);
	margin: 0.8em 0;
}
.prose :deep(strong) { font-weight: 600; }
.prose :deep(a) { color: #1976d2; text-decoration: none; }
.prose :deep(a:hover) { text-decoration: underline; }

/* Control panel: style injected HTML form elements */
.control-content :deep(select),
.control-content :deep(input:not([type="submit"]):not([type="button"]):not([type="hidden"])),
.control-content :deep(textarea) {
	font-family: inherit;
	font-size: 0.9rem;
	padding: 4px 8px;
	border: 1px solid rgba(0, 0, 0, 0.2);
	border-radius: 4px;
	background: #fff;
	margin: 2px 0;
}

.control-content :deep(button),
.control-content :deep(input[type="submit"]) {
	font-family: inherit;
	font-size: 0.85rem;
	padding: 6px 16px;
	border: none;
	border-radius: 4px;
	background: #1976d2;
	color: #fff;
	cursor: pointer;
	margin: 4px 2px;
}

.control-content :deep(button:hover),
.control-content :deep(input[type="submit"]:hover) {
	background: #1565c0;
}

.control-content :deep(label) {
	display: inline-block;
	margin: 4px 8px 4px 0;
	font-size: 0.9rem;
}

.input-row {
	display: flex;
	align-items: stretch;
	padding-top: 12px;
	flex-shrink: 0;
	gap: 12px;
}

.input-field {
	flex: 1;
}

.input-controls {
	display: flex;
	flex-direction: column;
	justify-content: flex-end;
	flex: 0 0 auto;
	gap: 4px;
}

.controls-row {
	display: flex;
	align-items: center;
	justify-content: flex-end;
}

.new-session-checkbox {
	flex: 0 0 auto;
}

.settings-card {
	max-height: 500px;
	overflow-y: auto;
}

.settings-advanced :deep(.v-expansion-panel-title) {
	min-height: 36px;
	padding: 0 12px;
}

.tools-grid {
	display: grid;
	grid-template-columns: 1fr 1fr;
	gap: 0;
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

.control-content :deep(.cid-rendered-content) {
	margin: 12px 0;
	text-align: center;
	cursor: pointer;
}

.control-content :deep(.cid-rendered-content svg) {
	max-width: 100%;
	height: auto;
}

.control-content :deep(.cid-render-error) {
	margin: 8px 0;
}

.welcome-text {
	color: #555;
	padding: 8px 4px;
}

.welcome-text h2 {
	font-size: 1.3rem;
	font-weight: 600;
	color: #333;
	margin-bottom: 0.6em;
}

.welcome-text p {
	margin: 0.6em 0;
	line-height: 1.6;
}

.welcome-text ol {
	margin: 0.4em 0 0.8em;
	padding-left: 1.5em;
}

.welcome-text li {
	margin: 0.3em 0;
	line-height: 1.6;
}

.welcome-text em {
	color: #1976d2;
}

.control-content :deep(.cid-fullscreen) {
	position: fixed;
	top: 0;
	left: 0;
	width: 100vw;
	height: 100vh;
	background: rgba(255, 255, 255, 0.95);
	z-index: 1000;
	display: flex;
	align-items: center;
	justify-content: center;
	padding: 40px;
	cursor: zoom-out;
}

.control-content :deep(.cid-fullscreen svg) {
	max-width: 90vw;
	max-height: 90vh;
}
</style>
