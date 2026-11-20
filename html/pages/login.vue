<script setup>
definePageMeta({ layout: 'blank' });
</script>

<template>
	<div class="login-page">
		<!-- the logo is a real link home, so it can be followed and named, not a clickable div -->
		<NuxtLink to="/" class="login-header" aria-label="EDUcore home">
			<img src="/educore-logo.png" alt="EDUcore" class="login-logo" />
		</NuxtLink>
		<form_login />
		<!-- ⟪rosettaMeanings R6⟫ TQ's personal-information notice, below the login form (TQ, 2026-11-10); its words in siteNoticeVocabulary -->
		<div class="login-notice"><SiteNoticePiiNotice /></div>
	</div>
</template>

<style scoped>
.login-page {
	min-height: 100vh;
	background: #fafaf8;
}

.login-header {
	display: block;
	padding: 24px;
	text-align: center;
	background: #fff;
	border-bottom: 1px solid rgba(0, 0, 0, 0.06);
}

.login-notice {
	max-width: 480px;
	margin: 0 auto 24px;
	padding: 0 16px;
}

.login-logo {
	max-width: 180px;
	height: auto;
}
</style>
