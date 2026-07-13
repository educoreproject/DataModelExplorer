'use strict';
// Raw-body + urlencoded capture gate (DME/Slack plan v3, task 1.1).
// Exercises the exact middleware shape mounted in startApiServer.js against the
// repo's own express/body-parser: a form-encoded POST parses, xReq.rawBody holds
// the exact request bytes (both content types), and JSON parsing is unchanged.
//
// Run: node server/test/raw-body-capture.test.js

const express = require('express');
const bodyParser = require('body-parser');
const http = require('http');

const results = [];
const ok = (name, cond, detail) => {
	results.push([name, !!cond]);
	console.log(`  ${cond ? 'PASS' : 'FAIL'}: ${name}${detail ? ` — ${detail}` : ''}`);
};

// identical to the startApiServer.js mounting
const rawBodyCapture = (xReq, xRes, buf) => {
	xReq.rawBody = buf;
};
const app = express();
app.use(bodyParser.json({ extended: true, verify: rawBodyCapture }));
app.use(bodyParser.urlencoded({ extended: true, verify: rawBodyCapture }));

app.post('/echo', (xReq, xRes) => {
	xRes.json({
		parsedBody: xReq.body,
		rawBodyString: xReq.rawBody ? xReq.rawBody.toString('utf8') : null,
		rawBodyIsBuffer: Buffer.isBuffer(xReq.rawBody),
	});
});

const postRaw = (port, contentType, bodyString, callback) => {
	const request = http.request(
		{
			host: '127.0.0.1',
			port,
			path: '/echo',
			method: 'POST',
			headers: {
				'content-type': contentType,
				'content-length': Buffer.byteLength(bodyString),
			},
		},
		(response) => {
			let data = '';
			response.on('data', (chunk) => {
				data += chunk;
			});
			response.on('end', () => callback('', JSON.parse(data)));
		},
	);
	request.on('error', (err) => callback(String(err)));
	request.write(bodyString);
	request.end();
};

const server = app.listen(0, () => {
	const port = server.address().port;
	const formBody =
		'token=fixtureToken&team_id=T0001&command=%2Fdme&text=birth+date&response_url=https%3A%2F%2Fhooks.slack.com%2Fcommands%2Ffixture';
	const jsonBody = JSON.stringify({ action: 'query', note: 'unchanged path' });

	postRaw(port, 'application/x-www-form-urlencoded', formBody, (formErr, formResult) => {
		if (formErr) {
			console.error(`form POST failed: ${formErr}`);
			process.exit(1);
		}

		ok(
			'form-encoded POST parses',
			formResult.parsedBody &&
				formResult.parsedBody.command === '/dme' &&
				formResult.parsedBody.text === 'birth date',
			`command=${formResult.parsedBody && formResult.parsedBody.command}`,
		);
		ok(
			'rawBody holds exact form bytes',
			formResult.rawBodyIsBuffer && formResult.rawBodyString === formBody,
		);

		postRaw(port, 'application/json', jsonBody, (jsonErr, jsonResult) => {
			if (jsonErr) {
				console.error(`json POST failed: ${jsonErr}`);
				process.exit(1);
			}

			ok(
				'JSON POST parses unchanged',
				jsonResult.parsedBody && jsonResult.parsedBody.action === 'query',
			);
			ok(
				'rawBody holds exact JSON bytes',
				jsonResult.rawBodyIsBuffer && jsonResult.rawBodyString === jsonBody,
			);

			server.close();
			const failed = results.filter(([, pass]) => !pass).length;
			console.log(
				`\n=== Results: ${results.length - failed} passed, ${failed} failed ===\n`,
			);
			process.exit(failed > 0 ? 1 : 0);
		});
	});
});
