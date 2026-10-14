'use strict';

// seededDraw.js — the rater tool's deterministic randomness. Every draw, split, deal and shuffle is a pure function of
// (seed text, a label naming what is being shuffled, the input list), so the same seed gives byte-identical output and two
// labels never share a stream. The stream is sha256(seedText ':' label ':' counter), 48 bits per number.
//
//   seededUnitStream(seedText, label) -> nextUnit() in [0, 1)
//   seededShuffle(itemList, seedText, label) -> a new list (Fisher-Yates); the input list is not changed

const crypto = require('crypto');

const seededUnitStream = (seedText, label) => {
	if (typeof seedText !== 'string' || seedText === '' || typeof label !== 'string' || label === '') {
		throw new Error(`seededDraw: seedText and label must be non-empty strings; got ${JSON.stringify([seedText, label])}`);
	}
	let counter = 0;
	return () => {
		const digestHex = crypto.createHash('sha256').update(`${seedText}:${label}:${counter}`).digest('hex');
		counter += 1;
		return parseInt(digestHex.slice(0, 12), 16) / 2 ** 48;
	};
};

const seededShuffle = (itemList, seedText, label) => {
	const nextUnit = seededUnitStream(seedText, label);
	const shuffledList = itemList.slice();
	for (let position = shuffledList.length - 1; position > 0; position--) {
		const swapPosition = Math.floor(nextUnit() * (position + 1));
		const held = shuffledList[position];
		shuffledList[position] = shuffledList[swapPosition];
		shuffledList[swapPosition] = held;
	}
	return shuffledList;
};

module.exports = { seededUnitStream, seededShuffle };
