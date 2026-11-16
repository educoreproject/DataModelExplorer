'use strict';

// numberText.js — how the report prints a number. One place, so a share is never printed without its count beside it
// when the builders use shareWithCountText, and an absent figure prints as the words that say why, never as 0 or NaN.

const countText = (countNumber) => Number(countNumber).toLocaleString('en-US');

const percentText = (shareNumber, decimalCount = 1) => (shareNumber === null || shareNumber === undefined ? 'not measured' : `${(shareNumber * 100).toFixed(decimalCount)}%`);

// "47 of 101 (46.5%)": the count, the whole and the share, together
const shareWithCountText = (partCount, wholeCount) => (wholeCount === 0 ? `${countText(partCount)} of 0` : `${countText(partCount)} of ${countText(wholeCount)} (${percentText(partCount / wholeCount)})`);

const intervalText = (interval) => (interval ? `${percentText(interval.lowerRate, 0)} to ${percentText(interval.upperRate, 0)}` : 'no interval (no answers)');

module.exports = { countText, percentText, shareWithCountText, intervalText };
