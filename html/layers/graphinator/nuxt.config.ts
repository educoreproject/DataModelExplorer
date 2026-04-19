// Graphinator Nuxt layer.
//
// Self-contained UI component set: streaming AI panel, download button,
// vendored composables (multipart content resolver, Graphviz renderer),
// and a Pinia store factory.
//
// Consumers pick this up via:
//   extends: ['./layers/graphinator']
//
// Nuxt merges components/, composables/, and stores/ from this layer
// into the consuming project's auto-import registry.

export default defineNuxtConfig({
	// No layer-specific settings required. Layer consumers inherit the main
	// project's @pinia/nuxt configuration.
});
