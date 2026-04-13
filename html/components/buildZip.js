// buildZip.js — Minimal ZIP builder using CompressionStream (no dependencies)
//
// ZIP format: sequence of local file entries, then a central directory, then
// an end-of-central-directory record. Each entry's payload is deflate-raw
// compressed via the browser's CompressionStream API.
//
// Usage:
//   import { buildZip } from './buildZip';
//   const blob = await buildZip([
//     { name: '01-query.md', content: 'markdown text' },
//     { name: '01-query.html', content: '<html>...' },
//   ]);
//   // blob is a Blob of type application/zip

const textEncoder = new TextEncoder();

const crc32Table = (() => {
	const table = new Uint32Array(256);
	for (let i = 0; i < 256; i++) {
		let c = i;
		for (let j = 0; j < 8; j++) {
			c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
		}
		table[i] = c;
	}
	return table;
})();

const crc32 = (data) => {
	let crc = 0xFFFFFFFF;
	for (let i = 0; i < data.length; i++) {
		crc = crc32Table[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
	}
	return (crc ^ 0xFFFFFFFF) >>> 0;
};

const deflateRaw = async (data) => {
	const cs = new CompressionStream('deflate-raw');
	const writer = cs.writable.getWriter();
	writer.write(data);
	writer.close();

	const chunks = [];
	const reader = cs.readable.getReader();
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		chunks.push(value);
	}

	let totalLength = 0;
	for (const chunk of chunks) totalLength += chunk.length;
	const result = new Uint8Array(totalLength);
	let offset = 0;
	for (const chunk of chunks) {
		result.set(chunk, offset);
		offset += chunk.length;
	}
	return result;
};

// Write a 16-bit little-endian value into a Uint8Array at offset
const writeU16 = (arr, offset, val) => {
	arr[offset] = val & 0xFF;
	arr[offset + 1] = (val >> 8) & 0xFF;
};

// Write a 32-bit little-endian value into a Uint8Array at offset
const writeU32 = (arr, offset, val) => {
	arr[offset] = val & 0xFF;
	arr[offset + 1] = (val >> 8) & 0xFF;
	arr[offset + 2] = (val >> 16) & 0xFF;
	arr[offset + 3] = (val >> 24) & 0xFF;
};

// DOS date/time from a Date object
const dosDateTime = (date) => {
	const time = ((date.getHours() & 0x1F) << 11) |
		((date.getMinutes() & 0x3F) << 5) |
		((date.getSeconds() >> 1) & 0x1F);
	const day = (((date.getFullYear() - 1980) & 0x7F) << 9) |
		(((date.getMonth() + 1) & 0x0F) << 5) |
		(date.getDate() & 0x1F);
	return { time, day };
};

/**
 * Build a ZIP file from an array of { name, content } entries.
 * @param {Array<{name: string, content: string}>} files
 * @returns {Promise<Blob>} ZIP file as a Blob
 */
export const buildZip = async (files) => {
	const now = new Date();
	const { time: dosTime, day: dosDate } = dosDateTime(now);

	const localEntries = [];
	const centralEntries = [];
	let localOffset = 0;

	for (const file of files) {
		const nameBytes = textEncoder.encode(file.name);
		const rawBytes = textEncoder.encode(file.content);
		const crc = crc32(rawBytes);
		const compressed = await deflateRaw(rawBytes);

		// Local file header (30 bytes + name + compressed data)
		const localHeader = new Uint8Array(30 + nameBytes.length);
		writeU32(localHeader, 0, 0x04034B50);   // Local file header signature
		writeU16(localHeader, 4, 20);            // Version needed (2.0)
		writeU16(localHeader, 6, 0);             // General purpose bit flag
		writeU16(localHeader, 8, 8);             // Compression method: deflate
		writeU16(localHeader, 10, dosTime);
		writeU16(localHeader, 12, dosDate);
		writeU32(localHeader, 14, crc);
		writeU32(localHeader, 18, compressed.length);
		writeU32(localHeader, 22, rawBytes.length);
		writeU16(localHeader, 26, nameBytes.length);
		writeU16(localHeader, 28, 0);            // Extra field length
		localHeader.set(nameBytes, 30);

		localEntries.push(localHeader, compressed);

		// Central directory entry (46 bytes + name)
		const centralHeader = new Uint8Array(46 + nameBytes.length);
		writeU32(centralHeader, 0, 0x02014B50);  // Central directory signature
		writeU16(centralHeader, 4, 20);           // Version made by
		writeU16(centralHeader, 6, 20);           // Version needed
		writeU16(centralHeader, 8, 0);            // Flags
		writeU16(centralHeader, 10, 8);           // Compression: deflate
		writeU16(centralHeader, 12, dosTime);
		writeU16(centralHeader, 14, dosDate);
		writeU32(centralHeader, 16, crc);
		writeU32(centralHeader, 20, compressed.length);
		writeU32(centralHeader, 24, rawBytes.length);
		writeU16(centralHeader, 28, nameBytes.length);
		writeU16(centralHeader, 30, 0);           // Extra field length
		writeU16(centralHeader, 32, 0);           // File comment length
		writeU16(centralHeader, 34, 0);           // Disk number start
		writeU16(centralHeader, 36, 0);           // Internal file attributes
		writeU32(centralHeader, 38, 0);           // External file attributes
		writeU32(centralHeader, 42, localOffset); // Relative offset of local header
		centralHeader.set(nameBytes, 46);

		centralEntries.push(centralHeader);

		localOffset += localHeader.length + compressed.length;
	}

	// End of central directory record (22 bytes)
	let centralDirSize = 0;
	for (const entry of centralEntries) centralDirSize += entry.length;

	const endRecord = new Uint8Array(22);
	writeU32(endRecord, 0, 0x06054B50);          // End of central directory signature
	writeU16(endRecord, 4, 0);                    // Disk number
	writeU16(endRecord, 6, 0);                    // Disk with central directory
	writeU16(endRecord, 8, files.length);         // Entries on this disk
	writeU16(endRecord, 10, files.length);        // Total entries
	writeU32(endRecord, 12, centralDirSize);
	writeU32(endRecord, 16, localOffset);         // Offset of central directory
	writeU16(endRecord, 20, 0);                   // Comment length

	return new Blob(
		[...localEntries, ...centralEntries, endRecord],
		{ type: 'application/zip' },
	);
};
