<script setup>
// LegalPage (BD 2026-11-18): the shared layout of the Privacy Policy and the Terms of Service. Each page passes its title,
// the date it took effect, a lead paragraph and its sections ({ head, paragraphList, pointList? }); this draws them the same way.
defineProps({
	title: { type: String, required: true },
	effectiveDateText: { type: String, required: true },
	leadText: { type: String, required: true },
	sectionList: { type: Array, required: true },
});
</script>

<template>
	<v-container class="py-8 legal-page" style="max-width: 820px;">
		<h1 class="text-h4 font-weight-bold text-primary mb-1">{{ title }}</h1>
		<p class="text-caption text-medium-emphasis mb-6">Effective {{ effectiveDateText }}</p>
		<p class="text-body-1 mb-6">{{ leadText }}</p>

		<section v-for="(oneSection, sectionIndex) in sectionList" :key="oneSection.head" class="mb-6">
			<h2 class="text-h6 font-weight-bold mb-2">{{ sectionIndex + 1 }}. {{ oneSection.head }}</h2>
			<p v-for="oneParagraph in oneSection.paragraphList" :key="oneParagraph" class="text-body-2 mb-2">{{ oneParagraph }}</p>
			<ul v-if="oneSection.pointList" class="text-body-2 legal-points mb-2">
				<li v-for="onePoint in oneSection.pointList" :key="onePoint">{{ onePoint }}</li>
			</ul>
		</section>

		<p class="text-body-2 mt-8">
			Questions? Email <a href="mailto:support@educore.org">support@educore.org</a>.
		</p>
	</v-container>
</template>

<style scoped>
.legal-points {
	padding-left: 1.4em;
}

.legal-points li {
	margin-bottom: 4px;
}
</style>
