<script setup>
// ── Rubric Definition ──────────────────────────────────────────────────
// The assessment framework: what we evaluate and what each level means.

const rubricDimensions = [
  {
    id: 'engineering',
    title: 'Engineering Complexity',
    icon: 'mdi-cog-outline',
    description: 'The developer effort required to build, integrate, and maintain a conforming implementation. Each indicator below is scored 1\u20133; the dimension score is the predominant level across indicators.',
    indicators: [
      {
        name: 'Data Format',
        low: 'CSV or flat JSON. Parseable with standard libraries, no special context needed.',
        moderate: 'JSON with nested structures, or XML with defined schemas. Standard tooling exists but requires modeling effort.',
        high: 'JSON-LD / RDF / linked data. Requires understanding of @context, namespaces, graph semantics, or SPARQL.',
      },
      {
        name: 'API Surface Area',
        low: 'No wire protocol, or a single-purpose lookup API with fewer than 10 operations.',
        moderate: 'REST API with 10\u201350 endpoints/data objects. Well-documented with Swagger/OpenAPI.',
        high: '50+ endpoints, multiple resource types, complex query parameters, or streaming/event APIs.',
      },
      {
        name: 'Dependency Chain',
        low: 'Self-contained. Can be adopted without implementing any other specification.',
        moderate: 'Recommends or benefits from one other spec (e.g., CEDS alignment), but not strictly required.',
        high: 'Requires implementing 2+ other specs first (e.g., W3C VC + Open Badges before CLR).',
      },
      {
        name: 'Consumer vs. Producer Asymmetry',
        low: 'Reading and writing are roughly equal effort, or the spec is read-only (e.g., a reference vocabulary).',
        moderate: 'Consumer-side (reading/querying) is straightforward; producer-side (publishing/issuing) requires more modeling and validation.',
        high: 'Producer-side requires significantly more effort: cryptographic signing, complex data assembly, or multi-stage pipelines.',
      },
      {
        name: 'SDK & Tooling Availability',
        low: 'Mature SDKs in multiple languages, or managed platforms that handle implementation details.',
        moderate: 'Reference implementations exist; SDKs in 1\u20132 languages, or good documentation with code samples.',
        high: 'No SDKs. Must implement from the specification document. Tooling is experimental or community-maintained only.',
      },
      {
        name: 'Spec Maturity & Stability',
        low: 'Stable, versioned specification with backward-compatibility guarantees. Infrequent breaking changes.',
        moderate: 'Published specification with active development. Breaking changes possible between major versions.',
        high: 'Draft, pre-release, or rapidly evolving. Data model may change. Implementers must track spec development closely.',
      },
    ],
  },
  {
    id: 'infrastructure',
    title: 'Infrastructure Requirements',
    icon: 'mdi-server-network',
    description: 'The servers, databases, middleware, and operational dependencies required to run a conforming implementation in production.',
    indicators: [
      {
        name: 'Hosting / Servers',
        low: 'No runtime component. Works with any existing web server or runs entirely client-side.',
        moderate: 'Requires a dedicated application server (e.g., Node.js, .NET, Java) or hosted API endpoint.',
        high: 'Requires multiple coordinated services: application server + background workers + job queues.',
      },
      {
        name: 'Database',
        low: 'No database required, or any general-purpose store (SQLite, PostgreSQL, etc.) works.',
        moderate: 'Requires a specific database engine (e.g., SQL Server, PostgreSQL) or a graph/document store.',
        high: 'Requires multiple data stores working together (e.g., relational DB + credential store + consent ledger).',
      },
      {
        name: 'Middleware',
        low: 'No middleware needed. Direct point-to-point integration or no integration at all.',
        moderate: 'May benefit from an API gateway, message broker, or integration server for multi-system deployments.',
        high: 'Requires dedicated middleware (Zone Integration Server, credential aggregation pipeline, event bus).',
      },
      {
        name: 'Cryptographic Infrastructure',
        low: 'No cryptographic requirements beyond standard HTTPS/TLS.',
        moderate: 'Requires key management for signing credentials or tokens. Managed signing services available.',
        high: 'Requires DID resolver infrastructure, multi-party key management, digital wallet integration, or zero-knowledge proof systems.',
      },
      {
        name: 'Managed Service Availability',
        low: 'Vendor-hosted registries or platforms handle all infrastructure (e.g., Credential Engine Registry).',
        moderate: 'Managed platforms exist but cover only part of the stack. Some self-hosting required.',
        high: 'No turnkey managed service. Full self-hosting of all components required.',
      },
      {
        name: 'Operational Cost & Maintenance',
        low: 'Minimal ongoing cost. Static mappings or vocabulary lookups with no runtime to maintain.',
        moderate: 'Standard web-application operations: monitoring, patching, database backups, certificate renewal.',
        high: 'High operational complexity: multi-service orchestration, credential lifecycle management, consent auditing, high availability requirements.',
      },
    ],
  },
  {
    id: 'legal',
    title: 'Legal & Licensing',
    icon: 'mdi-scale-balance',
    description: 'Licensing fees, membership requirements, compliance obligations, and legal agreements needed to adopt the specification.',
    indicators: [
      {
        name: 'Spec Access & Licensing',
        low: 'Fully open. Specification freely available online. No fees for access or conformance.',
        moderate: 'Open specification, but certification/conformance testing requires membership or a fee.',
        high: 'Paywalled specification, or mandatory licensing fees for conforming implementations.',
      },
      {
        name: 'Membership Requirements',
        low: 'No membership required. Community participation is open.',
        moderate: 'Membership recommended for full access to tooling, certification, or governance participation.',
        high: 'Membership mandatory for implementation, certification, or use of official branding.',
      },
      {
        name: 'Data Sharing Agreements',
        low: 'No multi-party agreements needed, or only standard terms of service.',
        moderate: 'Bilateral data sharing agreements needed for cross-organizational exchange.',
        high: 'Complex multi-party agreements: trust frameworks, governance charters, or ecosystem-wide legal scaffolding.',
      },
      {
        name: 'Regulatory Compliance',
        low: 'No special regulatory requirements beyond standard data handling practices.',
        moderate: 'Triggers one major regulation (e.g., FERPA for student records) with well-understood compliance paths.',
        high: 'Triggers multiple overlapping regulations (FERPA + COPPA + state privacy laws) or involves PII aggregation requiring explicit consent management.',
      },
      {
        name: 'IP & Patent Considerations',
        low: 'No known patent encumbrances. Open-source implementations available under permissive licenses (Apache, MIT).',
        moderate: 'RAND (Reasonable and Non-Discriminatory) patent terms, or open-source with copyleft (GPL).',
        high: 'Patent claims on core functionality, or restrictive licensing that limits derivative works.',
      },
    ],
  },
];

const overallBurdenDefinition = {
  description: 'The overall burden rating is a holistic assessment that considers all three dimensions together. It is not a simple average \u2014 a single "high" dimension (especially engineering or infrastructure) can elevate the overall rating. Legal burden alone rarely drives overall burden to "high" since legal requirements tend to be one-time setup costs.',
  levels: {
    low: 'Adoptable by a small team with standard web development skills and existing infrastructure. Weeks, not months.',
    medium: 'Requires dedicated planning, some specialized expertise, and potentially new infrastructure. A quarter-scale effort for a typical team.',
    high: 'Significant organizational investment. Requires specialized expertise across multiple domains, new infrastructure, and extended timelines. Multi-quarter effort.',
  },
};

// ── Spec Assessments (rubric applied) ──────────────────────────────────
const specs = [
  {
    id: 'ieee-p1484-2',
    short: 'IEEE P1484.2',
    title: 'IEEE P1484.2 LER',
    burden: 'medium',
    rationale: 'Architectural blueprint, not a wire protocol. Burden depends on which ecosystem role(s) your system fulfills. Leverages W3C VC and DID. Potentially 1EdTech and HROpen specifications like CASE, CLR, as well as PESC for transcript sharing and HROpen schemas.',
    rubric: {
      engineering: { level: 'moderate', note: 'Aligning an existing system requires moderate effort. Higher if building W3C VC from scratch.' },
      infrastructure: { level: 'moderate', note: 'Requires W3C VC-compatible credential infrastructure. Digital wallet integration needed for Holder role.' },
      legal: { level: 'low', note: 'IEEE standard is publicly referenced. No licensing fees. Data sharing agreements needed for multi-party ecosystems.' },
    },
    capabilities: ['W3C Verifiable Credentials support', 'W3C DID infrastructure', 'Digital wallet integration (for Holder role)', 'Credential registry access (recommended)'],
    guidance: 'Start by identifying which LER ecosystem role(s) your system will fulfill: Awarder, Holder, Reviewer, or Registry. Implement W3C VC and DID support. Use OB3 or CLR as the credential format.',
  },
  {
    id: 'case-v1',
    short: 'CASE v1.1',
    title: 'CASE v1.1',
    burden: 'medium',
    rationale: 'Well-defined REST API with JSON responses. Moderate effort for consumer-side; higher for publisher-side.',
    rubric: {
      engineering: { level: 'moderate', note: 'Consumer integration is straightforward; publishing frameworks via API requires more modeling effort.' },
      infrastructure: { level: 'low', note: 'Standard REST API endpoints. No specialized infrastructure required.' },
      legal: { level: 'low', note: 'Open standard. 1EdTech membership recommended but not required.' },
    },
    capabilities: ['REST API client', 'JSON parser', 'Competency data model (for publishers)'],
    guidance: 'Start as a CASE consumer: query existing published frameworks via the REST API. Build a local cache of competency trees. Phase 2: publish your own frameworks.',
  },
  {
    id: 'ctdl',
    short: 'CTDL',
    title: 'CTDL',
    burden: 'medium',
    rationale: 'JSON-LD/RDF requires familiarity with linked data concepts. Credential Engine provides tools that reduce the burden.',
    rubric: {
      engineering: { level: 'moderate', note: 'Modeling credentials in CTDL requires moderate effort. Consumer/search via Registry API is lighter.' },
      infrastructure: { level: 'low', note: 'Credential Engine hosts the Registry. Publishers need minimal infrastructure.' },
      legal: { level: 'low', note: 'Open vocabulary. No licensing. Publishing agreement with Credential Engine is straightforward.' },
    },
    capabilities: ['JSON-LD understanding', 'Credential data modeling', 'REST API client (for Registry integration)'],
    guidance: 'Begin by exploring the Credential Registry search. Map your credentials to CTDL terms using the CTDL Handbook. Use the Credential Engine publisher tool for initial data entry.',
  },
  {
    id: 'open-badges-v3',
    short: 'Open Badges 3.0',
    title: 'Open Badges 3.0',
    burden: 'medium',
    rationale: 'Well-documented with robust tooling. W3C VC alignment adds cryptographic complexity but managed services exist.',
    rubric: {
      engineering: { level: 'moderate', note: 'Issuer implementation requires moderate effort; verifier/displayer is lighter.' },
      infrastructure: { level: 'moderate', note: 'Issuers need key management for VC signing. Managed badge platforms handle infrastructure.' },
      legal: { level: 'low', note: 'Open standard. 1EdTech certification available but not required.' },
    },
    capabilities: ['JSON-LD processing', 'Cryptographic signing (for issuers)', 'Badge display/rendering UI', 'REST API client'],
    guidance: 'Start as a badge verifier/displayer. Use a managed badge platform (Badgr, Credly, Accredible) for initial issuance. Custom issuance requires W3C VC signing infrastructure.',
  },
  {
    id: 'clr-v2',
    short: 'CLR 2.0',
    title: 'CLR 2.0',
    burden: 'high',
    rationale: 'Builds on OB3 and W3C VC, requiring familiarity with both. Aggregating multiple credential types adds data modeling complexity.',
    rubric: {
      engineering: { level: 'high', note: 'Full issuer implementation is significant. Consumer/viewer is more moderate. Managed platforms reduce effort.' },
      infrastructure: { level: 'high', note: 'Requires credential aggregation pipeline, W3C VC signing, and learner consent management.' },
      legal: { level: 'moderate', note: 'Learner data aggregation requires consent management. FERPA compliance for educational institutions.' },
    },
    capabilities: ['JSON-LD processing', 'W3C VC signing infrastructure', 'Credential aggregation pipeline', 'Learner consent UI', 'Open Badges 3.0 compatibility'],
    guidance: 'Begin by implementing Open Badges 3.0 support first \u2014 CLR extends OB3. Start as a CLR consumer. Phase 2: aggregate your own badges/achievements. Phase 3: full issuance with consent management.',
  },
  {
    id: 'ceds',
    short: 'CEDS',
    title: 'CEDS',
    burden: 'low',
    rationale: 'Voluntary data dictionary and reference model. Implementation involves mapping your existing data elements to CEDS definitions.',
    rubric: {
      engineering: { level: 'low', note: 'Reference vocabulary, not wire protocol. Main effort is data element mapping.' },
      infrastructure: { level: 'low', note: 'No infrastructure changes required. CEDS provides the common language.' },
      legal: { level: 'low', note: 'Open, publicly funded standard. No licensing fees.' },
    },
    capabilities: ['Data element mapping capability', 'Understanding of P-20W data domains'],
    guidance: 'Start with the CEDS Data Model to identify relevant domains and elements. Use CEDS Align to map your local data dictionary. Focus on domains most critical to your needs.',
    graphStats: { classes: 402, properties: 2324, sifMappedProperties: 354 },
  },
  {
    id: 'sif-3-7',
    short: 'SIF 3.7',
    title: 'SIF 3.7',
    burden: 'medium',
    rationale: 'Requires implementing REST endpoints conforming to SIF Infrastructure spec and adopting SIF data objects. Middleware may be needed.',
    rubric: {
      engineering: { level: 'moderate', note: 'Implementing SIF REST consumers/providers requires conformance to SIF Infrastructure spec.' },
      infrastructure: { level: 'moderate', note: 'Zone Integration Server (ZIS) or equivalent middleware may be needed.' },
      legal: { level: 'low', note: 'Open specification. A4L membership recommended but not required.' },
    },
    capabilities: ['REST API implementation', 'SIF data object modeling', 'Zone Integration Server (for multi-system deployments)', 'CEDS-aligned data dictionary mapping'],
    guidance: 'Start with SIF 3.7 Infrastructure specification. Identify which SIF data objects your system needs. For multi-vendor environments, deploy a Zone Integration Server.',
    graphStats: { objects: 159, fields: 15620, cedsMappedFields: 2231 },
  },
  {
    id: 'ed-fi',
    short: 'Ed-Fi',
    title: 'Ed-Fi Data Standard',
    burden: 'medium',
    rationale: 'Complete open-source platform (ODS/API) reduces build effort, but deploying and maintaining requires infrastructure.',
    rubric: {
      engineering: { level: 'moderate', note: 'Implementing Ed-Fi API clients is straightforward with Swagger docs. ODS/API requires .NET and SQL Server.' },
      infrastructure: { level: 'moderate', note: 'ODS/API requires hosted application server, database (SQL Server or PostgreSQL), and API gateway.' },
      legal: { level: 'low', note: 'Fully open-source under Apache 2.0. No licensing fees.' },
    },
    capabilities: ['REST API implementation', 'SQL Server or PostgreSQL database', '.NET runtime (for ODS/API hosting)', 'Ed-Fi Unifying Data Model understanding'],
    guidance: 'Start with the Ed-Fi ODS/API platform as your data integration hub. Deploy using installer or Docker. Use Swagger UI to explore API resources.',
  },
  {
    id: 'lif-2-0',
    short: 'LIF 2.0',
    title: 'LIF 2.0',
    burden: 'medium',
    rationale: 'Data model specification, not a wire protocol. JSON-based payloads. Comprehensive (290+ fields) but well-structured into 8 entities.',
    rubric: {
      engineering: { level: 'moderate', note: 'Mapping to 8 entities with 290+ fields requires significant data modeling. JSON payloads are straightforward.' },
      infrastructure: { level: 'low', note: 'Transport-agnostic. No specific infrastructure requirements beyond JSON serialization.' },
      legal: { level: 'low', note: 'Open specification. No licensing fees. Privacy use_recommendations help with compliance.' },
    },
    capabilities: ['JSON data serialization', 'Data element mapping to LIF entities', 'Privacy/equity review process for use_recommendations', 'CEDS alignment'],
    guidance: 'Start by identifying which LIF entities your system touches. Map existing data fields to LIF fields. Review use_recommendations for each field.',
  },
];

// EDUcore graph stats (CEDS <-> SIF mapping data from knowledge graph)
const graphOverlap = {
  sifObjects: 159,
  sifFields: 15620,
  cedsClasses: 402,
  cedsProperties: 2324,
  sifFieldsMappedToCeds: 2231,
  uniqueCedsPropertiesMapped: 354,
  get sifCoveragePct() { return ((this.sifFieldsMappedToCeds / this.sifFields) * 100).toFixed(1); },
  get cedsCoveragePct() { return ((this.uniqueCedsPropertiesMapped / this.cedsProperties) * 100).toFixed(1); },
};

const burdenColor = (level) => {
  if (level === 'low') return 'success';
  if (level === 'medium' || level === 'moderate') return 'warning';
  return 'error';
};

const burdenIcon = (level) => {
  if (level === 'low') return 'mdi-speedometer-slow';
  if (level === 'medium' || level === 'moderate') return 'mdi-speedometer-medium';
  return 'mdi-speedometer';
};

const dimensions = ['engineering', 'infrastructure', 'legal'];
</script>

<template>
  <v-container class="py-8" style="max-width: 1200px;">

    <!-- ═══ Header ═══ -->
    <h1 class="text-h4 font-weight-bold text-primary mb-2">Implementation Burden Rubric</h1>
    <p class="text-body-1 text-medium-emphasis mb-8">
      This rubric defines the criteria used to assess implementation burden for education data specifications
      in the EDUcore Reference Library. It provides a consistent, transparent framework so implementers
      can compare specifications and standards bodies can understand how assessments are derived.
    </p>

    <!-- ═══ Section 1: How the Rubric Works ═══ -->
    <v-card variant="tonal" color="primary" class="mb-10">
      <v-card-title class="text-h6 font-weight-bold">How Specifications Are Assessed</v-card-title>
      <v-card-text>
        <p class="text-body-2 mb-3">
          Each specification is evaluated across <strong>three independent dimensions</strong> &mdash;
          Engineering Complexity, Infrastructure Requirements, and Legal &amp; Licensing. Within each dimension,
          a level of <strong>low</strong>, <strong>moderate</strong>, or <strong>high</strong> is assigned based
          on the indicators and criteria defined below.
        </p>
        <p class="text-body-2 mb-3">
          {{ overallBurdenDefinition.description }}
        </p>
        <v-row class="mt-2">
          <v-col v-for="(desc, level) in overallBurdenDefinition.levels" :key="level" cols="12" md="4">
            <v-card variant="outlined" class="h-100 pa-3">
              <div class="d-flex align-center ga-2 mb-2">
                <v-chip :color="burdenColor(level)" variant="tonal" size="small" :prepend-icon="burdenIcon(level)">
                  {{ level }}
                </v-chip>
                <span class="text-caption font-weight-bold text-uppercase">Overall</span>
              </div>
              <p class="text-body-2">{{ desc }}</p>
            </v-card>
          </v-col>
        </v-row>
      </v-card-text>
    </v-card>

    <!-- ═══ Section 2: Dimension Criteria ═══ -->
    <h2 class="text-h5 font-weight-bold text-primary mb-4">Assessment Dimensions</h2>

    <div v-for="dim in rubricDimensions" :key="dim.id" class="mb-8">
      <v-card variant="outlined">
        <v-card-title class="d-flex align-center ga-2 pb-1">
          <v-icon :icon="dim.icon" size="small" />
          <span class="text-h6 font-weight-bold">{{ dim.title }}</span>
        </v-card-title>
        <v-card-text>
          <p class="text-body-2 mb-4">{{ dim.description }}</p>

          <!-- Scoring Rubric Table -->
          <div style="overflow-x: auto;">
            <v-table density="comfortable" class="rubric-table">
              <thead>
                <tr>
                  <th style="min-width: 140px;">Indicator</th>
                  <th style="min-width: 200px;">
                    <v-chip color="success" variant="tonal" size="x-small" class="mr-1">1</v-chip> Low
                  </th>
                  <th style="min-width: 200px;">
                    <v-chip color="warning" variant="tonal" size="x-small" class="mr-1">2</v-chip> Medium
                  </th>
                  <th style="min-width: 200px;">
                    <v-chip color="error" variant="tonal" size="x-small" class="mr-1">3</v-chip> High
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="indicator in dim.indicators" :key="indicator.name">
                  <td class="font-weight-bold text-body-2">{{ indicator.name }}</td>
                  <td class="text-body-2">{{ indicator.low }}</td>
                  <td class="text-body-2">{{ indicator.moderate }}</td>
                  <td class="text-body-2">{{ indicator.high }}</td>
                </tr>
              </tbody>
            </v-table>
          </div>
        </v-card-text>
      </v-card>
    </div>

    <!-- ═══ Section 3: Cross-Standard Mapping Context ═══ -->
    <h2 class="text-h5 font-weight-bold text-primary mb-4">Cross-Standard Mapping Context</h2>
    <p class="text-body-2 text-medium-emphasis mb-4">
      Part of assessing implementation burden is understanding how well specifications overlap
      and map to each other. The EDUcore Knowledge Graph tracks field-level mappings between
      standards. Specifications with high cross-standard coverage are easier to adopt alongside
      existing implementations.
    </p>
    <v-card variant="tonal" color="primary" class="mb-10">
      <v-card-title class="text-subtitle-1 font-weight-bold pb-0">
        EDUcore Knowledge Graph: CEDS &harr; SIF Mapping Coverage
      </v-card-title>
      <v-card-text>
        <v-row class="mt-1">
          <v-col cols="6" sm="3">
            <div class="text-h5 font-weight-bold">{{ graphOverlap.sifObjects }}</div>
            <div class="text-caption text-medium-emphasis">SIF Objects</div>
          </v-col>
          <v-col cols="6" sm="3">
            <div class="text-h5 font-weight-bold">{{ graphOverlap.sifFields.toLocaleString() }}</div>
            <div class="text-caption text-medium-emphasis">SIF Fields</div>
          </v-col>
          <v-col cols="6" sm="3">
            <div class="text-h5 font-weight-bold">{{ graphOverlap.cedsClasses }}</div>
            <div class="text-caption text-medium-emphasis">CEDS Classes</div>
          </v-col>
          <v-col cols="6" sm="3">
            <div class="text-h5 font-weight-bold">{{ graphOverlap.cedsProperties.toLocaleString() }}</div>
            <div class="text-caption text-medium-emphasis">CEDS Properties</div>
          </v-col>
        </v-row>
        <v-divider class="my-3" />
        <v-row align="center">
          <v-col cols="12" md="6">
            <div class="text-body-2 mb-1">
              <strong>{{ graphOverlap.sifFieldsMappedToCeds.toLocaleString() }}</strong> SIF fields map to
              <strong>{{ graphOverlap.uniqueCedsPropertiesMapped }}</strong> unique CEDS properties
            </div>
            <div class="d-flex align-center ga-3">
              <div style="flex: 1;">
                <div class="text-caption text-medium-emphasis mb-1">SIF field coverage</div>
                <v-progress-linear :model-value="parseFloat(graphOverlap.sifCoveragePct)" color="primary" height="8" rounded />
              </div>
              <div class="text-body-2 font-weight-bold" style="min-width: 48px;">{{ graphOverlap.sifCoveragePct }}%</div>
            </div>
          </v-col>
          <v-col cols="12" md="6">
            <div class="text-body-2 mb-1">
              CEDS properties with at least one SIF mapping
            </div>
            <div class="d-flex align-center ga-3">
              <div style="flex: 1;">
                <div class="text-caption text-medium-emphasis mb-1">CEDS property coverage</div>
                <v-progress-linear :model-value="parseFloat(graphOverlap.cedsCoveragePct)" color="secondary" height="8" rounded />
              </div>
              <div class="text-body-2 font-weight-bold" style="min-width: 48px;">{{ graphOverlap.cedsCoveragePct }}%</div>
            </div>
          </v-col>
        </v-row>
      </v-card-text>
    </v-card>

    <!-- ═══ Section 4: Rubric Applied ═══ -->
    <h2 class="text-h5 font-weight-bold text-primary mb-2">Rubric Applied to Specifications</h2>
    <p class="text-body-2 text-medium-emphasis mb-4">
      The following table shows the rubric applied to {{ specs.length }} education data specifications currently
      tracked in the EDUcore Reference Library. Click any row to see the full assessment rationale.
    </p>

    <!-- Comparison Table -->
    <v-card variant="outlined" class="mb-8">
      <v-table density="comfortable">
        <thead>
          <tr>
            <th style="min-width: 160px;">Specification</th>
            <th class="text-center">Overall</th>
            <th class="text-center">Engineering</th>
            <th class="text-center">Infrastructure</th>
            <th class="text-center">Legal</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="spec in specs" :key="spec.id">
            <td class="font-weight-medium">{{ spec.short }}</td>
            <td class="text-center">
              <v-chip :color="burdenColor(spec.burden)" variant="tonal" size="small" :prepend-icon="burdenIcon(spec.burden)">
                {{ spec.burden }}
              </v-chip>
            </td>
            <td class="text-center">
              <v-chip :color="burdenColor(spec.rubric.engineering.level)" variant="flat" size="x-small">
                {{ spec.rubric.engineering.level }}
              </v-chip>
            </td>
            <td class="text-center">
              <v-chip :color="burdenColor(spec.rubric.infrastructure.level)" variant="flat" size="x-small">
                {{ spec.rubric.infrastructure.level }}
              </v-chip>
            </td>
            <td class="text-center">
              <v-chip :color="burdenColor(spec.rubric.legal.level)" variant="flat" size="x-small">
                {{ spec.rubric.legal.level }}
              </v-chip>
            </td>
          </tr>
        </tbody>
      </v-table>
    </v-card>

    <!-- Per-Spec Assessment Details -->
    <v-expansion-panels variant="accordion" class="mb-8">
      <v-expansion-panel v-for="spec in specs" :key="spec.id">
        <v-expansion-panel-title>
          <div class="d-flex align-center ga-3" style="width: 100%;">
            <span class="text-subtitle-2 font-weight-bold">{{ spec.title }}</span>
            <v-chip :color="burdenColor(spec.burden)" variant="tonal" size="x-small">
              {{ spec.burden }}
            </v-chip>
          </div>
        </v-expansion-panel-title>
        <v-expansion-panel-text>
          <p class="text-body-2 mb-4">{{ spec.rationale }}</p>

          <!-- Graph stats if available -->
          <v-alert v-if="spec.graphStats" type="info" variant="tonal" density="compact" class="mb-4">
            <div class="text-caption" v-if="spec.graphStats.objects">
              <strong>{{ spec.graphStats.objects }}</strong> data objects &middot;
              <strong>{{ spec.graphStats.fields?.toLocaleString() }}</strong> fields &middot;
              <strong>{{ spec.graphStats.cedsMappedFields?.toLocaleString() }}</strong> mapped to CEDS
            </div>
            <div class="text-caption" v-if="spec.graphStats.classes">
              <strong>{{ spec.graphStats.classes }}</strong> classes &middot;
              <strong>{{ spec.graphStats.properties?.toLocaleString() }}</strong> properties &middot;
              <strong>{{ spec.graphStats.sifMappedProperties }}</strong> mapped from SIF
            </div>
          </v-alert>

          <!-- Dimension assessments -->
          <v-table density="compact" class="mb-4">
            <thead>
              <tr>
                <th style="width: 130px;">Dimension</th>
                <th style="width: 100px;">Level</th>
                <th>Assessment Notes</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="dim in dimensions" :key="dim">
                <td class="text-capitalize font-weight-medium">{{ dim }}</td>
                <td>
                  <v-chip :color="burdenColor(spec.rubric[dim].level)" variant="flat" size="x-small">
                    {{ spec.rubric[dim].level }}
                  </v-chip>
                </td>
                <td class="text-body-2">{{ spec.rubric[dim].note }}</td>
              </tr>
            </tbody>
          </v-table>

          <!-- Prerequisites -->
          <h4 class="text-subtitle-2 font-weight-bold mb-2">Required Capabilities</h4>
          <div class="mb-4">
            <v-chip
              v-for="cap in spec.capabilities"
              :key="cap"
              size="small"
              variant="outlined"
              class="mr-1 mb-1"
            >
              {{ cap }}
            </v-chip>
          </div>

          <!-- Guidance -->
          <h4 class="text-subtitle-2 font-weight-bold mb-1">Getting Started</h4>
          <p class="text-body-2">{{ spec.guidance }}</p>
        </v-expansion-panel-text>
      </v-expansion-panel>
    </v-expansion-panels>

  </v-container>
</template>

<style scoped>
.rubric-table td {
  vertical-align: top;
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}
.rubric-table th:nth-child(2) { background: rgba(var(--v-theme-success), 0.04); }
.rubric-table th:nth-child(3) { background: rgba(var(--v-theme-warning), 0.04); }
.rubric-table th:nth-child(4) { background: rgba(var(--v-theme-error), 0.04); }
.rubric-table td:nth-child(2) { background: rgba(var(--v-theme-success), 0.02); }
.rubric-table td:nth-child(3) { background: rgba(var(--v-theme-warning), 0.02); }
.rubric-table td:nth-child(4) { background: rgba(var(--v-theme-error), 0.02); }
</style>
