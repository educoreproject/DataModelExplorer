// libraryEntries.js — Reference library entries for LER ecosystem specifications.
// WHY THIS SCHEMA EXISTS: The metadata fields were designed to serve three goals:
// 1) Human discovery (filters, tags, labels a person can scan)
// 2) AI/analytics discovery (structured fields a system can query programmatically)
// 3) Implementation readiness signaling (burden, capabilities, equity, privacy)
//
// Fields map to the EDU Reference Library spec:
// - implementationBurden: helps implementers triage what they can adopt now vs. later
// - requiredCapabilities: prevents adopting something you lack infrastructure for
// - equityConsiderations: surfaces LIF-derived accessibility flags
// - privacyConsiderations: flags FERPA, COPPA, or data sensitivity issues
// - accessLevel: open vs. restricted (Gates Foundation openness principle)

export const libraryEntries = [
  {
    id: 'lrw-competency-framework',
    title: 'IEEE P1484.2 LER Ecosystem Standard',
    type: 'Standard',
    category: 'Learner Records',
    targetCanonicalEntity: 'Verifiable Credential / LER Ecosystem Role',
    fieldMappingDescription: 'Defines ecosystem roles (Awarder, Holder, Reviewer, Transmitter, Registry, Talent Marketplace) rather than individual data fields. Credential payloads use W3C VC Data Model fields. Maps to CEDS Credential domain elements via CLR/OB3 credential formats.',
    transformationNotes: 'No direct field-level wire format — IEEE 1484.2 is an architectural blueprint. Credential data is carried by OB3 or CLR formats. Missing: no native assessment or enrollment data; relies on paired standards (CASE, CTDL) for competency and credential description fields.',
    description: 'IEEE P1484.2 Recommended Practices for Learning and Employment Record (LER) Ecosystems are intended to help system architects and engineers design and deploy systems that leverage shared standards and technologies to support ecosystem-scale issuing, holding, and presenting verifiable credentials for education, skills-based hiring, and career advancement.',
    owner: 'IEEE Computer Society',
    governanceBody: 'IEEE Computer Society / Learning Technology Standards Committee (C/LTSC)',
    lastUpdated: '2024-08-23',
    version: '2024',
    accessLevel: 'open',
    opennessStatus: 'open',
    accessUrl: 'https://sagroups.ieee.org/1484-2/',
    authoritativeRepoUrl: null,
    tags: ['LER', 'IEEE', 'verifiable-credentials', 'ecosystem', 'workforce', 'skills-based-hiring', 'career-advancement', 'credential-engine', '1EdTech'],
    // AI/analytics metadata
    aiTaxonomy: ['ler-ecosystem', 'credential-architecture', 'skills-based-hiring'],
    aiSummary: 'IEEE recommended practice defining the architecture and roles for LER ecosystems. Use as the overarching blueprint when building systems for issuing, holding, and verifying education and employment credentials.',
    aiUnlocksSummary: 'Provides the ecosystem-level architecture for your product to participate in LER credential exchange. Defines the roles (Awarder, Holder, Reviewer, Wallet, Registry) and trust model that connect issuers, learners, and employers — positioning your platform within a standards-based, interoperable credential ecosystem for skills-based hiring.',
    // Implementation fields
    implementationBurden: 'medium',
    implementationBurdenRationale: 'The standard is a recommended practice (architectural blueprint), not a wire protocol. Implementation burden depends on which ecosystem role(s) your system fulfills. Leverages W3C VC and DID as normative foundations.',
    burdenRubric: {
      engineering: { level: 'moderate', note: 'Aligning an existing system to the LER architecture requires moderate effort. Higher if building W3C VC infrastructure from scratch.' },
      infrastructure: { level: 'moderate', note: 'Requires W3C VC-compatible credential infrastructure. Digital wallet integration needed for Holder role. Registry infrastructure for governance role.' },
      legal: { level: 'low', note: 'IEEE standard is publicly referenced. No licensing fees for conformance. Data sharing agreements needed for multi-party ecosystems.' },
    },
    requiredCapabilities: ['W3C Verifiable Credentials support', 'W3C DID infrastructure', 'Digital wallet integration (for Holder role)', 'Credential registry access (recommended)'],
    implementationGuidance: 'Start by identifying which LER ecosystem role(s) your system will fulfill: Awarder (issuer), Holder (wallet/learner), Reviewer (verifier), or Registry (governance). Implement W3C VC and DID support as the normative foundation. Use Open Badges 3.0 or CLR 2.0 as the credential format. Align trust model to the standard\'s five recommended components.',
    referenceImplementations: [
      { name: 'IEEE 1484.2-2024 Standard (IEEE Store)', url: 'https://standards.ieee.org/ieee/1484.2/11406/', description: 'Official published standard document.' },
    ],
    samplePayloads: [
      {
        label: 'LER Ecosystem Roles (conceptual)',
        language: 'json',
        code: `{
  "ecosystem": "IEEE 1484.2-2024 LER",
  "roles": {
    "awarder": "Issues verifiable credentials (W3C VC)",
    "holder": "Manages credentials in a digital wallet",
    "reviewer": "Verifies credential authenticity and claims",
    "transmitter": "Delivers credentials between parties",
    "registry": "Provides trusted governance catalogs",
    "talentMarketplace": "Matches skills to employment opportunities"
  },
  "normativeFoundations": ["W3C Verifiable Credentials", "W3C DIDs"]
}`,
      },
    ],
    knownAdopters: ['T3 Innovation Network pilot partners', 'US Chamber of Commerce Foundation', 'Credential Engine', 'AACRAO'],
    technicalDocLinks: [
      { label: 'Project Website', url: 'https://sagroups.ieee.org/1484-2/' },
      { label: 'IEEE Standard (purchase)', url: 'https://standards.ieee.org/ieee/1484.2/11406/' },
    ],
    // Cross-spec awareness
    commonlyPairedWith: [
      { id: 'case-v1', rationale: 'CASE provides the competency framework exchange mechanism referenced by LER ecosystems for competency alignment across education and workforce.' },
      { id: 'ctdl', rationale: 'CTDL provides the linked-data vocabulary for describing credentials within the LER ecosystem, enabling credential transparency and registry discovery.' },
      { id: 'clr-v2', rationale: 'CLR 2.0 is a primary credential format for packaging LER data into comprehensive, portable learner records built on W3C VCs.' },
      { id: 'open-badges-v3', rationale: 'Open Badges 3.0 provides the micro-credential format that feeds into LER ecosystems, also built on W3C VCs as required by IEEE 1484.2.' },
    ],
    compatibilityNotes: 'IEEE 1484.2-2024 is the ecosystem architecture standard — it defines roles and trust models. CASE, CTDL, Open Badges, and CLR are the implementation standards that fulfill specific roles within the LER ecosystem. The standard normatively references W3C VCs and DIDs, and informatively references CEDS, CASE, CTDL, CLR, and Credential Registry.',
    // Equity field
    equityConsiderations: {
      level: 'medium-concern',
      notes: 'The standard acknowledges the need for equitable access to credential infrastructure. Digital wallet requirements may create barriers for learners without smartphones or stable internet. Alternative presentation methods should be supported.',
      lifDerived: false,
    },
    // Privacy field
    privacyConsiderations: {
      level: 'medium-concern',
      notes: 'LER ecosystems involve PII in verifiable credentials. The standard recommends selective disclosure and privacy-preserving verification. Implementers must address FERPA compliance for education records and consent management for credential sharing.',
      dataClassification: 'architectural-standard',
      regulations: ['FERPA', 'NDPA v2.2', 'state privacy laws'],
      ndpaProvisions: [
        {
          citation: 'NDPA Art. I §1.1',
          title: 'Provider as School Official',
          summary: 'Providers performing LER ecosystem services shall be considered a School Official with a legitimate educational interest, under the direct control and supervision of the LEA.',
        },
        {
          citation: 'NDPA Art. IV §4.2',
          title: 'Authorized Use Only',
          summary: 'Student Data processed via LER systems shall be used only for performing the Services outlined in Exhibit A, or as instructed by the LEA.',
        },
        {
          citation: 'NDPA Art. II §2.1',
          title: 'Data Ownership',
          summary: 'All Student Data processed through LER credential exchange remains the property of the LEA. Provider copies and modifications are subject to the same DPA provisions.',
        },
        {
          citation: 'NDPA Art. V §5.3',
          title: 'Cybersecurity Framework Required',
          summary: 'Providers must implement an adequate Cybersecurity Framework (NIST CSF, ISO 27000, CIS, or SDPC GESS) as declared in Exhibit F.',
        },
      ],
    },
    relatedResources: ['case-v1', 'ctdl', 'open-badges-v3', 'clr-v2'],
    status: 'approved',
  },
  {
    id: 'case-v1',
    title: 'Competency & Academic Standards Exchange (CASE) v1.1',
    type: 'Standard',
    targetCanonicalEntity: 'Competency Framework / Competency Definition',
    fieldMappingDescription: 'REST API with JSON payloads. Key entities: CFDocument (framework container), CFItem (individual competency), CFAssociation (relationships between items). Maps CFItem.identifier → CEDS CompetencyDefinition, CFDocument.identifier → CEDS CompetencyFramework. Full field crosswalk available in the field-mappings table.',
    transformationNotes: 'Strong alignment with CEDS Competencies domain. Missing: no credential issuance fields (use OB3/CLR), no assessment result fields, no enrollment data. CASE UUIDs must be mapped to CTDL URIs for credential transparency use cases.',
    category: 'Competency Frameworks',
    description: '1EdTech standard for exchanging competency frameworks and academic standards as structured, machine-readable data via a REST/JSON API. Enables systems to publish, discover, and align competency definitions across institutions and platforms.',
    owner: '1EdTech Consortium',
    governanceBody: '1EdTech Consortium',
    lastUpdated: '2025-06-01',
    version: '1.1',
    accessLevel: 'open',
    opennessStatus: 'open',
    accessUrl: 'https://www.1edtech.org/standards/case',
    authoritativeRepoUrl: null,
    tags: ['competency', 'CASE', 'academic-standards', '1EdTech', 'REST-API', 'framework-exchange'],
    aiTaxonomy: ['competency-exchange', 'academic-standards', 'framework-api'],
    aiSummary: 'REST/JSON API standard for publishing and exchanging competency frameworks. Use when systems need to share, align, or discover competency definitions across platforms.',
    aiUnlocksSummary: 'Enables your product to publish, consume, and align competency frameworks from multiple authorities (state standards, industry frameworks, institutional outcomes). Unlocks cross-institutional competency alignment, dynamic curriculum mapping, and automated standards crosswalking.',
    implementationBurden: 'medium',
    implementationBurdenRationale: 'Well-defined REST API with JSON responses. Moderate effort for consumer-side; higher for publisher-side where you must model your competency data into CASE format.',
    burdenRubric: {
      engineering: { level: 'moderate', note: 'Consumer integration is straightforward; publishing frameworks via the API requires more significant modeling effort.' },
      infrastructure: { level: 'low', note: 'Standard REST API endpoints. No specialized infrastructure required.' },
      legal: { level: 'low', note: 'Open standard. 1EdTech membership recommended but not required for basic use.' },
    },
    requiredCapabilities: ['REST API client', 'JSON parser', 'Competency data model (for publishers)'],
    implementationGuidance: 'Start as a CASE consumer: query existing published frameworks (e.g., state standards) via the REST API. Build a local cache of competency trees. Phase 2: publish your own institutional competency frameworks. Use the CASE Network sandbox for testing.',
    referenceImplementations: [
      { name: 'CASE Network', url: 'https://casenetwork.1edtech.org', description: 'Public registry of CASE-published competency frameworks from states and organizations.' },
      { name: 'OpenSALT', url: 'https://github.com/opensalt/opensalt', description: 'Open-source CASE framework editor and publisher.' },
    ],
    samplePayloads: [
      {
        label: 'CASE Competency Framework Item (JSON)',
        language: 'json',
        code: `{
  "CFItem": {
    "identifier": "urn:case:item:math-algebra-1",
    "fullStatement": "Solve linear equations in one variable",
    "humanCodingScheme": "MATH.ALG.1.1",
    "CFItemType": "Standard",
    "educationLevel": ["09", "10", "11"],
    "lastChangeDateTime": "2025-03-15T00:00:00Z"
  }
}`,
      },
    ],
    knownAdopters: ['Achieve (state standards)', 'OpenSALT community', 'Multiple US state education agencies', 'Credential Engine'],
    technicalDocLinks: [
      { label: 'CASE v1.1 Specification Documentation', url: 'https://www.imsglobal.org/spec/case/v1p1' },
      { label: 'CASE Network (Public Registry)', url: 'https://casenetwork.1edtech.org' },
    ],
    commonlyPairedWith: [
      { id: 'lrw-competency-framework', rationale: 'LER references competency frameworks that CASE makes exchangeable. CASE provides the API plumbing for distributing competency definitions used in LER records.' },
      { id: 'ctdl', rationale: 'CTDL describes credentials and their competency requirements. CASE provides the competency framework data that CTDL credential descriptions reference.' },
      { id: 'clr-v2', rationale: 'CLR records reference competencies achieved by learners. CASE provides the canonical framework identifiers that CLR uses for competency alignment.' },
      { id: 'open-badges-v3', rationale: 'Open Badges can reference CASE competency framework URIs/UUIDs as the achievement criteria, linking badge achievements to canonical skill definitions.' },
    ],
    compatibilityNotes: 'CASE is complementary to CTDL (competency definitions vs. credential descriptions) and CLR (competency references in learner records). No overlaps or conflicts. JSON format is simpler than JSON-LD — consider a JSON-LD bridge if integrating with CTDL.',
    equityConsiderations: {
      level: 'low-concern',
      notes: 'Framework exchange standard with no PII. Equity concern: published frameworks may embed curriculum biases. Review competency language for cultural neutrality before adoption.',
      lifDerived: false,
    },
    privacyConsiderations: {
      level: 'low-concern',
      notes: 'Schema/framework data only. No learner PII involved. Published frameworks are public data. NDPA obligations are minimal since CASE exchanges competency definitions, not Student Data as defined in Exhibit C.',
      dataClassification: 'public',
      ndpaProvisions: [
        {
          citation: 'NDPA Exhibit C',
          title: 'Student Data Definition — Not Applicable',
          summary: 'CASE exchanges competency framework definitions (public data), not Student Data as defined by the NDPA. No DPA is required for CASE framework data alone.',
        },
      ],
    },
    relatedResources: ['lrw-competency-framework', 'ctdl', 'clr-v2'],
    status: 'approved',
  },
  {
    id: 'ctdl',
    title: 'Credential Transparency Description Language (CTDL)',
    type: 'Standard',
    category: 'Credential Transparency',
    targetCanonicalEntity: 'Credential / Organization / Competency',
    fieldMappingDescription: 'JSON-LD linked data vocabulary. Key classes: ceterms:Credential, ceterms:Organization, ceterms:CompetencyFramework. Published to Credential Registry via CTDL-ASN. Maps ceterms:Credential → CEDS CredentialDefinition, ceterms:competencyNeeded → CEDS CompetencyDefinition.',
    transformationNotes: 'CTDL is a vocabulary, not a wire format — data is serialized as JSON-LD and published to the Credential Registry. Missing: no learner-level data (use CLR), no assessment results, no enrollment records. CTDL URIs are the canonical identifiers for credential descriptions referenced by OB3 and CLR.',
    description: 'Linked-data vocabulary (JSON-LD/RDF) for describing credentials, organizations, competencies, and their relationships. Maintained by Credential Engine, CTDL powers the Credential Registry and enables machine-readable credential transparency at national scale.',
    owner: 'Credential Engine',
    governanceBody: 'Credential Engine',
    lastUpdated: '2025-08-01',
    version: 'current',
    accessLevel: 'open',
    opennessStatus: 'open',
    accessUrl: 'https://credreg.net/ctdl/terms',
    authoritativeRepoUrl: 'https://github.com/CredentialEngine/CTDL_Json_Validation_Schema',
    tags: ['CTDL', 'credential-transparency', 'linked-data', 'JSON-LD', 'RDF', 'Credential-Engine', 'registry'],
    aiTaxonomy: ['credential-vocabulary', 'linked-data', 'transparency'],
    aiSummary: 'Linked-data vocabulary for describing credentials, their requirements, and issuing organizations. Use when publishing or consuming credential metadata for transparency and discovery.',
    aiUnlocksSummary: 'Enables your product to describe credentials in a machine-readable, semantically rich format that the Credential Registry and search engines can index. Unlocks credential discovery, comparison, and pathway mapping at national scale — letting learners and employers find and evaluate credentials across thousands of providers.',
    implementationBurden: 'medium',
    implementationBurdenRationale: 'JSON-LD/RDF requires familiarity with linked data concepts. Credential Engine provides tools and APIs that reduce the burden. Publishing to the Registry has a structured onboarding process.',
    burdenRubric: {
      engineering: { level: 'moderate', note: 'Modeling and publishing credentials in CTDL requires moderate effort. Consumer/search integration via Registry API is lighter.' },
      infrastructure: { level: 'low', note: 'Credential Engine hosts the Registry. Publishers need minimal infrastructure beyond data preparation.' },
      legal: { level: 'low', note: 'Open vocabulary. No licensing. Publishing agreement with Credential Engine is straightforward.' },
    },
    requiredCapabilities: ['JSON-LD understanding', 'Credential data modeling', 'REST API client (for Registry integration)'],
    implementationGuidance: 'Begin by exploring the Credential Registry search to understand CTDL data in practice. Map your credentials to CTDL terms using the CTDL Handbook. Use the Credential Engine publisher tool for initial data entry. For programmatic integration, use the Registry API.',
    referenceImplementations: [
      { name: 'Credential Finder', url: 'https://credentialfinder.org', description: 'National registry of credentials described in CTDL. Searchable by learners, employers, and systems.' },
      { name: 'CTDL Explorer', url: 'https://credreg.net/ctdl/explorer', description: 'Interactive browser for CTDL vocabulary terms and relationships.' },
    ],
    samplePayloads: [
      {
        label: 'CTDL Credential Description (JSON-LD)',
        language: 'json',
        code: `{
  "@context": "https://credreg.net/ctdl/schema/context/json",
  "@type": "ceterms:BachelorDegree",
  "ceterms:name": "B.S. Computer Science",
  "ceterms:ownedBy": {
    "@id": "https://credentialfinder.org/org/12345"
  },
  "ceterms:requires": [{
    "@type": "ceterms:ConditionProfile",
    "ceterms:targetCompetency": [
      { "ceterms:competencyText": "Software Engineering" }
    ]
  }]
}`,
      },
    ],
    knownAdopters: ['Credential Engine publisher network (4,000+ organizations)', 'US state longitudinal data systems', 'Lumina Foundation grantees', 'EMSI/Lightcast'],
    technicalDocLinks: [
      { label: 'CTDL Terms & Vocabulary', url: 'https://credreg.net/ctdl/terms' },
      { label: 'CTDL Handbook', url: 'https://credreg.net/ctdl/handbook' },
      { label: 'Credential Registry API', url: 'https://credreg.net/registry/assistant' },
    ],
    commonlyPairedWith: [
      { id: 'case-v1', rationale: 'CTDL credential descriptions reference competency frameworks. CASE provides the machine-readable competency data that CTDL credentials point to for their requirements.' },
      { id: 'open-badges-v3', rationale: 'Open Badges 3.0 credentials can embed CTDL metadata for richer credential descriptions. CTDL alignment adds discoverability via the Credential Registry.' },
      { id: 'lrw-competency-framework', rationale: 'LER competency taxonomy provides the workforce-aligned competency structure that CTDL credential descriptions reference.' },
      { id: 'clr-v2', rationale: 'CLR records aggregate credentials described by CTDL. CTDL skill URIs/UUIDs can be referenced in CLR achievement entries for semantic interoperability.' },
    ],
    compatibilityNotes: 'CTDL is the description/transparency layer while Open Badges and CLR are the issuance/record layers. CTDL describes what a credential IS; OB3/CLR record that a learner HAS one. They are complementary, not competing. CTDL uses JSON-LD; ensure JSON-LD tooling is available if integrating with CASE (plain JSON).',
    equityConsiderations: {
      level: 'low-concern',
      notes: 'Vocabulary standard describing credentials. Equity benefit: makes credential information transparent and discoverable to underserved populations. Concern: credential descriptions may omit alternative or non-traditional pathways if not intentionally included.',
      lifDerived: false,
    },
    privacyConsiderations: {
      level: 'low-concern',
      notes: 'Describes credentials and organizations — no learner PII. Published data is public by design. Organizations publishing to the Registry share institutional information voluntarily. NDPA obligations are minimal since CTDL describes credentials, not individual student records.',
      dataClassification: 'public',
      ndpaProvisions: [
        {
          citation: 'NDPA Exhibit C',
          title: 'Student Data Definition — Not Applicable',
          summary: 'CTDL describes credential types and organizations (public registry data), not Student Data as defined by the NDPA. No DPA is required for CTDL metadata publishing alone.',
        },
      ],
    },
    relatedResources: ['case-v1', 'open-badges-v3', 'lrw-competency-framework'],
    status: 'approved',
  },
  {
    id: 'open-badges-v3',
    title: 'Open Badges 3.0',
    type: 'Standard',
    category: 'Digital Credentials',
    targetCanonicalEntity: 'Achievement / OpenBadgeCredential',
    fieldMappingDescription: 'JSON-LD payloads conforming to W3C Verifiable Credentials Data Model. Key fields: OpenBadgeCredential.credentialSubject.achievement (Achievement object), issuer (Profile), evidence (Evidence array). Maps achievement.name → CEDS CredentialDefinition, achievement.criteria → competency alignment.',
    transformationNotes: 'OB3 is the micro-credential building block — individual badges. Missing: no transcript-level aggregation (use CLR), no competency framework exchange (use CASE), no organizational registry (use CTDL). Badges must be aggregated into CLR for comprehensive learner records.',
    description: '1EdTech standard for issuing, displaying, and verifying digital badges and micro-credentials. Version 3.0 aligns with W3C Verifiable Credentials, enabling cryptographic verification and decentralized trust for achievement recognition.',
    owner: '1EdTech Consortium',
    governanceBody: '1EdTech Consortium',
    lastUpdated: '2024-12-01',
    version: '3.0',
    accessLevel: 'open',
    opennessStatus: 'open',
    accessUrl: 'https://www.1edtech.org/standards/open-badges',
    authoritativeRepoUrl: 'https://github.com/1EdTech/openbadges-specification',
    tags: ['open-badges', 'micro-credentials', 'digital-badges', '1EdTech', 'verifiable-credentials', 'JSON-LD', 'achievement'],
    aiTaxonomy: ['digital-badge', 'micro-credential', 'achievement-verification'],
    aiSummary: 'Standard for issuing and verifying digital badges aligned with W3C VCs. Use when implementing achievement recognition, micro-credentialing, or skill badge systems.',
    aiUnlocksSummary: 'Enables your product to issue, display, and verify portable digital badges that learners can share across platforms and with employers. Unlocks micro-credentialing programs, stackable credential pathways, and verifiable achievement sharing — with W3C VC alignment providing cryptographic trust without centralized verification.',
    implementationBurden: 'medium',
    implementationBurdenRationale: 'OB3 is well-documented with robust tooling. The W3C VC alignment adds cryptographic complexity but managed services exist. Issuing is more complex than consuming/verifying.',
    burdenRubric: {
      engineering: { level: 'moderate', note: 'Issuer implementation requires moderate effort; verifier/displayer is lighter. Managed badge platforms significantly reduce engineering burden.' },
      infrastructure: { level: 'moderate', note: 'Issuers need key management for VC signing. Managed badge platforms (Badgr, Credly) handle infrastructure.' },
      legal: { level: 'low', note: 'Open standard. 1EdTech certification available but not required.' },
    },
    requiredCapabilities: ['JSON-LD processing', 'Cryptographic signing (for issuers)', 'Badge display/rendering UI', 'REST API client'],
    implementationGuidance: 'Start as a badge verifier/displayer: accept and render OB3 badges from other issuers. Use a managed badge platform (Badgr, Credly, Accredible) for initial issuance to skip infrastructure. Custom issuance requires W3C VC signing infrastructure. Test with 1EdTech conformance suite.',
    referenceImplementations: [
      { name: '1EdTech OB3 Conformance Suite', url: 'https://www.1edtech.org/spec/ob/v3p0/cert', description: 'Official conformance testing tool for Open Badges 3.0 implementations.' },
      { name: 'Badgr (open-source)', url: 'https://github.com/concentricsky/badgr-server', description: 'Open-source badge issuing platform supporting OB3.' },
    ],
    samplePayloads: [
      {
        label: 'Open Badge 3.0 Credential (JSON-LD)',
        language: 'json',
        code: `{
  "@context": [
    "https://www.w3.org/ns/credentials/v2",
    "https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json"
  ],
  "type": ["VerifiableCredential", "OpenBadgeCredential"],
  "issuer": {
    "id": "https://university.edu/issuers/1",
    "type": "Profile",
    "name": "State University"
  },
  "credentialSubject": {
    "type": "AchievementSubject",
    "achievement": {
      "type": "Achievement",
      "name": "Python Programming Fundamentals",
      "criteria": { "narrative": "Completed 40-hour course..." }
    }
  }
}`,
      },
    ],
    knownAdopters: ['Credly', 'Badgr/Instructure', 'Accredible', 'Digital Promise', 'Mozilla Foundation (original OB creator)'],
    technicalDocLinks: [
      { label: 'Open Badges 3.0 Specification', url: 'https://www.1edtech.org/spec/ob/v3p0' },
    ],
    commonlyPairedWith: [
      { id: 'clr-v2', rationale: 'CLR aggregates individual Open Badges into a comprehensive learner record. Open Badges are the building blocks; CLR is the container.' },
      { id: 'ctdl', rationale: 'CTDL metadata can enrich Open Badge credential descriptions, adding discoverability and transparency to badge programs via the Credential Registry.' },
      { id: 'lrw-competency-framework', rationale: 'LER competency definitions can be referenced as achievement criteria in Open Badges, connecting badge evidence to workforce-aligned competencies.' },
    ],
    compatibilityNotes: 'OB3 is built on W3C Verifiable Credentials, so it inherits VC trust infrastructure. CLR 2.0 extends OB3 — they share the same data model foundation. CTDL can describe the same credentials that OB3 issues, providing the transparency layer. No conflicts with CASE; competency frameworks from CASE can be referenced as badge criteria.',
    equityConsiderations: {
      level: 'medium-concern',
      notes: 'Badge UX must be accessible across devices and literacy levels. Visual badge design should meet WCAG standards. Wallet/sharing UX can be a barrier for low-digital-literacy populations. Consider QR code and paper-friendly fallbacks.',
      lifDerived: true,
    },
    privacyConsiderations: {
      level: 'medium-concern',
      notes: 'Badges contain learner achievement data. Hosted badge verification can create tracking vectors. Learner consent required before public sharing. Revocation mechanisms needed for accuracy. FERPA considerations when badges are issued by educational institutions. Under the NDPA, badge data maps to multiple Exhibit B categories requiring a signed DPA.',
      dataClassification: 'credential-metadata',
      regulations: ['FERPA (educational contexts)', 'NDPA v2.2', 'GDPR (international)'],
      ndpaProvisions: [
        {
          citation: 'NDPA Art. IV §4.4',
          title: 'No Disclosure of Student Data',
          summary: 'Provider shall not sell or disclose any Student Data or PII contained in badges, including achievement data and learner identifiers, except as directed by the LEA or permitted under the DPA.',
        },
        {
          citation: 'NDPA Art. IV §4.7',
          title: 'Targeted Advertising Prohibited',
          summary: 'Providers are prohibited from using badge achievement data to inform, influence, or enable Targeted Advertising. Adaptive learning recommendations and contextual advertising are permitted.',
        },
        {
          citation: 'NDPA Art. II §2.2',
          title: 'Parent/Student Access Rights',
          summary: 'Parents, legal guardians, or eligible students may review badge data and request corrections. Provider must respond within 30 days or per state law timelines.',
        },
        {
          citation: 'NDPA Exhibit B',
          title: 'Data Categories for Badges',
          summary: 'Badge issuance typically maps to Exhibit B categories: Student Name, Student Identifiers, Student In App Performance, and potentially Assessment data. Each must be designated Required (R) or Optional (O).',
        },
      ],
    },
    relatedResources: ['clr-v2', 'ctdl', 'lrw-competency-framework'],
    status: 'approved',
  },
  {
    id: 'clr-v2',
    title: 'Comprehensive Learner Record (CLR) 2.0',
    type: 'Standard',
    category: 'Learner Records',
    targetCanonicalEntity: 'ClrCredential / Achievement / Result',
    fieldMappingDescription: 'JSON-LD payloads extending OB3 via W3C VC Data Model. Key fields: ClrCredential.credentialSubject (ClrSubject with achievements array), Achievement (with results, alignment, evidence). Maps ClrSubject → CEDS learner record, Achievement.result → CEDS AssessmentResult.',
    transformationNotes: 'CLR is the comprehensive container — aggregates OB3 badges into a full learner record. Missing: no real-time data exchange (use Ed-Fi/SIF), no competency framework authoring (use CASE), no organizational discovery (use CTDL Registry). CLR achievement.alignment URIs should reference CASE or CTDL-ASN identifiers.',
    description: '1EdTech standard for comprehensive, portable learner achievement records. CLR 2.0 extends Open Badges 3.0 to aggregate multiple achievements, competencies, and experiences into a single verifiable record aligned with W3C Verifiable Credentials.',
    owner: '1EdTech Consortium',
    governanceBody: '1EdTech Consortium',
    lastUpdated: '2024-12-01',
    version: '2.0',
    accessLevel: 'open',
    opennessStatus: 'open',
    accessUrl: 'https://www.1edtech.org/standards/clr',
    authoritativeRepoUrl: null,
    tags: ['CLR', 'comprehensive-learner-record', 'learner-record', '1EdTech', 'verifiable-credentials', 'JSON-LD', 'portable-record'],
    aiTaxonomy: ['learner-record', 'credential-aggregation', 'portable-record'],
    aiSummary: 'Standard for aggregating achievements, badges, and competencies into a comprehensive, verifiable learner record. Use when building learner portfolios, transcript alternatives, or comprehensive credential packages.',
    aiUnlocksSummary: 'Enables your product to create comprehensive, portable learner records that aggregate badges, credentials, competencies, and experiences into a single verifiable package. Unlocks holistic learner profiles, transcript modernization, competency-based record-keeping, and cross-institutional record portability — giving learners a complete, verifiable picture of their achievements.',
    implementationBurden: 'high',
    implementationBurdenRationale: 'CLR 2.0 builds on OB3 and W3C VC, requiring familiarity with both. Aggregating multiple credential types into a coherent record adds data modeling complexity. Managed platforms exist but full custom implementation is significant.',
    burdenRubric: {
      engineering: { level: 'high', note: 'Full issuer implementation is a significant engineering effort. Consumer/viewer integration is more moderate. Managed platforms reduce effort.' },
      infrastructure: { level: 'high', note: 'Requires credential aggregation pipeline, W3C VC signing infrastructure, and learner consent management.' },
      legal: { level: 'moderate', note: 'Learner data aggregation requires consent management. FERPA compliance for educational institutions. 1EdTech certification available.' },
    },
    requiredCapabilities: ['JSON-LD processing', 'W3C VC signing infrastructure', 'Credential aggregation pipeline', 'Learner consent UI', 'Open Badges 3.0 compatibility'],
    implementationGuidance: 'Begin by implementing Open Badges 3.0 support first — CLR extends OB3. Start as a CLR consumer: accept and display CLR records from other issuers. Phase 2: aggregate your own badges/achievements into CLR records. Phase 3: implement full issuance with consent management and VC signing. Use 1EdTech conformance suite for validation.',
    referenceImplementations: [
      { name: '1EdTech CLR Conformance Suite', url: 'https://www.1edtech.org/spec/clr/v2p0/cert', description: 'Official conformance testing for CLR 2.0 implementations.' },
      { name: 'CLR Reference Implementation', url: 'https://github.com/1EdTech/CLR-Reference', description: 'Reference implementation demonstrating CLR record creation and verification.' },
    ],
    samplePayloads: [
      {
        label: 'CLR 2.0 Record (JSON-LD, simplified)',
        language: 'json',
        code: `{
  "@context": [
    "https://www.w3.org/ns/credentials/v2",
    "https://purl.imsglobal.org/spec/clr/v2p0/context.json"
  ],
  "type": ["VerifiableCredential", "ClrCredential"],
  "issuer": {
    "id": "https://university.edu/issuers/1",
    "type": "Profile",
    "name": "State University"
  },
  "credentialSubject": {
    "type": "ClrSubject",
    "verifiableCredential": [{
      "type": ["VerifiableCredential", "OpenBadgeCredential"],
      "credentialSubject": {
        "achievement": {
          "name": "Data Structures & Algorithms",
          "type": "Achievement"
        }
      }
    }]
  }
}`,
      },
    ],
    knownAdopters: ['Western Governors University', 'AACRAO (Digital Connect)', 'Parchment', 'National Student Clearinghouse'],
    technicalDocLinks: [
      { label: 'CLR 2.0 Specification', url: 'https://www.1edtech.org/spec/clr/v2p0' },
      { label: 'CLR Implementation Guide', url: 'https://www.1edtech.org/spec/clr/v2p0/impl' },
    ],
    commonlyPairedWith: [
      { id: 'open-badges-v3', rationale: 'CLR 2.0 extends Open Badges 3.0. Individual badges are aggregated into CLR records. Implement OB3 first as the foundation.' },
      { id: 'case-v1', rationale: 'CASE-published competency frameworks provide the canonical competency identifiers referenced in CLR achievement records.' },
      { id: 'lrw-competency-framework', rationale: 'LER provides the workforce-aligned competency taxonomy that CLR records reference for employer-readable skill evidence.' },
    ],
    compatibilityNotes: 'CLR 2.0 is a superset of Open Badges 3.0 — every OB3 badge can be included in a CLR. Both are built on W3C Verifiable Credentials. CTDL can describe CLR-issued credentials for registry transparency. CASE competency identifiers can be referenced in CLR achievement criteria. The entire LER stack fits together without conflicts.',
    equityConsiderations: {
      level: 'medium-concern',
      notes: 'CLR aggregation complexity can create a digital divide. Learners with fewer institutional touchpoints may have thinner CLR records, potentially disadvantaging them. Ensure CLR viewers present non-traditional achievements equitably. Wallet UX accessibility is critical.',
      lifDerived: true,
    },
    privacyConsiderations: {
      level: 'high-concern',
      notes: 'CLR records aggregate comprehensive learner data including achievements, competencies, and institutional history. FERPA compliance mandatory for educational issuers. Learner consent required for each achievement included. Selective disclosure mechanisms (from W3C VC) should be implemented to let learners share only relevant portions. The NDPA imposes the most extensive obligations on CLR implementations due to the breadth of Student Data aggregated.',
      dataClassification: 'PII / educational-record',
      regulations: ['FERPA', 'NDPA v2.2', 'COPPA (under-13 contexts)', 'GDPR (international)', 'state privacy laws'],
      ndpaProvisions: [
        {
          citation: 'NDPA Art. II §2.1',
          title: 'Student Data Property of LEA',
          summary: 'All Student Data in CLR records — including aggregated achievements, competencies, and institutional history — remains the property of the LEA. All copies and modifications are subject to the DPA.',
        },
        {
          citation: 'NDPA Art. IV §4.6',
          title: 'Data Disposition Within 60 Days',
          summary: 'On written LEA request or DPA termination, Provider must dispose of all CLR Student Data within 60 days. LEA may issue special disposition instructions via Exhibit D (partial/complete, destroy/transfer).',
        },
        {
          citation: 'NDPA Art. V §5.4',
          title: 'Breach Notification — 72 Hours',
          summary: 'Provider must notify LEA within 72 hours of a confirmed Data Breach affecting CLR records. Notification must include: date, description, affected data types, and impacted individuals. Provider must maintain a written breach response plan.',
        },
        {
          citation: 'NDPA Art. IV §4.5',
          title: 'De-Identification Standards',
          summary: 'If creating de-identified data from CLR records, Provider must follow NIST or US DoE de-identification standards. Re-identification is prohibited without LEA written direction.',
        },
        {
          citation: 'NDPA Art. II §2.3',
          title: 'Subprocessor Agreements Required',
          summary: 'All subprocessors handling CLR data must be bound by agreements no less stringent than the DPA. Subprocessors must not sell Student Data.',
        },
        {
          citation: 'NDPA Art. IV §4.3',
          title: 'Employee Confidentiality',
          summary: 'All Provider employees with access to CLR Student Data must have signed confidentiality agreements covering the DPA provisions.',
        },
        {
          citation: 'NDPA Exhibit B',
          title: 'Comprehensive Data Categories',
          summary: 'CLR aggregation may span most Exhibit B categories: Student Name, Student Identifiers, Demographics, Enrollment, Assessment, Transcript, Student In App Performance, and Student Work. Each must be explicitly listed and designated.',
        },
      ],
    },
    relatedResources: ['open-badges-v3', 'case-v1', 'lrw-competency-framework'],
    status: 'approved',
  },

  // ─── CEDS ──────────────────────────────────────────────────────────────────
  {
    id: 'ceds',
    title: 'Common Education Data Standards (CEDS)',
    type: 'Standard',
    category: 'Data Standards',
    targetCanonicalEntity: 'Education Data Element / P-20W Data Dictionary',
    fieldMappingDescription: 'CEDS is the canonical reference vocabulary — not a wire format. Data elements are organized into 13 domains with unique identifiers (e.g., http://ceds.ed.gov/terms#C200065). Other standards map their fields TO CEDS elements. Ed-Fi UDM fields map directly to CEDS element IDs. SIF data objects reference CEDS definitions.',
    transformationNotes: 'CEDS is the semantic layer, not a transport standard. Missing: no REST API specification (use Ed-Fi or SIF for transport), no credential issuance model (use OB3/CLR), no linked-data vocabulary (use CTDL). CEDS elements are the alignment target — all other standards should map to CEDS for interoperability.',
    description: 'CEDS is a national collaborative effort to develop voluntary, common data standards for a key set of education data elements to streamline the exchange and comparison of data across institutions, sectors, and states. CEDS includes a data model, data elements dictionary, a connection to data exchange standards, and tools for mapping and aligning data across P-20W (preschool through workforce) contexts.',
    owner: 'National Center for Education Statistics (NCES)',
    governanceBody: 'US Department of Education / NCES',
    lastUpdated: '2024-01-01',
    version: 'v11',
    accessLevel: 'open',
    opennessStatus: 'open',
    accessUrl: 'https://ceds.ed.gov',
    authoritativeRepoUrl: null,
    tags: ['CEDS', 'P-20W', 'data-dictionary', 'interoperability', 'NCES', 'federal', 'education-data', 'K-12', 'postsecondary', 'workforce', 'credentials', 'assessments', 'compliance-reporting', 'SLDS', 'EdFacts', 'LER-alignment'],
    aiTaxonomy: ['data-dictionary', 'education-data-model', 'P-20W-interoperability'],
    aiSummary: 'The foundational US education data dictionary and model covering P-20W. Use CEDS as the common vocabulary for aligning data elements across education and workforce systems, state longitudinal data systems, and federal reporting.',
    aiUnlocksSummary: 'Provides the canonical reference vocabulary for education data elements. Aligning to CEDS enables data exchange across K-12 districts, postsecondary institutions, and workforce agencies. Essential for state longitudinal data systems (SLDS) and federal EdFacts reporting.',
    implementationBurden: 'low',
    implementationBurdenRationale: 'CEDS is a voluntary data dictionary and reference model — no specific technology stack is mandated. Implementation involves mapping your existing data elements to CEDS definitions. Tools like CEDS Align and CEDS Connect assist with mapping.',
    burdenRubric: {
      engineering: { level: 'low', note: 'CEDS is a reference vocabulary, not a wire protocol. Main effort is data element mapping and alignment.' },
      infrastructure: { level: 'low', note: 'No infrastructure changes required. CEDS provides the common language; implementation is done in your existing systems.' },
      legal: { level: 'low', note: 'Open, publicly funded standard. No licensing fees. Data sharing governed by existing FERPA/state agreements.' },
    },
    requiredCapabilities: ['Data element mapping capability', 'Understanding of P-20W data domains'],
    implementationGuidance: 'Start by using the CEDS Data Model at ceds.ed.gov to identify the domains and elements relevant to your system. Use the CEDS Align tool to map your local data dictionary to CEDS elements. Focus on the domains most critical to your reporting and interoperability needs. CEDS Connect provides ETL templates for common data exchange scenarios.',
    referenceImplementations: [
      { name: 'CEDS Data Model & Element Finder', url: 'https://ceds.ed.gov', description: 'Browse and search the full CEDS data model, elements, and option sets.' },
      { name: 'CEDS Align', url: 'https://ceds.ed.gov/cedsAlign.aspx', description: 'Tool for mapping local data dictionaries to CEDS elements.' },
    ],
    samplePayloads: [
      {
        label: 'CEDS Domain Coverage (conceptual)',
        language: 'json',
        code: `{
  "standard": "CEDS v11",
  "domains": [
    "Assessments", "Authentication & Authorization",
    "Competencies", "Credentials", "CTE",
    "Early Learning", "Facilities", "K-12",
    "Learning Resources", "Postsecondary",
    "Workforce", "Adult Education",
    "Implementation Variables"
  ],
  "totalElements": 1800,
  "scope": "P-20W (Preschool through Workforce)"
}`,
      },
    ],
    knownAdopters: ['State Longitudinal Data Systems (SLDS)', 'EdFacts', 'Ed-Fi Alliance', 'CEDS Community of Practice members'],
    technicalDocLinks: [
      { label: 'CEDS Website', url: 'https://ceds.ed.gov' },
      { label: 'CEDS Data Model', url: 'https://ceds.ed.gov/dataModel.aspx' },
      { label: 'CEDS Align Tool', url: 'https://ceds.ed.gov/cedsAlign.aspx' },
    ],
    commonlyPairedWith: [
      { id: 'edfi', rationale: 'Ed-Fi operationalizes CEDS data elements into a REST API standard for real-time K-12 data exchange. Ed-Fi data elements are mapped to CEDS definitions.' },
      { id: 'sif', rationale: 'SIF data objects are mapped to CEDS elements. CEDS provides the canonical vocabulary; SIF provides the infrastructure-level exchange protocol.' },
      { id: 'case-v1', rationale: 'CASE competency frameworks align to CEDS Competencies domain elements for standards-based competency exchange.' },
    ],
    compatibilityNotes: 'CEDS is the semantic foundation — it defines what data elements mean. Ed-Fi and SIF are operational standards that move data using CEDS-aligned definitions. Most US education interoperability efforts reference CEDS for semantic alignment.',
    equityConsiderations: {
      level: 'low-concern',
      summary: 'CEDS is freely available and publicly funded. It includes elements for tracking equity-relevant data (disability status, economic disadvantage, English learner status) but does not mandate their collection.',
    },
    privacyConsiderations: {
      level: 'low-concern',
      summary: 'CEDS is a data dictionary — it defines elements but does not prescribe data collection or sharing. Privacy governance is handled by the implementing system and applicable laws (FERPA, COPPA).',
      dataClassification: 'reference-vocabulary',
      regulations: ['FERPA', 'COPPA', 'NDPA v2.2', 'state privacy laws'],
      ndpaClauses: [
        {
          citation: 'NDPA Exhibit B',
          title: 'Data Element Scoping',
          summary: 'CEDS element definitions inform the Exhibit B data schedule — LEAs should reference CEDS element IDs when specifying which data categories are shared with providers.',
        },
        {
          citation: 'NDPA Art. IV §4.5',
          title: 'De-Identification Standards',
          summary: 'When sharing CEDS-aligned data for analytics or AI/ML, de-identification must follow FERPA standards. CEDS elements like PersonIdentification must be removed or hashed.',
        },
        {
          citation: 'NDPA Art. IV §4.2',
          title: 'Authorized Use',
          summary: 'Systems exchanging CEDS-aligned data must limit use to authorized educational purposes per the NDPA.',
        },
      ],
    },
    relatedResources: ['edfi', 'sif', 'case-v1'],
    status: 'approved',
  },

  // ─── SIF ───────────────────────────────────────────────────────────────────
  {
    id: 'sif',
    title: 'Schools Interoperability Framework (SIF) 3.7',
    type: 'Standard',
    category: 'Data Standards',
    targetCanonicalEntity: 'K-12 Data Object (StudentPersonal, SchoolInfo, StaffPersonal)',
    fieldMappingDescription: 'REST API (SIF 3.x) with JSON/XML payloads. Key data objects: StudentPersonal (demographics), SchoolInfo (organization), StaffPersonal (staff), StudentSchoolEnrollment, SectionInfo, StudentSectionEnrollment, AssessmentRegistration. SIF objects map to CEDS elements — StudentPersonal.Name → CEDS PersonName, StudentPersonal.Demographics.BirthDate → CEDS BirthDate.',
    transformationNotes: 'Strong K-12 coverage but no postsecondary or workforce data objects. Missing: no credential issuance (use OB3/CLR), no competency framework exchange (use CASE), no workforce outcomes (use Ed-Fi extensions or CEDS Workforce domain). SIF 2.x XML objects must be transformed to SIF 3.x REST/JSON for modern integrations. A4L Unity is the planned successor unifying SIF and newer approaches.',
    description: 'SIF is a data sharing specification for K-12 education systems maintained by A4L Community (formerly the Access 4 Learning Community). SIF 3.7 defines a REST-based infrastructure for exchanging education data objects between systems using a publish/subscribe and request/response model. It includes a comprehensive data model covering student demographics, enrollment, scheduling, assessment, and more.',
    owner: 'A4L Community (Access 4 Learning)',
    governanceBody: 'A4L Community',
    lastUpdated: '2023-06-01',
    version: '3.7',
    accessLevel: 'open',
    opennessStatus: 'open',
    accessUrl: 'https://files.a4l.org/Implementation/Infrastructure/3.7/',
    authoritativeRepoUrl: null,
    tags: ['SIF', 'A4L', 'K-12', 'data-exchange', 'REST', 'infrastructure', 'publish-subscribe', 'student-records', 'enrollment', 'assessments', 'scheduling', 'CEDS-aligned', 'transcript-exchange', 'compliance-reporting'],
    aiTaxonomy: ['data-exchange-protocol', 'K-12-infrastructure', 'publish-subscribe'],
    aiSummary: 'REST-based K-12 data exchange infrastructure standard. Use SIF when you need a mature, standards-body-backed protocol for system-to-system data exchange in K-12 environments, especially in environments with SIF Zones and middleware.',
    aiUnlocksSummary: 'Provides a mature infrastructure for real-time data exchange between K-12 systems (SIS, LMS, assessment, transportation, food service, etc.). The SIF data model and Zone architecture enable publish/subscribe data flows across vendor systems without point-to-point integration.',
    implementationBurden: 'medium',
    implementationBurdenRationale: 'SIF 3.7 requires implementing REST endpoints conforming to the SIF Infrastructure specification and adopting SIF data objects. Middleware (Zone Integration Server) may be needed. The data model is comprehensive but complex.',
    burdenRubric: {
      engineering: { level: 'moderate', note: 'Implementing SIF REST consumers/providers requires conformance to the SIF Infrastructure spec. Data object modeling is well-documented but extensive.' },
      infrastructure: { level: 'moderate', note: 'A SIF Zone Integration Server (ZIS) or equivalent middleware may be needed for multi-system environments. Cloud-hosted ZIS options available.' },
      legal: { level: 'low', note: 'Open specification. A4L membership recommended but not required for implementation. NDPA compliance needed for student data exchange.' },
    },
    requiredCapabilities: ['REST API implementation', 'SIF data object modeling', 'Zone Integration Server (for multi-system deployments)', 'CEDS-aligned data dictionary mapping'],
    implementationGuidance: 'Start with the SIF 3.7 Infrastructure specification to understand the REST-based request/response and eventing models. Identify which SIF data objects (e.g., StudentPersonal, SchoolInfo, StaffPersonal) your system needs to produce or consume. For multi-vendor environments, deploy a Zone Integration Server. Map SIF data objects to your internal schema using CEDS alignment.',
    referenceImplementations: [
      { name: 'SIF 3.7 Infrastructure Specification', url: 'https://files.a4l.org/Implementation/Infrastructure/3.7/', description: 'Full SIF 3.7 infrastructure specification and implementation guide.' },
      { name: 'A4L Unity (SIF successor)', url: 'https://www.a4l.org/unity', description: 'Next-generation A4L data exchange framework building on SIF concepts.' },
    ],
    samplePayloads: [
      {
        label: 'SIF StudentPersonal Object (simplified)',
        language: 'json',
        code: `{
  "StudentPersonal": {
    "RefId": "D3E34B35-9D75-101A-8C3D-00AA001A1652",
    "LocalId": "S1234567",
    "Name": {
      "Type": "04",
      "FirstName": "Maria",
      "LastName": "Santos"
    },
    "Demographics": {
      "BirthDate": "2010-03-15",
      "Gender": "Female"
    },
    "EnrollmentStatus": "Active"
  }
}`,
      },
    ],
    knownAdopters: ['PowerSchool', 'Infinite Campus', 'Follett', 'Tyler Technologies (SIS)', 'Pearson'],
    technicalDocLinks: [
      { label: 'SIF 3.7 Specification', url: 'https://files.a4l.org/Implementation/Infrastructure/3.7/' },
      { label: 'A4L Community', url: 'https://www.a4l.org' },
    ],
    commonlyPairedWith: [
      { id: 'ceds', rationale: 'SIF data objects are mapped to CEDS data elements. CEDS provides the canonical vocabulary; SIF provides the transport mechanism.' },
      { id: 'edfi', rationale: 'Ed-Fi and SIF address similar K-12 data exchange needs with different architectural approaches. Many districts use both — SIF for legacy integrations and Ed-Fi for newer REST API patterns.' },
    ],
    compatibilityNotes: 'SIF 3.7 is the current REST-based version. Legacy SIF 2.x used XML/SOAP. Many K-12 environments have both SIF and Ed-Fi deployments. A4L Unity is the next-generation framework intended to unify these approaches.',
    equityConsiderations: {
      level: 'low-concern',
      summary: 'SIF is an open specification focused on data exchange infrastructure. It includes data objects for tracking equity-relevant student characteristics but does not mandate data collection practices.',
    },
    privacyConsiderations: {
      level: 'medium-concern',
      summary: 'SIF enables system-to-system student data exchange which requires careful FERPA and NDPA compliance. Zone architecture provides access control, but data governance policies must be established separately.',
      dataClassification: 'student-data-exchange',
      regulations: ['FERPA', 'COPPA', 'NDPA v2.2', 'state privacy laws'],
      ndpaClauses: [
        {
          citation: 'NDPA Art. IV §4.2',
          title: 'Authorized Use',
          summary: 'SIF data exchange must be scoped to authorized educational purposes per the NDPA. Zone Integration Servers must enforce access control per provider authorization.',
        },
        {
          citation: 'NDPA Art. IV §4.4',
          title: 'No Sale / No Disclosure',
          summary: 'Student data exchanged via SIF zones shall not be sold or disclosed to third parties outside the authorized educational purpose.',
        },
        {
          citation: 'NDPA Art. V §5.4',
          title: 'Breach Notification',
          summary: 'SIF Zone operators must notify LEAs within 72 hours of any security breach affecting student data within SIF data exchange infrastructure.',
        },
        {
          citation: 'NDPA Art. IV §4.6',
          title: 'Data Disposition',
          summary: 'Upon termination, SIF providers must delete or return all student data within 60 days. Zone data stores must be purged per NDPA disposition requirements.',
        },
        {
          citation: 'NDPA Exhibit B',
          title: 'Data Element Scoping',
          summary: 'SIF data objects exchanged must be explicitly listed in Exhibit B. StudentPersonal fields spanning demographics, enrollment, and assessment data each require designation.',
        },
      ],
    },
    relatedResources: ['ceds', 'edfi'],
    status: 'approved',
  },

  // ─── Ed-Fi ─────────────────────────────────────────────────────────────────
  {
    id: 'edfi',
    title: 'Ed-Fi Data Standard',
    type: 'Standard',
    category: 'Data Standards',
    targetCanonicalEntity: 'Operational Data Store Resource (Student, School, Assessment, Staff)',
    fieldMappingDescription: 'REST API with JSON payloads (Swagger-documented). Key resources: /students, /schools, /staffs, /assessments, /studentAssessments, /grades, /studentSchoolAssociations. Ed-Fi UDM fields are explicitly mapped to CEDS element IDs — e.g., Student.studentUniqueId → CEDS StudentIdentifier, StudentSchoolAssociation.entryDate → CEDS EnrollmentEntryDate. Descriptors (enumerations) are URI-based and CEDS-aligned.',
    transformationNotes: 'Strongest K-12 operational data coverage. Missing: no postsecondary data model (K-12 only), no credential issuance/verification (use OB3/CLR), no workforce outcomes beyond staff employment (use CEDS Workforce domain directly). Ed-Fi extensions can add custom resources but are not part of the core standard. SIF-to-Ed-Fi data migration requires object-level mapping (StudentPersonal → /students).',
    description: 'The Ed-Fi Data Standard is a widely adopted, CEDS-aligned, REST API-based data standard for K-12 education data. It provides a Unifying Data Model (UDM) and API surface that enables real-time, standards-based data exchange between K-12 operational systems. The Ed-Fi ODS/API platform is the reference implementation used by state education agencies and districts nationwide for data integration and reporting.',
    owner: 'Ed-Fi Alliance',
    governanceBody: 'Ed-Fi Alliance (Michael & Susan Dell Foundation)',
    lastUpdated: '2024-06-01',
    version: 'v5.1',
    accessLevel: 'open',
    opennessStatus: 'open',
    accessUrl: 'https://www.ed-fi.org/ed-fi-data-standard/',
    authoritativeRepoUrl: 'https://github.com/Ed-Fi-Alliance-OSS',
    tags: ['Ed-Fi', 'K-12', 'REST-API', 'ODS', 'CEDS-aligned', 'data-integration', 'open-source', 'SIS', 'LMS', 'assessment', 'enrollment', 'student-records', 'compliance-reporting', 'EdFacts', 'CTE', 'workforce-training', 'transcript-exchange'],
    aiTaxonomy: ['K-12-data-standard', 'REST-API', 'operational-data-store'],
    aiSummary: 'The leading open-source, REST API-based K-12 data standard. Use Ed-Fi when you need real-time, CEDS-aligned data exchange between K-12 systems (SIS, LMS, assessment, HR) with a well-supported open-source platform and active community.',
    aiUnlocksSummary: 'Provides an operational data store (ODS) and REST API that serves as the data integration backbone for K-12 districts and state agencies. Ed-Fi\'s Unifying Data Model maps to CEDS and enables real-time data flows from SIS, LMS, assessment, and HR systems into a central, standards-based data store for analytics, reporting, and interoperability.',
    implementationBurden: 'medium',
    implementationBurdenRationale: 'Ed-Fi provides a complete open-source platform (ODS/API) which reduces build effort, but deploying and maintaining the ODS requires database and API infrastructure. Writing API client integrations requires conformance to the Ed-Fi API specification. Strong community and documentation support.',
    burdenRubric: {
      engineering: { level: 'moderate', note: 'Implementing Ed-Fi API clients is straightforward with comprehensive Swagger documentation. The ODS/API platform requires .NET and SQL Server (or PostgreSQL) infrastructure.' },
      infrastructure: { level: 'moderate', note: 'The Ed-Fi ODS/API requires a hosted application server, database (SQL Server or PostgreSQL), and API gateway. Cloud deployment options available via Ed-Fi Alliance guidance.' },
      legal: { level: 'low', note: 'Fully open-source under Apache 2.0 license. No licensing fees. Community membership is free. Data governance per existing FERPA/state agreements.' },
    },
    requiredCapabilities: ['REST API implementation', 'SQL Server or PostgreSQL database', '.NET runtime (for ODS/API hosting)', 'Ed-Fi Unifying Data Model understanding'],
    implementationGuidance: 'Start with the Ed-Fi ODS/API platform as your data integration hub. Deploy the ODS using the Ed-Fi installer or Docker containers. Use the Swagger UI to explore API resources. For vendor integrations, implement Ed-Fi API clients that POST data to the ODS. Map your local data elements to the Ed-Fi Unifying Data Model (which is CEDS-aligned). Leverage the Ed-Fi Analytics Middle Tier for reporting views.',
    referenceImplementations: [
      { name: 'Ed-Fi ODS/API Platform', url: 'https://github.com/Ed-Fi-Alliance-OSS/Ed-Fi-ODS', description: 'Open-source Operational Data Store and REST API — the reference implementation of the Ed-Fi Data Standard.' },
      { name: 'Ed-Fi Data Standard Documentation', url: 'https://www.ed-fi.org/ed-fi-data-standard/', description: 'Official documentation for the Ed-Fi Unifying Data Model and API specification.' },
    ],
    samplePayloads: [
      {
        label: 'Ed-Fi Student API Resource (simplified)',
        language: 'json',
        code: `{
  "studentUniqueId": "604822",
  "birthDate": "2010-01-13",
  "firstName": "Maria",
  "lastSurname": "Santos",
  "identificationCodes": [
    {
      "assigningOrganizationIdentificationCode": "District",
      "identificationCode": "S1234567",
      "studentIdentificationSystemDescriptor": "uri://ed-fi.org/StudentIdentificationSystemDescriptor#Local"
    }
  ],
  "races": [
    { "raceDescriptor": "uri://ed-fi.org/RaceDescriptor#White" }
  ]
}`,
      },
    ],
    knownAdopters: ['Texas Education Agency', 'Wisconsin DPI', 'Nebraska Department of Education', 'Arizona Department of Education', 'Schoology', 'PowerSchool', 'Clever'],
    technicalDocLinks: [
      { label: 'Ed-Fi Data Standard', url: 'https://www.ed-fi.org/ed-fi-data-standard/' },
      { label: 'Ed-Fi Technology Suite', url: 'https://www.ed-fi.org/what-is-ed-fi/ed-fi-technology/' },
      { label: 'GitHub (Open Source)', url: 'https://github.com/Ed-Fi-Alliance-OSS' },
    ],
    commonlyPairedWith: [
      { id: 'ceds', rationale: 'Ed-Fi\'s Unifying Data Model is explicitly mapped to CEDS data elements, making Ed-Fi the operational implementation of CEDS semantics for K-12 data exchange.' },
      { id: 'sif', rationale: 'Many districts use both Ed-Fi and SIF. Ed-Fi handles newer REST-based integrations; SIF handles legacy system connections. Both map to CEDS.' },
      { id: 'case-v1', rationale: 'Ed-Fi can exchange competency and learning standard data that aligns with CASE-published frameworks for standards-aligned instruction and assessment.' },
    ],
    compatibilityNotes: 'Ed-Fi is CEDS-aligned by design — the Unifying Data Model maps directly to CEDS data elements. Ed-Fi is the most widely deployed K-12 data integration standard in the US, with strong support from state education agencies. The open-source ecosystem includes starter kits, vendor certifications, and community extensions.',
    equityConsiderations: {
      level: 'low-concern',
      summary: 'Ed-Fi is fully open-source (Apache 2.0) with no licensing costs. The data model includes elements for tracking equity-relevant demographics, program participation, and student outcomes. Free community resources lower adoption barriers for under-resourced districts.',
    },
    privacyConsiderations: {
      level: 'medium-concern',
      summary: 'Ed-Fi ODS stores student-level data requiring FERPA compliance. The platform includes role-based access control and API authentication. Data governance policies, NDPA agreements, and security hardening are the implementer\'s responsibility.',
      dataClassification: 'student-data-store',
      regulations: ['FERPA', 'COPPA', 'NDPA v2.2', 'state privacy laws'],
      ndpaClauses: [
        {
          citation: 'NDPA Art. I §1.1',
          title: 'Provider as School Official',
          summary: 'Vendors hosting Ed-Fi ODS instances or writing API clients are considered School Officials with legitimate educational interest under NDPA.',
        },
        {
          citation: 'NDPA Art. IV §4.2',
          title: 'Authorized Use',
          summary: 'Ed-Fi ODS API access must be scoped to authorized educational purposes per NDPA agreements. API keys and OAuth2 scopes must enforce purpose limitation.',
        },
        {
          citation: 'NDPA Art. IV §4.4',
          title: 'No Sale / No Disclosure',
          summary: 'Student data stored in Ed-Fi ODS shall not be sold or disclosed to unauthorized third parties. API access logging should be maintained.',
        },
        {
          citation: 'NDPA Art. V §5.4',
          title: 'Breach Notification',
          summary: 'Organizations hosting Ed-Fi ODS must notify affected LEAs within 72 hours of any security breach affecting student data.',
        },
        {
          citation: 'NDPA Art. IV §4.6',
          title: 'Data Disposition',
          summary: 'Upon contract termination, Ed-Fi ODS data must be deleted or returned within 60 days. Database backups must also be purged.',
        },
        {
          citation: 'NDPA Art. V §5.3',
          title: 'Cybersecurity Framework',
          summary: 'Ed-Fi ODS hosts must implement an adequate cybersecurity framework (NIST CSF, ISO 27000, CIS, or SDPC GESS) as declared in Exhibit F.',
        },
        {
          citation: 'NDPA Exhibit B',
          title: 'Comprehensive Data Categories',
          summary: 'Ed-Fi ODS may store data spanning most Exhibit B categories: Student Name, Identifiers, Demographics, Enrollment, Assessment, Transcript, Grades, Attendance, and Discipline. Each must be explicitly listed.',
        },
      ],
    },
    relatedResources: ['ceds', 'sif'],
    status: 'approved',
  },

  // ─── LIF ───────────────────────────────────────────────────────────────────
  {
    id: 'lif',
    title: 'Learner Information Framework (LIF) 2.0',
    type: 'Standard',
    category: 'Learner Records',
    targetCanonicalEntity: 'Person / Credential / Assessment / CompetencyFramework / Course / Program / Organization / Position',
    fieldMappingDescription: 'JSON-based data model with 8 core entities: Person, Credential, Assessment, CompetencyFramework, Course, Program, Organization, Position. Each entity has detailed fields with privacy use_recommendations. LIF fields map to CEDS elements — e.g., Assessment.identifier → CEDS AssessmentIdentifier, Person.Name → CEDS PersonName, Credential.name → CEDS CredentialDefinition.',
    transformationNotes: 'LIF is designed as the comprehensive interoperability layer across education and workforce. Covers territory of multiple specs: Assessment (like CEDS Assessment domain), CompetencyFramework (like CASE), Credential (like OB3/CLR), Position (workforce). Every field includes use_recommendations for equity and privacy. Missing: no specific wire protocol defined (transport-agnostic). Unique: includes Person entity with consent model and demographic sensitivity guidance.',
    description: 'The Learner Information Framework (LIF) 2.0 is a comprehensive data model for representing learning and employment records across the full P-20W lifecycle. LIF defines 8 core entities (Person, Credential, Assessment, CompetencyFramework, Course, Program, Organization, Position) with over 290 fields, each annotated with privacy and equity use recommendations. Designed to bridge education and workforce data systems with built-in sensitivity guidance.',
    owner: 'A4L Community (Access 4 Learning)',
    governanceBody: 'A4L Community / LIF Work Group',
    lastUpdated: '2025-01-01',
    version: '2.0',
    accessLevel: 'open',
    opennessStatus: 'open',
    accessUrl: 'https://www.a4l.org/lif',
    authoritativeRepoUrl: null,
    tags: ['LIF', 'A4L', 'LER', 'P-20W', 'interoperability', 'equity', 'privacy-by-design', 'workforce', 'credentials', 'assessments', 'competencies', 'K-12', 'postsecondary', 'use-recommendations'],
    aiTaxonomy: ['comprehensive-data-model', 'LER-interoperability', 'equity-aware'],
    aiSummary: 'Comprehensive education-to-workforce data model with 8 entities and 290+ fields, each with equity and privacy use recommendations. Use LIF when you need a single interoperability model spanning credentials, assessments, competencies, courses, programs, organizations, and employment positions with built-in sensitivity guidance.',
    aiUnlocksSummary: 'Provides a unified data model that bridges the gap between education-focused standards (CASE, OB3, CLR) and workforce systems. Unique in including Person-level consent and demographic sensitivity guidance at the field level. Positions your platform to handle the full learner lifecycle from assessment through employment.',
    implementationBurden: 'medium',
    implementationBurdenRationale: 'LIF is a data model specification, not a wire protocol — implementation involves mapping your system\'s data to LIF entities and fields. The model is comprehensive (290+ fields) but well-structured into 8 clear entities. JSON-based payloads. Equity use_recommendations require review during implementation.',
    burdenRubric: {
      engineering: { level: 'moderate', note: 'Mapping to 8 entities with 290+ fields requires significant data modeling effort. JSON payloads are straightforward. Use_recommendations add review overhead.' },
      infrastructure: { level: 'low', note: 'Transport-agnostic — LIF works over REST, message queues, or file exchange. No specific infrastructure requirements beyond JSON serialization.' },
      legal: { level: 'low', note: 'Open specification from A4L. No licensing fees. Privacy use_recommendations help with compliance but do not replace legal review.' },
    },
    requiredCapabilities: ['JSON data serialization', 'Data element mapping to LIF entities', 'Privacy/equity review process for use_recommendations', 'CEDS alignment for cross-standard interoperability'],
    implementationGuidance: 'Start by identifying which LIF entities your system touches (most will need Person, Credential, and at least one of Assessment/Course/Program). Map your existing data fields to LIF fields within those entities. Review the use_recommendations for each field you implement — they contain critical equity and privacy guidance. Use CEDS element alignment to connect LIF data to other standards in your ecosystem.',
    referenceImplementations: [
      { name: 'LIF 2.0 OpenAPI Schema', url: 'https://www.a4l.org/lif', description: 'Machine-readable OpenAPI specification for the LIF data model.' },
    ],
    samplePayloads: [
      {
        label: 'LIF Person Entity (simplified)',
        language: 'json',
        code: `{
  "Person": {
    "Identifier": [{ "id": "P-12345", "system": "district-sis" }],
    "Name": { "firstName": "Maria", "lastName": "Santos" },
    "Birth": { "date": "2010-03-15" },
    "Consent": { "type": "FERPA", "granted": true },
    "CredentialAward": [
      { "credentialId": "C-001", "awardDate": "2025-06-15" }
    ]
  }
}`,
      },
    ],
    knownAdopters: ['A4L Community members', 'State longitudinal data system pilots'],
    technicalDocLinks: [
      { label: 'A4L Community', url: 'https://www.a4l.org' },
      { label: 'LIF Specification', url: 'https://www.a4l.org/lif' },
    ],
    commonlyPairedWith: [
      { id: 'ceds', rationale: 'LIF fields are mapped to CEDS data elements. CEDS provides the canonical vocabulary; LIF provides the comprehensive entity model spanning education and workforce.' },
      { id: 'sif', rationale: 'LIF extends and modernizes SIF concepts. SIF K-12 data objects map to LIF entities (StudentPersonal → Person, SchoolInfo → Organization). LIF adds workforce and credential coverage.' },
      { id: 'clr-v2', rationale: 'CLR credential and achievement data maps to LIF Credential and Assessment entities. LIF adds Person-level context and organizational relationships.' },
      { id: 'open-badges-v3', rationale: 'OB3 badge data maps to LIF Credential entity. LIF adds assessment, course, and program context around credential awards.' },
    ],
    compatibilityNotes: 'LIF is positioned as the comprehensive successor/complement to SIF, extending coverage from K-12 into workforce and credentials. It bridges the gap between education-focused standards (CASE, OB3, CLR) and workforce data needs. The model is CEDS-aligned and designed to interoperate with all major education data standards.',
    equityConsiderations: {
      level: 'low-concern',
      summary: 'LIF is uniquely equity-aware — every field includes use_recommendations with guidance on preventing bias, protecting sensitive data, and ensuring equitable access. The Person entity includes explicit consent modeling and demographic sensitivity guidance.',
    },
    privacyConsiderations: {
      level: 'medium-concern',
      summary: 'LIF handles extensive PII across Person, Credential, and employment entities. Every field includes privacy use_recommendations. The Person entity includes Consent sub-entity for explicit consent tracking. Implementers must follow use_recommendations and applicable regulations.',
      dataClassification: 'comprehensive-PII',
      regulations: ['FERPA', 'COPPA', 'NDPA v2.2', 'state privacy laws', 'GDPR (international contexts)'],
      ndpaClauses: [
        {
          citation: 'NDPA Art. I §1.1',
          title: 'Provider as School Official',
          summary: 'Systems implementing LIF Person and Credential entities are handling student data and must be designated as School Officials under NDPA.',
        },
        {
          citation: 'NDPA Art. IV §4.2',
          title: 'Authorized Use',
          summary: 'LIF data across all 8 entities must be used only for authorized educational and workforce development purposes per NDPA.',
        },
        {
          citation: 'NDPA Art. IV §4.5',
          title: 'De-Identification Standards',
          summary: 'LIF Person entity fields (Name, Birth, Demographics) must be de-identified per FERPA standards when used for analytics. LIF use_recommendations provide field-level guidance.',
        },
        {
          citation: 'NDPA Art. V §5.4',
          title: 'Breach Notification',
          summary: 'Systems storing LIF Person data must comply with 72-hour breach notification requirements.',
        },
        {
          citation: 'NDPA Art. IV §4.6',
          title: 'Data Disposition',
          summary: 'LIF data across all entities must be deleted or returned within 60 days of contract termination.',
        },
        {
          citation: 'NDPA Exhibit B',
          title: 'Comprehensive Data Categories',
          summary: 'LIF spans nearly all Exhibit B categories: Person (Name, Identifiers, Demographics), Assessment, Credential, Course, Program. Each entity must be explicitly listed in Exhibit B.',
        },
      ],
    },
    relatedResources: ['ceds', 'sif', 'clr-v2', 'open-badges-v3'],
    status: 'approved',
  },
];

// Human-readable title lookup keyed by entry ID.
export const entryTitles = {
  'lrw-competency-framework': 'IEEE P1484.2 LER Ecosystem Standard',
  'case-v1': 'CASE v1.1',
  'ctdl': 'CTDL',
  'open-badges-v3': 'Open Badges 3.0',
  'clr-v2': 'CLR 2.0',
  'ceds': 'CEDS',
  'sif': 'SIF 3.7',
  'edfi': 'Ed-Fi Data Standard',
  'lif': 'LIF 2.0',
};

export const categoryFilters = [
  'All',
  'Learner Records',
  'Competency Frameworks',
  'Credential Transparency',
  'Digital Credentials',
  'Data Standards',
];

export const typeFilters = ['All', 'Standard'];

export const burdenFilters = ['All', 'low', 'medium', 'high'];

// Unique list of all required capabilities across entries, for filtering.
export const allCapabilities = [...new Set(
  libraryEntries.flatMap(e => e.requiredCapabilities)
)].sort();

export const equityLevelFilters = ['All', 'low-concern', 'medium-concern', 'high-concern'];
export const privacyLevelFilters = ['All', 'low-concern', 'medium-concern', 'high-concern'];
