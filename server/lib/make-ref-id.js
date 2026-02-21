'use strict';

const crypto = require('crypto');

// ============================================================================
// make-ref-id.js — Cryptographically random alphanumeric ID generator
//
// Based on TQ's qtools-new-refid pattern. Uses Node's built-in crypto module
// instead of sodium-native for zero external dependencies.
//
// Usage:
//   const makeRefId = require('./lib/make-ref-id');
//   const id = makeRefId();          // 20-char alphanumeric string
//   const short = makeRefId(10);     // 10-char alphanumeric string
// ============================================================================

const excludedChars = ['0', 'O', '1', 'l'];
const allChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const cleanupRegEx = new RegExp(`(${excludedChars.join('|')})`, 'g');
const workingCharSet = allChars.replace(cleanupRegEx, '');

const makeRefId = (digits = 20) => {
	const bytes = crypto.randomBytes(digits);
	let outString = '';
	for (let i = 0; i < digits; i++) {
		outString += workingCharSet[bytes[i] % workingCharSet.length];
	}
	return outString;
};

module.exports = makeRefId;
