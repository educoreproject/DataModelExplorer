'use strict';
// @concept: [[DataModelExplorer]]

// zip-entry-reader — reads ONE named entry out of a zip held in memory (use-case Structure tab, 2026-10-30;
// PLAN-useCaseStructureTab-103026). educore carries no zip library, and the only zips it opens are the forge's own
// downloads (small, deterministic, stored or deflated, never zip64), so this reads exactly that much of the format with
// Node's zlib and REFUSES anything else by name. A caller that serves the bytes must still check them against a
// checksum it trusts (the forge zip's own SHA256SUMS): this reader can then only ever refuse, never serve wrong bytes.
//
// readZipEntry({ zipBuffer, entryName }, callback(errorText, entryBuffer))
// Refusals (each text begins with its name): zipUnreadable (no end-of-central-directory record, a zip64 or out-of-range
// record), zipEntryAbsent, zipEntryMethodUnsupported, zipEntryDamaged (inflate failed or the size is not the declared one).

const zlib = require('zlib');

const END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;
const CENTRAL_DIRECTORY_HEADER_SIGNATURE = 0x02014b50;
const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
const END_OF_CENTRAL_DIRECTORY_MIN_LENGTH = 22;
const ZIP_COMMENT_MAX_LENGTH = 65535;
const ZIP64_MARKER = 0xffffffff;

// how each compression method the forge writes is undone (data, not a branch); an unlisted method is refused
const inflaterByCompressionMethod = Object.freeze({
	0: (compressedBuffer, callback) => callback(null, compressedBuffer),
	8: (compressedBuffer, callback) => zlib.inflateRaw(compressedBuffer, callback),
});

const refusalOf = (refusalName, reasonText) => `${refusalName}: ${reasonText}`;

// the end-of-central-directory record, searched backwards over the longest comment a zip may carry
const endOfCentralDirectoryOffsetOf = (zipBuffer) => {
	const lowestOffset = Math.max(0, zipBuffer.length - END_OF_CENTRAL_DIRECTORY_MIN_LENGTH - ZIP_COMMENT_MAX_LENGTH);
	for (let candidateOffset = zipBuffer.length - END_OF_CENTRAL_DIRECTORY_MIN_LENGTH; candidateOffset >= lowestOffset; candidateOffset--) {
		if (zipBuffer.readUInt32LE(candidateOffset) === END_OF_CENTRAL_DIRECTORY_SIGNATURE) return candidateOffset;
	}
	return -1;
};

// every central-directory entry: its name, method, sizes and where its local header is
const centralDirectoryEntryListOf = (zipBuffer, directoryOffset, entryCount) => {
	const entryList = [];
	let headerOffset = directoryOffset;
	for (let entryIndex = 0; entryIndex < entryCount; entryIndex++) {
		if (headerOffset + 46 > zipBuffer.length || zipBuffer.readUInt32LE(headerOffset) !== CENTRAL_DIRECTORY_HEADER_SIGNATURE) return null;
		const entryNameLength = zipBuffer.readUInt16LE(headerOffset + 28);
		const extraFieldLength = zipBuffer.readUInt16LE(headerOffset + 30);
		const commentLength = zipBuffer.readUInt16LE(headerOffset + 32);
		entryList.push({
			entryName: zipBuffer.toString('utf8', headerOffset + 46, headerOffset + 46 + entryNameLength),
			compressionMethod: zipBuffer.readUInt16LE(headerOffset + 10),
			compressedSize: zipBuffer.readUInt32LE(headerOffset + 20),
			uncompressedSize: zipBuffer.readUInt32LE(headerOffset + 24),
			localHeaderOffset: zipBuffer.readUInt32LE(headerOffset + 42),
		});
		headerOffset += 46 + entryNameLength + extraFieldLength + commentLength;
	}
	return entryList;
};

const readZipEntry = ({ zipBuffer, entryName }, callback) => {
	if (!Buffer.isBuffer(zipBuffer) || zipBuffer.length < END_OF_CENTRAL_DIRECTORY_MIN_LENGTH) {
		callback(refusalOf('zipUnreadable', 'the zip is not a buffer of at least one end-of-central-directory record'));
		return;
	}
	const endOffset = endOfCentralDirectoryOffsetOf(zipBuffer);
	if (endOffset === -1) {
		callback(refusalOf('zipUnreadable', 'no end-of-central-directory record'));
		return;
	}
	const entryCount = zipBuffer.readUInt16LE(endOffset + 10);
	const directoryOffset = zipBuffer.readUInt32LE(endOffset + 16);
	if (directoryOffset === ZIP64_MARKER || directoryOffset >= zipBuffer.length) {
		callback(refusalOf('zipUnreadable', `central directory offset ${directoryOffset} is zip64 or past the end of a ${zipBuffer.length}-byte zip`));
		return;
	}
	const entryList = centralDirectoryEntryListOf(zipBuffer, directoryOffset, entryCount);
	if (!entryList) {
		callback(refusalOf('zipUnreadable', `the central directory does not hold the ${entryCount} entries it declares`));
		return;
	}
	const entry = entryList.find((oneEntry) => oneEntry.entryName === entryName);
	if (!entry) {
		callback(refusalOf('zipEntryAbsent', `the zip holds no entry '${entryName}' (it holds ${entryList.length} entries)`));
		return;
	}
	const inflater = inflaterByCompressionMethod[entry.compressionMethod];
	if (!inflater) {
		callback(refusalOf('zipEntryMethodUnsupported', `${entryName} uses compression method ${entry.compressionMethod}; this reader knows ${Object.keys(inflaterByCompressionMethod).join(', ')}`));
		return;
	}
	const localOffset = entry.localHeaderOffset;
	if ([entry.compressedSize, entry.uncompressedSize, localOffset].includes(ZIP64_MARKER) || localOffset + 30 > zipBuffer.length || zipBuffer.readUInt32LE(localOffset) !== LOCAL_FILE_HEADER_SIGNATURE) {
		callback(refusalOf('zipUnreadable', `${entryName}: its local header at ${localOffset} is zip64 or not a local header`));
		return;
	}
	const dataOffset = localOffset + 30 + zipBuffer.readUInt16LE(localOffset + 26) + zipBuffer.readUInt16LE(localOffset + 28);
	if (dataOffset + entry.compressedSize > zipBuffer.length) {
		callback(refusalOf('zipUnreadable', `${entryName}: its ${entry.compressedSize} bytes run past the end of the zip`));
		return;
	}
	inflater(zipBuffer.subarray(dataOffset, dataOffset + entry.compressedSize), (inflateError, entryBuffer) => {
		if (inflateError) {
			callback(refusalOf('zipEntryDamaged', `${entryName}: ${inflateError.message}`));
			return;
		}
		if (entryBuffer.length !== entry.uncompressedSize) {
			callback(refusalOf('zipEntryDamaged', `${entryName}: ${entryBuffer.length} bytes after inflating, the directory says ${entry.uncompressedSize}`));
			return;
		}
		callback('', Buffer.from(entryBuffer));
	});
};

module.exports = { readZipEntry };
