// @concept: [[UserDataPersistence]]
//
// PROFILE PAGE VOCABULARY (WORKORDER-userSqlAndSaveHole-111026)
//
// The words form_profile.vue added when a password change began to need the current password and the username became
// read-only. The page's older labels are still written in the component.

export const profileVocabulary = Object.freeze({
	currentPasswordLabel: 'Current Password',
	currentPasswordRequiredText: 'Enter your current password to change it.',
	usernameReadOnlyHintText: 'Your user name is changed by an administrator.',
	// shown after a password change: the server ends every other session of the account (review SF-4, ROMANTIC_PARASOL
	// ruling 2026-11-10), including AI-connector (MCP OAuth) sessions
	passwordChangedText: 'Password changed. Your other sessions, including AI connectors, are signed out.',
});
