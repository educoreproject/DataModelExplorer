<script setup>
import { useSpecificationMetadataStore } from '@/stores/specificationMetadataStore';
const specStore = useSpecificationMetadataStore();

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

// ── Specs from store ─────────────────────────────────────────────────
const specs = computed(() => specStore.specs);

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
      The following table shows the rubric applied to {{ specStore.specCount }} education data specifications currently
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
            <td class="font-weight-medium">{{ spec.title }}</td>
            <td class="text-center">
              <v-chip :color="burdenColor(spec.implementationBurden)" variant="tonal" size="small" :prepend-icon="burdenIcon(spec.implementationBurden)">
                {{ spec.implementationBurden }}
              </v-chip>
            </td>
            <td class="text-center">
              <v-chip :color="burdenColor(spec.burdenRubric.engineering.level)" variant="flat" size="x-small">
                {{ spec.burdenRubric.engineering.level }}
              </v-chip>
            </td>
            <td class="text-center">
              <v-chip :color="burdenColor(spec.burdenRubric.infrastructure.level)" variant="flat" size="x-small">
                {{ spec.burdenRubric.infrastructure.level }}
              </v-chip>
            </td>
            <td class="text-center">
              <v-chip :color="burdenColor(spec.burdenRubric.legal.level)" variant="flat" size="x-small">
                {{ spec.burdenRubric.legal.level }}
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
            <v-chip :color="burdenColor(spec.implementationBurden)" variant="tonal" size="x-small">
              {{ spec.implementationBurden }}
            </v-chip>
          </div>
        </v-expansion-panel-title>
        <v-expansion-panel-text>
          <p class="text-body-2 mb-4">{{ spec.implementationBurdenRationale }}</p>

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
            <div class="text-caption" v-if="spec.graphStats.entities">
              <strong>{{ spec.graphStats.entities }}</strong> entities &middot;
              <strong>{{ spec.graphStats.fields?.toLocaleString() }}</strong> fields
            </div>
            <div class="text-caption" v-if="spec.graphStats.elements">
              <strong>{{ spec.graphStats.elements?.toLocaleString() }}</strong> elements &middot;
              <strong>{{ spec.graphStats.complexTypes }}</strong> complex types &middot;
              <strong>{{ spec.graphStats.simpleTypes }}</strong> simple types
            </div>
            <div class="text-caption" v-if="spec.graphStats.programs">
              <strong>{{ spec.graphStats.programs?.toLocaleString() }}</strong> program codes
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
                  <v-chip :color="burdenColor(spec.burdenRubric[dim].level)" variant="flat" size="x-small">
                    {{ spec.burdenRubric[dim].level }}
                  </v-chip>
                </td>
                <td class="text-body-2">{{ spec.burdenRubric[dim].note }}</td>
              </tr>
            </tbody>
          </v-table>

          <!-- Prerequisites -->
          <h4 class="text-subtitle-2 font-weight-bold mb-2">Required Capabilities</h4>
          <div class="mb-4">
            <v-chip
              v-for="cap in spec.requiredCapabilities"
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
          <p class="text-body-2">{{ spec.implementationGuidance }}</p>
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
