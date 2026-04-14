<script setup>
definePageMeta({ middleware: 'auth' });

const message = 'hello from work.vue';
</script>

<template>
	<v-container>
		{{ message }}
	</v-container>
</template>
