// useCaseTaxonomy.js — Hierarchical use case taxonomy for the EDU Reference Library.
// Maps use cases to GitHub issues at educoreproject/educore_use_cases.

export const useCaseTaxonomy = [
  {
    id: 'all-learning-counts',
    label: 'All Learning Counts',
    subtitle: 'Every learning experience, skill, and credential recognized and portable.',
    icon: '📜',
    color: 'indigo',
    children: [
      {
        id: 'ler-issuing',
        label: 'LER Issuing',
        children: [
          { id: 'ler-issuing-general', label: 'LER Issuing', githubIssue: 2, tags: ['LER'] },
          { id: 'slds-issuance', label: 'Education Records Issuance from SLDS', githubIssue: 6, tags: ['LER'] },
          { id: 'workforce-training', label: 'Workforce Training Recognition', githubIssue: 4, tags: ['LER', 'Workforce'] },
          { id: 'stackable-credentials', label: 'Workforce Readiness & Digital Literacy Recognition Through Stackable Credentials', githubIssue: 32, tags: ['LER', 'Workforce'] },
          { id: 'educator-licensure', label: 'Educator Licensure & Teacher Talent Pipeline Using Wallet-Based LER', githubIssue: 36, tags: ['LER', 'Workforce'] },
          { id: 'military-skill-translation', label: 'Military-to-Civilian Skill Translation for Hiring', githubIssue: 37, tags: ['LER', 'Military'] },
          { id: 'informal-learning', label: 'Recognition of Informal, Community-Based, & Entrepreneurial Learning', githubIssue: 38, tags: ['LER'] },
          { id: 'employer-skill-recognition', label: 'Employer-Issued Skill Recognition for Career Mobility & Portability', githubIssue: 33, tags: ['LER', 'Workforce'] },
        ],
      },
      {
        id: 'ler-verifying',
        label: 'LER Verifying',
        children: [
          { id: 'ler-verification-general', label: 'LER Verification', githubIssue: 3, tags: ['LER'] },
          { id: 'program-qualification', label: 'Program Qualification (using verifiable employment and volunteer records)', githubIssue: 7, tags: ['LER', 'Workforce'] },
          { id: 'skills-based-job-app', label: 'Skills-Based Job Application with a Verifiable LER', githubIssue: 26, tags: ['LER', 'Workforce'] },
          { id: 'program-completion-verification', label: 'Verification of Program Completion & Job Readiness Training', githubIssue: 31, tags: ['LER', 'Workforce'] },
          { id: 'privacy-preserving-access', label: 'Privacy-Preserving & Selectively Disclosed Opportunity Access', githubIssue: 40, tags: ['LER', 'Workforce'] },
        ],
      },
      {
        id: 'ler-wallets',
        label: 'LER Wallets & Digital Credentials',
        children: [
          { id: 'digital-wallet-storage', label: 'Digital Wallet Storage, Control, and Selective Sharing of LERs', githubIssue: 25, tags: ['LER', 'Workforce'] },
          { id: 'digital-wallets-vc', label: 'Digital Wallets & Verifiable Credentials', githubIssue: 12, tags: ['LER'] },
        ],
      },
      {
        id: 'ler-workforce',
        label: 'Workforce LER Applications',
        children: [
          { id: 'resume-to-ler', label: 'Resume-to-Structured LER Conversion for Reuse Across Hiring Systems', githubIssue: 27, tags: ['LER', 'Workforce'] },
          { id: 'passive-candidate-discovery', label: 'Passive Candidate Discovery and Employer Matching Using an LER', githubIssue: 28, tags: ['LER', 'Workforce'] },
          { id: 'career-pathway-navigation', label: 'Career Pathway Navigation & Opportunity Discovery Using an LER', githubIssue: 29, tags: ['LER', 'Workforce'] },
          { id: 'job-board-ats-transfer', label: 'Job Board-to-ATS Transfer for Partial Application Completion', githubIssue: 30, tags: ['LER', 'Workforce'] },
          { id: 'inclusive-ler-support', label: 'Inclusive LER Support for Nonlinear & Marginalized Worker Journeys', githubIssue: 34, tags: ['LER', 'Workforce'] },
          { id: 'regional-ler-ecosystem', label: 'State or Regional LER Ecosystem for Talent Pipelines & Pathway Coordination', githubIssue: 35, tags: ['LER', 'Workforce'] },
        ],
      },
    ],
  },
  {
    id: 'ai-empowered-learning',
    label: 'AI-Empowered Learning',
    subtitle: 'Helping learning happen for every learner in any context.',
    icon: '✦',
    color: 'sky',
    children: [
      {
        id: 'ai-learning-general',
        label: 'AI-Empowered Lifelong Learning',
        children: [
          { id: 'ai-lifelong-learning', label: 'AI-Empowered Lifelong Learning (general)', githubIssue: 14 },
        ],
      },
      {
        id: 'ai-specialized',
        label: 'Specialized AI Learning',
        children: [
          { id: 'career-navigation', label: 'Career Navigation & Advising', githubIssue: 15, tags: ['Workforce'] },
          { id: 'ai-ed-research', label: 'AI-Empowered Education Research & Evaluation', githubIssue: 11 },
          { id: 'ai-evaluations-outcomes', label: 'Connecting AI Evaluations to Educational Outcomes', githubIssue: 11 },
        ],
      },
    ],
  },
  {
    id: 'government-administrative',
    label: 'Government & Administrative',
    subtitle: 'Education and workforce systems administration and optimization.',
    icon: '⚙️',
    color: 'amber',
    children: [
      {
        id: 'compliance-reporting',
        label: 'State & Federal Compliance Reporting',
        children: [
          { id: 'edfacts-fs002', label: 'edFACTS FS002 — Child Count', githubIssue: 5, tags: ['Administration / Operations'] },
          { id: 'edfacts-general', label: 'Federal K-12 EDFacts Reporting', githubIssue: 1, tags: ['Administration / Operations'] },
          { id: 'granular-statistical-reports', label: 'Produce Granular & Timely Government Statistical Reports (6.1)', githubIssue: 23 },
        ],
      },
      {
        id: 'unemployment-workforce-data',
        label: 'Unemployment & Workforce Data Systems',
        children: [
          { id: 'ui-benefit-payments', label: 'Initial and Ongoing Unemployment Insurance Benefit Payments (1.1)', githubIssue: 16 },
          { id: 'ui-reemployment', label: 'Reemployment of UI Benefit Recipients (1.2)', githubIssue: 18 },
          { id: 'hr-analytics-recruitment', label: 'Benchmarking HR Analytics and Talent Recruitment & Management (2.1)', githubIssue: 19 },
          { id: 'compensation-career-guidance', label: 'Benchmarking Compensation and Career Guidance & Job Search Services (3.1)', githubIssue: 20 },
        ],
      },
      {
        id: 'operations-decision',
        label: 'Operations & Decision Support',
        children: [
          { id: 'structured-fed-data', label: 'Structured Federal Government Data to Inform AI', githubIssue: 10 },
          { id: 'employment-outcomes', label: 'Improving Employment Outcomes Data for Program Management (4.1)', githubIssue: 21 },
          { id: 'supply-demand-analysis', label: 'Supply-Demand Analysis to Align Education & Workforce Investment (5.1)', githubIssue: 22 },
        ],
      },
    ],
  },
  {
    id: 'health-care',
    label: 'Health Care',
    subtitle: 'Clinical research enclaves and health-related learning and credentialing.',
    icon: '🩺',
    color: 'emerald',
    children: [
      {
        id: 'human-services',
        label: 'Human Services',
        children: [
          { id: 'guardianship-consent', label: 'Guardianship & Consent Credentials for Education & Human Services', githubIssue: 39, tags: ['LER', 'Human Services'] },
        ],
      },
    ],
  },
];

// ─── Use Case → CEDS Domain Mapping ─────────────────────────────────────────
// Maps each leaf use case ID to the CEDS domains it touches.

export const useCaseCedsDomains: Record<string, string[]> = {
  // All Learning Counts → LER Issuing
  'ler-issuing-general':        ['credentials'],
  'slds-issuance':              ['k12', 'postsecondary', 'credentials'],
  'workforce-training':         ['workforce', 'credentials'],

  // All Learning Counts → LER Verifying
  'ler-verification-general':   ['credentials', 'authN'],
  'program-qualification':      ['credentials', 'workforce'],

  // AI-Empowered Learning
  'ai-lifelong-learning':       ['competencies', 'learningResources'],
  'career-navigation':          ['workforce', 'competencies', 'credentials'],
  'ai-ed-research':             ['assessments', 'learningResources', 'implVars'],
  'ai-evaluations-outcomes':    ['assessments', 'learningResources', 'implVars'],

  // Government & Administrative → Compliance
  'edfacts-fs002':              ['k12', 'implVars'],
  'edfacts-general':            ['k12', 'implVars'],
  'granular-statistical-reports': ['implVars', 'k12', 'postsecondary', 'workforce'],

  // Government & Administrative → Unemployment & Workforce Data
  'ui-benefit-payments':        ['workforce', 'implVars'],
  'ui-reemployment':            ['workforce', 'implVars'],
  'hr-analytics-recruitment':   ['workforce', 'implVars'],
  'compensation-career-guidance': ['workforce', 'implVars'],

  // Government & Administrative → Operations
  'structured-fed-data':        ['implVars', 'k12', 'postsecondary', 'workforce'],
  'employment-outcomes':        ['workforce', 'implVars'],
  'supply-demand-analysis':     ['workforce', 'implVars', 'postsecondary'],

  // All Learning Counts → LER Wallets & Digital Credentials
  'digital-wallet-storage':     ['credentials', 'authN'],
  'digital-wallets-vc':         ['credentials', 'authN'],

  // All Learning Counts → Workforce LER Applications
  'resume-to-ler':              ['workforce', 'credentials', 'competencies'],
  'passive-candidate-discovery': ['workforce', 'credentials', 'competencies'],
  'career-pathway-navigation':  ['workforce', 'competencies', 'credentials'],
  'job-board-ats-transfer':     ['workforce', 'credentials'],
  'inclusive-ler-support':      ['workforce', 'credentials', 'competencies'],
  'regional-ler-ecosystem':     ['workforce', 'credentials', 'k12', 'postsecondary'],

  // All Learning Counts → LER Issuing (new)
  'stackable-credentials':      ['credentials', 'workforce', 'competencies'],
  'educator-licensure':         ['credentials', 'k12', 'workforce'],
  'military-skill-translation': ['workforce', 'credentials', 'competencies'],
  'informal-learning':          ['credentials', 'competencies'],
  'employer-skill-recognition': ['workforce', 'credentials', 'competencies'],

  // All Learning Counts → LER Verifying (new)
  'skills-based-job-app':       ['workforce', 'credentials', 'competencies'],
  'program-completion-verification': ['workforce', 'credentials'],
  'privacy-preserving-access':  ['credentials', 'authN', 'workforce'],

  // Health Care → Human Services
  'guardianship-consent':       ['credentials', 'authN', 'k12'],
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
