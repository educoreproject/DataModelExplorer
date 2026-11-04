'use strict';

// admitRequest — the one access function of the standards query service (design section 1.10). Every door calls it; nothing else decides admission.
//   admitRequest({ door, credential, operationName, registryRow }, callback) → callback('', { principal } | { refusal: { refusalName, reason } })
//   principal: { kind: 'anonymous' | 'siteUser' | 'oauthUser', userRefId, role }
// A site token's noToken claim says nothing about login (login tokens carry it too): the test is user.role, present and not 'public'.

const PUBLIC_ROLE_NAME = 'public';
const MCP_DOOR_NAME = 'mcp';

const ANONYMOUS_PRINCIPAL = Object.freeze({ kind: 'anonymous', userRefId: '', role: '' });

const signedInUserOf = (authclaims) => {
	const user = authclaims && authclaims.user;
	return user && user.role && user.role !== PUBLIC_ROLE_NAME ? user : null;
};

// one reader per door (DATA, no branch); a credential that names nobody is the anonymous principal, never a refusal: every core operation is public
const PRINCIPAL_READER_BY_DOOR = Object.freeze({
	api: (authclaims) => {
		const user = signedInUserOf(authclaims);
		return user ? { kind: 'siteUser', userRefId: user.refId, role: user.role } : ANONYMOUS_PRINCIPAL;
	},
	mcp: (mcpAuth) => (mcpAuth && mcpAuth.sub ? { kind: 'oauthUser', userRefId: mcpAuth.sub, role: mcpAuth.role } : ANONYMOUS_PRINCIPAL),
});

const ADMISSION_TEST_BY_NAME = Object.freeze({
	public: () => '',
	signedIn: (principal) => (principal.kind === 'anonymous' ? 'signedInRequired' : ''),
});

const admitRequest = ({ door, credential, operationName, registryRow }, callback) => {
	const readPrincipal = PRINCIPAL_READER_BY_DOOR[door];
	if (!readPrincipal) {
		callback(`admitRequest: unknown door '${door}'; the doors are ${Object.keys(PRINCIPAL_READER_BY_DOOR).join(', ')}`);
		return;
	}
	const admissionTest = ADMISSION_TEST_BY_NAME[registryRow.admission];
	if (!admissionTest) {
		callback(`admitRequest: operation ${operationName} has unknown admission '${registryRow.admission}'`);
		return;
	}
	const principal = readPrincipal(credential);
	// design 4.8: a rosetta tool needs a person. The MCP loopback has no sub, so every loopback client would be one owner; a users row whose role is public names nobody who signed in.
	if (door === MCP_DOOR_NAME && registryRow.mcpDoorRefusesLoopback && (principal.kind === 'anonymous' || principal.role === PUBLIC_ROLE_NAME)) {
		callback('', { refusal: { refusalName: 'loopbackNotAdmitted', reason: `${operationName} on MCP needs an account signed in by OAuth; a loopback or public-role caller has none. The Query API answers it with no credential.` } });
		return;
	}
	const refusalName = admissionTest(principal);
	callback('', refusalName ? { refusal: { refusalName, reason: `${operationName} needs a signed-in person; this request carries no such credential` } } : { principal });
};

module.exports = { admitRequest };
