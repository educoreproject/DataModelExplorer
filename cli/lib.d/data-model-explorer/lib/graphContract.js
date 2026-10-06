'use strict';

// graphContract.js — the DME's reading of the graph contract (CONTRACTS-declared-100626 §0; campaign P2, W-A-3). educore has
// no require path into educoreForge, so the contract arrives as a GENERATED file, contract/graphContract.json, written byte
// for byte by educoreForge lib/vocabulary/tools/emitGraphContractJson.js. readerSha256 is the sha256 of THOSE BYTES — the same
// bytes the forge hashed into every passport it writes (graphContractSha256) — so "this reader and that graph agree on the
// contract" is one string comparison, made by passportReader before anything is rendered.
//
//   { contract, readerSha256, CONTRACT_FILE_PATH, PASSPORT_PARSER_BY_TYPE }
//
// Loaded once per process (the CLI is spawned per call). An absent or unparseable file is fatal at load: a reader with no
// contract would read every passport as nonconforming, and saying so per call would hide the real fault.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CONTRACT_FILE_PATH = path.join(__dirname, '..', 'contract', 'graphContract.json');
const contractText = fs.readFileSync(CONTRACT_FILE_PATH, 'utf8');
const readerSha256 = crypto.createHash('sha256').update(contractText, 'utf8').digest('hex');
const contract = JSON.parse(contractText);

// the ONE declared parse of a jsonString passport field (V1-C23); a field of any other type is read as stored
const PASSPORT_PARSER_BY_TYPE = Object.freeze({ jsonString: (storedText) => JSON.parse(storedText) });

module.exports = { contract, readerSha256, CONTRACT_FILE_PATH, PASSPORT_PARSER_BY_TYPE };
