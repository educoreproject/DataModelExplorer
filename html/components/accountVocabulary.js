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
	emailNotValidText: 'Enter an email address such as name@example.org.',
	passwordLabel: 'Password',
	registerButtonText: 'Create account',
	registrationClosedText: 'New accounts cannot be created here at present.',
	requiredText: 'Required.',

	confirmTitle: 'Confirming your email address',
	confirmWorkingText: 'One moment...',
	confirmIdentifierPromptText: 'To get a new link, enter your user name or email address.',

	// WORKORDER-adminApproval-112126: the approval steps the applicant sees, and the approval page
	registerApprovalNoticeText: 'New accounts here are approved by an administrator before they can sign in. We will email you when yours is decided.',
	approvalPageTitle: 'Account application',
	approvalPendingListTitle: 'Waiting for approval',
	approvalPendingListEmptyText: 'No account is waiting for approval.',
	approvalUsernameLabel: 'User name',
	approvalNameLabel: 'Name',
	approvalEmailLabel: 'Email address',
	approvalSignedUpLabel: 'Signed up',
	approvalStateLabel: 'State',
	approvalDecidedLabel: 'Decided',
	approvalCommentLabel: 'Comment',
	approvalNoCommentText: '(none)',
	// WORKORDER-approvalLooseEnds-112126 L1: shown where an account time is absent (components/accountTimeText.js)
	timeAbsentText: '(not recorded)',
	// A8: the optional note an applicant leaves for the approvers
	applicationCommentLabel: 'Comment for the administrators (optional)',
	applicationCommentHintText: 'Who you are and why you would like an account. Only administrators see it.',
	applicationCommentTooLongText: 'At most 1000 characters.',
	approveButtonText: 'Approve',
	declineButtonText: 'Decline',
	sendDeclineEmailLabel: 'Email the applicant that the account was not approved',
	approvalChooseApplicantText: 'Choose an application from the list.',
	// WORKORDER-approvalMailPolish-112126 P4: the Pending approvals tool on /admin
	pendingApprovalsToolText: 'PENDING APPROVALS',
	pendingApprovalsTitle: 'Accounts waiting for approval',
	pendingApprovalsReviewText: 'Review',
	pendingApprovalsRefreshText: 'Refresh',
	// WORKORDER-approvalLooseEnds-112126 L6: an /admin tool opened (?tool=...) by someone whose role may not use it
	adminToolNotPermittedText: 'Only an administrator can use this tool.',
	// WORKORDER-approvalLooseEnds-112126 L7: the approval page opened by someone who is not an approver
	approvalNotApproverText: 'Only administrators can review account applications.',
	accountStateTextByName: Object.freeze({
		pendingApproval: 'waiting for approval',
		declined: 'declined',
		active: 'approved (active)',
		pendingConfirmation: 'email not yet confirmed',
		disabled: 'disabled by an administrator',
	}),
	decisionTextByName: Object.freeze({ approve: 'approved', decline: 'declined' }),
});
