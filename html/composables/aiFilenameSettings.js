// AI FILENAME SETTINGS — the one Haiku call that suggests a download's filename (useAiFilename.js), as data. The DME and Rosetta both read these.
//   utilityUrl       the public Anthropic relay (server/lib/askmilo-utility.js): no auth gate, two daily spend buckets, a 429 when a bucket is spent
//   modelName        the relay's shorthand for the model
//   maxNameLength    the longest name the prompt asks for (a caller that cleans the answer cuts to its own limit)
//   promptTemplate   the DME's prompt from explorer.vue at 674fb45, byte for byte; {maxNameLength} and {snippetText} are filled by aiFilenamePromptOf
//   cappedHttpStatus the relay's answer when the day's bucket is spent

export const aiFilenameSettings = Object.freeze({
	utilityUrl: '/api/askmilo-utility',
	modelName: 'haiku',
	maxNameLength: 40,
	promptTemplate: 'Given this content, suggest a short camelCase filename (no extension, max {maxNameLength} chars). Reply with ONLY the filename, nothing else.\n\n{snippetText}',
	cappedHttpStatus: 429,
});
