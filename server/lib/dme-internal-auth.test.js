'use strict';
// Unit test for dme-internal-auth.resolveInternalAuth — the security decision matrix for
// the per-user graph executor's second auth mode (Option A). Pure function, no server.
// Run: node server/lib/dme-internal-auth.test.js

const { resolveInternalAuth, isLoopbackAddress } = require('./dme-internal-auth');

const SECRET = 'test-secret-abc123';

const mkReq = ({ headers = {}, peer = '127.0.0.1' } = {}) => ({
	headers,
	socket: { remoteAddress: peer },
	ip: peer,
});

const results = [];
const ok = (name, cond) => results.push([name, !!cond]);

// 1. No header -> JWT path
ok(
	'no internal-secret header -> internal:false',
	resolveInternalAuth({ xReq: mkReq({}), configuredSecret: SECRET }).internal === false,
);

// 2. Header present but server has no secret configured -> disabled
ok(
	'no secret configured -> internal:false',
	resolveInternalAuth({
		xReq: mkReq({ headers: { 'x-dme-internal-secret': SECRET } }),
		configuredSecret: '',
	}).internal === false,
);

// 3. Wrong secret -> false
ok(
	'wrong secret -> internal:false',
	resolveInternalAuth({
		xReq: mkReq({ headers: { 'x-dme-internal-secret': 'WRONG' } }),
		configuredSecret: SECRET,
	}).internal === false,
);

// 4. Correct secret + loopback 127.0.0.1 + no forwarding -> true
ok(
	'correct secret + 127.0.0.1 -> internal:true',
	resolveInternalAuth({
		xReq: mkReq({ headers: { 'x-dme-internal-secret': SECRET }, peer: '127.0.0.1' }),
		configuredSecret: SECRET,
	}).internal === true,
);

// 5. Correct secret + ::1 -> true
ok(
	'correct secret + ::1 -> internal:true',
	resolveInternalAuth({
		xReq: mkReq({ headers: { 'x-dme-internal-secret': SECRET }, peer: '::1' }),
		configuredSecret: SECRET,
	}).internal === true,
);

// 6. Correct secret + IPv4-mapped IPv6 loopback -> true
ok(
	'correct secret + ::ffff:127.0.0.1 -> internal:true',
	resolveInternalAuth({
		xReq: mkReq({ headers: { 'x-dme-internal-secret': SECRET }, peer: '::ffff:127.0.0.1' }),
		configuredSecret: SECRET,
	}).internal === true,
);

// 7. Correct secret but NON-loopback peer -> false
ok(
	'correct secret + non-loopback peer -> internal:false',
	resolveInternalAuth({
		xReq: mkReq({ headers: { 'x-dme-internal-secret': SECRET }, peer: '8.8.8.8' }),
		configuredSecret: SECRET,
	}).internal === false,
);

// 8. Correct secret + loopback BUT x-forwarded-for present -> false (proxied origin)
ok(
	'correct secret + x-forwarded-for -> internal:false',
	resolveInternalAuth({
		xReq: mkReq({
			headers: { 'x-dme-internal-secret': SECRET, 'x-forwarded-for': '8.8.8.8' },
			peer: '127.0.0.1',
		}),
		configuredSecret: SECRET,
	}).internal === false,
);

// 9. Correct secret + loopback BUT x-real-ip present -> false
ok(
	'correct secret + x-real-ip -> internal:false',
	resolveInternalAuth({
		xReq: mkReq({
			headers: { 'x-dme-internal-secret': SECRET, 'x-real-ip': '8.8.8.8' },
			peer: '127.0.0.1',
		}),
		configuredSecret: SECRET,
	}).internal === false,
);

// 10. isLoopbackAddress helper sanity
ok('isLoopbackAddress 127.0.0.1', isLoopbackAddress('127.0.0.1') === true);
ok('isLoopbackAddress 10.0.0.5 false', isLoopbackAddress('10.0.0.5') === false);
ok('isLoopbackAddress empty false', isLoopbackAddress('') === false);

let allPass = true;
results.forEach(([n, g]) => {
	if (!g) allPass = false;
	console.log(`${g ? 'PASS' : 'FAIL'} - ${n}`);
});
console.log(allPass ? 'ALL_PASS' : 'SOME_FAIL');
process.exit(allPass ? 0 : 1);
