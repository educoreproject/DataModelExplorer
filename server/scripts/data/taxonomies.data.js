// taxonomies.js — Structured taxonomies for stakeholders, shared technical
// resources/standards, and use cases mapped to CEDS RDF domains.
//
// Each taxonomy is organized hierarchically with searchable business needs
// attached to stakeholder entries and CEDS RDF URIs on use cases.

// ─── Stakeholders Taxonomy ───────────────────────────────────────────────────

module.exports.stakeholderTaxonomy = [
  {
    id: 'education-institutions',
    label: 'Education Institutions',
    icon: '🏫',
    children: [
      {
        id: 'k12-districts',
        label: 'K–12 Districts',
        businessNeeds: [
          'Student transcript portability across districts',
          'Standards-aligned credential issuance for graduates',
          'FERPA-compliant data sharing with workforce partners',
          'Competency-based progress tracking aligned to state standards',
        ],
      },
      {
        id: 'higher-education',
        label: 'Higher Education Institutions',
        businessNeeds: [
          'Digital diploma and credential issuance',
          'Prior learning assessment and credit transfer',
          'Employer-aligned competency mapping for programs',
          'Interoperable learner records for transfer students',
        ],
      },
      {
        id: 'cte-programs',
        label: 'Career & Technical Education (CTE) Programs',
        businessNeeds: [
          'Industry-recognized credential alignment',
          'Work-based learning documentation',
          'Pathway completion tracking across institutions',
          'Employer validation of CTE skill outcomes',
        ],
      },
      {
        id: 'adult-education',
        label: 'Adult Education Providers',
        businessNeeds: [
          'GED/HiSET credential portability',
          'Workforce readiness skill documentation',
          'Bridge program outcome tracking',
          'Non-traditional learner identity management',
        ],
      },
    ],
  },
  {
    id: 'workforce-employers',
    label: 'Workforce & Employers',
    icon: '💼',
    children: [
      {
        id: 'industry-partners',
        label: 'Industry Partners & Employers',
        businessNeeds: [
          'Verify candidate credentials without contacting issuers',
          'Map internal job requirements to standardized skill taxonomies',
          'Reduce time-to-hire through trusted credential verification',
          'Access talent pipeline data from education partners',
        ],
      },
      {
        id: 'staffing-agencies',
        label: 'Staffing & Workforce Agencies',
        businessNeeds: [
          'Portable skill profiles for candidate placement',
          'Automated credential verification at scale',
          'Cross-sector competency matching',
          'Workforce analytics on skill supply and demand',
        ],
      },
      {
        id: 'professional-associations',
        label: 'Professional Associations',
        businessNeeds: [
          'Industry certification standards alignment',
          'Continuing education credit tracking',
          'Member credential portfolio management',
          'Cross-association credential recognition',
        ],
      },
    ],
  },
  {
    id: 'technology-providers',
    label: 'Technology Providers',
    icon: '💻',
    children: [
      {
        id: 'edtech-vendors',
        label: 'EdTech Vendors',
        businessNeeds: [
          'Standards-compliant API integration for credential exchange',
          'Interoperable data schemas for multi-platform deployments',
          'Privacy-by-design architecture guidance',
          'AI/ML model training compliance for education data',
        ],
      },
      {
        id: 'lms-providers',
        label: 'LMS & SIS Providers',
        businessNeeds: [
          'CEDS-aligned data export/import',
          'Competency-based grading schema support',
          'Credential issuance plugin architecture',
          'Learner record interoperability across systems',
        ],
      },
      {
        id: 'credentialing-platforms',
        label: 'Credentialing & Wallet Platforms',
        businessNeeds: [
          'W3C Verifiable Credential issuance and verification',
          'DID-based identity infrastructure',
          'Selective disclosure and zero-knowledge proof support',
          'Cross-platform credential portability',
        ],
      },
    ],
  },
  {
    id: 'government-policy',
    label: 'Government & Policy',
    icon: '🏛️',
    children: [
      {
        id: 'federal-agencies',
        label: 'Federal Agencies (ED, DOL)',
        businessNeeds: [
          'National education data standards compliance monitoring',
          'Workforce development outcome measurement',
          'Cross-agency data interoperability',
          'Privacy regulation enforcement support (FERPA/COPPA)',
        ],
      },
      {
        id: 'state-education-agencies',
        label: 'State Education Agencies (SEAs)',
        businessNeeds: [
          'Statewide longitudinal data system integration',
          'CEDS-compliant reporting to federal systems',
          'Credential registry and recognition frameworks',
          'Cross-district data exchange governance',
        ],
      },
      {
        id: 'local-education-agencies',
        label: 'Local Education Agencies (LEAs)',
        businessNeeds: [
          'Student data system interoperability',
          'Community workforce partner data sharing',
          'Family engagement portal standards',
          'Equitable access monitoring and reporting',
        ],
      },
    ],
  },
  {
    id: 'standards-bodies',
    label: 'Standards Bodies & Consortia',
    icon: '📐',
    children: [
      {
        id: 'credential-engine',
        label: 'Credential Engine',
        businessNeeds: [
          'CTDL vocabulary adoption and credential transparency',
          'Credential Registry publishing and discovery',
          'Cross-standard alignment with 1EdTech specs',
          'Community of practice for credential transparency',
        ],
      },
      {
        id: 'w3c-credentials',
        label: 'W3C Credentials Community Group',
        businessNeeds: [
          'Verifiable Credentials adoption in education',
          'DID method interoperability testing',
          'Education-specific VC profile development',
          'Privacy-preserving verification standards',
        ],
      },
      {
        id: 't3-innovation',
        label: 'T3 Innovation Network',
        businessNeeds: [
          'LER ecosystem coordination and adoption',
          'Interoperability testing and certification',
          'Employer engagement in credential trust frameworks',
          'Open-source reference implementations',
        ],
      },
      {
        id: 'ims-1edtech',
        label: '1EdTech Consortium',
        businessNeeds: [
          'Open Badges and CLR alignment',
          'LTI and CASE standard coordination',
          'EdTech interoperability certification',
          'Comprehensive Learner Record adoption',
        ],
      },
    ],
  },
  {
    id: 'learners-advocates',
    label: 'Learners & Advocates',
    icon: '🎓',
    children: [
      {
        id: 'learner-advocates',
        label: 'Learner Advocacy Organizations',
        businessNeeds: [
          'Learner data ownership and consent transparency',
          'Equitable access to credential infrastructure',
          'Multilingual and accessible credential interfaces',
          'Protection against algorithmic bias in skill assessment',
        ],
      },
      {
        id: 'community-organizations',
        label: 'Community-Based Organizations',
        businessNeeds: [
          'Low-barrier credential access for underserved populations',
          'Non-traditional learning recognition and validation',
          'Workforce readiness program credential portability',
          'Digital literacy support for credential management',
        ],
      },
    ],
  },
  {
    id: 'research-academia',
    label: 'Research & Academia',
    icon: '🔬',
    children: [
      {
        id: 'university-research',
        label: 'University Research Centers',
        businessNeeds: [
          'Access to de-identified education and workforce data',
          'Standards landscape analysis and gap identification',
          'Longitudinal outcome studies across credential types',
          'Interoperability evaluation frameworks',
        ],
      },
      {
        id: 'think-tanks',
        label: 'Policy Think Tanks & Evaluation Firms',
        businessNeeds: [
          'Ecosystem adoption metrics and benchmarks',
          'ROI analysis of credential interoperability',
          'Equity impact assessment of data standards',
          'Cross-sector comparative analysis',
        ],
      },
    ],
  },
];

// ─── Shared Technical Resources & Standards Taxonomy ─────────────────────────

module.exports.technicalResourcesTaxonomy = [
  {
    id: 'data-standards',
    label: 'Data Standards & Schemas',
    icon: '📊',
    children: [
      {
        id: 'ceds',
        label: 'Common Education Data Standards (CEDS)',
        url: 'https://ceds.ed.gov',
        description: 'National collaborative effort to develop voluntary, common data standards for P–20W education.',
        scope: 'P-20W data interoperability',
      },
      {
        id: 'ler-framework',
        label: 'IEEE 1484.2-2024 LER Ecosystem Standard',
        url: 'https://sagroups.ieee.org/1484-2/',
        description: 'IEEE recommended practice for LER ecosystems — defines roles and architecture for issuing, holding, and verifying credentials.',
        scope: 'LER ecosystem architecture',
      },
      {
        id: 'case-framework',
        label: 'CASE (Competency & Academic Standards Exchange)',
        url: 'https://www.1edtech.org/standards/case',
        description: 'REST/JSON API standard for exchanging competency frameworks and academic standards.',
        scope: 'Competency framework exchange',
      },
      {
        id: 'ctdl',
        label: 'Credential Transparency Description Language (CTDL)',
        url: 'https://credreg.net/ctdl',
        description: 'Linked-data vocabulary for describing credentials, competencies, and organizations.',
        scope: 'Credential transparency',
      },
    ],
  },
  {
    id: 'identity-credentials',
    label: 'Identity & Credential Standards',
    icon: '🔐',
    children: [
      {
        id: 'w3c-did',
        label: 'W3C Decentralized Identifiers (DIDs)',
        url: 'https://w3.org/TR/did-core',
        description: 'Globally unique identifiers that enable verifiable, decentralized digital identity.',
        scope: 'Identity infrastructure',
      },
      {
        id: 'open-badges',
        label: 'Open Badges 3.0',
        url: 'https://www.1edtech.org/standards/open-badges',
        description: 'Visual, verifiable digital badges for skills and achievements aligned with W3C VCs.',
        scope: 'Achievement recognition',
      },
      {
        id: 'clr',
        label: 'Comprehensive Learner Record (CLR) 2.0',
        url: 'https://www.1edtech.org/standards/clr',
        description: 'Standard for comprehensive, portable learner achievement records extending Open Badges.',
        scope: 'Learner achievement records',
      },
    ],
  },
  {
    id: 'interoperability',
    label: 'Interoperability Frameworks',
    icon: '🔗',
    children: [
      {
        id: 'json-ld',
        label: 'JSON-LD (Linked Data)',
        url: 'https://json-ld.org',
        description: 'Method for encoding Linked Data using JSON, enabling semantic interoperability.',
        scope: 'Data serialization',
      },
      {
        id: 'xapi',
        label: 'xAPI (Experience API)',
        url: 'https://xapi.com',
        description: 'Specification for learning technology that records and tracks learning experiences.',
        scope: 'Learning activity tracking',
      },
    ],
  },
  {
    id: 'privacy-governance',
    label: 'Privacy & Governance Frameworks',
    icon: '🛡️',
    children: [
      {
        id: 'ferpa',
        label: 'FERPA',
        url: 'https://ed.gov/ferpa',
        description: 'Federal law protecting the privacy of student education records.',
        scope: 'Student record privacy',
      },
      {
        id: 'coppa',
        label: 'COPPA',
        url: 'https://ftc.gov/coppa',
        description: 'Federal law protecting children under 13 in online contexts.',
        scope: 'Child privacy protection',
      },
      {
        id: 'gdpr',
        label: 'GDPR',
        url: 'https://gdpr.eu',
        description: 'EU regulation on data protection and privacy.',
        scope: 'International data protection',
      },
      {
        id: 'ndpa',
        label: 'NDPA v2.2 (National Data Privacy Agreement)',
        url: 'https://files.a4l.org/privacy/NDPA/NDPA_v2-2_STANDARD_WEB.pdf',
        description: 'SDPC standard agreement governing student data privacy between LEAs and Providers. Covers data ownership (Art. II), authorized use (Art. IV §4.2), no-sale/no-disclosure (§4.4), advertising limits (§4.7), breach notification within 72 hours (Art. V §5.4), and data disposition within 60 days (§4.6). Includes Exhibits A-G for services, data schedules, definitions, disposition, privacy terms, cybersecurity frameworks, and state supplements.',
        scope: 'Student data privacy agreements (LEA-Provider)',
      },
      {
        id: 'sdpc-gess',
        label: 'SDPC Global Education Security Standard (GESS)',
        url: 'https://sdpc.a4l.org/gess/',
        description: 'Cybersecurity framework option under NDPA Exhibit F, specifically designed for education technology providers.',
        scope: 'Education cybersecurity standards',
      },
    ],
  },
];

// ─── Use Cases Mapped to CEDS RDF ───────────────────────────────────────────
// Each use case maps to one or more CEDS RDF domains with specific element URIs.
// CEDS RDF namespace: https://ceds.ed.gov/element/

module.exports.useCasesCedsRdf = [
  {
    id: 'uc-credential-verification',
    label: 'Credential Verification & Trust',
    icon: '✅',
    description: 'Verify and trust digital credentials issued by education institutions and training providers.',
    stakeholders: ['higher-education', 'industry-partners', 'credentialing-platforms'],
    businessNeeds: [
      'Instant credential verification without contacting issuer',
      'Tamper-evident credential storage and sharing',
      'Employer trust in digital credentials',
    ],
    cedsDomains: ['credentials'],
    cedsRdfElements: [
      { element: 'CredentialDefinition', uri: 'http://ceds.ed.gov/terms#C200087', description: 'Defines a qualification, achievement, personal or organizational quality, or aspect of an identity typically used to indicate suitability.' },
      { element: 'CredentialType', uri: 'http://ceds.ed.gov/terms#C000071', description: 'An indication of the category of credential a person holds.' },
      { element: 'CredentialAwardStartDate', uri: 'http://ceds.ed.gov/terms#P001163', description: 'The date on which a credential was awarded.' },
      { element: 'CredentialDefinitionVerificationType', uri: 'http://ceds.ed.gov/terms#C001753', description: 'A resource describing the means by which someone can verify whether a credential has been attained.' },
    ],
    relatedStandards: ['open-badges', 'clr', 'ctdl'],
  },
  {
    id: 'uc-skills-mapping',
    label: 'Skills & Competency Mapping',
    icon: '🧠',
    description: 'Map educational outcomes to workforce skill requirements using standardized taxonomies.',
    stakeholders: ['k12-districts', 'higher-education', 'cte-programs', 'industry-partners'],
    businessNeeds: [
      'Align curriculum to employer skill requirements',
      'Translate academic outcomes into workforce-readable skills',
      'Build competency-based progression pathways',
    ],
    cedsDomains: ['competencies'],
    cedsRdfElements: [
      { element: 'CompetencyDefinition', uri: 'http://ceds.ed.gov/terms#C200065', description: 'A resource that states a capability or behavior that a person may learn or be able to do within a given context.' },
      { element: 'CompetencyFramework', uri: 'http://ceds.ed.gov/terms#C200067', description: 'A resource that identifies a collection of logically related CompetencyDefinitions and contextualizing metadata.' },
      { element: 'CompetencySet', uri: 'http://ceds.ed.gov/terms#C200068', description: 'A group of related competency definitions within a framework.' },
    ],
    relatedStandards: ['ler-framework', 'case-framework', 'ctdl'],
  },
  {
    id: 'uc-workforce-mobility',
    label: 'Workforce Mobility & Career Transitions',
    icon: '🚀',
    description: 'Enable learners and workers to carry verified records across institutions and employers.',
    stakeholders: ['staffing-agencies', 'industry-partners', 'adult-education', 'learner-advocates'],
    businessNeeds: [
      'Portable career profiles across state lines',
      'Cross-sector credential recognition',
      'Reduce time-to-hire for experienced workers',
    ],
    cedsDomains: ['workforce', 'credentials'],
    cedsRdfElements: [
      { element: 'WorkforceEmploymentQuarterlyData', uri: 'http://ceds.ed.gov/terms#C200373', description: 'Quarterly employment data for workforce program participants.' },
      { element: 'StandardOccupationalClassification', uri: 'http://ceds.ed.gov/terms#P000730', description: 'Links to a Standard Occupational Classification (SOC) value.' },
      { element: 'WorkforceProgramParticipation', uri: 'http://ceds.ed.gov/terms#C200375', description: 'Information about instruction and/or services provided through a workforce development program.' },
      { element: 'CompetencyDefinition', uri: 'http://ceds.ed.gov/terms#C200065', description: 'A capability or behavior used to model skill requirements within CEDS.' },
    ],
    relatedStandards: ['ler-framework', 'ctdl', 'clr'],
  },
  {
    id: 'uc-transcript-exchange',
    label: 'K–12 Transcript & Record Exchange',
    icon: '📋',
    description: 'Exchange student academic records between K–12 districts, states, and postsecondary institutions.',
    stakeholders: ['k12-districts', 'state-education-agencies', 'local-education-agencies'],
    businessNeeds: [
      'Seamless student transfer between districts',
      'Automated transcript evaluation for college admissions',
      'CEDS-compliant state reporting',
    ],
    cedsDomains: ['k12'],
    cedsRdfElements: [
      { element: 'K12StudentAcademicRecord', uri: 'http://ceds.ed.gov/terms#C200210', description: 'The summary level academic record for a K12 student including graduation information.' },
      { element: 'CourseSection', uri: 'http://ceds.ed.gov/terms#C200074', description: 'A specific offering of a course within a term or session.' },
      { element: 'K12StudentEnrollment', uri: 'http://ceds.ed.gov/terms#C200219', description: 'Information about a student enrollment that is unique to the K12 context.' },
      { element: 'GradeLevel', uri: 'http://ceds.ed.gov/terms#C002175', description: 'Grade levels offered by educational institutions.' },
    ],
    relatedStandards: ['ceds', 'clr'],
  },
  {
    id: 'uc-postsecondary-credentials',
    label: 'Postsecondary Credential Issuance',
    icon: '🎓',
    description: 'Issue and verify postsecondary degrees, certificates, and microcredentials in digital format.',
    stakeholders: ['higher-education', 'credentialing-platforms', 'professional-associations'],
    businessNeeds: [
      'Digital diploma issuance at scale',
      'Microcredential and badge programs',
      'Employer-verifiable degree attestation',
    ],
    cedsDomains: ['postsecondary', 'credentials'],
    cedsRdfElements: [
      { element: 'PersonDegreeOrCertificate', uri: 'http://ceds.ed.gov/terms#C200281', description: 'The name of the degree or certificate earned by an individual.' },
      { element: 'PostsecondaryStudentAcademicRecord', uri: 'http://ceds.ed.gov/terms#C200336', description: 'The summary level academic record for a postsecondary student including graduation information.' },
      { element: 'PostsecondaryProgram', uri: 'http://ceds.ed.gov/terms#C200331', description: 'Attributes for a postsecondary program including type, length, and requirements.' },
      { element: 'PostsecondaryInstitution', uri: 'http://ceds.ed.gov/terms#C200329', description: 'An organization that provides educational programs for individuals who have completed secondary school.' },
    ],
    relatedStandards: ['open-badges', 'clr', 'ctdl'],
  },
  {
    id: 'uc-cte-pathways',
    label: 'CTE Pathway Completion & Industry Credentials',
    icon: '🔧',
    description: 'Track CTE program completion and align industry credentials to academic pathways.',
    stakeholders: ['cte-programs', 'industry-partners', 'state-education-agencies'],
    businessNeeds: [
      'Industry credential alignment to CTE pathways',
      'Cross-institution pathway completion tracking',
      'Employer recognition of CTE program outcomes',
    ],
    cedsDomains: ['cte', 'competencies'],
    cedsRdfElements: [
      { element: 'ProgramParticipationCareerAndTechnical', uri: 'http://ceds.ed.gov/terms#C200318', description: 'Information on a person participating in a career and technical education program.' },
      { element: 'CareerCluster', uri: 'http://ceds.ed.gov/terms#C001288', description: 'The career cluster that defines the industry or occupational focus for a CTE pathway.' },
      { element: 'CareerAndTechnicalEducationInstructorIndustryCertification', uri: 'http://ceds.ed.gov/terms#C001318', description: 'Industry certification held by a CTE instructor, indicating alignment to industry standards.' },
      { element: 'CareerAndTechnicalEducationConcentrator', uri: 'http://ceds.ed.gov/terms#C000037', description: 'An indication of a student who has met the state-defined threshold of CTE concentrators.' },
    ],
    relatedStandards: ['ler-framework', 'case-framework', 'ctdl'],
  },
  {
    id: 'uc-assessment-results',
    label: 'Assessment Results & Performance Data',
    icon: '📝',
    description: 'Exchange assessment results and performance data across systems for holistic learner profiles.',
    stakeholders: ['k12-districts', 'higher-education', 'state-education-agencies', 'edtech-vendors'],
    businessNeeds: [
      'Standardized assessment result exchange',
      'Cross-system performance analytics',
      'Competency-based assessment alignment',
    ],
    cedsDomains: ['assessments'],
    cedsRdfElements: [
      { element: 'AssessmentResult', uri: 'http://ceds.ed.gov/terms#C200047', description: 'Information about a person\'s results from an assessment including score value and score information.' },
      { element: 'AssessmentPerformanceLevel', uri: 'http://ceds.ed.gov/terms#C200038', description: 'Performance levels that may be assigned to an assessment subtest result with specifications for score-based selection.' },
      { element: 'Assessment', uri: 'http://ceds.ed.gov/terms#C200010', description: 'An instrument used to evaluate a person, typically having at least one AssessmentForm, AssessmentSection, and AssessmentItem.' },
      { element: 'AssessmentItem', uri: 'http://ceds.ed.gov/terms#C200023', description: 'A specific prompt that defines a question or protocol for a measurable activity that triggers a response.' },
    ],
    relatedStandards: ['ceds', 'xapi'],
  },
  {
    id: 'uc-data-governance',
    label: 'Data Sharing & Privacy Governance',
    icon: '🛡️',
    description: 'Establish and enforce data sharing agreements and privacy controls across ecosystem partners using the SDPC National Data Privacy Agreement (NDPA v2.2) framework.',
    stakeholders: ['federal-agencies', 'state-education-agencies', 'edtech-vendors', 'community-organizations'],
    businessNeeds: [
      'FERPA-compliant data exchange agreements',
      'NDPA/DPA execution between LEAs and Providers (NDPA Art. I §1.1)',
      'Exhibit B data element scoping and minimization (NDPA §1.3)',
      'AI/ML training data governance with de-identification standards (NDPA §4.5)',
      'Learner consent management and parent/student access rights (NDPA §2.2)',
      'Breach notification within 72 hours (NDPA Art. V §5.4)',
      'Data disposition within 60 days of termination (NDPA §4.6)',
    ],
    cedsDomains: ['authN', 'implVars'],
    cedsRdfElements: [
      { element: 'PersonIdentification', uri: 'http://ceds.ed.gov/terms#C200291', description: 'Identifiers assigned to an individual within a system.' },
      { element: 'Authorization', uri: 'http://ceds.ed.gov/terms#C200055', description: 'Information about a data system or application which an authenticated person may access.' },
      { element: 'AuthorizationDocument', uri: 'http://ceds.ed.gov/terms#C200056', description: 'A document that authorizes a decision or plan such as an IEP or data sharing agreement.' },
    ],
    relatedStandards: ['ferpa', 'coppa', 'ndpa'],
  },
  {
    id: 'uc-equity-access',
    label: 'Equitable Access & Digital Inclusion',
    icon: '⚖️',
    description: 'Ensure credential and data systems are accessible to all learners regardless of background or resources.',
    stakeholders: ['learner-advocates', 'community-organizations', 'local-education-agencies'],
    businessNeeds: [
      'Multilingual credential interfaces',
      'Low-bandwidth credential access',
      'Alternative identity pathways for underserved populations',
    ],
    cedsDomains: ['earlyLearning', 'k12', 'adultEd'],
    cedsRdfElements: [
      { element: 'PersonLanguage', uri: 'http://ceds.ed.gov/terms#C200293', description: 'Language information associated with a person, including language of instruction.' },
      { element: 'PersonDisability', uri: 'http://ceds.ed.gov/terms#C200285', description: 'The disability status for an individual and their primary disability type.' },
      { element: 'EconomicDisadvantageStatus', uri: 'http://ceds.ed.gov/terms#C000086', description: 'An indication that the student met the state criteria for classification as having an economic disadvantage.' },
      { element: 'EnglishLearnerStatus', uri: 'http://ceds.ed.gov/terms#C000180', description: 'An indication of whether an individual is classified as an English language learner.' },
    ],
    relatedStandards: ['ceds', 'clr'],
  },
];

// ─── Helper: collect all searchable business needs ───────────────────────────

