<script setup>
// @concept: [[DataModelExplorer]]
// Home, '/': what EDUcore is, the explainer video, where to start (Use Cases, the specifications, the Data Model Explorer),
// and a contact form. The site has no mail server, so the form opens the visitor's own email app with a message to
// SUPPORT_EMAIL_ADDRESS whose body carries the form's fields inline; nothing is stored or sent by this site.

import { computed, ref } from 'vue';

const SUPPORT_EMAIL_ADDRESS = 'support@ed-core.org';
const CONTACT_SUBJECT_TEXT = 'EDUcore contact request';
const VIDEO_PATH = '/media/educore-universal-data-translation.mp4';
const VIDEO_POSTER_PATH = '/media/educore-universal-data-translation-poster.jpg';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

useHead({
	title: 'Home',
	meta: [{ name: 'description', content: 'EDUcore is a free-to-use, open-source graph database of data standard schemas, organized around a federated set of ontological models starting with CEDS and CTDL: a universal data map and translator for education and workforce data.' }],
});

const startLinkList = [
	{ to: '/explore/use-cases', icon: 'mdi-lightbulb-on-outline', title: 'Explore the Use Cases', text: 'See each use case and how it connects with education data.' },
	{ to: '/explore/standards', icon: 'mdi-certificate-outline', title: 'Explore the specifications', text: 'Walk the specifications those use cases cite, and how their elements map to each other.' },
	{ to: '/dm/explorer', icon: 'mdi-graph-outline', title: 'Ask the Data Model Explorer', text: 'Ask questions of the database in plain language (sign-in required).' },
];

// ---- the contact form: name, organization, email
const contactForm = ref(null);
const contactName = ref('');
const contactOrganization = ref('');
const contactEmail = ref('');
const isContactOpened = ref(false);

const requiredRule = (fieldLabel) => (value) => (String(value || '').trim() ? true : `${fieldLabel} is required`);
const emailRule = (value) => (EMAIL_PATTERN.test(String(value || '').trim()) ? true : 'Enter a valid email address');

const contactMailtoHref = computed(() => {
	const bodyText = [
		`Name: ${contactName.value.trim()}`,
		`Organization: ${contactOrganization.value.trim()}`,
		`Email: ${contactEmail.value.trim()}`,
	].join('\n');
	return `mailto:${SUPPORT_EMAIL_ADDRESS}?subject=${encodeURIComponent(CONTACT_SUBJECT_TEXT)}&body=${encodeURIComponent(bodyText)}`;
});

const sendContact = async () => {
	const { valid } = await contactForm.value.validate();
	if (!valid) return;
	window.location.href = contactMailtoHref.value;
	isContactOpened.value = true;
};
</script>

<template>
	<v-container class="py-8 home-page" style="max-width: 1000px;" data-testid="home-page">
		<h1 class="text-h4 font-weight-bold text-primary mb-4">EDUcore</h1>

		<p class="text-body-1 mb-4">
			EDUcore is a free-to-use, open-source, graph DB of data standard schemas organized around a federated set of ontological models starting with CEDS and CTDL.
		</p>
		<p class="text-body-1 mb-6">
			EDUcore provides a universal data map and translator for education institutions, workforce systems, government agencies, standards bodies, and AI platforms to interoperate more accurately and efficiently without replacing existing systems or forcing proprietary dependencies.
		</p>

		<figure class="home-video mb-8">
			<video
				:src="VIDEO_PATH"
				:poster="VIDEO_POSTER_PATH"
				controls
				playsinline
				preload="metadata"
				aria-label="EDUcore: universal data translation. Send your data in, in the format you already use (Ed-Fi, SIF, PESC, CASE); in the middle, a federated ontology of CEDS and CTDL that every standard maps to once; see it out the other side, in any format."
				data-testid="home-video"
			/>
			<figcaption class="text-caption text-medium-emphasis mt-1">Universal data translation, built on the standards you already use.</figcaption>
		</figure>

		<h2 class="text-h5 font-weight-bold mb-2">Where to start</h2>
		<p class="text-body-1 mb-4">
			EDUcore provides Use Cases to provide shared context. For now, explore the Use Cases and how they connect with education data, explore specifications related to those use cases, and ask questions to the database through the Data Model Explorer.
		</p>
		<v-row class="mb-8" data-testid="home-start-links">
			<v-col v-for="oneLink in startLinkList" :key="oneLink.to" cols="12" md="4">
				<v-card :to="oneLink.to" variant="outlined" class="h-100">
					<v-card-item>
						<template #prepend><v-icon :icon="oneLink.icon" color="primary" /></template>
						<v-card-title class="text-subtitle-1 font-weight-bold text-wrap">{{ oneLink.title }}</v-card-title>
					</v-card-item>
					<v-card-text>{{ oneLink.text }}</v-card-text>
				</v-card>
			</v-col>
		</v-row>

		<h2 id="contact" class="text-h5 font-weight-bold mb-2">Contact us</h2>
		<p class="text-body-1 mb-4">
			Send this form and your email app opens a message to <a :href="`mailto:${SUPPORT_EMAIL_ADDRESS}`">{{ SUPPORT_EMAIL_ADDRESS }}</a> with your details in it, ready to send.
		</p>
		<v-card variant="outlined" style="max-width: 560px;">
			<v-card-text>
				<v-form ref="contactForm" aria-labelledby="contact" data-testid="home-contact-form" @submit.prevent="sendContact">
					<v-text-field v-model="contactName" label="Name" autocomplete="name" :rules="[requiredRule('Name')]" class="mb-2" />
					<v-text-field v-model="contactOrganization" label="Organization" autocomplete="organization" :rules="[requiredRule('Organization')]" class="mb-2" />
					<v-text-field v-model="contactEmail" label="Email" type="email" autocomplete="email" :rules="[requiredRule('Email'), emailRule]" class="mb-2" />
					<v-btn type="submit" color="primary" prepend-icon="mdi-email-outline">Send</v-btn>
				</v-form>
				<v-alert v-if="isContactOpened" type="info" variant="tonal" density="compact" class="mt-4" role="status" data-testid="home-contact-opened">
					Your email app should now show the message; press send there. If nothing opened, write to {{ SUPPORT_EMAIL_ADDRESS }}.
				</v-alert>
			</v-card-text>
		</v-card>
	</v-container>
</template>

<style scoped>
.home-video {
	margin: 0;
}
.home-video video {
	display: block;
	width: 100%;
	aspect-ratio: 16 / 9;
	border-radius: 8px;
	background: #f5f5f0;
}
</style>
