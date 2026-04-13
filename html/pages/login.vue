<script setup>
definePageMeta({ layout: 'blank' });
</script>

<template>
	<div class="login-page">
		<div class="login-header" @click="navigateTo('/')" style="cursor: pointer;">
			<img src="/educore-logo.png" alt="EDUcore" class="login-logo" />
		</div>
		<form_login />
	</div>
</template>

<style scoped>
.login-page {
	min-height: 100vh;
	background: #fafaf8;
}

.login-header {
	padding: 24px;
	text-align: center;
	background: #fff;
	border-bottom: 1px solid rgba(0, 0, 0, 0.06);
}

.login-logo {
	max-width: 180px;
	height: auto;
}
</style>
