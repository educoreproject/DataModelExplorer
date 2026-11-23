#!/usr/bin/env node
'use strict';
// sendOneRealEmail.js — the ONE real send of Phase 2 (WORKORDER-userRegistrationReset-112026), run BY HAND, never by the
// suite (it is not a *.test.js, so runServerSuite.sh and CI never see it). It reads a REAL instance's [email-sender]
// section (default qbook) and sends one short message through lib/email-sender.js and Resend. On qbook,
// redirectAllEmailTo sends it to tqii whatever the recipient says. It prints the message id or the named refusal, and
// never the API key.
//
//   node server/test/manual/sendOneRealEmail.js --instanceName=qbook --toAddress=tq@justkidding.com

const path = require('path');
const commandLineParser = require('qtools-parse-command-line');
const configFileProcessor = require('qtools-config-file-processor');
const { emailSenderOf } = require('../../lib/email-sender');

// lib/email-sender.js logs an unreachable first attempt through process.global.xLog, as it does inside the server
process.global = { xLog: { status: (logText) => console.log(logText), error: (logText) => console.error(logText) } };

const { values: valueListByName } = commandLineParser.getParameters();
const instanceName = [].concat(valueListByName.instanceName || [])[0];
const toAddress = [].concat(valueListByName.toAddress || [])[0];
if (!instanceName || !toAddress) {
	console.error('sendOneRealEmail: REFUSED: --instanceName and --toAddress are both required');
	process.exit(2);
}

const instanceConfigDirPath = path.join(__dirname, '..', '..', '..', '..', 'configs', 'instanceSpecific', instanceName);
const emailSenderSettings = configFileProcessor.getConfig('startApiServer.ini', instanceConfigDirPath, { resolve: true })['email-sender'];
const emailSender = emailSenderOf({ emailSenderSettings });
if (emailSender.configRefusal) {
	console.error(`sendOneRealEmail: REFUSED: ${emailSender.configRefusal}`);
	process.exit(1);
}

const sentAtText = new Date().toISOString();
emailSender.sendEmail(
	{
		toList: [toAddress],
		subject: `EDUcore mail check from ${instanceName}`,
		text: `This is the one-time check that the EDUcore server can send mail through Resend (registration and password reset work, ${sentAtText}). No action is needed.`,
		html: `<p>This is the one-time check that the EDUcore server can send mail through Resend (registration and password reset work, ${sentAtText}).</p><p>No action is needed.</p>`,
	},
	(sendErrorText, sendResult) => {
		if (sendErrorText) {
			console.error(`sendOneRealEmail: NOT SENT: ${sendErrorText}`);
			process.exit(1);
		}
		console.log(`sendOneRealEmail: SENT messageId=${sendResult.messageId} deliveredTo=${sendResult.deliveredToList.join(', ')} at ${sentAtText}`);
		process.exit(0);
	},
);
