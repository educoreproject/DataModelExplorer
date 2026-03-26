<script setup>
	import { useLoginStore } from '@/stores/loginStore';
	import { computed } from 'vue';
	import { useRouter } from 'vue-router';
	
	const LoginStore = useLoginStore();
	const router = useRouter();

	if (router?.currentRoute.value.query.logout) {
		LoginStore.logout();
	}

	// Check if we're on the work page
	const isWorkPage = computed(() => {
		return router.currentRoute.value.path === '/work' || 
		       router.currentRoute.value.path === '/work/';
	});

	// Check if we're on the admin page
	const isAdminPage = computed(() => {
		return router.currentRoute.value.path === '/admin' ||
		       router.currentRoute.value.path === '/admin/';
	});

	// Check if we're on the library page
	const isLibraryPage = computed(() => {
		return router.currentRoute.value.path === '/library' ||
		       router.currentRoute.value.path === '/library/';
	});

	// Check if we're on any use cases page
	const isUseCasesPage = computed(() => {
		return router.currentRoute.value.path.startsWith('/uc');
	});

	// Check if we're on any data models page
	const isDataModelsPage = computed(() => {
		return router.currentRoute.value.path.startsWith('/dm');
	});


	const reloadPage = () => {
		window.location.href = window.location.href.replace(
			/^(https?:\/\/[^\/]+).*/,
			'$1',
		);
	};
</script>

<template>
	<!-- Top banner (not an app bar) -->
	<div class="banner justify-center align-center">
		<h1 class="banner-title">EDUcore</h1>
	</div>

	<!-- Navigation bar -->
	<v-app-bar app elevation="0" class="border-bottom border-1"
		v-if="true || LoginStore.validUser"
	>
		<v-app-bar-title class="titleOrange">
			<template v-if="isAdminPage">Admin Tools</template>
			<template v-else-if="isDataModelsPage">Data Models</template>
			<template v-else-if="isUseCasesPage">Use Cases</template>
			<template v-else-if="isLibraryPage">Library</template>
			<template v-else-if="isWorkPage">Work</template>
			<template v-else>EDUcore Tools</template>
		</v-app-bar-title>

		<v-btn
			v-if="(LoginStore.loggedInUser.role === 'client') && !isWorkPage"
			variant="text"
			prepend-icon="mdi-image"
			title="Get to Work"
			:to="{ path: '/work' }"
		>
			Open Work.vue
		</v-btn>

		<v-btn
			v-if="LoginStore.validUser"
			variant="text"
			prepend-icon="mdi-graph"
			title="Data Models - Cross-Standard Search, Mapping, and Lookup"
			:to="{ path: '/dm/explorer' }"
			:disabled="isDataModelsPage"
		>
			Data Models
		</v-btn>

		<v-btn
			v-if="LoginStore.validUser"
			variant="text"
			prepend-icon="mdi-lightbulb-on"
			title="Use Cases - Standards Matrix and Applications"
			:to="{ path: '/uc/matrix' }"
			:disabled="isUseCasesPage"
		>
			Use Cases
		</v-btn>

		<v-btn
			v-if="LoginStore.validUser"
			variant="text"
			prepend-icon="mdi-bookshelf"
			title="Document Library"
			:to="{ path: '/library' }"
			:disabled="isLibraryPage"
		>
			Library
		</v-btn>

		<v-btn
			variant="text"
			prepend-icon="mdi-account"
			title="Profile"
			:to="{ path: '/utility', query: { purpose: 'profile' } }"
		>
			<span v-if="LoginStore.loggedInUser.last">
				{{ LoginStore.loggedInUser.first }} {{ LoginStore.loggedInUser.last }}
			</span>
			<span v-else>{{ LoginStore.loggedInUser.username }}</span>
		</v-btn>

		<v-btn
			v-if="!isAdminPage && ['admin', 'super'].includes(LoginStore.loggedInUser.role)"
			variant="text"
			prepend-icon="mdi-shield-account"
			title="Admin Tools"
			:to="{ path: '/admin' }"
		>
			Admin
		</v-btn>

		<v-btn variant="text" prepend-icon="mdi-logout" title="Logout" @click="reloadPage">
			Logout
		</v-btn>
	</v-app-bar>
</template>

<style scoped>
	/* Banner styling */
	.banner {
		background: linear-gradient(135deg, #2c5f8a 0%, #1a3d5c 100%);
		padding: 0.4rem;
		text-align: center;
	}

	.banner-title {
		margin: 0;
		color: #fff;
		font-family: Georgia, 'Times New Roman', serif;
		font-size: 1.6rem;
		letter-spacing: 2px;
	}
	.titleOrange {
		color: #2c5f8a;
		font-weight: bold;
		padding-left: 5px;
	}
	.v-app-bar {
		margin-top: 2.7rem;
		border-bottom: 1px solid #ddd !important;
	}
	/* Toolbar title alignment fixes */
	.v-app-bar-title {
		margin-inline-start: 0 !important;
	}
</style>
