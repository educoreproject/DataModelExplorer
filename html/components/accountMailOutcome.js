// accountMailOutcome.js — how the account pages read the server's "your mail did not go" (WORKORDER-
// accountMailFailureAndApprovalNotice-112326 M3, M6) and "an administrator must approve this" (M4) answers.
//
// The not-sent case is a refusal (503) on all three forms, by one of four names (server lib/user-profile-rules.json
// mailFailureRefusalNameByFlow): accountMailNotSent / accountMailRefused on the reset and resend forms,
// registrationMailNotSent / registrationMailRefused at sign-up (whose account is then undone). Its reason is shown as sent.
// An approval reply carries isAwaitingApproval (approval now) or isApprovalAfterConfirmation (approval once the address
// is confirmed); the pages then show AccountApprovalNotice beside the success line.

export const MAIL_NOT_SENT_REFUSAL_NAME_LIST = Object.freeze(['accountMailNotSent', 'accountMailRefused', 'registrationMailNotSent', 'registrationMailRefused']);

export const isMailNotSentRefusal = (refusalName) => MAIL_NOT_SENT_REFUSAL_NAME_LIST.includes(refusalName);

export const isApprovalReply = (replyObject) => !!replyObject && (replyObject.isAwaitingApproval === true || replyObject.isApprovalAfterConfirmation === true);
