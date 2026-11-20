<script setup>
// Privacy Policy (BD 2026-11-18): what the EDUcore application collects and why, written from what the site actually does:
// accounts and sign-in (including MCP sign-in for AI assistants), the Bigin contact form, text sent to an AI model by Rosetta and
// the AI Explorer, and server logs. No advertising or analytics cookies are set.
useHead({
	title: 'Privacy Policy',
	meta: [{ name: 'description', content: 'How the EDUcore application collects, uses and protects information: accounts, sign-in for AI assistants (MCP), the contact form, AI features and server logs.' }],
});

const effectiveDateText = 'November 18, 2026';
const leadText =
	'EDUcore is a free, open-source knowledge graph of education data standards, run by the EDUcore Project ("EDUcore", "we", "us"). This policy covers the EDUcore application: the website at educore.org, its API, and its MCP server at ed-core.org/mcp. It explains what information we collect, why, and the choices you have.';

const sectionList = [
	{
		head: 'What you can do without giving us anything',
		paragraphList: [
			'Most of EDUcore is public. You can browse use cases, standards, specifications, the Standards Explorer and the downloads without an account, and we do not ask who you are.',
		],
	},
	{
		head: 'Information we collect',
		pointList: [
			'Account information: if we create an account for you, your name, email address, username, password and role. We use it only to sign you in and decide what you can see.',
			'Contact form: the name, organization, email address, ecosystem vertical and message you enter on the home page. The form is provided by Zoho Bigin, and what you submit is stored in our Bigin account as a contact.',
			'Emails you send us at support@educore.org.',
			'Text you give the AI features: fields and descriptions you submit to Rosetta, and questions you ask the AI Explorer. Rosetta keeps a job and its report so you can return to it by its link.',
			'Server logs: like most websites, our servers record requests they receive, including IP address, browser type, the page or API address requested and the time. We use logs to keep the service running, find errors and prevent abuse.',
		],
	},
	{
		head: 'Signing in from an AI assistant (MCP)',
		paragraphList: [
			'When you connect Google Gemini, Anthropic Claude, OpenAI ChatGPT or another assistant to the EDUcore MCP server, your assistant sends you to an EDUcore sign-in page. You enter your EDUcore username and password there, on our site; your password is never given to the AI provider. Once you approve, the assistant receives an access token that lets it read the EDUcore graph on your behalf. The token grants read-only access; it cannot change any data.',
			'The questions your assistant sends to EDUcore and the answers we return pass through that AI provider, and their own privacy policy covers what they do with your conversations. You can disconnect EDUcore at any time in your assistant\'s connector settings.',
		],
	},
	{
		head: 'How we use information',
		pointList: [
			'To provide the service: sign you in, answer your queries, run Rosetta jobs and show you your results.',
			'To reply when you contact us, and to tell you about EDUcore if you asked us to.',
			'To keep EDUcore secure and working: diagnose errors, measure load and stop misuse.',
			'We do not sell your information, and we do not use it for advertising.',
		],
	},
	{
		head: 'Who we share it with',
		paragraphList: ['We share information only with the service providers that run EDUcore for us, and only as much as each needs:'],
		pointList: [
			'Hosting: our website and servers run on cloud hosting providers, who store and process data for us.',
			'Zoho (Bigin), which receives and stores contact form submissions.',
			'Anthropic, whose Claude models process the text you submit to Rosetta and the AI Explorer to produce an answer.',
			'Anyone we are required to by law, or where needed to protect the safety, rights or property of our users or the public.',
		],
	},
	{
		head: 'Cookies and browser storage',
		paragraphList: [
			'EDUcore does not set advertising or analytics cookies. Your sign-in is held by the page while it is open, and a few features (such as the rater) keep their state in your browser\'s session storage, which is cleared when you close the tab. Embedded services, such as the Bigin contact form, may set their own cookies under their own policies.',
		],
	},
	{
		head: 'How long we keep it',
		paragraphList: [
			'We keep account information while your account is open, contact form submissions and emails for as long as needed to follow up, Rosetta jobs so their links keep working, and server logs for a limited time for operations and security. You can ask us to delete your account or anything you sent us.',
		],
	},
	{
		head: 'Your choices',
		paragraphList: [
			'You can ask to see, correct or delete the information we hold about you, or close your account, by emailing support@educore.org. We will answer within 30 days.',
		],
	},
	{
		head: 'Security',
		paragraphList: [
			'We use encrypted connections (HTTPS) for the site, the API and the MCP server, keep the graph read-only for outside users, and limit who can reach our servers. No system is perfectly secure, so please use a password you don\'t use anywhere else.',
		],
	},
	{
		head: 'Children',
		paragraphList: [
			'EDUcore is a tool for professionals who work with education data. It is not directed to children under 13, and we do not knowingly collect their personal information. EDUcore holds descriptions of data standards, not student records; please do not submit student records or other personal data about learners to Rosetta or the AI Explorer.',
		],
	},
	{
		head: 'Changes to this policy',
		paragraphList: ['If we change this policy, we will post the new version here with a new effective date. Significant changes will be noted on the site.'],
	},
];
</script>

<template>
	<LegalPage title="Privacy Policy" :effective-date-text="effectiveDateText" :lead-text="leadText" :section-list="sectionList" />
</template>
