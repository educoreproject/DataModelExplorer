<script setup>
// PiiNotice — TQ's personal-information notice (R6), its words from siteNoticeVocabulary. One component, so the login page and Rosetta can never say it differently.
import { siteNoticeWords } from '@/components/siteNotice/siteNoticeVocabulary';
</script>

<template>
	<v-alert type="warning" variant="tonal" density="compact" class="piiNotice" data-testid="pii-notice">{{ siteNoticeWords.piiNoticeText }}</v-alert>
</template>

<style scoped>
.piiNotice { font-size: 0.9rem; }
</style>
