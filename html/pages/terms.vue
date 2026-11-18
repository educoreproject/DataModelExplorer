<script setup>
// Terms of Service (BD 2026-11-18): the terms for using the EDUcore application (the site, its API and its MCP server).
useHead({
	title: 'Terms of Service',
	meta: [{ name: 'description', content: 'The terms for using the EDUcore application: the website, its API and its MCP server for AI assistants.' }],
});

const effectiveDateText = 'November 18, 2026';
const leadText =
	'These terms apply to the EDUcore application, run by the EDUcore Project ("EDUcore", "we", "us"): the website at educore.org, its API, and its MCP server at ed-core.org/mcp. By using EDUcore you agree to them. If you use EDUcore for an organization, you agree on its behalf.';

const sectionList = [
	{
		head: 'The service',
		paragraphList: [
			'EDUcore is a free, open-source knowledge graph of education data standards: their classes and properties, how they map to shared hub standards such as CEDS and CTDL, and use cases that cite them. We provide it to help institutions, workforce systems, agencies, standards bodies and AI platforms interoperate. We may change, add or remove features at any time.',
		],
	},
	{
		head: 'Accounts',
		paragraphList: [
			'Some features, including the MCP server, need an EDUcore account. Accounts are currently issued on request through support@educore.org. Keep your password private and do not share your account; you are responsible for what happens under it. Tell us right away at support@educore.org if you think someone else has used it. We may suspend or close an account that breaks these terms.',
		],
	},
	{
		head: 'Connecting AI assistants',
		paragraphList: [
			'You may connect an AI assistant, such as Google Gemini, Anthropic Claude or OpenAI ChatGPT, to the EDUcore MCP server under your own account. You are responsible for that connection and for how your assistant uses what EDUcore returns. Your use of the assistant itself is governed by its provider\'s terms, not ours.',
		],
	},
	{
		head: 'Acceptable use',
		paragraphList: ['Please use EDUcore fairly. Do not:'],
		pointList: [
			'try to get around sign-in, rate limits or other protections, or reach data or systems you are not allowed to;',
			'overload the service, for example with automated requests far beyond normal use, or interfere with others using it;',
			'submit student records or other personal data about learners to Rosetta, the AI Explorer or any other feature;',
			'use EDUcore to break the law or anyone else\'s rights.',
		],
	},
	{
		head: 'Content and ownership',
		paragraphList: [
			'The data standards described in EDUcore belong to the organizations that publish them, under their own licenses; check a standard\'s own terms before relying on it. EDUcore\'s own software is open source under its repository\'s license. The mappings, use cases and other content EDUcore adds may be used, shared and adapted, with credit to EDUcore.',
			'You keep any rights in what you submit. You give us permission to store and process it to provide the service to you, as described in our Privacy Policy.',
		],
	},
	{
		head: 'AI-generated content',
		paragraphList: [
			'Some EDUcore features, such as Rosetta and the AI Explorer, use AI models, and mappings in the graph may be machine-derived. Each mapping records its confidence and source, but AI output and derived mappings can be wrong. Review anything important before you rely on it, especially before using it in a production system.',
		],
	},
	{
		head: 'No warranty',
		paragraphList: [
			'EDUcore is provided free and "as is", without warranties of any kind, including fitness for a particular purpose, accuracy or uninterrupted availability.',
		],
	},
	{
		head: 'Limitation of liability',
		paragraphList: [
			'To the fullest extent the law allows, EDUcore and its contributors are not liable for any indirect, incidental or consequential damages, or for lost data, revenue or profits, arising from your use of the service.',
		],
	},
	{
		head: 'Privacy',
		paragraphList: ['Our Privacy Policy explains what we collect and how we use it. It is part of these terms.'],
	},
	{
		head: 'Changes to these terms',
		paragraphList: [
			'We may update these terms. We will post the new version here with a new effective date; using EDUcore after that means you accept the change.',
		],
	},
];
</script>

<template>
	<LegalPage title="Terms of Service" :effective-date-text="effectiveDateText" :lead-text="leadText" :section-list="sectionList" />
</template>
