#!/usr/bin/env node
'use strict';
// @concept: [[PasswordHashing]]

const moduleName = __filename.replace(__dirname + '/', '').replace(/.js$/, ''); //this just seems to come in handy a lot

const qt = require('qtools-functional-library'); //qt.help({printOutput:true, queryString:'.*', sendJson:false});

//START OF moduleFunction() ============================================================

const moduleFunction = ({ moduleName }) => () => {
	// SYSTEM INIT ---------------------------------
	const xLog = process.global.xLog;
	const crypto = require('crypto');

	// the stored form is '<hash hex>:<salt hex>'; both lengths follow from these byte counts
	const HASH_BYTE_COUNT = 64;
	const SALT_BYTE_COUNT = 16;
	const STORED_PASSWORD_HASH_PATTERN = new RegExp(`^[0-9a-f]{${HASH_BYTE_COUNT * 2}}:[0-9a-f]{${SALT_BYTE_COUNT * 2}}$`);

	const pwHash = (password, salt) => {

		salt = salt ? salt : crypto.randomBytes(SALT_BYTE_COUNT).toString('hex');

		// Hashing user's salt and password with 1000 iterations,

		const hash = crypto
			.pbkdf2Sync(password.toString(), salt, 1000, HASH_BYTE_COUNT, `sha512`)
			.toString(`hex`);

		return { hash, salt };
	};
	
	// Verify password against stored hash and salt
	const verify = ({ password, hash, salt }) => {
		if (!password || !hash || !salt) {
			return false;
		}
		
		try {
			const hashToVerify = crypto
				.pbkdf2Sync(password.toString(), salt, 1000, 64, `sha512`)
				.toString(`hex`);
			
			return hashToVerify === hash;
		} catch (error) {
			xLog.error(`Password verification error: ${error.message}`);
			return false;
		}
	};

	// Hash password and return in storage format "hash:salt"
	const hashPassword = (password) => {
		if (!password) {
			throw new Error('Password is required for hashing');
		}
		
		const { hash, salt } = pwHash(password);
		return `${hash}:${salt}`;
	};

	// Verify password against storage format "hash:salt"
	const verifyPassword = (password, storedPassword) => {
		if (!password || !storedPassword) {
			return false;
		}
		
		// Check if it's in hash:salt format
		if (!storedPassword.includes(':')) {
			return false; // Not a hashed password
		}
		
		const [hash, salt] = storedPassword.split(':');
		return verify({ password, hash, salt });
	};

	// Check if password meets NIST 800-63B requirements
	const validatePasswordStrength = (password) => {
		const errors = [];
		
		// NIST 800-63B requirements:
		// - Minimum 8 characters (we'll use 12 for better security)
		// - Maximum 64 characters
		// - No composition rules (mixed case, numbers, special chars not required)
		// - Check against common passwords
		
		if (!password) {
			errors.push('Password is required');
			return { isValid: false, errors };
		}
		
		if (password.length < 12) {
			errors.push('Password must be at least 12 characters long');
		}
		
		if (password.length > 64) {
			errors.push('Password must be no more than 64 characters long');
		}
		
		// Check for common weak passwords
		const commonPasswords = [
			'password', '123456', '123456789', 'qwerty', 'abc123', 
			'password123', 'admin', 'letmein', 'welcome', 'monkey',
			'1234567890', 'password1', 'qwerty123', 'password12'
		];
		
		if (commonPasswords.some(common => password.toLowerCase().includes(common.toLowerCase()))) {
			errors.push('Password contains common words or patterns');
		}
		
		// Check for repeated characters (more than 3 in a row)
		if (/(.)\1{3,}/.test(password)) {
			errors.push('Password cannot contain more than 3 consecutive identical characters');
		}
		
		return {
			isValid: errors.length === 0,
			errors
		};
	};

	// isStoredPasswordHash - true only for this module's own stored form. 'Contains a colon' was the old test, and a typed
	// password with a colon was stored as typed (review SF-2, 2026-11-10): every path now hashes unless this is true.
	const isStoredPasswordHash = (passwordText) => typeof passwordText === 'string' && STORED_PASSWORD_HASH_PATTERN.test(passwordText);

	return { pwHash, verify, hashPassword, verifyPassword, validatePasswordStrength, isStoredPasswordHash };
};

//END OF moduleFunction() ============================================================

module.exports = moduleFunction(moduleName); //returns initialized moduleFunction
