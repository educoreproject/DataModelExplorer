// edMatrixStore.js — Pinia store for EdMatrix Standards Matrix
//
// Pure client-side data store. No API calls — all 33 standards are embedded.
// State: rawData, viewMode, activeFilter
// Getters: standards (hydrated), currentRows, filteredStandards
// Actions: toggleFilter, resetFilter, countMatches, getCellClass

export const useEdMatrixStore = defineStore('edMatrixStore', {
	state: () => ({
		viewMode: 'dataCategory', // 'dataCategory' or 'useCase'
		activeFilter: { type: null, layer: null },

		types: [
			'Organizational',
			'Personal',
			'Event',
			'Achievement',
			'Credential',
			'Competency',
			'Content Metadata',
			'Content',
			'AI',
		],

		useCaseCategories: ['AI-empowered Learning', 'All Learning Counts'],

		layerNames: ['Data Dictionary', 'Logical Model', 'Serialization', 'Protocol'],

		layerMap: {
			1: 'Data Dictionary',
			2: 'Logical Model',
			3: 'Serialization',
			4: 'Protocol',
		},

		rawData: [
			{ name: 'CASE', org: '1EdTech', types: ['Competency'], dataLayers: [1, 2, 3, 4], uses: ['JSON-LD'], url: 'https://www.imsglobal.org/activity/case', excerpt: '<p><strong>CASE:</strong> Representation of competency frameworks and learning objectives.</p>' },
			{ name: 'CC', org: '1EdTech', types: ['Content Metadata', 'Content'], dataLayers: [2, 3], uses: ['XML', 'Zip'], url: 'http://www.imsglobal.org/cc/', excerpt: '<p><strong>Common Cartridge:</strong> Content packaging standard for course materials.</p>' },
			{ name: 'CP', org: '1EdTech', types: ['Content Metadata', 'Content'], dataLayers: [2, 3], uses: ['XML', 'Zip'], url: 'https://www.imsglobal.org/content/packaging/index.html', excerpt: '<p><strong>Content Packaging:</strong> Format for exchange between educational systems.</p>' },
			{ name: 'Caliper', org: '1EdTech', types: ['Event'], dataLayers: [4], uses: ['HTTP'], url: 'https://www.imsglobal.org/activity/caliper', excerpt: '<p><strong>Caliper:</strong> Protocol for transmitting learning events.</p>' },
			{ name: 'LTI', org: '1EdTech', types: ['Content'], dataLayers: [4], uses: ['OAuth'], url: 'http://www.imsglobal.org/activity/learning-tools-interoperability', excerpt: '<p><strong>LTI:</strong> Protocol for learning management system integration.</p>' },
			{ name: 'Open Badges', org: '1EdTech', types: ['Achievement', 'Credential'], dataLayers: [3, 4], uses: ['JSON-LD'], url: 'https://www.imsglobal.org/sites/default/files/Badges/OBv2p0Final/index.html', excerpt: '<p><strong>Open Badges:</strong> Format for communicating skills and achievements.</p>' },
			{ name: 'OneRoster', org: '1EdTech', types: ['Organizational', 'Personal'], dataLayers: [3, 4], uses: ['REST', 'CSV'], url: 'https://www.imsglobal.org/activity/onerosterlis', excerpt: '<p><strong>OneRoster:</strong> Secure exchange of class roster information.</p>' },
			{ name: 'QTI', org: '1EdTech', types: ['Content Metadata', 'Content'], dataLayers: [1, 2, 3], uses: ['XML', 'LOM'], url: 'http://www.imsglobal.org/question/', excerpt: '<p><strong>QTI:</strong> Packaging format for assessment items and tests.</p>' },
			{ name: 'CLR', org: '1EdTech', types: ['Personal', 'Achievement', 'Credential'], dataLayers: [1, 2, 3], uses: ['JSON'], url: 'http://www.imsglobal.org/clr/', excerpt: '<p><strong>CLR:</strong> Digital records of learning and achievements.</p>' },
			{ name: 'MCP', org: 'Agentic AI Foundation', types: ['AI', 'Content Metadata', 'Content'], dataLayers: [4], uses: ['JSON', 'REST'], url: 'https://modelcontextprotocol.io/', excerpt: '<p><strong>Model Context Protocol (MCP):</strong> Enables AI models to securely connect to external tools.</p>' },
			{ name: 'A2A', org: 'Linux Foundation', types: ['AI'], dataLayers: [4], uses: ['JSON', 'REST'], url: 'https://www.linuxfoundation.org', excerpt: '<p><strong>Agent to Agent:</strong> Empowers developers to build interoperable agents.</p>' },
			{ name: 'SIF Data Model', org: 'A4L', types: ['Organizational', 'Personal', 'Event', 'Achievement'], dataLayers: [1, 2, 3], uses: ['LRMI'], url: 'https://www.a4l.org/page/DataModel', excerpt: '<p>Data model for educational information.</p>' },
			{ name: 'SIF Infrastructure', org: 'A4L', types: ['Organizational', 'Personal', 'Event', 'Achievement'], dataLayers: [4], uses: ['XML', 'JSON', 'HTTP'], url: 'https://www.a4l.org/page/Infrastructure', excerpt: '<p>Protocol for transmitting educational information.</p>' },
			{ name: 'Blockcerts', org: 'Blockcerts', types: ['Personal', 'Event', 'Achievement', 'Credential'], dataLayers: [3, 4], uses: ['Blockchain', 'JSON-LD'], url: 'https://www.blockcerts.org/', excerpt: '<p><strong>Blockcerts:</strong> Open standard for blockchain-based certificates.</p>' },
			{ name: 'UDL', org: 'CAST', types: ['Content'], dataLayers: [1, 2], uses: [''], url: 'http://www.cast.org/our-work/about-udl.html', excerpt: '<p>Framework based on learning science.</p>' },
			{ name: 'CTDL', org: 'Credential Engine', types: ['Credential', 'Competency', 'Content Metadata'], dataLayers: [1, 2, 3], uses: ['JSON-LD'], url: 'https://credentialengine.org/', excerpt: '<p>Description language for credentialing resources.</p>' },
			{ name: 'LRMI', org: 'DCMI', types: ['Content Metadata'], dataLayers: [1, 2], uses: ['Schema.org'], url: 'http://dublincore.org/specifications/lrmi/', excerpt: '<p>Metadata terms for describing learning resources.</p>' },
			{ name: 'Europass', org: 'EC', types: ['Organizational', 'Personal', 'Event', 'Achievement', 'Competency'], dataLayers: [2, 3], uses: [''], url: 'https://github.com/european-commission-europass/EDCI-Data-Model', excerpt: '<p>Captures non-formal and formal learning across Europe.</p>' },
			{ name: 'Assessment API', org: 'Ed-Fi Alliance', types: ['Event'], dataLayers: [3, 4], uses: ['REST', 'JSON'], url: 'https://techdocs.ed-fi.org/', excerpt: '<p>Exchange of student assessment results.</p>' },
			{ name: 'Core Student API', org: 'Ed-Fi Alliance', types: ['Organizational', 'Personal', 'Event', 'Achievement'], dataLayers: [3, 4], uses: ['REST', 'JSON'], url: 'https://techdocs.ed-fi.org/', excerpt: '<p>Core data domains in K-12 education.</p>' },
			{ name: 'Ed-Fi Data Standard', org: 'Ed-Fi Alliance', types: ['Organizational', 'Personal', 'Event'], dataLayers: [1, 2, 3], uses: ['JSON'], url: 'https://techdocs.ed-fi.org/', excerpt: '<p>Data elements and serialization for Ed-Fi systems.</p>' },
			{ name: 'Enrollment API', org: 'Ed-Fi Alliance', types: ['Organizational', 'Personal'], dataLayers: [3, 4], uses: ['REST', 'JSON'], url: 'https://techdocs.ed-fi.org/', excerpt: '<p>APIs for student and teacher demographics.</p>' },
			{ name: 'EduPUB', org: 'IDPF', types: ['Content'], dataLayers: [3], uses: ['HTML', 'EPUB'], url: 'http://idpf.org/edupub', excerpt: '<p>EPUB profile targeted at education.</p>' },
			{ name: 'IEEE 1484.20.2', org: 'IEEE LTSC', types: ['Competency'], dataLayers: [1], uses: [''], url: 'https://standards.ieee.org/', excerpt: 'Defining interoperable competency data.' },
			{ name: 'LMT IEEE 2881', org: 'IEEE LTSC', types: ['Content Metadata'], dataLayers: [1, 2], uses: ['RDF', 'TTL', 'JSON-LD'], url: 'https://opensource.ieee.org/lmt/lmt', excerpt: 'Aligned to a Resource Description Framework (RDF) model.' },
			{ name: 'LOM', org: 'IEEE LTSC', types: ['Content Metadata'], dataLayers: [1, 2, 3], uses: ['RDF', 'XML', 'JSON-LD'], url: 'https://standards.ieee.org/', excerpt: '<p>LOM: Schema for describing learning objects.</p>' },
			{ name: 'SCD', org: 'IEEE LTSC', types: ['Competency'], dataLayers: [1, 2, 3], uses: ['RDF', 'TTL', 'JSON-LD'], url: 'https://opensource.ieee.org/scd/scd', excerpt: '<p>Data model for competency frameworks.</p>' },
			{ name: 'SCORM', org: 'IEEE LTSC', types: ['Content'], dataLayers: [2, 3], uses: ['HTML', 'JavaScript'], url: 'https://standards.ieee.org/', excerpt: '<p>Reusable digital learning resources.</p>' },
			{ name: 'IEEE xAPI', org: 'IEEE LTSC', types: ['Event'], dataLayers: [4], uses: [''], url: 'https://opensource.ieee.org/xapi', excerpt: '<p>Tracking activities and student experiences.</p>' },
			{ name: 'Activity Report', org: 'MedBiquitous', types: ['Organizational', 'Personal', 'Event'], dataLayers: [1, 2, 3], uses: [''], url: 'https://www.medbiq.org/', excerpt: '<p>Compile continuing education and certification data.</p>' },
			{ name: 'Performance Framework', org: 'MedBiquitous', types: ['Organizational', 'Credential', 'Competency'], dataLayers: [1, 2, 3], uses: [''], url: 'https://www.medbiq.org/', excerpt: '<p>Format to represent expected performance levels.</p>' },
			{ name: 'Admissions', org: 'PESC', types: ['Organizational', 'Personal', 'Event', 'Achievement', 'Credential'], dataLayers: [1, 2, 3], uses: ['XML'], url: 'https://www.pesc.org/', excerpt: '<p>Standard for postsecondary admissions applications.</p>' },
			{ name: 'College Transcript', org: 'PESC', types: ['Organizational', 'Personal', 'Event', 'Achievement', 'Credential'], dataLayers: [1, 2, 3], uses: ['XML'], url: 'https://www.pesc.org/', excerpt: '<p>Standard for postsecondary educational institutions.</p>' },
			{ name: 'EOC', org: 'Schema.org', types: ['Organizational', 'Personal', 'Credential'], dataLayers: [1, 2], uses: [''], url: 'https://schema.org/EducationalOccupationalCredential', excerpt: '<p>Diploma, degree, or qualification badge.</p>' },
			{ name: 'CEDS', org: 'US Ed', types: ['Organizational', 'Personal', 'Event', 'Achievement', 'Credential', 'Competency', 'Content Metadata'], dataLayers: [1, 2], uses: [''], url: 'http://ceds.ed.gov/', excerpt: '<p>Common vocabulary for US education data.</p>' },
		],
	}),

	getters: {
		// Hydrate rawData with human-readable layer names and dynamic useCase mapping
		standards: (state) => {
			return state.rawData.map((s) => {
				const useCases = [];
				if (s.types.includes('AI')) useCases.push('AI-empowered Learning');
				if (s.types.includes('Achievement') || s.types.includes('Credential')) useCases.push('All Learning Counts');

				return {
					...s,
					layers: s.dataLayers.map((num) => state.layerMap[num]),
					useCaseCategories: useCases,
				};
			});
		},

		currentRows: (state) => {
			return state.viewMode === 'dataCategory' ? state.types : state.useCaseCategories;
		},

		filteredStandards() {
			if (!this.activeFilter.type) return this.standards;

			return this.standards.filter((s) => {
				const typeMatch =
					this.viewMode === 'dataCategory'
						? s.types.includes(this.activeFilter.type)
						: s.useCaseCategories.includes(this.activeFilter.type);

				return typeMatch && s.layers.includes(this.activeFilter.layer);
			});
		},
	},

	actions: {
		toggleFilter(type, layer) {
			if (this.activeFilter.type === type && this.activeFilter.layer === layer) {
				this.activeFilter = { type: null, layer: null };
			} else {
				this.activeFilter = { type, layer };
			}
		},

		resetFilter() {
			this.activeFilter = { type: null, layer: null };
		},

		countMatches(rowLabel, layer) {
			return this.standards.filter((s) => {
				const typeMatch =
					this.viewMode === 'dataCategory'
						? s.types.includes(rowLabel)
						: s.useCaseCategories.includes(rowLabel);
				return typeMatch && s.layers.includes(layer);
			}).length;
		},

		getCellClass(rowLabel, layer) {
			if (this.activeFilter.type === rowLabel && this.activeFilter.layer === layer) return 'active-cell';
			return this.countMatches(rowLabel, layer) > 0 ? 'has-data' : 'empty-cell';
		},
	},
});
