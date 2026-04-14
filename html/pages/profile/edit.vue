<script setup>
definePageMeta({ middleware: 'auth' });
</script>

<template>
	<div>
		<SubPageNav
			:model-value="'edit'"
			:tabs="[
				{ label: 'Profile', value: 'edit', to: '/profile/edit' },
				{ label: 'Sessions', value: 'sessions', to: '/profile/sessions' },
			]"
		/>
		<form_profile />
	</div>
</template>
