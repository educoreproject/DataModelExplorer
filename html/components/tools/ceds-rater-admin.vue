<script setup>
// ceds-rater-admin — the Mapping Survey tab of /admin (WORKORDER-RATER6; named CEDS Rater until revision 7, whose
// rename changed only the labels: the file, the ?tool=ceds-rater key and the test ids keep the old name). The one home of the rater admin: the raters view
// (RaterAdminPanel: gold line and counts, Surveys, raters table, add a rater, the once-only password, downloads) and
// the Results view (RaterResultsPanel), chosen by the `view` query parameter so a bookmark or the old /rater/admin and
// /rater/admin/results URLs (which redirect here) land on the right one: /admin?tool=ceds-rater and
// /admin?tool=ceds-rater&view=results.
//
// This component is the guard. /admin's own middleware has already required the main-site login; here the panels are
// rendered only for an admin role, so a rater (or any other non-admin) gets a refusal and no call is made. The server's
// /api/raterAdmin gate (admin, super) is the judge either way; every panel call is signed with the main login
// (raterStore CREDENTIAL_BY_SOURCE_NAME.mainLogin), never with a rater token.
import { computed } from 'vue';
import { useLoginStore } from '@/stores/loginStore';
import { isRaterAdminRole } from '@/stores/raterStore';
import RaterAdminPanel from '@/components/rater/AdminPanel.vue';
import RaterResultsPanel from '@/components/rater/ResultsPanel.vue';
// the shared rt- styles; imported, not <style src>, which breaks the production build beside a scoped block
import '@/assets/css/raterArea.css';

const RATER_VIEW_BY_NAME = Object.freeze({
	raters: { panelComponent: RaterAdminPanel },
	results: { panelComponent: RaterResultsPanel },
});
const DEFAULT_RATER_VIEW_NAME = 'raters'; // the tab with no `view` parameter

const route = useRoute();
const router = useRouter();
const loginStore = useLoginStore();

const isAdmin = computed(() => isRaterAdminRole(loginStore.loggedInUser?.role));
const raterViewName = computed(() => route.query.view || DEFAULT_RATER_VIEW_NAME);
const raterView = computed(() => RATER_VIEW_BY_NAME[raterViewName.value]);

const showRaterView = (viewName) => {
	const nextQuery = { ...route.query, view: viewName };
	if (viewName === DEFAULT_RATER_VIEW_NAME) {
		delete nextQuery.view;
	}
	router.push({ query: nextQuery });
};
</script>

<template>
	<div class="rt-app rt-admin-host" data-testid="ceds-rater-tool">
		<p v-if="!isAdmin" role="alert" class="rt-alert-error" data-testid="ceds-rater-not-admin">The Mapping Survey tool is for admins. This account is not one.</p>
		<p v-else-if="!raterView" role="alert" class="rt-alert-error" data-testid="ceds-rater-view-unknown">There is no Mapping Survey view '{{ raterViewName }}'. The views are: {{ Object.keys(RATER_VIEW_BY_NAME).join(', ') }}.</p>
		<component
			:is="raterView.panelComponent"
			v-else
			:key="raterViewName"
			@open-results="showRaterView('results')"
			@back="showRaterView('raters')"
		/>
	</div>
</template>

<style scoped>
.rt-admin-host { width: 100%; text-align: left; border-radius: 8px; }
</style>
