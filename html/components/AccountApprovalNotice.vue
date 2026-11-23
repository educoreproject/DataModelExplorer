<script setup>
	// AccountApprovalNotice — WORKORDER-accountMailFailureAndApprovalNotice-112326 M4: every place that tells a person an
	// administrator must approve their account says it through this, so it cannot be skimmed past: an amber warning
	// block with a prominent icon, a bold heading and the sentence in bold; NEVER inside a success message (tqii: a green
	// tick tells the reader they are done). The words are the caller's, from accountVocabulary; data-testid and classes
	// fall through to the alert.
	defineProps({ headingText: { type: String, required: true }, noticeText: { type: String, required: true } });
</script>

<template>
	<v-alert type="warning" variant="tonal" border="start" prominent class="account-approval-notice mb-4">
		<div class="account-approval-notice__heading">{{ headingText }}</div>
		<div>{{ noticeText }}</div>
	</v-alert>
</template>

<style scoped>
	/* dark amber like the awaiting-approval email; the tonal warning's own text colour is too pale to read easily */
	.account-approval-notice {
		font-weight: 700;
		color: #9a3412 !important;
	}
	.account-approval-notice__heading {
		font-size: 1.05rem;
		margin-bottom: 4px;
	}
</style>
