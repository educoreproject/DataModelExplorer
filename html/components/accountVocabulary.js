// @concept: [[UserDataPersistence]]
//
// ACCOUNT PAGES VOCABULARY (WORKORDER-userRegistrationReset-112026)
//
// The words of the register, confirm, forgot-password and reset-password pages and of the links on the login form, here
// so tqii can edit them without reading the components. What the server says after a request (the "if an account
// matches" reply, refusals) comes from the server and is shown as it arrives.

export const accountVocabulary = Object.freeze({
	forgotPasswordLinkText: 'Forgot password?',
	createAccountLinkText: 'Create an account',
	backToSignInText: 'Back to sign in',
	resendConfirmationButtonText: 'Send a new confirmation link',

	forgotPasswordTitle: 'Reset your password',
	forgotPasswordIntroText: 'Enter your user name or the email address on your account. If it matches an account, we will email a link to choose a new password.',
	identifierLabel: 'User name or email address',
	sendResetLinkButtonText: 'Email me a link',

	resetPasswordTitle: 'Choose a new password',
	resetPasswordIntroText: 'Your new password must be at least 12 characters. Choosing it signs you out everywhere else.',
	newPasswordLabel: 'New password',
	confirmPasswordLabel: 'New password again',
	passwordsDifferText: 'The two passwords are not the same.',
	passwordTooShortText: 'A password must be at least 12 characters.',
	savePasswordButtonText: 'Save new password',
	missingTokenText: 'This page needs the link from your email. Ask for a new one below.',

	registerTitle: 'Create an EDUcore account',
	registerIntroText: 'Your user name is how you sign in; your email address is where we send links to confirm the account and to reset its password.',
	usernameLabel: 'User name',
	usernameHintText: 'Letters, numbers, underscore and hyphen.',
	firstNameLabel: 'First name',
	lastNameLabel: 'Last name',
	emailLabel: 'Email address',
	passwordLabel: 'Password',
	registerButtonText: 'Create account',
	registrationClosedText: 'New accounts cannot be created here at present.',
	requiredText: 'Required.',

	confirmTitle: 'Confirming your email address',
	confirmWorkingText: 'One moment...',
	confirmIdentifierPromptText: 'To get a new link, enter your user name or email address.',
});
