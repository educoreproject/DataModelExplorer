// accountMailOutcome.js — how the account pages read the server's "your mail did not go" (WORKORDER-
// accountMailFailureAndApprovalNotice-112326 M3) and "an administrator must approve this" (M4) answers.
//
// One name for the not-sent case on both sides of the wire: the reset and resend forms are refused with refusalName
// accountMailNotSent (503); a registration, whose account IS created, replies 200 with mailOutcome accountMailNotSent.
// An approval reply carries isAwaitingApproval (approval now) or isApprovalAfterConfirmation (approval once the address
// is confirmed); the pages set either message apart with AccountApprovalNotice.

export const ACCOUNT_MAIL_NOT_SENT_NAME = 'accountMailNotSent';

export const isMailNotSentRefusal = (refusalName) => refusalName === ACCOUNT_MAIL_NOT_SENT_NAME;

export const isMailNotSentReply = (replyObject) => !!replyObject && replyObject.mailOutcome === ACCOUNT_MAIL_NOT_SENT_NAME;

export const isApprovalReply = (replyObject) => !!replyObject && (replyObject.isAwaitingApproval === true || replyObject.isApprovalAfterConfirmation === true);
