'use strict';
// testLoginCredentials.js — the DME login the multiTenant suites use, read from the environment, never from the repo.
// (2026-10-07: a literal login password committed here in June reached the public GitHub repository. This module is the
// one place the suites get credentials; noContainerLiterals.test.js fails if a literal login password returns.)
//
//   DME_TEST_USERNAME / DME_TEST_PASSWORD                 the primary test user
//   DME_TEST_SECOND_USERNAME / DME_TEST_SECOND_PASSWORD   a second user, for the isolation checks (phase 4 only)
//
// A missing variable is refused by name; there is no default.

const readRequiredEnv = (variableName) => {
	const variableValue = process.env[variableName];
	if (!variableValue) {
		console.error(`FATAL: ${variableName} is not set; export it before running (the multiTenant suites read their DME login from the environment; there is no default)`);
		process.exit(1);
	}
	return variableValue;
};

const primaryTestLogin = () => ({ loginUsername: readRequiredEnv('DME_TEST_USERNAME'), loginPassword: readRequiredEnv('DME_TEST_PASSWORD') });

const secondTestLogin = () => ({ loginUsername: readRequiredEnv('DME_TEST_SECOND_USERNAME'), loginPassword: readRequiredEnv('DME_TEST_SECOND_PASSWORD') });

module.exports = { primaryTestLogin, secondTestLogin };
