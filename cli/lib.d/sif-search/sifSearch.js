#!/usr/bin/env node
'use strict';

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, '');

const os = require('os');
const path = require('path');
const fs = require('fs');
const commandLineParser = require('qtools-parse-command-line');
const commandLineParameters = commandLineParser.getParameters();
const configFileProcessor = require('qtools-config-file-processor');
const TurndownService = require('turndown');

// ----------------------------------------------------------------------
// FIGURE OUT CONFIG (following ceds1/bb2 pattern)

const findProjectRoot = ({ rootFolderName = 'system', closest = true } = {}) =>
	__dirname.replace(
		new RegExp(`^(.*${closest ? '' : '?'}\/${rootFolderName}).*$`),
		'$1',
	);
const projectRoot = findProjectRoot();

const configName =
	os.hostname() == 'qMini.local' ? 'instanceSpecific/qbook' : '';
const configDirPath = `${projectRoot}/configs/${configName}/`;
const sifConfig = (() => {
	try {
		const config = configFileProcessor.getConfig('sifSearch.ini', configDirPath, {
			resolve: false,
		});
		return (config && config['sifSearch']) || {};
	} catch (e) {
		return {};
	}
})();

const BASE_URL = sifConfig.baseUrl || 'https://a4ldocumentation.atlassian.net';
const EMAIL = sifConfig.email || '';
const API_TOKEN = sifConfig.apiToken || '';
const DEFAULT_SPACE = sifConfig.defaultSpace || 'ARCHITECTU';

// ----------------------------------------------------------------------
// PARSE ACTION

const detectAction = () => {
	const actionNames = ['help', 'search', 'readPage', 'listPages'];
	for (const arg of process.argv.slice(2)) {
		const match = arg.match(/^-(\w+)$/);
		if (match && actionNames.includes(match[1])) {
			return match[1];
		}
	}
	return 'help';
};

const getParam = (name, defaultValue) => {
	const vals = commandLineParameters.values && commandLineParameters.values[name];
	if (vals && vals.length > 0) return vals[0];
	return defaultValue;
};

const getPositionalArgs = () => commandLineParameters.fileList || [];

const action = detectAction();
const mockApi = !!commandLineParameters.switches.mockApi;
const verbose = !!commandLineParameters.switches.verbose;

// ----------------------------------------------------------------------
// AUTH

const getAuthHeader = () => {
	if (!EMAIL || !API_TOKEN) return null;
	const credentials = Buffer.from(`${EMAIL}:${API_TOKEN}`).toString('base64');
	return `Basic ${credentials}`;
};

// ----------------------------------------------------------------------
// HTML-TO-MARKDOWN CONVERSION

const convertStorageToMarkdown = (storageHtml) => {
	if (!storageHtml) return '';

	// Strip Confluence-specific ac: and ri: elements before conversion
	let cleaned = storageHtml
		.replace(/<ac:[^>]*\/>/g, '')
		.replace(/<ac:[^>]*>[\s\S]*?<\/ac:[^>]*>/g, '')
		.replace(/<ri:[^>]*\/>/g, '')
		.replace(/<ri:[^>]*>[\s\S]*?<\/ri:[^>]*>/g, '');

	const turndownService = new TurndownService({
		headingStyle: 'atx',
		codeBlockStyle: 'fenced',
	});

	return turndownService.turndown(cleaned);
};

// ----------------------------------------------------------------------
// MOCK DATA

const mockSearchResults = [
	{ id: 'MOCK-001', title: '[MOCK] SIF Infrastructure Overview', excerpt: 'Overview of SIF standards and data exchange patterns', url: '#mock' },
	{ id: 'MOCK-002', title: '[MOCK] True-Up Process Guide', excerpt: 'Guide to the student data true-up reconciliation process', url: '#mock' },
	{ id: 'MOCK-003', title: '[MOCK] Ed-Fi to SIF Mapping', excerpt: 'Crosswalk between Ed-Fi and SIF data models', url: '#mock' },
];

const mockPageContent = {
	id: 'MOCK-001',
	title: '[MOCK] SIF Infrastructure Overview',
	spaceKey: 'ARCHITECTU',
	markdown: '# SIF Infrastructure\n\nThis is mock page content for testing the sifSearch tool pipeline.\n\n## Key Concepts\n\n- Student Information Framework (SIF)\n- True-up processes\n- Data exchange standards\n- Zone Integration Server (ZIS)\n\n## Architecture\n\nThe SIF infrastructure uses a publish-subscribe model where agents register with a ZIS to share student data across systems.',
	url: '#mock',
	lastUpdated: '2026-01-15',
};

// ----------------------------------------------------------------------
// API FUNCTIONS

const apiSearch = async ({ query, cql, limit }) => {
	if (mockApi) return mockSearchResults.slice(0, limit);

	const authHeader = getAuthHeader();
	if (!authHeader) {
		console.error('Error: Confluence credentials not configured in sifSearch.ini');
		process.exit(1);
	}

	const searchCql = cql || `text ~ "${query}"`;
	const encodedCql = encodeURIComponent(searchCql);
	const url = `${BASE_URL}/wiki/rest/api/search?cql=${encodedCql}&limit=${limit}`;

	if (verbose) console.error(`[sifSearch] GET ${url}`);

	const response = await fetch(url, {
		headers: {
			'Authorization': authHeader,
			'Accept': 'application/json',
		},
	});

	if (!response.ok) {
		console.error(`Error: Confluence search failed: ${response.status} ${response.statusText}`);
		process.exit(1);
	}

	const data = await response.json();
	return (data.results || []).map(result => ({
		id: String(result.content?.id || result.id || ''),
		title: result.content?.title || result.title || '',
		excerpt: (result.excerpt || '').replace(/<[^>]*>/g, '').trim(),
		url: result.content?._links?.webui
			? `${BASE_URL}/wiki${result.content._links.webui}`
			: '#',
	}));
};

const apiReadPage = async ({ pageId }) => {
	if (mockApi) return mockPageContent;

	const authHeader = getAuthHeader();
	if (!authHeader) {
		console.error('Error: Confluence credentials not configured in sifSearch.ini');
		process.exit(1);
	}

	const url = `${BASE_URL}/wiki/api/v2/pages/${pageId}?body-format=storage`;

	if (verbose) console.error(`[sifSearch] GET ${url}`);

	const response = await fetch(url, {
		headers: {
			'Authorization': authHeader,
			'Accept': 'application/json',
		},
	});

	if (!response.ok) {
		console.error(`Error: Confluence getPage failed: ${response.status} ${response.statusText}`);
		process.exit(1);
	}

	const page = await response.json();
	const storageBody = page.body?.storage?.value || '';
	const markdown = convertStorageToMarkdown(storageBody);

	return {
		id: String(page.id || pageId),
		title: page.title || '',
		spaceKey: page.spaceId ? String(page.spaceId) : DEFAULT_SPACE,
		markdown,
		url: page._links?.webui
			? `${BASE_URL}/wiki${page._links.webui}`
			: '#',
		lastUpdated: page.version?.createdAt || '',
	};
};

const apiListPages = async ({ spaceKey, limit }) => {
	if (mockApi) return mockSearchResults.map(r => ({ id: r.id, title: r.title, url: r.url }));

	const authHeader = getAuthHeader();
	if (!authHeader) {
		console.error('Error: Confluence credentials not configured in sifSearch.ini');
		process.exit(1);
	}

	// Resolve space key to space ID via v2 API
	const resolveSpaceKey = spaceKey || DEFAULT_SPACE;
	const spaceUrl = `${BASE_URL}/wiki/api/v2/spaces?keys=${resolveSpaceKey}`;

	if (verbose) console.error(`[sifSearch] GET ${spaceUrl}`);

	const spaceResponse = await fetch(spaceUrl, {
		headers: {
			'Authorization': authHeader,
			'Accept': 'application/json',
		},
	});

	if (!spaceResponse.ok) {
		console.error(`Error: Confluence space lookup failed: ${spaceResponse.status} ${spaceResponse.statusText}`);
		process.exit(1);
	}

	const spaceData = await spaceResponse.json();
	const space = (spaceData.results || [])[0];
	if (!space) {
		console.error(`Error: Space not found: ${resolveSpaceKey}`);
		process.exit(1);
	}

	const pagesUrl = `${BASE_URL}/wiki/api/v2/spaces/${space.id}/pages?limit=${limit}`;

	if (verbose) console.error(`[sifSearch] GET ${pagesUrl}`);

	const pagesResponse = await fetch(pagesUrl, {
		headers: {
			'Authorization': authHeader,
			'Accept': 'application/json',
		},
	});

	if (!pagesResponse.ok) {
		console.error(`Error: Confluence listPages failed: ${pagesResponse.status} ${pagesResponse.statusText}`);
		process.exit(1);
	}

	const pagesData = await pagesResponse.json();
	return (pagesData.results || []).map(page => ({
		id: String(page.id),
		title: page.title || '',
		url: page._links?.webui
			? `${BASE_URL}/wiki${page._links.webui}`
			: '#',
	}));
};

// ----------------------------------------------------------------------
// OUTPUT FORMATTERS

const formatSearchResults = (results) => {
	if (results.length === 0) {
		return 'No results found.';
	}
	const lines = [];
	lines.push(`Found ${results.length} result(s):\n`);
	results.forEach((r, i) => {
		lines.push(`${i + 1}. [${r.id}] ${r.title}`);
		if (r.excerpt) lines.push(`   ${r.excerpt}`);
		lines.push(`   ${r.url}`);
		lines.push('');
	});
	return lines.join('\n');
};

const formatPageContent = (page) => {
	const lines = [];
	lines.push(`# ${page.title}`);
	lines.push('');
	lines.push(`Space: ${page.spaceKey} | ID: ${page.id} | Updated: ${page.lastUpdated}`);
	lines.push(`URL: ${page.url}`);
	lines.push('');
	lines.push(page.markdown);
	return lines.join('\n');
};

const formatPageList = (pages) => {
	if (pages.length === 0) {
		return 'No pages found in space.';
	}
	const lines = [];
	lines.push(`Found ${pages.length} page(s):\n`);
	pages.forEach((p, i) => {
		lines.push(`${i + 1}. [${p.id}] ${p.title}`);
		lines.push(`   ${p.url}`);
		lines.push('');
	});
	return lines.join('\n');
};

// ----------------------------------------------------------------------
// HELP

const showHelp = () => {
	console.log(`sifSearch - SIF/Confluence Documentation Search (v1)

USAGE:
  sifSearch -search "query text"         Search pages by text
  sifSearch -search --cql="type=page"    Search with raw CQL
  sifSearch -readPage "pageId"           Read full page as markdown
  sifSearch -listPages                   List all pages in default space
  sifSearch -listPages --space=KEY       List pages in specific space
  sifSearch -help                        Show this help

OPTIONS:
  --limit=N          Max results (default: 10)
  --space=KEY        Override default space (default: ${DEFAULT_SPACE})
  -mockApi           Use mock data (no credentials needed)
  -verbose           Show request URLs on stderr

EXAMPLES:
  sifSearch -search "student data"
  sifSearch -search --cql="space=ARCHITECTU AND type=page"
  sifSearch -readPage "12345678"
  sifSearch -listPages --space=ARCHITECTU --limit=50
  sifSearch -search "true-up" -mockApi`);
};

// ----------------------------------------------------------------------
// MAIN

const main = async () => {
	const positionalArgs = getPositionalArgs();
	const limit = parseInt(getParam('limit', '10'), 10);

	switch (action) {
		case 'help':
			showHelp();
			break;

		case 'search': {
			const cql = getParam('cql', null);
			const query = positionalArgs[0] || '';
			if (!query && !cql) {
				console.error('Error: -search requires a query argument or --cql parameter');
				process.exit(1);
			}
			const results = await apiSearch({ query, cql, limit });
			console.log(formatSearchResults(results));
			break;
		}

		case 'readPage': {
			const pageId = positionalArgs[0];
			if (!pageId) {
				console.error('Error: -readPage requires a page ID argument');
				process.exit(1);
			}
			const page = await apiReadPage({ pageId });
			console.log(formatPageContent(page));
			break;
		}

		case 'listPages': {
			const spaceKey = getParam('space', null);
			const pages = await apiListPages({ spaceKey, limit });
			console.log(formatPageList(pages));
			break;
		}

		default:
			showHelp();
	}
};

main().catch(err => {
	console.error(`Error: ${err.message}`);
	process.exit(1);
});
