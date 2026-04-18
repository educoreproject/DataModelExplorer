// cedsAlignment.js — CEDS ontology vocabulary match-up data.
//
// Source: Common Education Data Standards (CEDS) v13 Ontology
//   https://ceds.ed.gov  |  https://github.com/CEDStandards/CEDS-Ontology
//   Namespace: http://ceds.ed.gov/terms#
//
// Element names use official CEDS ontology skos:notation identifiers
// (e.g. 'CompetencyDefinition' = http://ceds.ed.gov/terms#C200065).
//
// CEDS has 13 official domains:
//   Early Learning, K12, Postsecondary, Career & Technical, Adult Education,
//   Workforce, Assessments, Credentials, Competencies, Learning Resources,
//   Facilities, Implementation Variables, Authentication & Authorization
//
// For each library entry we map to each CEDS domain with:
//   status: 'full' | 'partial' | 'gap'
//   notes: short rationale
//   cedsElements: CEDS ontology class/property notation names that align
//   gapNotes: what CEDS covers that this standard does NOT address

module.exports.cedsDomains = [
  { id: 'credentials',         label: 'Credentials',                    icon: '🎓' },
  { id: 'competencies',        label: 'Competencies',                   icon: '🧠' },
  { id: 'workforce',           label: 'Workforce',                      icon: '💼' },
  { id: 'assessments',         label: 'Assessments',                    icon: '📝' },
  { id: 'learningResources',   label: 'Learning Resources',             icon: '📚' },
  { id: 'k12',                 label: 'K–12',                           icon: '🏫' },
  { id: 'postsecondary',       label: 'Postsecondary',                  icon: '🎒' },
  { id: 'cte',                 label: 'Career & Technical',             icon: '🔧' },
  { id: 'adultEd',             label: 'Adult Education',                icon: '🧑‍🏫' },
  { id: 'earlyLearning',       label: 'Early Learning',                 icon: '🧒' },
  { id: 'authN',               label: 'Auth & Authorization',           icon: '🔐' },
  { id: 'implVars',            label: 'Implementation Variables',       icon: '⚙️' },
  { id: 'facilities',          label: 'Facilities',                     icon: '🏢' },
];

// status values:
//   'full'    — strong alignment; the standard directly addresses this CEDS domain
//   'partial' — some overlap but the standard is scoped more narrowly or broadly
//   'gap'     — the library standard does not cover this CEDS domain at all

module.exports.cedsAlignmentMatrix = [
  {
    entryId: 'lrw-competency-framework',
    entryShortName: 'IEEE P1484.2 LER Ecosystem Standard',
    domains: {
      credentials: {
        status: 'full',
        cedsElements: ['Credential', 'CredentialType', 'CredentialAward', 'CredentialDefinition', 'CredentialDefinitionVerificationType'],
        notes: 'Core focus of the LER standard. Defines ecosystem roles (Awarder, Holder, Reviewer) for credential issuance and verification built on W3C VCs.',
        gapNotes: null,
      },
      competencies: {
        status: 'full',
        cedsElements: ['CompetencyFramework', 'CompetencyDefinition', 'CompetencySet', 'CompetencyDefinition'],
        notes: 'LER credentials carry competency evidence. The standard informatively references CASE and CTDL for competency framework exchange and description.',
        gapNotes: null,
      },
      workforce: {
        status: 'full',
        cedsElements: ['WorkforceProgramParticipation', 'WorkforceEmploymentQuarterlyData', 'StandardOccupationalClassification', 'CompetencyDefinition'],
        notes: 'Skills-based hiring and career advancement are primary use cases. LER Talent Marketplace role directly addresses workforce credential matching.',
        gapNotes: null,
      },
      assessments: {
        status: 'partial',
        cedsElements: ['AssessmentResult'],
        notes: 'LER credentials can carry assessment outcomes as verifiable claims. The standard does not model assessment event structure.',
        gapNotes: 'CEDS Assessments domain models full assessment lifecycle; LER standard focuses on credential-level outcomes.',
      },
      learningResources: {
        status: 'partial',
        cedsElements: ['LearningResource'],
        notes: 'LER credentials can reference learning experiences. The standard does not model learning resource metadata at CEDS level of detail.',
        gapNotes: null,
      },
      k12: {
        status: 'partial',
        cedsElements: ['K12StudentAcademicRecord'],
        notes: 'K–12 credentials (diplomas, course completions) are valid LER use cases. Standard is education-level agnostic.',
        gapNotes: 'CEDS K12 includes detailed enrollment, attendance, and discipline data beyond LER scope.',
      },
      postsecondary: {
        status: 'full',
        cedsElements: ['PersonDegreeOrCertificate', 'PostsecondaryStudentAcademicRecord', 'PostsecondaryProgram'],
        notes: 'Postsecondary credential issuance and verification is a primary LER use case. Strong alignment with CEDS postsecondary credential elements.',
        gapNotes: null,
      },
      cte: {
        status: 'full',
        cedsElements: ['ProgramParticipationCareerAndTechnical', 'CareerCluster', 'CareerAndTechnicalEducationInstructorIndustryCertification'],
        notes: 'CTE and industry credential portability are core LER objectives. The standard directly addresses skills-based hiring that CTE programs feed into.',
        gapNotes: null,
      },
      adultEd: {
        status: 'partial',
        cedsElements: ['PersonProgramParticipation'],
        notes: 'Adult education credentials (GED, workforce certificates) are valid LER use cases. No adult-education-specific modeling in the standard.',
        gapNotes: null,
      },
      earlyLearning: {
        status: 'gap',
        cedsElements: [],
        notes: 'LER standard is not designed for early childhood contexts.',
        gapNotes: 'CEDS Early Learning developmental domains not represented.',
      },
      authN: {
        status: 'full',
        cedsElements: ['PersonIdentification', 'AuthorizationDocument'],
        notes: 'LER standard normatively requires W3C DIDs for identity. Defines trust, verification, and wallet roles that directly address authentication and authorization.',
        gapNotes: null,
      },
      implVars: {
        status: 'partial',
        cedsElements: ['ImplementationStatus', 'OrganizationIdentificationSystem'],
        notes: 'LER Registry role provides organizational identity and governance catalogs. Partial alignment with CEDS Implementation Variables.',
        gapNotes: null,
      },
      facilities: {
        status: 'gap',
        cedsElements: [],
        notes: 'No overlap.',
        gapNotes: null,
      },
    },
  },

  {
    entryId: 'case-v1',
    entryShortName: 'CASE v1.1',
    domains: {
      credentials: {
        status: 'partial',
        cedsElements: ['CredentialDefinition'],
        notes: 'CASE defines competency criteria that inform credential requirements but does not model credential issuance or attainment.',
        gapNotes: 'CEDS Credential includes attainment date, issuing org, and verification — CASE covers competency definitions only.',
      },
      competencies: {
        status: 'full',
        cedsElements: ['CompetencyFramework', 'CompetencyDefinition', 'CompetencyDefinition', 'CompetencyDefinition'],
        notes: 'CASE is purpose-built for competency framework exchange. Deep alignment with CEDS CompetencyFramework, CompetencyDefinition, and LearningStandard entities.',
        gapNotes: null,
      },
      workforce: {
        status: 'partial',
        cedsElements: ['StandardOccupationalClassification', 'CompetencyDefinition'],
        notes: 'Workforce competency frameworks can be published via CASE. Does not model employment records or workforce programs directly.',
        gapNotes: 'CEDS Workforce includes EmploymentRecord and WorkforceProgram — not in CASE scope.',
      },
      assessments: {
        status: 'gap',
        cedsElements: [],
        notes: 'CASE does not model assessments. Competency frameworks may inform assessment design but CASE is not an assessment standard.',
        gapNotes: 'CEDS Assessments domain (test structure, items, results) is entirely outside CASE scope.',
      },
      learningResources: {
        status: 'partial',
        cedsElements: ['LearningResource'],
        notes: 'Competency frameworks published via CASE can be used to align learning resources, but CASE does not model resource metadata.',
        gapNotes: 'CEDS Learning Resources includes URL, media type, educational level — not in CASE scope.',
      },
      k12: {
        status: 'full',
        cedsElements: ['CompetencySet', 'CompetencyDefinition', 'CompetencyDefinition'],
        notes: 'CASE is widely adopted for K–12 state academic standards exchange. US state education agencies publish standards via CASE Network.',
        gapNotes: null,
      },
      postsecondary: {
        status: 'partial',
        cedsElements: ['PostsecondaryStudentAcademicRecord'],
        notes: 'Postsecondary competency frameworks can use CASE but adoption is lower than K–12. Alignment with CEDS postsecondary competency records.',
        gapNotes: 'CEDS Postsecondary includes enrollment, program, degree — CASE covers only competency definitions.',
      },
      cte: {
        status: 'full',
        cedsElements: ['ProgramParticipationCareerAndTechnical', 'CareerCluster', 'CareerAndTechnicalEducationInstructorIndustryCertification'],
        notes: 'CTE industry competency frameworks are a primary CASE use case. Strong alignment with CEDS CTE occupational cluster and industry alignment elements.',
        gapNotes: null,
      },
      adultEd: {
        status: 'partial',
        cedsElements: ['PersonProgramParticipation'],
        notes: 'Adult education competency frameworks can be exchanged via CASE but no adult-education-specific modeling exists.',
        gapNotes: null,
      },
      earlyLearning: {
        status: 'gap',
        cedsElements: [],
        notes: 'No early learning frameworks currently published via CASE.',
        gapNotes: 'CEDS Early Learning developmental domains are not represented in CASE.',
      },
      authN: {
        status: 'gap',
        cedsElements: [],
        notes: 'CASE defines no authentication or authorization model. API access uses standard OAuth2.',
        gapNotes: null,
      },
      implVars: {
        status: 'gap',
        cedsElements: [],
        notes: 'No implementation variable modeling.',
        gapNotes: null,
      },
      facilities: {
        status: 'gap',
        cedsElements: [],
        notes: 'No overlap.',
        gapNotes: null,
      },
    },
  },

  {
    entryId: 'ctdl',
    entryShortName: 'CTDL',
    domains: {
      credentials: {
        status: 'full',
        cedsElements: ['Credential', 'CredentialType', 'CredentialAward', 'CredentialDefinition'],
        notes: 'CTDL is credential-centric. Deep alignment with CEDS Credential entity including credential type taxonomy, issuing organizations, and requirements.',
        gapNotes: null,
      },
      competencies: {
        status: 'full',
        cedsElements: ['CompetencyFramework', 'CompetencyDefinition', 'CompetencySet'],
        notes: 'CTDL models competency frameworks and their relationship to credentials. Credential Engine maintains CTDL-ASN for competency-specific vocabulary.',
        gapNotes: null,
      },
      workforce: {
        status: 'full',
        cedsElements: ['WorkforceProgramParticipation', 'StandardOccupationalClassification', 'CompetencyDefinition'],
        notes: 'Workforce credentials and occupational alignment are core CTDL use cases. Credential Registry includes O*NET and SOC code alignment.',
        gapNotes: null,
      },
      assessments: {
        status: 'partial',
        cedsElements: ['AssessmentResult'],
        notes: 'CTDL can describe assessment-based credentials but does not model assessment events, items, or sessions.',
        gapNotes: 'CEDS Assessments domain models full assessment lifecycle; CTDL only describes the resulting credential.',
      },
      learningResources: {
        status: 'partial',
        cedsElements: ['LearningResource', 'LearningResource'],
        notes: 'CTDL can reference learning opportunities associated with credentials. Does not model resource metadata at the CEDS level of detail.',
        gapNotes: null,
      },
      k12: {
        status: 'partial',
        cedsElements: ['CompetencySet'],
        notes: 'K–12 credentials can be described in CTDL but adoption is lower than in postsecondary. Some K–12 industry certification programs are in the Registry.',
        gapNotes: 'CEDS K12 student record data is not modeled in CTDL.',
      },
      postsecondary: {
        status: 'full',
        cedsElements: ['PersonDegreeOrCertificate', 'PostsecondaryProgram', 'PostsecondaryStudentAcademicRecord'],
        notes: 'Postsecondary degrees and certificates are primary CTDL content. Strong alignment with CEDS Postsecondary credential and program elements.',
        gapNotes: null,
      },
      cte: {
        status: 'full',
        cedsElements: ['ProgramParticipationCareerAndTechnical', 'CareerCluster', 'CareerAndTechnicalEducationInstructorIndustryCertification'],
        notes: 'CTE/industry credentials are heavily represented in the Credential Registry. Strong alignment with CEDS CTE program and occupational cluster elements.',
        gapNotes: null,
      },
      adultEd: {
        status: 'partial',
        cedsElements: ['PersonProgramParticipation'],
        notes: 'Adult education credentials (GED, HiSET, workforce certificates) can be described in CTDL. No adult-education-specific vocabulary.',
        gapNotes: null,
      },
      earlyLearning: {
        status: 'gap',
        cedsElements: [],
        notes: 'Early learning credentials are not typically described in CTDL.',
        gapNotes: 'CEDS Early Learning developmental domains are not represented.',
      },
      authN: {
        status: 'gap',
        cedsElements: [],
        notes: 'CTDL does not model authentication or authorization. Registry access uses standard API keys.',
        gapNotes: null,
      },
      implVars: {
        status: 'partial',
        cedsElements: ['ImplementationStatus', 'OrganizationIdentificationSystem'],
        notes: 'Organization identifiers in CTDL (CTID, DUNS) partially align with CEDS Implementation Variables for organizational identification.',
        gapNotes: null,
      },
      facilities: {
        status: 'gap',
        cedsElements: [],
        notes: 'No overlap.',
        gapNotes: null,
      },
    },
  },

  {
    entryId: 'open-badges-v3',
    entryShortName: 'Open Badges 3.0',
    domains: {
      credentials: {
        status: 'full',
        cedsElements: ['Credential', 'CredentialType', 'CredentialAward', 'CredentialDefinition'],
        notes: 'OB3 is a credential issuance standard. Full alignment with CEDS Credential entity including issuer, award status, and criteria.',
        gapNotes: null,
      },
      competencies: {
        status: 'partial',
        cedsElements: ['CompetencyDefinition'],
        notes: 'Badges can reference competency definitions as achievement criteria but do not define competency frameworks themselves.',
        gapNotes: 'CEDS Competencies domain defines full framework structure; OB3 only references competencies.',
      },
      workforce: {
        status: 'partial',
        cedsElements: ['CompetencyDefinition', 'StandardOccupationalClassification'],
        notes: 'Workforce badges and micro-credentials exist as an OB3 use case. Badges can reference occupational alignments.',
        gapNotes: 'CEDS Workforce includes EmploymentRecord and WorkforceProgram — not modeled in OB3.',
      },
      assessments: {
        status: 'partial',
        cedsElements: ['AssessmentResult', 'AssessmentPerformanceLevel'],
        notes: 'Badge criteria can reference assessment results. OB3 does not model assessment structure (test, session, item).',
        gapNotes: 'CEDS models full assessment lifecycle; OB3 only records the resulting achievement.',
      },
      learningResources: {
        status: 'partial',
        cedsElements: ['LearningResource'],
        notes: 'Badge criteria can link to learning resources. OB3 does not model CEDS LearningResource metadata fields.',
        gapNotes: null,
      },
      k12: {
        status: 'partial',
        cedsElements: ['K12StudentAcademicRecord'],
        notes: 'K–12 badges are a growing use case (e.g., digital merit badges, skill endorsements). Partial alignment with CEDS K12 academic records.',
        gapNotes: 'CEDS K12 includes detailed enrollment, course, and attendance data beyond OB3 scope.',
      },
      postsecondary: {
        status: 'full',
        cedsElements: ['PersonDegreeOrCertificate', 'PostsecondaryStudentAcademicRecord'],
        notes: 'Higher ed micro-credentials and co-curricular badges are a primary OB3 use case. Strong alignment with CEDS postsecondary credential elements.',
        gapNotes: null,
      },
      cte: {
        status: 'partial',
        cedsElements: ['ProgramParticipationCareerAndTechnical', 'CareerAndTechnicalEducationInstructorIndustryCertification'],
        notes: 'CTE skill badges exist but OB3 is not CTE-native. Industry certification badges align with CEDS CTE industry alignment.',
        gapNotes: null,
      },
      adultEd: {
        status: 'partial',
        cedsElements: ['PersonProgramParticipation'],
        notes: 'Adult learning badges are applicable for workforce development and continuing education contexts.',
        gapNotes: null,
      },
      earlyLearning: {
        status: 'gap',
        cedsElements: [],
        notes: 'Not applicable in early learning context.',
        gapNotes: null,
      },
      authN: {
        status: 'partial',
        cedsElements: ['PersonIdentification'],
        notes: 'OB3 uses W3C VC identity (DIDs) for issuer and holder identification. Partial alignment with CEDS person identity elements.',
        gapNotes: 'CEDS Auth models full system access and role management — OB3 only handles credential identity.',
      },
      implVars: {
        status: 'partial',
        cedsElements: ['ImplementationStatus', 'OrganizationIdentificationSystem'],
        notes: 'Issuer identity and badge status registries partially align with CEDS Implementation Variables.',
        gapNotes: null,
      },
      facilities: {
        status: 'gap',
        cedsElements: [],
        notes: 'No overlap.',
        gapNotes: null,
      },
    },
  },

  {
    entryId: 'clr-v2',
    entryShortName: 'CLR 2.0',
    domains: {
      credentials: {
        status: 'full',
        cedsElements: ['Credential', 'CredentialType', 'CredentialAward', 'CredentialDefinition', 'CredentialDefinitionVerificationType'],
        notes: 'CLR aggregates credentials into comprehensive records. Full alignment with CEDS Credential entity including verification and award lifecycle.',
        gapNotes: null,
      },
      competencies: {
        status: 'full',
        cedsElements: ['CompetencyDefinition', 'CompetencySet', 'CompetencyDefinition'],
        notes: 'CLR records carry competency evidence as first-class achievements. Competency references align with CEDS CompetencyDefinition and CompetencySet.',
        gapNotes: null,
      },
      workforce: {
        status: 'full',
        cedsElements: ['WorkforceProgramParticipation', 'WorkforceEmploymentQuarterlyData', 'StandardOccupationalClassification'],
        notes: 'CLR is designed for workforce mobility with comprehensive achievement records. Employment history and workforce credentials map to CEDS Workforce domain.',
        gapNotes: null,
      },
      assessments: {
        status: 'partial',
        cedsElements: ['AssessmentResult', 'AssessmentPerformanceLevel'],
        notes: 'CLR can carry assessment outcomes as achievements but does not model assessment event structure.',
        gapNotes: 'CEDS models assessment sessions, items, and accommodations — CLR only records outcomes.',
      },
      learningResources: {
        status: 'partial',
        cedsElements: ['LearningResource'],
        notes: 'CLR references learning experiences but does not model resource metadata at the CEDS level of detail.',
        gapNotes: null,
      },
      k12: {
        status: 'partial',
        cedsElements: ['K12StudentAcademicRecord', 'CourseSection'],
        notes: 'K–12 transcript alternative is a CLR use case but adoption is still developing. Partial alignment with CEDS K12 academic records.',
        gapNotes: 'CEDS K12 includes detailed attendance, discipline, and special education data beyond CLR scope.',
      },
      postsecondary: {
        status: 'full',
        cedsElements: ['PostsecondaryStudentAcademicRecord', 'PostsecondaryProgram', 'PersonDegreeOrCertificate'],
        notes: 'Postsecondary comprehensive records are a primary CLR use case. Strong alignment with CEDS postsecondary academic record and credential elements.',
        gapNotes: null,
      },
      cte: {
        status: 'full',
        cedsElements: ['ProgramParticipationCareerAndTechnical', 'CareerAndTechnicalEducationInstructorIndustryCertification', 'CareerCluster'],
        notes: 'CTE pathway completion records align well with CLR. Industry certifications and program completions map to CEDS CTE domain.',
        gapNotes: null,
      },
      adultEd: {
        status: 'partial',
        cedsElements: ['PersonProgramParticipation', 'PersonProgramParticipation'],
        notes: 'Adult learner records can use CLR for credential aggregation. Partial alignment with CEDS adult education program elements.',
        gapNotes: null,
      },
      earlyLearning: {
        status: 'gap',
        cedsElements: [],
        notes: 'CLR is not designed for early childhood records.',
        gapNotes: 'CEDS Early Learning developmental domains are not represented in CLR.',
      },
      authN: {
        status: 'partial',
        cedsElements: ['PersonIdentification', 'AuthorizationDocument'],
        notes: 'CLR uses W3C VC identity infrastructure (DIDs) for issuer and holder identification. Consent management aligns with CEDS authorization concepts.',
        gapNotes: 'CEDS Auth models full system access and role management beyond CLR identity scope.',
      },
      implVars: {
        status: 'partial',
        cedsElements: ['ImplementationStatus', 'OrganizationIdentificationSystem'],
        notes: 'Organization identifiers and credential status registries partially align with CEDS Implementation Variables.',
        gapNotes: null,
      },
      facilities: {
        status: 'gap',
        cedsElements: [],
        notes: 'No overlap.',
        gapNotes: null,
      },
    },
  },
  // ─── CEDS ────────────────────────────────────────────────────────────────
  {
    entryId: 'ceds',
    entryShortName: 'CEDS',
    domains: {
      credentials:       { status: 'full',    cedsElements: ['Credential', 'CredentialType', 'CredentialAward', 'CredentialDefinition'], notes: 'CEDS is the canonical definition source for credential data elements.', gapNotes: null },
      competencies:      { status: 'full',    cedsElements: ['CompetencyFramework', 'CompetencyDefinition', 'CompetencySet'], notes: 'CEDS defines the competency domain vocabulary used across all aligned standards.', gapNotes: null },
      workforce:         { status: 'full',    cedsElements: ['WorkforceEmploymentQuarterlyData', 'WorkforceProgramParticipation', 'StandardOccupationalClassification'], notes: 'Comprehensive workforce data elements for employment outcomes and program participation.', gapNotes: null },
      assessments:       { status: 'full',    cedsElements: ['Assessment', 'AssessmentResult', 'AssessmentPerformanceLevel', 'AssessmentItem'], notes: 'Full assessment lifecycle coverage.', gapNotes: null },
      learningResources: { status: 'full',    cedsElements: ['LearningResource', 'LearningResourceEducationLevel'], notes: 'Complete learning resource metadata vocabulary.', gapNotes: null },
      k12:               { status: 'full',    cedsElements: ['K12StudentAcademicRecord', 'K12StudentEnrollment', 'CourseSection', 'GradeLevel'], notes: 'CEDS is the foundational K-12 data dictionary for US education.', gapNotes: null },
      postsecondary:     { status: 'full',    cedsElements: ['PostsecondaryStudentAcademicRecord', 'PostsecondaryProgram', 'PostsecondaryInstitution'], notes: 'Comprehensive postsecondary data coverage.', gapNotes: null },
      cte:               { status: 'full',    cedsElements: ['ProgramParticipationCareerAndTechnical', 'CareerCluster'], notes: 'Full CTE pathway and career cluster coverage.', gapNotes: null },
      adultEd:           { status: 'full',    cedsElements: ['AdultEducationProgramParticipation'], notes: 'Adult education program participation elements defined.', gapNotes: null },
      earlyLearning:     { status: 'full',    cedsElements: ['EarlyLearningProgramParticipation', 'EarlyLearningOrganization'], notes: 'Early learning domain with program and organization elements.', gapNotes: null },
      authN:             { status: 'full',    cedsElements: ['PersonIdentification', 'Authorization', 'AuthorizationDocument'], notes: 'Authentication and authorization elements for identity and access.', gapNotes: null },
      implVars:          { status: 'full',    cedsElements: ['ImplementationVariable'], notes: 'Implementation variables domain is intrinsic to CEDS.', gapNotes: null },
      facilities:        { status: 'full',    cedsElements: ['Facility', 'FacilityDesign', 'FacilityMortgage'], notes: 'Facilities domain with building and design elements.', gapNotes: null },
    },
  },

  // ─── SIF ─────────────────────────────────────────────────────────────────
  {
    entryId: 'sif',
    entryShortName: 'SIF 3.7',
    domains: {
      credentials:       { status: 'partial', cedsElements: ['CredentialType'], notes: 'SIF can transport credential-related data but does not define a credential issuance model.', gapNotes: 'No native credential issuance or verification framework.' },
      competencies:      { status: 'partial', cedsElements: ['CompetencyDefinition'], notes: 'SIF includes learning standards objects that map to competency elements.', gapNotes: 'Not a competency framework exchange standard.' },
      workforce:         { status: 'gap',     cedsElements: [], notes: 'SIF is scoped to K-12; no workforce data objects.', gapNotes: 'No workforce employment or program participation coverage.' },
      assessments:       { status: 'full',    cedsElements: ['Assessment', 'AssessmentResult', 'AssessmentItem'], notes: 'SIF has robust assessment data objects for K-12 test score exchange.', gapNotes: null },
      learningResources: { status: 'partial', cedsElements: ['LearningResource'], notes: 'SIF includes learning resource metadata objects.', gapNotes: 'Less granular than dedicated learning resource standards.' },
      k12:               { status: 'full',    cedsElements: ['K12StudentAcademicRecord', 'K12StudentEnrollment', 'CourseSection'], notes: 'Core strength of SIF — comprehensive K-12 data objects for student, school, staff, enrollment, and scheduling.', gapNotes: null },
      postsecondary:     { status: 'gap',     cedsElements: [], notes: 'SIF is focused on K-12; no postsecondary data objects.', gapNotes: 'No postsecondary coverage.' },
      cte:               { status: 'partial', cedsElements: ['ProgramParticipationCareerAndTechnical'], notes: 'Limited CTE data objects within K-12 context.', gapNotes: 'No dedicated CTE pathway modeling.' },
      adultEd:           { status: 'gap',     cedsElements: [], notes: 'Not in scope for SIF.', gapNotes: null },
      earlyLearning:     { status: 'gap',     cedsElements: [], notes: 'Not in scope for SIF.', gapNotes: null },
      authN:             { status: 'partial', cedsElements: ['PersonIdentification', 'Authorization'], notes: 'SIF Zone architecture includes authentication and access control.', gapNotes: 'Authentication is infrastructure-level, not data-model-level.' },
      implVars:          { status: 'partial', cedsElements: ['ImplementationVariable'], notes: 'SIF Infrastructure spec addresses implementation configuration.', gapNotes: null },
      facilities:        { status: 'partial', cedsElements: ['Facility'], notes: 'SIF includes SchoolInfo and basic facility objects.', gapNotes: 'Limited facility detail compared to CEDS facilities domain.' },
    },
  },

  // ─── Ed-Fi ───────────────────────────────────────────────────────────────
  {
    entryId: 'edfi',
    entryShortName: 'Ed-Fi Data Standard',
    domains: {
      credentials:       { status: 'partial', cedsElements: ['Credential', 'CredentialType'], notes: 'Ed-Fi includes credential objects for staff and student credentials within the K-12 context.', gapNotes: 'Not a credential issuance/verification standard. Limited to K-12 credential tracking.' },
      competencies:      { status: 'full',    cedsElements: ['CompetencyFramework', 'CompetencyDefinition', 'CompetencySet'], notes: 'Ed-Fi supports learning standards and competency framework exchange aligned to CEDS.', gapNotes: null },
      workforce:         { status: 'partial', cedsElements: ['StandardOccupationalClassification'], notes: 'Ed-Fi includes staff employment and HR data objects. Limited workforce outcomes data.', gapNotes: 'Primarily K-12 staff workforce data, not learner workforce outcomes.' },
      assessments:       { status: 'full',    cedsElements: ['Assessment', 'AssessmentResult', 'AssessmentPerformanceLevel', 'AssessmentItem'], notes: 'Comprehensive assessment data model — one of Ed-Fi\'s strongest domains.', gapNotes: null },
      learningResources: { status: 'partial', cedsElements: ['LearningResource'], notes: 'Ed-Fi includes learning objective and standard references but limited learning resource metadata.', gapNotes: 'Not a learning resource cataloging standard.' },
      k12:               { status: 'full',    cedsElements: ['K12StudentAcademicRecord', 'K12StudentEnrollment', 'CourseSection', 'GradeLevel'], notes: 'Core domain of Ed-Fi — the most comprehensive K-12 operational data model in active deployment.', gapNotes: null },
      postsecondary:     { status: 'gap',     cedsElements: [], notes: 'Ed-Fi is scoped to K-12.', gapNotes: 'No postsecondary data model.' },
      cte:               { status: 'full',    cedsElements: ['ProgramParticipationCareerAndTechnical', 'CareerCluster'], notes: 'Ed-Fi includes CTE program and pathway data objects within K-12 context.', gapNotes: null },
      adultEd:           { status: 'gap',     cedsElements: [], notes: 'Not in scope for Ed-Fi.', gapNotes: null },
      earlyLearning:     { status: 'partial', cedsElements: ['EarlyLearningProgramParticipation'], notes: 'Limited early childhood data elements via community extensions.', gapNotes: 'Not a core Ed-Fi domain; available through extensions.' },
      authN:             { status: 'partial', cedsElements: ['PersonIdentification', 'Authorization'], notes: 'Ed-Fi ODS/API includes OAuth2 authentication and API key authorization.', gapNotes: 'Authentication is API-infrastructure-level, not data-model-level.' },
      implVars:          { status: 'full',    cedsElements: ['ImplementationVariable'], notes: 'Ed-Fi descriptors and configuration are well-mapped to CEDS implementation variables.', gapNotes: null },
      facilities:        { status: 'partial', cedsElements: ['Facility'], notes: 'Ed-Fi includes EducationOrganization and School entities with basic facility attributes.', gapNotes: 'No detailed facility design or mortgage elements.' },
    },
  },
  // ─── LIF ──────────────────────────────────────────────────────────────────
  {
    entryId: 'lif',
    entryShortName: 'LIF 2.0',
    domains: {
      credentials:       { status: 'full',    cedsElements: ['Credential', 'CredentialType', 'CredentialAward', 'CredentialDefinition'], notes: 'LIF Credential entity maps directly to CEDS Credential domain with comprehensive field coverage including requirements, accreditation, and alignments.', gapNotes: null },
      competencies:      { status: 'full',    cedsElements: ['CompetencyFramework', 'CompetencyDefinition', 'CompetencySet'], notes: 'LIF CompetencyFramework entity with 30 fields covers framework metadata, competency definitions, associations, and alignments.', gapNotes: null },
      workforce:         { status: 'full',    cedsElements: ['WorkforceEmploymentQuarterlyData', 'StandardOccupationalClassification', 'WorkforceProgramParticipation'], notes: 'LIF Position entity covers employment status, compensation, hours, industry codes, job codes, and organizational relationships.', gapNotes: null },
      assessments:       { status: 'full',    cedsElements: ['Assessment', 'AssessmentResult', 'AssessmentPerformanceLevel', 'AssessmentItem'], notes: 'LIF Assessment entity has 54 fields — the most comprehensive assessment coverage of any standard in the library, including performance levels, scoring methods, and competency alignment.', gapNotes: null },
      learningResources: { status: 'partial', cedsElements: ['LearningResource'], notes: 'LIF Course and Program entities cover learning contexts but not standalone learning resource metadata.', gapNotes: 'No dedicated learning resource cataloging entity.' },
      k12:               { status: 'full',    cedsElements: ['K12StudentAcademicRecord', 'CourseSection', 'GradeLevel'], notes: 'LIF Course entity (62 fields) covers K-12 course data comprehensively including grades, credits, enrollment, and standards alignment.', gapNotes: null },
      postsecondary:     { status: 'full',    cedsElements: ['PostsecondaryStudentAcademicRecord', 'PostsecondaryProgram'], notes: 'LIF Program entity (54 fields) covers postsecondary program data including credits, credentials, financial aid, and outcomes.', gapNotes: null },
      cte:               { status: 'partial', cedsElements: ['ProgramParticipationCareerAndTechnical', 'CareerCluster'], notes: 'LIF covers CTE through Program and Position entities but lacks dedicated career cluster modeling.', gapNotes: 'No explicit CTE pathway entity; handled through Program.programType.' },
      adultEd:           { status: 'partial', cedsElements: ['AdultEducationProgramParticipation'], notes: 'LIF Program entity can represent adult education programs; not a dedicated domain.', gapNotes: 'No adult-education-specific fields.' },
      earlyLearning:     { status: 'gap',     cedsElements: [], notes: 'LIF does not include early learning-specific entities or fields.', gapNotes: 'No early learning coverage.' },
      authN:             { status: 'partial', cedsElements: ['PersonIdentification', 'Authorization'], notes: 'LIF Person entity includes Identifier and Consent sub-entities for identity and authorization.', gapNotes: 'Consent model is included but not a full AuthN/AuthZ framework.' },
      implVars:          { status: 'partial', cedsElements: ['ImplementationVariable'], notes: 'LIF includes informationSourceId, informationSourceOrganization, and informationSourceSystem on every entity for provenance tracking.', gapNotes: null },
      facilities:        { status: 'gap',     cedsElements: [], notes: 'LIF Organization entity covers organizations but not physical facilities.', gapNotes: 'No facilities domain coverage.' },
    },
  },
];

// Derived: per-domain summary across all entries
