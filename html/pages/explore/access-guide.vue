<script setup>
const mcpConfigExample = `{
  "mcpServers": {
    "educore-standards": {
      "type": "url",
      "url": "https://your-server.example.com/mcp"
    }
  }
}`;

const cypherExample = `// Find all SIF objects that map to CEDS properties
MATCH (s:SifObject)-[r:MAPS_TO]->(c:CedsProperty)
RETURN s.name, c.name, r.confidence
LIMIT 25`;

const fetchExample = `// Query the knowledge graph via REST
const res = await fetch('/api/dmeCypherQuery', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    action: 'query',
    query: 'MATCH (n:CedsClass) RETURN n.name LIMIT 10',
    params: {}
  })
});
const data = await res.json();`;

const lookupExample = `// Browse top-level CEDS classes
GET /api/dmeLookup?level=topLevel&standard=ceds

// Get children of a specific node
GET /api/dmeLookup?level=children&standard=sif&nodeType=SifObject&nodeId=Student

// Search across standards
GET /api/dmeLookup?level=search&standard=ceds&nodeId=enrollment`;

const utilityExample = `// Quick AI-powered question about standards
const res = await fetch('/api/askmilo-utility', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    prompt: 'Compare CLR v2 and Open Badges v3 for workforce credentials',
    model: 'haiku',
    maxTokens: 2048
  })
});
const { response } = await res.json();`;
</script>

<template>
	<v-container class="py-8" style="max-width: 960px;">
		<!-- Page header -->
		<h1 class="text-h4 font-weight-bold text-primary mb-2">How to Access the Reference Library</h1>
		<p class="text-body-1 text-medium-emphasis mb-8">
			Three ways to explore education data standards: browse the site starting from use cases, connect an AI agent via MCP, or query the API directly.
		</p>

		<!-- ═══════════════════════════════════════════════════════════ -->
		<!-- APPROACH 1: USE-CASE-FIRST BROWSING -->
		<!-- ═══════════════════════════════════════════════════════════ -->
		<div class="mb-12">
			<div class="d-flex align-center mb-4">
				<v-avatar color="primary" size="36" class="mr-3">
					<span class="text-body-1 font-weight-bold" style="color: #fff;">1</span>
				</v-avatar>
				<h2 class="text-h5 font-weight-bold">Start from Use Cases (Recommended)</h2>
			</div>

			<p class="text-body-1 mb-4">
				The fastest way to find relevant standards is to start with <strong>what you're trying to accomplish</strong>, not the specs themselves.
				The site is organized around real-world education and workforce scenarios, and each one maps directly to the standards that support it.
			</p>

			<!-- Step cards -->
			<v-card variant="outlined" class="mb-4">
				<v-card-text class="pa-5">
					<div class="text-overline text-medium-emphasis mb-2">STEP 1</div>
					<h3 class="text-subtitle-1 font-weight-bold mb-2">Pick a topic</h3>
					<p class="text-body-2 text-medium-emphasis mb-3">
						Go to <strong>Explore &rarr; Topics</strong> in the sidebar. Topics are organized by value driver:
						learner mobility, workforce alignment, credential transparency, and more.
						Each topic shows how many use cases and value drivers it contains.
					</p>
					<v-btn variant="tonal" size="small" to="/explore/topics" prepend-icon="mdi-book-open-variant">
						Browse Topics
					</v-btn>
				</v-card-text>
			</v-card>

			<v-card variant="outlined" class="mb-4">
				<v-card-text class="pa-5">
					<div class="text-overline text-medium-emphasis mb-2">STEP 2</div>
					<h3 class="text-subtitle-1 font-weight-bold mb-2">Choose a use case</h3>
					<p class="text-body-2 text-medium-emphasis mb-3">
						Each topic contains specific scenarios like "Adult Learner LER Assembly" or "Disability Accommodations-Aware Record Sharing."
						Use cases are linked to GitHub issues for community discussion and tagged with their CEDS data domains.
					</p>
					<v-btn variant="tonal" size="small" to="/explore/use-cases" prepend-icon="mdi-lightbulb-on-outline">
						Browse Use Cases
					</v-btn>
				</v-card-text>
			</v-card>

			<v-card variant="outlined" class="mb-4">
				<v-card-text class="pa-5">
					<div class="text-overline text-medium-emphasis mb-2">STEP 3</div>
					<h3 class="text-subtitle-1 font-weight-bold mb-2">Review the Standards Map</h3>
					<p class="text-body-2 text-medium-emphasis mb-3">
						Inside each use case, the <strong>Standards Map</strong> tab shows which interoperability specifications
						are relevant, scored by how well they align with the use case's CEDS domains. Standards with full alignment
						are ranked higher than partial matches, and lower-burden specs surface first among ties.
					</p>
					<p class="text-body-2 text-medium-emphasis mb-3">
						Select the standards you want to work with, then click <strong>"Create my implementation plan"</strong>
						to generate a tailored plan via the AI Explorer. You'll pick a persona (School Admin, Developer, Vendor, etc.)
						so the plan speaks to your role.
					</p>
				</v-card-text>
			</v-card>

			<v-card variant="outlined" class="mb-4">
				<v-card-text class="pa-5">
					<div class="text-overline text-medium-emphasis mb-2">ALSO AVAILABLE</div>
					<h3 class="text-subtitle-1 font-weight-bold mb-2">Browse all standards directly</h3>
					<p class="text-body-2 text-medium-emphasis mb-3">
						If you already know what you're looking for, the <strong>Standards</strong> page lists all specifications
						grouped by category. Each entry includes implementation burden, access level, equity considerations,
						sample payloads, and links to technical documentation.
					</p>
					<v-btn variant="tonal" size="small" to="/explore/standards" prepend-icon="mdi-certificate-outline">
						Browse Standards
					</v-btn>
				</v-card-text>
			</v-card>
		</div>

		<!-- ═══════════════════════════════════════════════════════════ -->
		<!-- APPROACH 2: MCP (AI Agent Access) -->
		<!-- ═══════════════════════════════════════════════════════════ -->
		<div class="mb-12">
			<div class="d-flex align-center mb-4">
				<v-avatar color="primary" size="36" class="mr-3">
					<span class="text-body-1 font-weight-bold" style="color: #fff;">2</span>
				</v-avatar>
				<h2 class="text-h5 font-weight-bold">Connect via MCP (AI Agent Access)</h2>
			</div>

			<p class="text-body-1 mb-4">
				The EDUcore knowledge graph is exposed as a
				<a href="https://modelcontextprotocol.io" target="_blank">Model Context Protocol</a> (MCP) server.
				This lets AI tools like Claude Desktop, Claude Code, Cursor, or any MCP-compatible client
				query the graph directly as part of a conversation.
			</p>

			<v-alert type="info" variant="tonal" density="compact" class="mb-5">
				The MCP server is read-only. All queries are validated before execution — no data can be modified through this interface.
			</v-alert>

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

			<!-- Configuration example -->
			<h3 class="text-subtitle-1 font-weight-bold mb-3">Configuration</h3>
			<p class="text-body-2 text-medium-emphasis mb-3">
				Add the EDUcore MCP server to your client's configuration. For Claude Desktop or Claude Code,
				add this to your MCP settings:
			</p>
			<pre class="code-block mb-3">{{ mcpConfigExample }}</pre>
			<p class="text-body-2 text-medium-emphasis mb-0">
				Replace the URL with your server's address. Once connected, the AI agent can call
				<code>getSchema</code> to learn the graph structure, then use <code>cypherQuery</code>
				to answer questions about education data standards, cross-standard mappings, and CEDS alignment.
			</p>
		</div>

		<!-- ═══════════════════════════════════════════════════════════ -->
		<!-- APPROACH 3: REST API -->
		<!-- ═══════════════════════════════════════════════════════════ -->
		<div class="mb-12">
			<div class="d-flex align-center mb-4">
				<v-avatar color="primary" size="36" class="mr-3">
					<span class="text-body-1 font-weight-bold" style="color: #fff;">3</span>
				</v-avatar>
				<h2 class="text-h5 font-weight-bold">Query the REST API</h2>
			</div>

			<p class="text-body-1 mb-4">
				For programmatic access, the server exposes REST endpoints for querying the knowledge graph,
				browsing the data model tree, and running AI-powered questions.
			</p>

			<!-- Cypher Query endpoint -->
			<v-card variant="outlined" class="mb-4">
				<v-card-title class="d-flex align-center ga-2 text-subtitle-1 font-weight-bold">
					<v-chip size="x-small" color="success" variant="flat">POST</v-chip>
					/api/dmeCypherQuery
				</v-card-title>
				<v-card-text>
					<p class="text-body-2 text-medium-emphasis mb-3">
						Execute read-only Cypher queries directly against the knowledge graph.
						Same engine as the MCP <code>cypherQuery</code> tool.
					</p>
					<pre class="code-block mb-3">{{ fetchExample }}</pre>
					<p class="text-body-2 text-medium-emphasis mb-0">
						Also supports <code>GET /api/dmeCypherQuery?action=schema</code> to retrieve the graph schema.
					</p>
				</v-card-text>
			</v-card>

			<!-- Lookup endpoint -->
			<v-card variant="outlined" class="mb-4">
				<v-card-title class="d-flex align-center ga-2 text-subtitle-1 font-weight-bold">
					<v-chip size="x-small" color="info" variant="flat">GET</v-chip>
					/api/dmeLookup
				</v-card-title>
				<v-card-text>
					<p class="text-body-2 text-medium-emphasis mb-3">
						Browse the data model as a tree. This is the same endpoint that powers the Crosswalk tool in the UI.
						Navigate by level: list standards, get top-level nodes, drill into children, or search.
					</p>
					<pre class="code-block mb-0">{{ lookupExample }}</pre>
				</v-card-text>
			</v-card>

			<!-- AI Utility endpoint -->
			<v-card variant="outlined" class="mb-4">
				<v-card-title class="d-flex align-center ga-2 text-subtitle-1 font-weight-bold">
					<v-chip size="x-small" color="warning" variant="flat">POST</v-chip>
					/api/askmilo-utility
				</v-card-title>
				<v-card-text>
					<p class="text-body-2 text-medium-emphasis mb-3">
						A lightweight AI relay for quick, single-turn questions about standards.
						Accepts a prompt and optional model selection (<code>haiku</code>, <code>sonnet</code>, or <code>opus</code>).
					</p>
					<pre class="code-block mb-0">{{ utilityExample }}</pre>
				</v-card-text>
			</v-card>

			<!-- WebSocket -->
			<v-card variant="outlined" class="mb-4">
				<v-card-title class="d-flex align-center ga-2 text-subtitle-1 font-weight-bold">
					<v-chip size="x-small" color="secondary" variant="flat">WS</v-chip>
					/ws/explorer
				</v-card-title>
				<v-card-text>
					<p class="text-body-2 text-medium-emphasis mb-3">
						WebSocket endpoint for the full AI Explorer experience. Supports streaming responses, multi-perspective
						chorus mode, tool use, and session persistence. This is what powers the AI Explorer tool in the UI.
					</p>
					<p class="text-body-2 text-medium-emphasis mb-0">
						Send a JSON message with <code>type: "prompt"</code> and <code>text</code> to start a query.
						The server streams back responses on <code>stdout</code>, <code>stderr</code>, and <code>done</code> channels.
						See the <strong>AI Explorer</strong> in the Tools section for an interactive version.
					</p>
				</v-card-text>
			</v-card>
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
						<td class="text-body-2">Browse CEDS and SIF element trees side by side</td>
						<td>
							<v-btn variant="text" size="small" to="/dm/lookup" prepend-icon="mdi-swap-horizontal">
								Crosswalk
							</v-btn>
						</td>
					</tr>
					<tr>
						<td class="text-body-2">Ask an AI about cross-standard mappings</td>
						<td>
							<v-btn variant="text" size="small" to="/dm/personas" prepend-icon="mdi-robot-outline">
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
					<tr>
						<td class="text-body-2">Query the graph programmatically</td>
						<td>
							<span class="text-body-2"><code>POST /api/dmeCypherQuery</code></span>
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
</style>
