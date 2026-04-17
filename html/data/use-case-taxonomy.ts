// useCaseTaxonomy.js — Hierarchical use case taxonomy for the EDU Reference Library.
// Maps use cases to GitHub issues at educoreproject/educore_use_cases.
// Topics: SEDM, P20W+LER (renamed from the previous four categories).

export const useCaseTaxonomy = [
  {
    id: 'sedm',
    label: 'SEDM',
    subtitle: 'Special Education Data Model — federal reporting, Section 618 compliance, and IDEA data workflows.',
    icon: '\uD83C\uDFDB\uFE0F',
    color: 'orange',
    children: [
      {
        id: 'section-618-reporting',
        label: 'Section 618 Federal Reporting',
        children: [
          { id: 'section-618-child-count', label: 'Section 618 Child Count and Educational Environments Reporting', githubIssue: 41, tags: ['SEDM'] },
          { id: 'section-618-assessment', label: 'Section 618 Assessment Data Reporting', githubIssue: 42, tags: ['SEDM'] },
          { id: 'section-618-exiting', label: 'Section 618 Exiting Special Education Reporting', githubIssue: 43, tags: ['SEDM'] },
          { id: 'section-618-personnel', label: 'Section 618 Personnel Reporting', githubIssue: 44, tags: ['SEDM'] },
          { id: 'section-618-dispute', label: 'Section 618 Dispute Resolution Reporting', githubIssue: 45, tags: ['SEDM'] },
          { id: 'section-618-moe-ceis', label: 'Section 618 MOE Reduction and Coordinated Early Intervening Services (CEIS) Reporting', githubIssue: 46, tags: ['SEDM'] },
        ],
      },
      {
        id: 'idea-compliance',
        label: 'IDEA Compliance',
        children: [
          { id: 'idea-part-c', label: 'IDEA Part C Early Intervention Reporting', githubIssue: 47, tags: ['SEDM'] },
          { id: 'child-find', label: 'Child Find and Identification (Including Disproportionality Monitoring)', githubIssue: 48, tags: ['SEDM'] },
          { id: 'initial-referral', label: 'Initial Referral and Evaluation', githubIssue: 49, tags: ['SEDM'] },
        ],
      },
      {
        id: 'edfacts-reporting',
        label: 'EdFacts Reporting',
        children: [
          { id: 'edfacts-general', label: 'Federal K-12 EDFacts Reporting', githubIssue: 1, tags: ['Administration / Operations'] },
          { id: 'edfacts-fs002', label: 'Special Education Federal Reporting FS002', githubIssue: 5, tags: ['Administration / Operations'], complete: true },
        ],
      },
    ],
  },
  {
    id: 'p20w-ler',
    label: 'P20W+LER',
    subtitle: 'PK-20-Workforce lifelong learning — LERs, digital wallets, AI-empowered learning, and workforce data systems.',
    icon: '\uD83D\uDCDC',
    color: 'deep-purple',
    children: [
      {
        id: 'ler-issuing',
        label: 'LER Issuing',
        children: [
          { id: 'ler-issuing-general', label: 'LER Issuance', githubIssue: 2, tags: ['P20W+LER', 'LER'], complete: true },
          { id: 'slds-issuance', label: 'LER Issuance from SLDS', githubIssue: 6, tags: ['P20W+LER', 'LER'] },
          { id: 'workforce-training', label: 'Workplace Training Recognition', githubIssue: 4, tags: ['P20W+LER', 'Workforce', 'LER'] },
          { id: 'stackable-credentials', label: 'Workforce Readiness & Digital Literacy Recognition Through Stackable Credentials', githubIssue: 32, tags: ['P20W+LER', 'Workforce', 'LER'] },
          { id: 'educator-licensure', label: 'Educator Licensure & Teacher Talent Pipeline Using Wallet-Based LER', githubIssue: 36, tags: ['P20W+LER', 'Workforce', 'LER'] },
          { id: 'military-skill-translation', label: 'Military-to-Civilian Skill Translation for Hiring', githubIssue: 37, tags: ['P20W+LER', 'LER', 'Military'] },
          { id: 'informal-learning', label: 'Recognition of Informal, Community-Based, & Entrepreneurial Learning', githubIssue: 38, tags: ['P20W+LER', 'LER'] },
          { id: 'employer-skill-recognition', label: 'Employer-Issued Skill Recognition for Career Mobility & Portability', githubIssue: 33, tags: ['Workforce', 'LER'] },
        ],
      },
      {
        id: 'ler-verifying',
        label: 'LER Verifying',
        children: [
          { id: 'ler-verification-general', label: 'LER Verification', githubIssue: 3, tags: ['P20W+LER', 'LER'] },
          { id: 'program-qualification', label: 'Privacy-Preserving Proof of Employment', githubIssue: 7, tags: ['Workforce', 'LER'] },
          { id: 'skills-based-job-app', label: 'Skills-Based Job Application with a Verifiable LER', githubIssue: 26, tags: ['Workforce', 'LER'] },
          { id: 'program-completion-verification', label: 'Verification of Program Completion & Job Readiness Training', githubIssue: 31, tags: ['Workforce', 'LER'] },
          { id: 'privacy-preserving-access', label: 'Privacy-Preserving & Selectively Disclosed Opportunity Access', githubIssue: 40, tags: ['P20W+LER', 'Workforce', 'LER'] },
        ],
      },
      {
        id: 'ler-wallets',
        label: 'LER Wallets & Digital Credentials',
        children: [
          { id: 'digital-wallets-vc', label: 'Digital Wallets & Verifiable Credentials', githubIssue: 12, tags: ['LER'] },
          { id: 'digital-wallet-storage', label: 'Digital Wallet Storage, Control, and Selective Sharing of LERs', githubIssue: 25, tags: ['P20W+LER', 'Workforce', 'LER'] },
          { id: 'guardianship-consent', label: 'Guardianship & Consent Credentials for Education & Human Services', githubIssue: 39, tags: ['LER', 'Human Services'] },
        ],
      },
      {
        id: 'ler-workforce',
        label: 'Workforce LER Applications',
        children: [
          { id: 'career-navigation', label: 'Career Navigation & Advising', githubIssue: 15, tags: ['P20W+LER', 'Workforce'] },
          { id: 'resume-to-ler', label: 'Resume-to-Structured LER Conversion for Reuse Across Hiring Systems', githubIssue: 27, tags: ['Workforce', 'LER'] },
          { id: 'passive-candidate-discovery', label: 'Passive Candidate Discovery and Employer Matching Using an LER', githubIssue: 28, tags: ['Workforce', 'LER'] },
          { id: 'career-pathway-navigation', label: 'Career Pathway Navigation & Opportunity Discovery Using an LER', githubIssue: 29, tags: ['Workforce', 'LER'] },
          { id: 'job-board-ats-transfer', label: 'Job Board-to-ATS Transfer for Partial Application Completion', githubIssue: 30, tags: ['Workforce', 'LER'] },
          { id: 'inclusive-ler-support', label: 'Inclusive LER Support for Nonlinear & Marginalized Worker Journeys', githubIssue: 34, tags: ['Workforce', 'LER'] },
          { id: 'regional-ler-ecosystem', label: 'State or Regional LER Ecosystem for Talent Pipelines & Pathway Coordination', githubIssue: 35, tags: ['P20W+LER', 'Workforce', 'LER'] },
        ],
      },
      {
        id: 'ai-empowered',
        label: 'AI-Empowered Learning',
        children: [
          { id: 'ai-evaluations-outcomes', label: 'Connecting AI Evaluations to Educational Outcomes', githubIssue: 11, tags: [] },
          { id: 'ai-lifelong-learning', label: 'AI Context & Closed Loop', githubIssue: 14, tags: [] },
          { id: 'structured-fed-data', label: 'Structured Federal Government Data to Inform AI', githubIssue: 10, tags: [] },
        ],
      },
      {
        id: 'workforce-data-systems',
        label: 'Workforce Data Systems',
        children: [
          { id: 'ui-benefit-payments', label: 'Initial and Ongoing Unemployment Insurance Benefit Payments (1.1)', githubIssue: 16, tags: [] },
          { id: 'ui-reemployment', label: 'Reemployment of UI Benefit Recipients (1.2)', githubIssue: 18, tags: [] },
          { id: 'hr-analytics-recruitment', label: 'Benchmarking HR Analytics and Talent Recruitment & Management (2.1)', githubIssue: 19, tags: [] },
          { id: 'compensation-career-guidance', label: 'Benchmarking Compensation and Career Guidance & Job Search Services (3.1)', githubIssue: 20, tags: [] },
          { id: 'employment-outcomes', label: 'Improving Employment Outcomes Data for Program Management (4.1)', githubIssue: 21, tags: [] },
          { id: 'supply-demand-analysis', label: 'Supply-Demand Analysis to Align Education & Workforce Investment (5.1)', githubIssue: 22, tags: [] },
          { id: 'granular-statistical-reports', label: 'Produce Granular & Timely Government Statistical Reports (6.1)', githubIssue: 23, tags: [] },
        ],
      },
    ],
  },
];

// ─── Use Case → CEDS Domain Mapping ─────────────────────────────────────────
// Maps each leaf use case ID to the CEDS domains it touches.

export const useCaseCedsDomains: Record<string, string[]> = {
  // SEDM → Section 618
  'section-618-child-count':    ['k12', 'implVars'],
  'section-618-assessment':     ['k12', 'assessments', 'implVars'],
  'section-618-exiting':        ['k12', 'implVars'],
  'section-618-personnel':      ['k12', 'implVars'],
  'section-618-dispute':        ['k12', 'implVars'],
  'section-618-moe-ceis':       ['k12', 'implVars'],

  // SEDM → IDEA
  'idea-part-c':                ['k12', 'implVars'],
  'child-find':                 ['k12', 'implVars'],
  'initial-referral':           ['k12', 'implVars'],

  // SEDM → EdFacts
  'edfacts-general':            ['k12', 'implVars'],
  'edfacts-fs002':              ['k12', 'implVars'],

  // P20W+LER → LER Issuing
  'ler-issuing-general':        ['credentials'],
  'slds-issuance':              ['k12', 'postsecondary', 'credentials'],
  'workforce-training':         ['workforce', 'credentials'],
  'stackable-credentials':      ['credentials', 'workforce', 'competencies'],
  'educator-licensure':         ['credentials', 'k12', 'workforce'],
  'military-skill-translation': ['workforce', 'credentials', 'competencies'],
  'informal-learning':          ['credentials', 'competencies'],
  'employer-skill-recognition': ['workforce', 'credentials', 'competencies'],

  // P20W+LER → LER Verifying
  'ler-verification-general':   ['credentials', 'authN'],
  'program-qualification':      ['credentials', 'workforce'],
  'skills-based-job-app':       ['workforce', 'credentials', 'competencies'],
  'program-completion-verification': ['workforce', 'credentials'],
  'privacy-preserving-access':  ['credentials', 'authN', 'workforce'],

  // P20W+LER → LER Wallets
  'digital-wallets-vc':         ['credentials', 'authN'],
  'digital-wallet-storage':     ['credentials', 'authN'],
  'guardianship-consent':       ['credentials', 'authN', 'k12'],

  // P20W+LER → Workforce LER Applications
  'career-navigation':          ['workforce', 'competencies', 'credentials'],
  'resume-to-ler':              ['workforce', 'credentials', 'competencies'],
  'passive-candidate-discovery': ['workforce', 'credentials', 'competencies'],
  'career-pathway-navigation':  ['workforce', 'competencies', 'credentials'],
  'job-board-ats-transfer':     ['workforce', 'credentials'],
  'inclusive-ler-support':      ['workforce', 'credentials', 'competencies'],
  'regional-ler-ecosystem':     ['workforce', 'credentials', 'k12', 'postsecondary'],

  // P20W+LER → AI-Empowered
  'ai-evaluations-outcomes':    ['assessments', 'learningResources', 'implVars'],
  'ai-lifelong-learning':       ['competencies', 'learningResources'],
  'structured-fed-data':        ['implVars', 'k12', 'postsecondary', 'workforce'],

  // P20W+LER → Workforce Data Systems
  'ui-benefit-payments':        ['workforce', 'implVars'],
  'ui-reemployment':            ['workforce', 'implVars'],
  'hr-analytics-recruitment':   ['workforce', 'implVars'],
  'compensation-career-guidance': ['workforce', 'implVars'],
  'employment-outcomes':        ['workforce', 'implVars'],
  'supply-demand-analysis':     ['workforce', 'implVars', 'postsecondary'],
  'granular-statistical-reports': ['implVars', 'k12', 'postsecondary', 'workforce'],
};

// Helper: flatten all leaf use cases
export function getAllUseCases() {
  const cases: Array<Record<string, unknown>> = [];
  useCaseTaxonomy.forEach(cat => {
    cat.children.forEach(sub => {
      sub.children.forEach(uc => {
        cases.push({ ...uc, categoryId: cat.id, subcategoryId: sub.id });
      });
    });
  });
  return cases;
}

// Helper: count use cases per category
export function countUseCases(categoryId: string) {
  const cat = useCaseTaxonomy.find(c => c.id === categoryId);
  if (!cat) return 0;
  return cat.children.reduce((sum, sub) => sum + sub.children.length, 0);
}

// Helper: count complete use cases per category
export function countCompleteUseCases(categoryId: string) {
  const cat = useCaseTaxonomy.find(c => c.id === categoryId);
  if (!cat) return 0;
  return cat.children.reduce((sum, sub) => sum + sub.children.filter(uc => uc.complete).length, 0);
}
