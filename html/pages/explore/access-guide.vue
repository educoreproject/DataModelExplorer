<script setup>
useHead({
	title: 'MCP Access Guide',
	meta: [{ name: 'description', content: 'Connect Google Gemini, Anthropic Claude or OpenAI ChatGPT to the EDUcore standards graph through its MCP server (https://ed-core.org/mcp), and sign in with an EDUcore account.' }],
});

// The one address every AI client connects to (BD 2026-11-17)
const MCP_SERVER_URL = 'https://ed-core.org/mcp';
const SUPPORT_EMAIL_ADDRESS = 'support@educore.org';

// Adding EDUcore to the three big AI assistants: the same server URL in each, through the app's own connector settings,
// or a one-line command in the provider's command-line agent. Menu names follow each provider's help pages as of November 2026.
const assistantSetupList = [
	{
		name: 'Google Gemini',
		icon: 'mdi-google',
		appStepList: [
			'Open gemini.google.com and go to Settings → Connected apps.',
			'Choose to add a custom app (an MCP server).',
			`Name it EDUcore and paste the server URL: ${MCP_SERVER_URL}`,
			'Save, then choose Connect.',
		],
		appNote: 'Custom apps are rolling out to personal Google accounts and may not be on yours yet; Gemini CLI works today.',
		cliName: 'Gemini CLI',
		cliCommand: `gemini mcp add --transport http educore-standards ${MCP_SERVER_URL}`,
		cliAfter: 'Inside Gemini CLI, run /mcp auth educore-standards to sign in.',
		helpUrl: 'https://geminicli.com/docs/tools/mcp-server/',
		helpText: 'Gemini CLI MCP guide',
	},
	{
		name: 'Anthropic Claude',
		icon: 'mdi-asterisk',
		appStepList: [
			'Open claude.ai (or Claude Desktop) and go to Settings → Connectors.',
			'Choose Add custom connector.',
			`Name it EDUcore and paste the server URL: ${MCP_SERVER_URL}`,
			'Choose Add, then Connect.',
		],
		appNote: 'On Team and Enterprise plans an owner adds the connector first; each member then connects.',
		cliName: 'Claude Code',
		cliCommand: `claude mcp add --transport http educore-standards ${MCP_SERVER_URL}`,
		cliAfter: 'Inside Claude Code, run /mcp and choose educore-standards to sign in.',
		helpUrl: 'https://claude.com/docs/connectors/custom/remote-mcp',
		helpText: 'Claude custom connector guide',
	},
	{
		name: 'OpenAI ChatGPT',
		icon: 'mdi-creation',
		appStepList: [
			'Open chatgpt.com and go to Settings → Apps & Connectors → Advanced settings.',
			'Turn on Developer mode.',
			`Back in Apps & Connectors, choose Create, name it EDUcore and paste the server URL: ${MCP_SERVER_URL}`,
			'Set Authentication to OAuth, tick “I trust this application”, then Create.',
		],
		appNote: 'Developer mode is on paid ChatGPT plans; in a chat, pick EDUcore from the tools (+) menu.',
		cliName: 'Codex CLI',
		cliCommand: `codex mcp add educore-standards --url ${MCP_SERVER_URL}`,
		cliAfter: 'Then run codex mcp login educore-standards to sign in.',
		helpUrl: 'https://platform.openai.com/docs/guides/developer-mode',
		helpText: 'ChatGPT developer mode guide',
	},
];

const signInStepList = [
	{ head: 'Your assistant opens EDUcore', text: 'The first time it connects, your assistant opens an EDUcore sign-in page in your browser.' },
	{ head: 'Sign in with your EDUcore account', text: 'Enter your EDUcore username and password. Your password goes only to EDUcore, never to the AI provider.' },
	{ head: 'Back to your conversation', text: 'Approve the connection and you return to your assistant, which can now read the EDUcore graph (read-only).' },
];

const claudeCodeConfig = `{
  "mcpServers": {
    "educore-standards": {
      "type": "http",
      "url": "https://ed-core.org/mcp"
    }
  }
}`;

const mcpConfigExample = `{
  "mcpServers": {
    "educore-standards": {
      "type": "http",
      "url": "https://ed-core.org/mcp"
    }
  }
}`;

</script>

<template>
	<v-container class="py-8" style="max-width: 960px;">
		<!-- Page header -->
		<h1 class="text-h4 font-weight-bold text-primary mb-2">MCP Access Guide</h1>
		<p class="text-body-1 text-medium-emphasis mb-8">
			Connect your AI assistant to the EDUcore standards graph, so it can answer questions about education data standards from the graph itself.
		</p>

		<!-- ═══════════════════════════════════════════════════════════ -->
		<!-- MCP (AI agent access) -->
		<!-- ═══════════════════════════════════════════════════════════ -->
		<div class="mb-12">
			<p class="text-body-1 mb-4">
				The EDUcore knowledge graph is exposed as a
				<a href="https://modelcontextprotocol.io" target="_blank">Model Context Protocol</a> (MCP) server.
				This lets AI tools like Claude Desktop, Claude Code, Cursor, or any MCP-compatible client
				query the graph directly as part of a conversation.
			</p>

			<v-alert type="info" variant="tonal" density="compact" class="mb-4">
				The MCP server is read-only. All queries are validated before execution — no data can be modified through this interface.
			</v-alert>

			<!-- Add EDUcore to Gemini, Claude or ChatGPT: the same server URL in all three -->
			<h3 class="text-subtitle-1 font-weight-bold mb-2">Add EDUcore to your AI assistant</h3>
			<p class="text-body-2 text-medium-emphasis mb-3">
				Every assistant connects to the same EDUcore server address. Paste it into your assistant's connector settings,
				or run the one-line command in its command-line tool:
			</p>
			<pre class="code-block mb-4" data-testid="mcp-server-url">{{ MCP_SERVER_URL }}</pre>

			<v-row class="mb-2" data-testid="mcp-assistant-columns">
				<v-col v-for="assistant in assistantSetupList" :key="assistant.name" cols="12" md="4" class="d-flex">
					<v-card variant="outlined" class="assistant-card flex-grow-1 d-flex flex-column">
						<v-card-title class="d-flex align-center ga-2 text-subtitle-1 font-weight-bold">
							<v-icon :icon="assistant.icon" size="20" color="primary" />
							{{ assistant.name }}
						</v-card-title>
						<v-card-text class="d-flex flex-column flex-grow-1">
							<div class="text-overline text-medium-emphasis">In the app</div>
							<ol class="assistant-steps text-body-2 mb-2">
								<li v-for="oneStep in assistant.appStepList" :key="oneStep">{{ oneStep }}</li>
							</ol>
							<p class="text-caption text-medium-emphasis mb-3">{{ assistant.appNote }}</p>

							<div class="text-overline text-medium-emphasis">Or in {{ assistant.cliName }}</div>
							<pre class="code-block code-block--wrap mb-2">{{ assistant.cliCommand }}</pre>
							<p class="text-caption text-medium-emphasis mb-3">{{ assistant.cliAfter }}</p>

							<a :href="assistant.helpUrl" target="_blank" rel="noopener" class="text-body-2 mt-auto">
								{{ assistant.helpText }} <v-icon icon="mdi-open-in-new" size="14" />
							</a>
						</v-card-text>
					</v-card>
				</v-col>
			</v-row>
			<p class="text-caption text-medium-emphasis mb-5">
				Menu names change as the providers update their apps; if a step doesn't match, the provider's guide linked in each column has the current path.
			</p>

			<!-- What happens when the assistant first connects -->
			<v-card variant="tonal" color="primary" class="mb-5" data-testid="mcp-sign-in">
				<v-card-text class="pa-5">
					<h3 class="text-subtitle-1 font-weight-bold mb-3">Then EDUcore asks you to sign in</h3>
					<v-row dense>
						<v-col v-for="(oneStep, stepIndex) in signInStepList" :key="oneStep.head" cols="12" md="4">
							<div class="d-flex align-start ga-2">
								<v-avatar color="primary" size="24" class="flex-shrink-0">
									<span class="text-caption font-weight-bold" style="color: #fff;">{{ stepIndex + 1 }}</span>
								</v-avatar>
								<div>
									<div class="text-body-2 font-weight-bold">{{ oneStep.head }}</div>
									<div class="text-body-2">{{ oneStep.text }}</div>
								</div>
							</div>
						</v-col>
					</v-row>
					<p class="text-body-2 mt-4 mb-0">
						<strong>No account yet?</strong> Email
						<a :href="`mailto:${SUPPORT_EMAIL_ADDRESS}?subject=EDUcore%20account%20request`">{{ SUPPORT_EMAIL_ADDRESS }}</a>
						to ask for one.
					</p>
				</v-card-text>
			</v-card>

			<!-- MCP Server Info -->
			<v-card variant="outlined" class="mb-5">
				<v-card-title class="text-subtitle-1 font-weight-bold">Server Details</v-card-title>
				<v-card-text>
					<v-table density="compact">
						<tbody>
							<tr>
								<td class="font-weight-medium" style="width: 160px;">Server name</td>
								<td><code>educore-standards</code></td>
							</tr>
							<tr>
								<td class="font-weight-medium">Transport</td>
								<td>Streamable HTTP</td>
							</tr>
							<tr>
								<td class="font-weight-medium">Endpoint</td>
								<td><code>/mcp</code></td>
							</tr>
							<tr>
								<td class="font-weight-medium">Authentication</td>
								<td>
									educore.org login required &mdash; request credentials from
									<a href="mailto:support@educore.org">support@educore.org</a>
								</td>
							</tr>
							<tr>
								<td class="font-weight-medium">Graph contents</td>
								<td>CEDS v14 and SIF education data standards with cross-standard mappings</td>
							</tr>
						</tbody>
					</v-table>
				</v-card-text>
			</v-card>

			<!-- Tools -->
			<h3 class="text-subtitle-1 font-weight-bold mb-3">Available Tools</h3>

			<v-card variant="outlined" class="mb-3">
				<v-card-text class="pa-5">
					<div class="d-flex align-center mb-2">
						<v-chip size="small" color="primary" variant="flat" class="mr-2">TOOL</v-chip>
						<span class="text-subtitle-2 font-weight-bold">getSchema</span>
					</div>
					<p class="text-body-2 text-medium-emphasis mb-0">
						Returns the full knowledge graph schema: node labels, relationship types, properties on each node type,
						and example Cypher queries. Call this first so the AI agent understands the graph structure before writing queries.
					</p>
				</v-card-text>
			</v-card>

			<v-card variant="outlined" class="mb-5">
				<v-card-text class="pa-5">
					<div class="d-flex align-center mb-2">
						<v-chip size="small" color="primary" variant="flat" class="mr-2">TOOL</v-chip>
						<span class="text-subtitle-2 font-weight-bold">cypherQuery</span>
					</div>
					<p class="text-body-2 text-medium-emphasis mb-3">
						Execute a read-only Cypher query against the graph. Returns results as JSON.
						Use parameterized queries (<code>$param</code> syntax) when filtering by user-provided values.
					</p>
					<div class="text-caption font-weight-bold text-medium-emphasis mb-1">Parameters</div>
					<v-table density="compact">
						<tbody>
							<tr>
								<td class="font-weight-medium" style="width: 100px;"><code>query</code></td>
								<td>A Cypher query string (required)</td>
							</tr>
							<tr>
								<td class="font-weight-medium"><code>params</code></td>
								<td>Named parameters object, e.g. <code>{ "nodeId": "001234" }</code> (optional)</td>
							</tr>
						</tbody>
					</v-table>
				</v-card-text>
			</v-card>

			<!-- Claude Code setup -->
			<h3 class="text-subtitle-1 font-weight-bold mb-3">Setup: Claude Code</h3>
			<p class="text-body-2 text-medium-emphasis mb-3">
				<a href="https://claude.ai/claude-code" target="_blank">Claude Code</a> is Anthropic's CLI agent for software engineering.
				To connect it to the EDUcore knowledge graph, add the MCP server to your project settings:
			</p>

			<v-card variant="outlined" class="mb-4">
				<v-card-text class="pa-5">
					<div class="text-overline text-medium-emphasis mb-2">OPTION A &mdash; Via CLI (recommended)</div>
					<p class="text-body-2 text-medium-emphasis mb-3">
						Run this command in your project directory. Claude Code will add the server to your project's <code>.mcp.json</code>:
					</p>
					<pre class="code-block mb-0">claude mcp add educore-standards --transport http https://ed-core.org/mcp</pre>
				</v-card-text>
			</v-card>

			<v-card variant="outlined" class="mb-4">
				<v-card-text class="pa-5">
					<div class="text-overline text-medium-emphasis mb-2">OPTION B &mdash; Manual config</div>
					<p class="text-body-2 text-medium-emphasis mb-3">
						Add the following to your project's <code>.mcp.json</code> file (create it in your project root if it doesn't exist):
					</p>
					<pre class="code-block mb-0">{{ claudeCodeConfig }}</pre>
				</v-card-text>
			</v-card>

			<v-card variant="outlined" class="mb-5">
				<v-card-text class="pa-5">
					<div class="text-overline text-medium-emphasis mb-2">VERIFY IT WORKS</div>
					<p class="text-body-2 text-medium-emphasis mb-3">
						Once configured, start Claude Code and try a query:
					</p>
					<pre class="code-block mb-3">claude "Use the educore-standards MCP to show me the CEDS classes related to credentials"</pre>
					<p class="text-body-2 text-medium-emphasis mb-0">
						Claude will call <code>getSchema</code> to understand the graph, then write and execute Cypher queries
						to answer your question. You can ask follow-up questions in the same session &mdash; Claude retains context
						about the graph structure.
					</p>
				</v-card-text>
			</v-card>

			<h3 class="text-subtitle-1 font-weight-bold mb-3">Example Prompts for Claude Code</h3>
			<v-card variant="outlined" class="mb-5">
				<v-card-text class="pa-5">
					<ul class="text-body-2 text-medium-emphasis" style="list-style: none; padding: 0; margin: 0;">
						<li class="mb-2"><code>"Show me FS002 in the EDUcore ontology"</code></li>
						<li class="mb-2"><code>"What CEDS elements are needed for LER verification?"</code></li>
						<li class="mb-2"><code>"Find cross-standard mappings between SIF and CEDS for student enrollment"</code></li>
						<li class="mb-2"><code>"List all use cases in EDUcore that are incomplete"</code></li>
						<li class="mb-2"><code>"Compare the credential-related classes across CEDS, CTDL, and PESC"</code></li>
						<li><code>"What Ed-Fi entities map to CEDS assessment properties?"</code></li>
					</ul>
				</v-card-text>
			</v-card>

			<!-- Other MCP clients -->
			<h3 class="text-subtitle-1 font-weight-bold mb-3">Setup: Other MCP Clients</h3>
			<p class="text-body-2 text-medium-emphasis mb-3">
				For Claude Desktop, Cursor, or any MCP-compatible client, add the EDUcore server to your MCP configuration:
			</p>
			<pre class="code-block mb-3">{{ mcpConfigExample }}</pre>
			<p class="text-body-2 text-medium-emphasis mb-0">
				Once connected, the AI agent can call
				<code>getSchema</code> to learn the graph structure, then use <code>cypherQuery</code>
				to answer questions about education data standards, cross-standard mappings, and CEDS alignment.
			</p>
		</div>

		<!-- ═══════════════════════════════════════════════════════════ -->
		<!-- QUICK REFERENCE -->
		<!-- ═══════════════════════════════════════════════════════════ -->
		<div class="mb-8">
			<h2 class="text-h5 font-weight-bold mb-4">Quick Reference</h2>

			<v-table density="comfortable">
				<thead>
					<tr>
						<th>I want to...</th>
						<th>Go here</th>
					</tr>
				</thead>
				<tbody>
					<tr>
						<td class="text-body-2">Find which standards fit my scenario</td>
						<td>
							<v-btn variant="text" size="small" to="/explore/use-cases" prepend-icon="mdi-lightbulb-on-outline">
								Use Cases
							</v-btn>
						</td>
					</tr>
					<tr>
						<td class="text-body-2">Read a specific standard's details, burden, and sample payloads</td>
						<td>
							<v-btn variant="text" size="small" to="/explore/standards" prepend-icon="mdi-certificate-outline">
								Standards
							</v-btn>
						</td>
					</tr>
					<tr>
						<td class="text-body-2">Ask an AI about cross-standard mappings</td>
						<td>
							<v-btn variant="text" size="small" to="/dm/explorer" prepend-icon="mdi-robot-outline">
								AI Explorer
							</v-btn>
						</td>
					</tr>
					<tr>
						<td class="text-body-2">Let my AI agent query the knowledge graph</td>
						<td>
							<span class="text-body-2">Connect via MCP at <code>/mcp</code></span>
						</td>
					</tr>
				</tbody>
			</v-table>
		</div>
	</v-container>
</template>

<style scoped>
.code-block {
	background: #1e293b;
	color: #f8fafc;
	padding: 16px 20px;
	border-radius: 8px;
	font-size: 0.82rem;
	line-height: 1.6;
	overflow-x: auto;
	white-space: pre;
	font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
}

/* a command in a narrow column wraps instead of scrolling */
.code-block--wrap {
	white-space: pre-wrap;
	word-break: break-all;
	padding: 10px 12px;
	font-size: 0.76rem;
}

.assistant-steps {
	padding-left: 1.2em;
}

.assistant-steps li {
	margin-bottom: 4px;
}
</style>
