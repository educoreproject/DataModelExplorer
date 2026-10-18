// Logs in by POST, credentials in the body (2026-10-08), falling back to the old GET when the backend has no POST route.
//
// The Vercel deploys rewrite /api/* to https://ed-core.org/api/*. A backend still running code from before 2575721
// has only GET /api/login and answers a POST with Express's 404 "Cannot POST /api/login". Only that 404/405 retries
// with GET; a 401 (wrong password) or any other error is thrown as it came. The GET puts the password in the query
// string, so this fallback should come out once every backend the frontend talks to has the POST route.

import axios from 'axios';

export const postLogin = async ({ username, password }) => {
	try {
		return await axios.post('/api/login', { username, password });
	} catch (error) {
		if (![404, 405].includes(error.response?.status)) {
			throw error;
		}
		return axios.get('/api/login', { params: { username, password } });
	}
};
