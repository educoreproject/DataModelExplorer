'use strict';

// providerRegistry.js - Config-driven tool provider registry
// Loads provider.json manifests from an explicit list of enabled providers.
// Each enabled entry is either a bare name (resolved against basePath) or
// a full path (starts with /). No directory scanning.
// CJS module.

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ---------------------------------------------------------------------
// loadManifestFromPath - Load and validate a single provider.json

const loadManifestFromPath = (manifestPath) => {
	if (!fs.existsSync(manifestPath)) {
		console.error(`[providerRegistry] Manifest not found: ${manifestPath}`);
		return null;
	}
	try {
		const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
		const providerKey = (manifest.providerName || '').toLowerCase();
		if (!providerKey) {
			console.error(`[providerRegistry] Skipping ${manifestPath}: missing providerName`);
			return null;
		}
		return manifest;
	} catch (err) {
		console.error(`[providerRegistry] Failed to load ${manifestPath}: ${err.message}`);
		return null;
	}
};

// ---------------------------------------------------------------------
// resolveManifestPath - Given an enabled entry, produce the provider.json path
//
// If the entry starts with '/', it is a full path to a provider directory.
// Otherwise it is a bare name resolved as basePath/name/provider.json.

const resolveManifestPath = (entry, basePath) => {
	if (entry.startsWith('/')) {
		// Full path — expect provider.json inside the directory
		return path.join(entry, 'provider.json');
	}
	if (!basePath) {
		console.error(`[providerRegistry] Cannot resolve bare name "${entry}" — no basePath configured`);
		return null;
	}
	return path.join(basePath, entry, 'provider.json');
};

// ---------------------------------------------------------------------
// createProviderRegistry - Build registry from explicit enabled list
//
// config: { basePath, enabled, suppressedTools }
//   basePath: default directory for bare-name provider resolution
//   enabled: array of provider entries (bare names or full paths)
//   suppressedTools: array of provider names to exclude

const createProviderRegistry = (config) => {
	const providers = {}; // providerName (lowercase) -> manifest data
	const providerDirs = {}; // providerName (lowercase) -> directory path
	const toolIndex = {}; // tool definition name -> { provider, toolEntry }

	const basePath = (config && config.basePath) || '';
	const enabledEntries = (config && config.enabled) || [];
	const suppressedTools = (config && config.suppressedTools) || [];

	if (enabledEntries.length === 0) {
		return buildRegistryInterface(providers, toolIndex);
	}

	// Normalize suppressed tool names to lowercase for matching
	const suppressedSet = suppressedTools && suppressedTools.length > 0
		? new Set(suppressedTools.map(t => t.toLowerCase()))
		: null;

	// Load each enabled provider
	for (const entry of enabledEntries) {
		const manifestPath = resolveManifestPath(entry, basePath);
		if (!manifestPath) continue;

		const manifest = loadManifestFromPath(manifestPath);
		if (!manifest) continue;

		const providerKey = manifest.providerName.toLowerCase();

		// Skip if suppressed
		if (suppressedSet && suppressedSet.has(providerKey)) continue;

		providers[providerKey] = manifest;
		providerDirs[providerKey] = path.dirname(manifestPath);

		// Index each tool by its Anthropic definition name
		for (const toolEntry of manifest.tools || []) {
			const toolName = toolEntry.definition && toolEntry.definition.name;
			if (!toolName) {
				console.error(`[providerRegistry] Skipping tool in ${manifest.providerName}: missing definition.name`);
				continue;
			}
			toolIndex[toolName] = { provider: manifest, toolEntry, manifestDir: path.dirname(manifestPath) };
		}
	}

	// Run startup commands for providers that declare them
	for (const providerKey of Object.keys(providers)) {
		const manifest = providers[providerKey];
		if (!manifest.startup) continue;

		console.error(`[providerRegistry] Running startup for ${manifest.providerName}...`);
		const timeout = (manifest.startupTimeout || 30) * 1000;
		try {
			execSync(manifest.startup, { cwd: providerDirs[providerKey], timeout, stdio: ['pipe', 'inherit', 'inherit'] });
		} catch (err) {
			console.error(`[providerRegistry] Startup failed for ${manifest.providerName}: ${err.message}`);
		}
	}

	return buildRegistryInterface(providers, toolIndex);
};

// ---------------------------------------------------------------------
// buildRegistryInterface - Create the public API object from internal state

const buildRegistryInterface = (providers, toolIndex) => ({
	// hasProviders - Are any tool providers registered?
	hasProviders: () => Object.keys(providers).length > 0,

	// getToolDefinitions - Flat array of all Anthropic tool definition objects,
	// ready to pass directly to the Messages API tools parameter.
	getToolDefinitions: () => {
		const definitions = [];
		for (const providerKey of Object.keys(providers)) {
			for (const toolEntry of providers[providerKey].tools || []) {
				if (toolEntry.definition) {
					definitions.push(toolEntry.definition);
				}
			}
		}
		return definitions;
	},

	// getProviderForTool - Look up a tool by its Anthropic definition name
	// (e.g., 'sif_search', 'ceds_lookup'). Returns the cli mapping needed
	// for dispatch, or null if not found.
	getProviderForTool: (toolName) => {
		const entry = toolIndex[toolName];
		if (!entry) return null;
		return {
			providerName: entry.provider.providerName,
			cli: entry.toolEntry.cli,
			providerDir: entry.manifestDir,
		};
	},

	// getRegisteredNames - List of provider names that were successfully loaded
	getRegisteredNames: () => Object.keys(providers).map(k => providers[k].providerName),

	// getToolNames - List of all registered Anthropic tool definition names
	getToolNames: () => Object.keys(toolIndex),
});

module.exports = { createProviderRegistry };
