'use strict';

// admitRequest — the one access function of the standards query service (design section 1.10). Every door calls it; nothing else decides admission.
//   admitRequest({ door, credential, clientAddress?, operationName, registryRow }, callback) → callback('', { principal } | { refusal: { refusalName, reason } })
//   principal: { kind: 'anonymous' | 'siteUser' | 'oauthUser', userRefId, role, visitorAddress? }
//   ⟪rosettaMeanings R3⟫ clientAddress is the API door's req.ip (trust proxy 1 made it the address nginx saw; no header is read here). An anonymous principal on that
//   door carries it as visitorAddress, in memory only: the job service turns it into visitorRefId with a keyed HMAC (a secret this module never holds) before
//   anything is stored, so the address itself is never kept. MCP has no address, and no visitorAddress.
// A site token's noToken claim says nothing about login (login tokens carry it too): the test is user.role, present and not 'public'.

const PUBLIC_ROLE_NAME = 'public';
const MCP_DOOR_NAME = 'mcp';

const ANONYMOUS_PRINCIPAL_KIND = 'anonymous';
const ANONYMOUS_PRINCIPAL = Object.freeze({ kind: ANONYMOUS_PRINCIPAL_KIND, userRefId: '', role: '' });

const signedInUserOf = (authclaims) => {
	const user = authclaims && authclaims.user;
	return user && user.role && user.role !== PUBLIC_ROLE_NAME ? user : null;
};

// one reader per door (DATA, no branch); a credential that names nobody is the anonymous principal, never a refusal: every core operation is public
const PRINCIPAL_READER_BY_DOOR = Object.freeze({
	api: (authclaims, clientAddress) => {
		const user = signedInUserOf(authclaims);
		if (user) {
			return { kind: 'siteUser', userRefId: user.refId, role: user.role };
		}
		return clientAddress ? { ...ANONYMOUS_PRINCIPAL, visitorAddress: String(clientAddress) } : ANONYMOUS_PRINCIPAL;
	},
	mcp: (mcpAuth) => (mcpAuth && mcpAuth.sub ? { kind: 'oauthUser', userRefId: mcpAuth.sub, role: mcpAuth.role } : ANONYMOUS_PRINCIPAL),
});

const REFUSAL_REASON_BY_NAME = Object.freeze({
	judgedStepNotOfferedToScripts: 'the judged step is offered through website sign-in and MCP sign-in; a request with neither is refused, until API credentials exist. Retrieval is open and needs none.',
	notFound: 'there is no such job for this account',
});

const ADMISSION_TEST_BY_NAME = Object.freeze({
	public: () => '',
	signedIn: (principal) => (principal.kind === 'anonymous' ? 'signedInRequired' : ''),
	// Rosetta's judged step (Q25): the credential is the test. The row names what the anonymous are told: a submit says scripts are not offered this yet, and a status or fetch says notFound, as for any job not theirs.
	judgedStep: (principal, registryRow) => (principal.kind === 'anonymous' ? registryRow.anonymousRefusalName : ''),
	// ⟪rosettaMeanings R3, TQ Q86⟫ the judged step opened to visitors: a person signed in, or an anonymous visitor the API door could name by address. Anyone else (an anonymous caller with no address) is told what the row names.
	judgedStepOpenToVisitors: (principal, registryRow) => (principal.kind === ANONYMOUS_PRINCIPAL_KIND && !principal.visitorAddress ? registryRow.anonymousRefusalName : ''),
});

const admitRequest = ({ door, credential, clientAddress, operationName, registryRow }, callback) => {
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
	const principal = readPrincipal(credential, clientAddress);
	// design 4.8: a rosetta tool needs a person. The MCP loopback has no sub, so every loopback client would be one owner; a users row whose role is public names nobody who signed in.
	if (door === MCP_DOOR_NAME && registryRow.mcpDoorRefusesLoopback && (principal.kind === 'anonymous' || principal.role === PUBLIC_ROLE_NAME)) {
		callback('', { refusal: { refusalName: 'loopbackNotAdmitted', reason: `${operationName} on MCP needs an account signed in by OAuth; a loopback or public-role caller has none. The Query API answers it with no credential.` } });
		return;
	}
	const refusalName = admissionTest(principal, registryRow);
	callback('', refusalName ? { refusal: { refusalName, reason: REFUSAL_REASON_BY_NAME[refusalName] || `${operationName} needs a signed-in person; this request carries no such credential` } } : { principal });
};

module.exports = { admitRequest, ANONYMOUS_PRINCIPAL_KIND };
