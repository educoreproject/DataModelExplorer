<script setup>
	// AccountApprovalNotice — WORKORDER-accountMailFailureAndApprovalNotice-112326 M4: every place that tells a person an
	// administrator must approve their account says it through this, so the sentence cannot be skimmed past: a Vuetify
	// warning alert, bold, with a coloured edge. The words are the caller's (accountVocabulary, or the server's reply);
	// data-testid and classes fall through to the alert.
	defineProps({ noticeText: { type: String, required: true } });
</script>

<template>
	<v-alert type="warning" variant="tonal" border="start" class="account-approval-notice mb-4">{{ noticeText }}</v-alert>
</template>

<style scoped>
	.account-approval-notice {
		font-weight: 700;
	}
</style>
