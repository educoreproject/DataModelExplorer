<script setup>
// @concept: [[DataModelExplorer]]
// Home, '/': what EDUcore is, the explainer video, where to start (Use Cases, the specifications, the Data Model Explorer),
// and the contact form. The form is Bigin's web form (each submission a contact in EDUcore's Bigin), kept as Bigin gave it
// in public/forms/bigin-contact.html and shown here in an iframe: its styles reset a whole document and its scripts are
// inline, so it cannot live inside this page. The frame is same-origin, so it is sized to the form's own height.

import { onBeforeUnmount, ref } from 'vue';

const SUPPORT_EMAIL_ADDRESS = 'support@ed-core.org';
const CONTACT_FORM_PATH = '/forms/bigin-contact.html';
const CONTACT_FRAME_START_HEIGHT = 630; // the form's measured height, so the page does not jump while the form loads
const VIDEO_PATH = '/media/educore-universal-data-translation.mp4';
const VIDEO_POSTER_PATH = '/media/educore-universal-data-translation-poster.jpg';

useHead({
	title: 'Home',
	meta: [{ name: 'description', content: 'EDUcore is a free-to-use, open-source graph database of data standard schemas, organized around a federated set of ontological models starting with CEDS and CTDL: a universal data map and translator for education and workforce data.' }],
});

const startLinkList = [
	{ to: '/explore/use-cases', icon: 'mdi-lightbulb-on-outline', title: 'Explore the Use Cases', text: 'See each use case and how it connects with education data.' },
	{ to: '/explore/standards', icon: 'mdi-certificate-outline', title: 'Explore the specifications', text: 'Walk the specifications those use cases cite, and how their elements map to each other.' },
	{ to: '/dm/explorer', icon: 'mdi-graph-outline', title: 'Ask the Data Model Explorer', text: 'Ask questions of the database in plain language (sign-in required).' },
];

// ---- the contact form's frame: as tall as the form inside it, following it as it changes (an error line, the thank-you)
const contactFrame = ref(null);
const contactFrameHeight = ref(CONTACT_FRAME_START_HEIGHT);
let contactFrameResizeObserver = null;

const fitContactFrame = () => {
	const frameDocument = contactFrame.value?.contentDocument;
	// the body's own height, not the document's: a document is never shorter than its frame, so the frame could only grow
	if (frameDocument?.body) contactFrameHeight.value = Math.ceil(frameDocument.body.getBoundingClientRect().height);
};
const watchContactFrame = () => {
	fitContactFrame();
	contactFrameResizeObserver?.disconnect();
	const frameBody = contactFrame.value?.contentDocument?.body;
	if (frameBody && typeof ResizeObserver !== 'undefined') {
		contactFrameResizeObserver = new ResizeObserver(fitContactFrame);
		contactFrameResizeObserver.observe(frameBody);
	}
};
onBeforeUnmount(() => contactFrameResizeObserver?.disconnect());
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
			Interested in EDUcore? Leave your details and we will be in touch. You can also write to <a :href="`mailto:${SUPPORT_EMAIL_ADDRESS}`">{{ SUPPORT_EMAIL_ADDRESS }}</a>.
		</p>
		<iframe
			ref="contactFrame"
			:src="CONTACT_FORM_PATH"
			title="Contact EDUcore: interest form"
			class="home-contact-frame"
			:style="{ height: `${contactFrameHeight}px` }"
			data-testid="home-contact-form"
			@load="watchContactFrame"
		/>
	</v-container>
</template>

<style scoped>
.home-video {
	margin: 0;
	max-width: 560px;
}
.home-video video {
	display: block;
	width: 100%;
	aspect-ratio: 16 / 9;
	border-radius: 8px;
	background: #f5f5f0;
}
.home-contact-frame {
	display: block;
	width: 100%;
	max-width: 568px;
	border: 0;
}
</style>
