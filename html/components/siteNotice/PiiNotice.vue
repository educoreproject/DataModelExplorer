<script setup>
// PiiNotice — TQ's personal-information notice (R6), its words from siteNoticeVocabulary. One component, so the login page and Rosetta can never say it differently.
import { siteNoticeWords } from '@/components/siteNotice/siteNoticeVocabulary';
</script>

<template>
	<!-- the theme's primary colour, the logo's blue (TQ, 2026-11-10: not the warning orange) -->
	<v-alert color="primary" variant="tonal" density="compact" class="piiNotice" data-testid="pii-notice">{{ siteNoticeWords.piiNoticeText }}</v-alert>
</template>

<style scoped>
.piiNotice { font-size: 0.9rem; }
</style>
