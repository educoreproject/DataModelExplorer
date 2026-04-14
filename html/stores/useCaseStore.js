// useCaseStore.js — Pinia store for EDUcore Use Cases
//
// Pure client-side data store. No API calls — all 37 use cases are embedded.
// Consolidates data from three sources:
//   1. GitHub issues at educoreproject/educore_use_cases (35 issues)
//   2. EDUcore Knowledge Graph (UseCase nodes with actors and steps)
//   3. Taxonomy hierarchy from html/data/use-case-taxonomy.ts
//
// State: taxonomy (4 topics), useCases (flat array of 37 use cases)
// Getters: useCaseById, useCasesByCategory, useCasesByTag, useCasesForCedsDomain,
//          useCaseCount, allLabels, taxonomyFlat

// =========================================================================
// Define the use case store using Pinia

export const useUseCaseStore = defineStore('useCaseStore', {
	// =========================================================================
	// STATE

	state: () => ({

		// -----------------------------------------------------------------
		// Taxonomy — hierarchical organization (4 topics)
		// children arrays reference use case IDs from the useCases array

		taxonomy: [
			// -------------------------------------------------------------
			// Topic 1: All Learning Counts
			{
				id: 'all-learning-counts',
				label: 'All Learning Counts',
				subtitle: 'Every learning experience, skill, and credential recognized and portable.',
				icon: '\u{1F4DC}',
				color: 'indigo',
				children: [
					{
						id: 'ler-issuing',
						label: 'LER Issuing',
						children: [
							'ler-issuing-general',
							'slds-issuance',
							'workforce-training',
							'stackable-credentials',
							'educator-licensure',
							'military-skill-translation',
							'informal-learning',
							'employer-skill-recognition',
						],
					},
					{
						id: 'ler-verifying',
						label: 'LER Verifying',
						children: [
							'ler-verification-general',
							'program-qualification',
							'skills-based-job-app',
							'program-completion-verification',
							'privacy-preserving-access',
						],
					},
					{
						id: 'ler-wallets',
						label: 'LER Wallets & Digital Credentials',
						children: [
							'digital-wallet-storage',
							'digital-wallets-vc',
						],
					},
					{
						id: 'ler-workforce',
						label: 'Workforce LER Applications',
						children: [
							'resume-to-ler',
							'passive-candidate-discovery',
							'career-pathway-navigation',
							'job-board-ats-transfer',
							'inclusive-ler-support',
							'regional-ler-ecosystem',
						],
					},
				],
			},

			// -------------------------------------------------------------
			// Topic 2: AI-Empowered Learning
			{
				id: 'ai-empowered-learning',
				label: 'AI-Empowered Learning',
				subtitle: 'Helping learning happen for every learner in any context.',
				icon: '\u2726',
				color: 'sky',
				children: [
					{
						id: 'ai-learning-general',
						label: 'AI-Empowered Lifelong Learning',
						children: [
							'ai-lifelong-learning',
							'persistent-user-memory',
						],
					},
					{
						id: 'ai-specialized',
						label: 'Specialized AI Learning',
						children: [
							'career-navigation',
							'ai-ed-research',
							'ai-evaluations-outcomes',
						],
					},
				],
			},

			// -------------------------------------------------------------
			// Topic 3: Government & Administrative
			{
				id: 'government-administrative',
				label: 'Government & Administrative',
				subtitle: 'Education and workforce systems administration and optimization.',
				icon: '\u2699\uFE0F',
				color: 'amber',
				children: [
					{
						id: 'compliance-reporting',
						label: 'State & Federal Compliance Reporting',
						children: [
							'edfacts-fs002',
							'edfacts-general',
							'granular-statistical-reports',
						],
					},
					{
						id: 'unemployment-workforce-data',
						label: 'Unemployment & Workforce Data Systems',
						children: [
							'ui-benefit-payments',
							'ui-reemployment',
							'hr-analytics-recruitment',
							'compensation-career-guidance',
						],
					},
					{
						id: 'operations-decision',
						label: 'Operations & Decision Support',
						children: [
							'structured-fed-data',
							'employment-outcomes',
							'supply-demand-analysis',
							'team-use',
						],
					},
				],
			},

			// -------------------------------------------------------------
			// Topic 4: Health Care
			{
				id: 'health-care',
				label: 'Health Care',
				subtitle: 'Clinical research enclaves and health-related learning and credentialing.',
				icon: '\u{1FA7A}',
				color: 'emerald',
				children: [
					{
						id: 'human-services',
						label: 'Human Services',
						children: [
							'guardianship-consent',
						],
					},
				],
			},
		],

		// -----------------------------------------------------------------
		// Use Cases — flat array of all 37 use cases (35 GitHub + 2 internal)

		useCases: [

			// =============================================================
			// All Learning Counts > LER Issuing
			// =============================================================

			// -----------------------------------------------------------------
			// ler-issuing-general (issue #2)
			{
				id: 'ler-issuing-general',
				githubIssue: 2,
				title: 'LER Issuance',
				description: 'As an issuer, I want to issue a verifiable learning and employment record to a holder so that the holder can share it with verifiers.',
				categoryId: 'all-learning-counts',
				subcategoryId: 'ler-issuing',
				tags: ['All Learning Counts', 'LER'],
				cedsDomains: ['credentials'],
				actors: [
					{ name: 'Issuer / Issuing System', role: 'Creates and signs verifiable credentials' },
					{ name: 'Holder / Holder\'s Digital Wallet', role: 'Receives and stores credentials' },
					{ name: 'Identity Registry', role: 'Provides identity verification' },
					{ name: 'Skills Registry', role: 'Provides competency definitions' },
					{ name: 'Verifiable Data Registry', role: 'Stores credential schemas and revocation lists' },
				],
				steps: [
					{ stepNumber: 1, actor: 'Issuer / Issuing System', action: 'Verify holder identity against Identity Registry' },
					{ stepNumber: 2, actor: 'Issuer / Issuing System', action: 'Map achievements to Skills Registry competencies' },
					{ stepNumber: 3, actor: 'Issuer / Issuing System', action: 'Create credential payload with achievement data' },
					{ stepNumber: 4, actor: 'Issuer / Issuing System', action: 'Sign credential with institutional key' },
					{ stepNumber: 5, actor: 'Issuer / Issuing System', action: 'Register credential schema in Verifiable Data Registry' },
					{ stepNumber: 6, actor: 'Issuer / Issuing System', action: 'Transmit credential to Holder' },
					{ stepNumber: 7, actor: 'Holder / Holder\'s Digital Wallet', action: 'Receive and store credential' },
					{ stepNumber: 8, actor: 'Holder / Holder\'s Digital Wallet', action: 'Verify credential integrity' },
				],
				outcomes: ['Holder possesses a verifiable, portable credential'],
				dependencies: ['Identity Registry available', 'Credential schema defined'],
				references: [],
			},

			// -----------------------------------------------------------------
			// slds-issuance (issue #6)
			{
				id: 'slds-issuance',
				githubIssue: 6,
				title: 'LER Issuance from SLDS',
				description: 'As a State Longitudinal Data System (SLDS), I want to issue verifiable learning records from authoritative state education data so that learners have portable, verifiable records of their educational history.',
				categoryId: 'all-learning-counts',
				subcategoryId: 'ler-issuing',
				tags: ['All Learning Counts', 'LER'],
				cedsDomains: ['k12', 'postsecondary', 'credentials'],
				actors: [
					{ name: 'Issuer / Issuing System', role: 'SLDS issuing credentials' },
					{ name: 'Holder / Holder\'s Digital Wallet', role: 'Learner receiving records' },
					{ name: 'Identity Registry', role: 'State identity verification' },
					{ name: 'Skills Registry', role: 'State competency definitions' },
					{ name: 'Verifiable Data Registry', role: 'State credential registry' },
				],
				steps: [
					{ stepNumber: 1, actor: 'Issuer / Issuing System', action: 'Extract learner records from SLDS' },
					{ stepNumber: 2, actor: 'Issuer / Issuing System', action: 'Verify learner identity' },
					{ stepNumber: 3, actor: 'Issuer / Issuing System', action: 'Map achievements to competency frameworks' },
					{ stepNumber: 4, actor: 'Issuer / Issuing System', action: 'Create verifiable credential payload' },
					{ stepNumber: 5, actor: 'Issuer / Issuing System', action: 'Sign credential' },
					{ stepNumber: 6, actor: 'Issuer / Issuing System', action: 'Register in state credential registry' },
					{ stepNumber: 7, actor: 'Issuer / Issuing System', action: 'Transmit to learner wallet' },
					{ stepNumber: 8, actor: 'Holder / Holder\'s Digital Wallet', action: 'Store and verify credential' },
				],
				outcomes: ['Learner possesses verifiable state education record'],
				dependencies: ['SLDS data available', 'State credential registry operational'],
				references: [],
			},

			// -----------------------------------------------------------------
			// workforce-training (issue #4)
			{
				id: 'workforce-training',
				githubIssue: 4,
				title: 'Workplace Training Recognition',
				description: 'As an employer, I want to issue verifiable credentials for workplace training so that employees can use them for career advancement.',
				categoryId: 'all-learning-counts',
				subcategoryId: 'ler-issuing',
				tags: ['All Learning Counts', 'Workforce', 'LER'],
				cedsDomains: ['workforce', 'credentials'],
				actors: [
					{ name: 'Employer / Training Provider', role: 'Issues training credentials' },
					{ name: 'Employee / Learner', role: 'Receives training credentials' },
					{ name: 'HR System', role: 'Records training completion' },
					{ name: 'Skills Registry', role: 'Maps training to competencies' },
					{ name: 'Credential Issuer', role: 'Signs and issues verifiable credentials' },
				],
				steps: [
					{ stepNumber: 1, actor: 'Employee / Learner', action: 'Complete training program' },
					{ stepNumber: 2, actor: 'HR System', action: 'Record completion and assessment results' },
					{ stepNumber: 3, actor: 'Employer / Training Provider', action: 'Map training to Skills Registry competencies' },
					{ stepNumber: 4, actor: 'Credential Issuer', action: 'Create and sign verifiable credential' },
					{ stepNumber: 5, actor: 'Credential Issuer', action: 'Transmit to employee wallet' },
				],
				outcomes: [],
				dependencies: [],
				references: [],
			},

			// -----------------------------------------------------------------
			// stackable-credentials (issue #32)
			{
				id: 'stackable-credentials',
				githubIssue: 32,
				title: 'Workforce Readiness & Digital Literacy Recognition Through Stackable Credentials',
				description: 'This use case focuses on recognizing and verifying digital literacy and workforce readiness skills acquired through non-traditional pathways, using stackable micro-credentials that can be progressively combined.',
				categoryId: 'all-learning-counts',
				subcategoryId: 'ler-issuing',
				tags: ['LER', 'Workforce'],
				cedsDomains: ['credentials', 'workforce', 'competencies'],
				actors: [],
				steps: [],
				outcomes: [],
				dependencies: [],
				references: [],
			},

			// -----------------------------------------------------------------
			// educator-licensure (issue #36)
			{
				id: 'educator-licensure',
				githubIssue: 36,
				title: 'Educator Licensure & Teacher Talent Pipeline Using Wallet-Based LER',
				description: 'This use case focuses on the educator licensure pathway, where aspiring or current educators assemble, control, and share a verifiable record of coursework, assessments, endorsements, and licensure artifacts.',
				categoryId: 'all-learning-counts',
				subcategoryId: 'ler-issuing',
				tags: ['LER', 'Workforce'],
				cedsDomains: ['credentials', 'k12', 'workforce'],
				actors: [],
				steps: [],
				outcomes: [],
				dependencies: [],
				references: [],
			},

			// -----------------------------------------------------------------
			// military-skill-translation (issue #37)
			{
				id: 'military-skill-translation',
				githubIssue: 37,
				title: 'Military-to-Civilian Skill Translation for Hiring',
				description: 'This use case focuses on enabling military-connected learners to translate their service-acquired knowledge, experience, and skills into civilian-recognizable, verifiable credentials.',
				categoryId: 'all-learning-counts',
				subcategoryId: 'ler-issuing',
				tags: ['LER', 'Military'],
				cedsDomains: ['workforce', 'credentials', 'competencies'],
				actors: [],
				steps: [],
				outcomes: [],
				dependencies: [],
				references: [],
			},

			// -----------------------------------------------------------------
			// informal-learning (issue #38)
			{
				id: 'informal-learning',
				githubIssue: 38,
				title: 'Recognition of Informal, Community-Based, & Entrepreneurial Learning',
				description: 'This use case addresses the recognition of learning, leadership development, and entrepreneurial growth acquired outside formal academic systems.',
				categoryId: 'all-learning-counts',
				subcategoryId: 'ler-issuing',
				tags: ['LER'],
				cedsDomains: ['credentials', 'competencies'],
				actors: [],
				steps: [],
				outcomes: [],
				dependencies: [],
				references: [],
			},

			// -----------------------------------------------------------------
			// employer-skill-recognition (issue #33)
			{
				id: 'employer-skill-recognition',
				githubIssue: 33,
				title: 'Employer-Issued Skill Recognition for Career Mobility & Portability',
				description: 'This use case describes how employers can issue verifiable skill recognition credentials to employees based on demonstrated workplace competencies.',
				categoryId: 'all-learning-counts',
				subcategoryId: 'ler-issuing',
				tags: ['LER', 'Workforce'],
				cedsDomains: ['workforce', 'credentials', 'competencies'],
				actors: [],
				steps: [],
				outcomes: [],
				dependencies: [],
				references: [],
			},

			// =============================================================
			// All Learning Counts > LER Verifying
			// =============================================================

			// -----------------------------------------------------------------
			// ler-verification-general (issue #3)
			{
				id: 'ler-verification-general',
				githubIssue: 3,
				title: 'LER Verification',
				description: 'As a verifier, I want to verify the authenticity and validity of a learner\'s credential so that I can trust the claims made.',
				categoryId: 'all-learning-counts',
				subcategoryId: 'ler-verifying',
				tags: ['All Learning Counts', 'LER'],
				cedsDomains: ['credentials', 'authN'],
				actors: [
					{ name: 'Holder', role: 'Presents credentials for verification' },
					{ name: 'Verifier', role: 'Checks credential authenticity and validity' },
					{ name: 'Identity Registry', role: 'Confirms issuer identity' },
					{ name: 'Skills Registry', role: 'Validates competency definitions' },
					{ name: 'Trust Registry', role: 'Confirms issuer authorization' },
					{ name: 'Verifiable Data Registry', role: 'Checks revocation status' },
				],
				steps: [
					{ stepNumber: 1, actor: 'Holder', action: 'Select credentials to present' },
					{ stepNumber: 2, actor: 'Holder', action: 'Generate verifiable presentation' },
					{ stepNumber: 3, actor: 'Holder', action: 'Transmit presentation to Verifier' },
					{ stepNumber: 4, actor: 'Verifier', action: 'Parse credential structure' },
					{ stepNumber: 5, actor: 'Verifier', action: 'Verify cryptographic signature' },
					{ stepNumber: 6, actor: 'Verifier', action: 'Check Issuer against Identity Registry' },
					{ stepNumber: 7, actor: 'Verifier', action: 'Confirm Issuer authorization via Trust Registry' },
					{ stepNumber: 8, actor: 'Verifier', action: 'Validate competencies against Skills Registry' },
					{ stepNumber: 9, actor: 'Verifier', action: 'Check revocation status in Verifiable Data Registry' },
					{ stepNumber: 10, actor: 'Verifier', action: 'Evaluate credential expiration' },
					{ stepNumber: 11, actor: 'Verifier', action: 'Assess trust level based on all checks' },
					{ stepNumber: 12, actor: 'Verifier', action: 'Generate verification result' },
					{ stepNumber: 13, actor: 'Verifier', action: 'Return result to relying party' },
					{ stepNumber: 14, actor: 'Verifier', action: 'Log verification event' },
				],
				outcomes: ['Credential authenticity confirmed', 'Claims validated against registries', 'Trust level assessed'],
				dependencies: ['Trust Registry available', 'Revocation service operational'],
				references: [],
			},

			// -----------------------------------------------------------------
			// program-qualification (issue #7)
			{
				id: 'program-qualification',
				githubIssue: 7,
				title: 'Privacy-Preserving Proof of Employment',
				description: 'As a worker, I want to prove my employment history without revealing sensitive details so that I can qualify for programs and services.',
				categoryId: 'all-learning-counts',
				subcategoryId: 'ler-verifying',
				tags: ['Workforce', 'LER'],
				cedsDomains: ['credentials', 'workforce'],
				actors: [
					{ name: 'Holder', role: 'Worker presenting proof' },
					{ name: 'Identity Registry', role: 'Identity verification' },
					{ name: 'Verifier', role: 'Program/service provider verifying employment' },
				],
				steps: [
					{ stepNumber: 1, actor: 'Holder', action: 'Select employment credentials' },
					{ stepNumber: 2, actor: 'Holder', action: 'Create selective disclosure presentation' },
					{ stepNumber: 3, actor: 'Holder', action: 'Submit to verifier' },
					{ stepNumber: 4, actor: 'Verifier', action: 'Verify credential signature' },
					{ stepNumber: 5, actor: 'Verifier', action: 'Check identity against registry' },
					{ stepNumber: 6, actor: 'Verifier', action: 'Evaluate disclosed claims against requirements' },
					{ stepNumber: 7, actor: 'Verifier', action: 'Determine program qualification' },
					{ stepNumber: 8, actor: 'Verifier', action: 'Return result' },
				],
				outcomes: ['Worker qualifies without full disclosure', 'Privacy preserved', 'Verifiable proof recorded'],
				dependencies: ['Selective disclosure capability', 'Trust framework operational'],
				references: [],
			},

			// -----------------------------------------------------------------
			// skills-based-job-app (issue #26)
			{
				id: 'skills-based-job-app',
				githubIssue: 26,
				title: 'Skills-Based Job Application with a Verifiable LER',
				description: 'As a job applicant, I want to apply for jobs using my verifiable LER so that employers can trust my skills and credentials without manual verification.',
				categoryId: 'all-learning-counts',
				subcategoryId: 'ler-verifying',
				tags: ['Workforce', 'LER'],
				cedsDomains: ['workforce', 'credentials', 'competencies'],
				actors: [
					{ name: 'Learner', role: 'Job applicant presenting credentials' },
					{ name: 'Credential Issuer', role: 'Issues original credentials' },
					{ name: 'Wallet Provider', role: 'Manages credential storage' },
					{ name: 'Employer', role: 'Reviews and verifies applicant credentials' },
					{ name: 'Job Board', role: 'Facilitates job matching' },
					{ name: 'Applicant Tracking System', role: 'Processes applications' },
				],
				steps: [
					{ stepNumber: 1, actor: 'Learner', action: 'Browse job listings and select matching position' },
					{ stepNumber: 2, actor: 'Job Board', action: 'Parse job requirements into skills/credential criteria' },
					{ stepNumber: 3, actor: 'Learner', action: 'Select relevant credentials from wallet' },
					{ stepNumber: 4, actor: 'Wallet Provider', action: 'Generate verifiable presentation with selective disclosure' },
					{ stepNumber: 5, actor: 'Applicant Tracking System', action: 'Receive and parse verifiable presentation' },
					{ stepNumber: 6, actor: 'Employer', action: 'Auto-verify credentials and match to job requirements' },
					{ stepNumber: 7, actor: 'Employer', action: 'Score and rank applicant based on verified skills' },
				],
				outcomes: [],
				dependencies: [],
				references: [],
			},

			// -----------------------------------------------------------------
			// program-completion-verification (issue #31)
			{
				id: 'program-completion-verification',
				githubIssue: 31,
				title: 'Verification of Program Completion & Job Readiness Training',
				description: 'This use case describes how training providers and employers can verify that a worker has completed a specific training program or achieved job readiness certification.',
				categoryId: 'all-learning-counts',
				subcategoryId: 'ler-verifying',
				tags: ['Workforce', 'LER'],
				cedsDomains: ['workforce', 'credentials'],
				actors: [],
				steps: [],
				outcomes: [],
				dependencies: [],
				references: [],
			},

			// -----------------------------------------------------------------
			// privacy-preserving-access (issue #40)
			{
				id: 'privacy-preserving-access',
				githubIssue: 40,
				title: 'Privacy-Preserving & Selectively Disclosed Opportunity Access',
				description: 'This use case addresses how learners can use learning and employment records to pursue opportunities while disclosing only the information necessary for a given purpose.',
				categoryId: 'all-learning-counts',
				subcategoryId: 'ler-verifying',
				tags: ['LER', 'Workforce'],
				cedsDomains: ['credentials', 'authN', 'workforce'],
				actors: [],
				steps: [],
				outcomes: [],
				dependencies: [],
				references: [],
			},

			// =============================================================
			// All Learning Counts > LER Wallets & Digital Credentials
			// =============================================================

			// -----------------------------------------------------------------
			// digital-wallet-storage (issue #25)
			{
				id: 'digital-wallet-storage',
				githubIssue: 25,
				title: 'Digital Wallet Storage, Control, and Selective Sharing of LERs',
				description: 'As a learner, I want a digital wallet to securely store, manage, and selectively share my learning and employment records so that I maintain full control over my verified credentials.',
				categoryId: 'all-learning-counts',
				subcategoryId: 'ler-wallets',
				tags: ['All Learning Counts', 'Workforce', 'LER'],
				cedsDomains: ['credentials', 'authN'],
				actors: [
					{ name: 'Learner', role: 'Manages credentials in wallet' },
					{ name: 'Credential Issuer', role: 'Issues verifiable credentials' },
					{ name: 'Wallet Provider', role: 'Provides secure storage and sharing platform' },
					{ name: 'Verifier', role: 'Requests and verifies credentials' },
					{ name: 'Trust Registry', role: 'Provides trust verification' },
				],
				steps: [
					{ stepNumber: 1, actor: 'Credential Issuer', action: 'Issue credential to learner wallet' },
					{ stepNumber: 2, actor: 'Learner', action: 'Review and accept credential into wallet' },
					{ stepNumber: 3, actor: 'Wallet Provider', action: 'Securely store credential with encryption' },
					{ stepNumber: 4, actor: 'Verifier', action: 'Request credential presentation' },
					{ stepNumber: 5, actor: 'Learner', action: 'Select credentials and generate selective disclosure' },
					{ stepNumber: 6, actor: 'Verifier', action: 'Verify presentation against Trust Registry' },
					{ stepNumber: 7, actor: 'Wallet Provider', action: 'Log sharing event for learner audit trail' },
				],
				outcomes: [],
				dependencies: [],
				references: [],
			},

			// -----------------------------------------------------------------
			// digital-wallets-vc (issue #12)
			{
				id: 'digital-wallets-vc',
				githubIssue: 12,
				title: 'Digital Wallets & Verifiable Credentials',
				description: 'The Gates Foundation Digital Wallets & Verifiable Credentials use case focuses on the infrastructure layer enabling learners to store, manage, and share their educational credentials through standards-based digital wallets.',
				categoryId: 'all-learning-counts',
				subcategoryId: 'ler-wallets',
				tags: ['LER'],
				cedsDomains: ['credentials', 'authN'],
				actors: [],
				steps: [],
				outcomes: [],
				dependencies: [],
				references: [],
			},

			// =============================================================
			// All Learning Counts > Workforce LER Applications
			// =============================================================

			// -----------------------------------------------------------------
			// resume-to-ler (issue #27)
			{
				id: 'resume-to-ler',
				githubIssue: 27,
				title: 'Resume-to-Structured LER Conversion',
				description: 'As a job seeker, I want to convert my traditional resume into a structured, verifiable LER so that I can reuse it across multiple hiring systems without manual re-entry.',
				categoryId: 'all-learning-counts',
				subcategoryId: 'ler-workforce',
				tags: ['Workforce', 'LER'],
				cedsDomains: ['workforce', 'credentials', 'competencies'],
				actors: [
					{ name: 'Learner', role: 'Job seeker converting resume' },
					{ name: 'Resume Parsing Service', role: 'Extracts structured data from resume' },
					{ name: 'Wallet Provider', role: 'Stores structured LER' },
					{ name: 'Job Board', role: 'Accepts LER for applications' },
					{ name: 'Applicant Tracking System', role: 'Processes structured applications' },
					{ name: 'Employer/Recruiter', role: 'Reviews structured applicant data' },
				],
				steps: [
					{ stepNumber: 1, actor: 'Learner', action: 'Upload resume to parsing service' },
					{ stepNumber: 2, actor: 'Resume Parsing Service', action: 'Extract and structure resume data' },
					{ stepNumber: 3, actor: 'Resume Parsing Service', action: 'Map skills to competency frameworks' },
					{ stepNumber: 4, actor: 'Wallet Provider', action: 'Store structured LER in learner wallet' },
					{ stepNumber: 5, actor: 'Learner', action: 'Review and approve structured LER' },
					{ stepNumber: 6, actor: 'Job Board', action: 'Accept LER for application submission' },
					{ stepNumber: 7, actor: 'Applicant Tracking System', action: 'Ingest structured data without manual re-entry' },
				],
				outcomes: [],
				dependencies: [],
				references: [],
			},

			// -----------------------------------------------------------------
			// passive-candidate-discovery (issue #28)
			{
				id: 'passive-candidate-discovery',
				githubIssue: 28,
				title: 'Passive Candidate Discovery and Employer Matching Using an LER',
				description: 'This use case describes how employers can discover and match with qualified candidates through their LER-based skills profiles without requiring active job applications.',
				categoryId: 'all-learning-counts',
				subcategoryId: 'ler-workforce',
				tags: ['Workforce', 'LER'],
				cedsDomains: ['workforce', 'credentials', 'competencies'],
				actors: [],
				steps: [],
				outcomes: [],
				dependencies: [],
				references: [],
			},

			// -----------------------------------------------------------------
			// career-pathway-navigation (issue #29)
			{
				id: 'career-pathway-navigation',
				githubIssue: 29,
				title: 'Career Pathway Navigation & Opportunity Discovery Using an LER',
				description: 'This use case describes how learners can use their LER to discover career pathways, identify skill gaps, and find relevant learning opportunities.',
				categoryId: 'all-learning-counts',
				subcategoryId: 'ler-workforce',
				tags: ['Workforce', 'LER'],
				cedsDomains: ['workforce', 'competencies', 'credentials'],
				actors: [],
				steps: [],
				outcomes: [],
				dependencies: [],
				references: [],
			},

			// -----------------------------------------------------------------
			// job-board-ats-transfer (issue #30)
			{
				id: 'job-board-ats-transfer',
				githubIssue: 30,
				title: 'Job Board-to-ATS Transfer for Partial Application Completion',
				description: 'This use case addresses the problem of partial application completion when job seekers move between job boards and employer applicant tracking systems.',
				categoryId: 'all-learning-counts',
				subcategoryId: 'ler-workforce',
				tags: ['Workforce', 'LER'],
				cedsDomains: ['workforce', 'credentials'],
				actors: [],
				steps: [],
				outcomes: [],
				dependencies: [],
				references: [],
			},

			// -----------------------------------------------------------------
			// inclusive-ler-support (issue #34)
			{
				id: 'inclusive-ler-support',
				githubIssue: 34,
				title: 'Inclusive LER Support for Nonlinear & Marginalized Worker Journeys',
				description: 'This use case describes how LER systems can support workers with nonlinear career paths, employment gaps, and experiences across informal and formal settings.',
				categoryId: 'all-learning-counts',
				subcategoryId: 'ler-workforce',
				tags: ['Workforce', 'LER'],
				cedsDomains: ['workforce', 'credentials', 'competencies'],
				actors: [],
				steps: [],
				outcomes: [],
				dependencies: [],
				references: [],
			},

			// -----------------------------------------------------------------
			// regional-ler-ecosystem (issue #35)
			{
				id: 'regional-ler-ecosystem',
				githubIssue: 35,
				title: 'State or Regional LER Ecosystem for Talent Pipelines & Pathway Coordination',
				description: 'This use case describes how a state or regional entity can build an LER ecosystem that connects education providers, employers, workforce boards, and learners.',
				categoryId: 'all-learning-counts',
				subcategoryId: 'ler-workforce',
				tags: ['LER', 'Workforce'],
				cedsDomains: ['workforce', 'credentials', 'k12', 'postsecondary'],
				actors: [],
				steps: [],
				outcomes: [],
				dependencies: [],
				references: [],
			},

			// =============================================================
			// AI-Empowered Learning > AI-Empowered Lifelong Learning
			// =============================================================

			// -----------------------------------------------------------------
			// ai-lifelong-learning (issue #14)
			{
				id: 'ai-lifelong-learning',
				githubIssue: 14,
				title: 'AI-Empowered Lifelong Learning',
				description: 'As AI agents become central to educational delivery, a fundamental infrastructure challenge has emerged: these systems need to both read from and write back to the third-party systems that run schools and institutions.',
				categoryId: 'ai-empowered-learning',
				subcategoryId: 'ai-learning-general',
				tags: [],
				cedsDomains: ['competencies', 'learningResources'],
				actors: [],
				steps: [],
				outcomes: [],
				dependencies: [],
				references: [],
			},

			// -----------------------------------------------------------------
			// persistent-user-memory (issue #24)
			{
				id: 'persistent-user-memory',
				githubIssue: 24,
				title: 'Persistent User Memory',
				description: 'Feature request for persistent user memory of chats and interactions.',
				categoryId: 'ai-empowered-learning',
				subcategoryId: 'ai-learning-general',
				tags: [],
				cedsDomains: [],
				actors: [],
				steps: [],
				outcomes: [],
				dependencies: [],
				references: [],
			},

			// =============================================================
			// AI-Empowered Learning > Specialized AI Learning
			// =============================================================

			// -----------------------------------------------------------------
			// career-navigation (issue #15)
			{
				id: 'career-navigation',
				githubIssue: 15,
				title: 'Career Navigation & Advising',
				description: 'The Gates Foundation Career Navigation & Advising use case focuses on how AI systems, grounded in standards-based education and labor market data, can guide learners through career exploration, pathway planning, and credential decisions.',
				categoryId: 'ai-empowered-learning',
				subcategoryId: 'ai-specialized',
				tags: ['Workforce'],
				cedsDomains: ['workforce', 'competencies', 'credentials'],
				actors: [],
				steps: [],
				outcomes: [],
				dependencies: [],
				references: [],
			},

			// -----------------------------------------------------------------
			// ai-ed-research (issue #11)
			{
				id: 'ai-ed-research',
				githubIssue: 11,
				title: 'AI-Empowered Education Research & Evaluation',
				description: 'This use case describes how AI-powered tools can evaluate educational outcomes by connecting assessment data, learning activities, and credential attainment.',
				categoryId: 'ai-empowered-learning',
				subcategoryId: 'ai-specialized',
				tags: [],
				cedsDomains: ['assessments', 'learningResources', 'implVars'],
				actors: [],
				steps: [],
				outcomes: [],
				dependencies: [],
				references: [],
			},

			// -----------------------------------------------------------------
			// ai-evaluations-outcomes (issue #11)
			{
				id: 'ai-evaluations-outcomes',
				githubIssue: 11,
				title: 'Connecting AI Evaluations to Educational Outcomes',
				description: 'This use case describes how AI-powered tools can evaluate educational outcomes by connecting assessment data, learning activities, and credential attainment.',
				categoryId: 'ai-empowered-learning',
				subcategoryId: 'ai-specialized',
				tags: [],
				cedsDomains: ['assessments', 'learningResources', 'implVars'],
				actors: [],
				steps: [],
				outcomes: [],
				dependencies: [],
				references: [],
			},

			// =============================================================
			// Government & Administrative > State & Federal Compliance Reporting
			// =============================================================

			// -----------------------------------------------------------------
			// edfacts-fs002 (issue #5)
			{
				id: 'edfacts-fs002',
				githubIssue: 5,
				title: 'Special Education Federal Reporting FS002',
				description: 'State EDFacts Coordinators submit data to EDFacts for Special Education Child Count reporting, providing annual counts of children with disabilities receiving special education and related services.',
				categoryId: 'government-administrative',
				subcategoryId: 'compliance-reporting',
				tags: ['Administration / Operations'],
				cedsDomains: ['k12', 'implVars'],
				actors: [
					{ name: 'EDFacts Coordinator / State System', role: 'Assembles and submits FS002 data' },
					{ name: 'EDFacts EDPass System', role: 'Validates and processes FS002 data' },
				],
				steps: [
					{ stepNumber: 1, actor: 'EDFacts Coordinator / State System', action: 'Assemble child count data from LEAs and validate against IDEA requirements' },
					{ stepNumber: 2, actor: 'EDFacts EDPass System', action: 'Receive, validate, and process FS002 fact tables' },
				],
				outcomes: [],
				dependencies: [],
				references: [],
			},

			// -----------------------------------------------------------------
			// edfacts-general (issue #1)
			{
				id: 'edfacts-general',
				githubIssue: 1,
				title: 'Federal K-12 EDFacts Reporting',
				description: 'State EDFacts Coordinators submit data to EDFacts, a U.S. Department of Education initiative to put performance data at the center of policy, management and budget decisions for all K-12 educational programs.',
				categoryId: 'government-administrative',
				subcategoryId: 'compliance-reporting',
				tags: ['Administration / Operations'],
				cedsDomains: ['k12', 'implVars'],
				actors: [
					{ name: 'EDFacts Coordinator / State System', role: 'Designated official within SEA who assembles and submits annual K-12 data' },
					{ name: 'EDFacts EDPass System', role: 'Modernized centralized data submission application for collecting and validating education data' },
				],
				steps: [
					{ stepNumber: 1, actor: 'EDFacts Coordinator / State System', action: 'Assemble and validate data elements, generate aggregate counts, enable quality control for fact tables' },
					{ stepNumber: 2, actor: 'EDFacts EDPass System', action: 'Receive, validate, and process data meeting reporting requirements' },
				],
				outcomes: [],
				dependencies: [],
				references: [],
			},

			// -----------------------------------------------------------------
			// granular-statistical-reports (issue #23)
			{
				id: 'granular-statistical-reports',
				githubIssue: 23,
				title: 'Produce Granular & Timely Government Statistical Reports',
				description: 'As a government statistical agency, I want to produce granular and timely statistical reports at national, regional, state, and local levels to inform policy and resource allocation.',
				categoryId: 'government-administrative',
				subcategoryId: 'compliance-reporting',
				tags: [],
				cedsDomains: ['implVars', 'k12', 'postsecondary', 'workforce'],
				actors: [
					{ name: 'System', role: 'Statistical processing' },
					{ name: 'User', role: 'Government analyst' },
				],
				steps: [
					{ stepNumber: 1, actor: 'User', action: 'Define reporting parameters and scope' },
					{ stepNumber: 2, actor: 'System', action: 'Aggregate data from multiple sources' },
					{ stepNumber: 3, actor: 'System', action: 'Validate data quality and completeness' },
					{ stepNumber: 4, actor: 'System', action: 'Apply statistical models and analysis' },
					{ stepNumber: 5, actor: 'System', action: 'Generate reports at required geographic levels' },
					{ stepNumber: 6, actor: 'User', action: 'Review and publish reports' },
					{ stepNumber: 7, actor: 'System', action: 'Distribute to stakeholders' },
				],
				outcomes: ['Timely statistical reports at multiple geographic levels', 'Evidence-based policy support', 'Improved data timeliness', 'Enhanced granularity', 'Better workforce program evaluation'],
				dependencies: [],
				references: [],
			},

			// =============================================================
			// Government & Administrative > Unemployment & Workforce Data Systems
			// =============================================================

			// -----------------------------------------------------------------
			// ui-benefit-payments (issue #16)
			{
				id: 'ui-benefit-payments',
				githubIssue: 16,
				title: 'Initial and Ongoing Unemployment Insurance Benefit Payments',
				description: 'As a state unemployment insurance agency, I want to process initial and ongoing benefit payments accurately and efficiently.',
				categoryId: 'government-administrative',
				subcategoryId: 'unemployment-workforce-data',
				tags: [],
				cedsDomains: ['workforce', 'implVars'],
				actors: [
					{ name: 'Worker', role: 'UI claimant' },
					{ name: 'State', role: 'UI administering agency' },
					{ name: 'Employment Advisement System', role: 'Automated eligibility processing' },
				],
				steps: [
					{ stepNumber: 1, actor: 'Worker', action: 'File initial UI claim' },
					{ stepNumber: 2, actor: 'State', action: 'Verify employment history and eligibility' },
					{ stepNumber: 3, actor: 'Employment Advisement System', action: 'Calculate benefit amount' },
				],
				outcomes: [],
				dependencies: [],
				references: [],
			},

			// -----------------------------------------------------------------
			// ui-reemployment (issue #18)
			{
				id: 'ui-reemployment',
				githubIssue: 18,
				title: 'Reemployment of UI Benefit Recipients',
				description: 'As a state workforce agency, I want to support the reemployment of UI benefit recipients through targeted services and job matching.',
				categoryId: 'government-administrative',
				subcategoryId: 'unemployment-workforce-data',
				tags: [],
				cedsDomains: ['workforce', 'implVars'],
				actors: [
					{ name: 'Worker', role: 'UI recipient seeking reemployment' },
					{ name: 'State', role: 'Workforce agency' },
					{ name: 'Employment Advisement System', role: 'Job matching and services' },
				],
				steps: [
					{ stepNumber: 1, actor: 'Worker', action: 'Complete reemployment assessment' },
					{ stepNumber: 2, actor: 'Employment Advisement System', action: 'Match skills to job openings' },
					{ stepNumber: 3, actor: 'State', action: 'Provide targeted training referrals' },
					{ stepNumber: 4, actor: 'Worker', action: 'Complete assigned reemployment activities' },
					{ stepNumber: 5, actor: 'Employment Advisement System', action: 'Track outcomes and update benefit status' },
					{ stepNumber: 6, actor: 'State', action: 'Report reemployment metrics' },
				],
				outcomes: [],
				dependencies: [],
				references: [],
			},

			// -----------------------------------------------------------------
			// hr-analytics-recruitment (issue #19)
			{
				id: 'hr-analytics-recruitment',
				githubIssue: 19,
				title: 'Benchmarking HR Analytics and Talent Recruitment & Management',
				description: 'As an HR analyst, I want to benchmark our analytics and recruitment practices against labor market data to improve talent management.',
				categoryId: 'government-administrative',
				subcategoryId: 'unemployment-workforce-data',
				tags: [],
				cedsDomains: ['workforce', 'implVars'],
				actors: [
					{ name: 'HR Analyst', role: 'Analyzes workforce data' },
					{ name: 'Employer', role: 'Uses insights for talent decisions' },
					{ name: 'SOC Matching Tool', role: 'Maps positions to occupational codes' },
					{ name: 'Labor Market Benchmark Reports', role: 'Provides comparison data' },
				],
				steps: [
					{ stepNumber: 1, actor: 'HR Analyst', action: 'Define benchmarking parameters' },
					{ stepNumber: 2, actor: 'SOC Matching Tool', action: 'Map positions to O*NET/SOC codes' },
					{ stepNumber: 3, actor: 'Labor Market Benchmark Reports', action: 'Provide compensation and demand data' },
					{ stepNumber: 4, actor: 'HR Analyst', action: 'Analyze gaps between internal and market data' },
					{ stepNumber: 5, actor: 'HR Analyst', action: 'Generate recruitment recommendations' },
					{ stepNumber: 6, actor: 'Employer', action: 'Implement talent strategy adjustments' },
					{ stepNumber: 7, actor: 'HR Analyst', action: 'Track outcomes and iterate' },
				],
				outcomes: [],
				dependencies: [],
				references: [],
			},

			// -----------------------------------------------------------------
			// compensation-career-guidance (issue #20)
			{
				id: 'compensation-career-guidance',
				githubIssue: 20,
				title: 'Benchmarking Compensation and Career Guidance & Job Search Services',
				description: 'As a career advisor, I want to benchmark compensation data and provide career guidance services using current labor market information.',
				categoryId: 'government-administrative',
				subcategoryId: 'unemployment-workforce-data',
				tags: [],
				cedsDomains: ['workforce', 'implVars'],
				actors: [
					{ name: 'Career Advisor', role: 'Provides guidance to job seekers' },
					{ name: 'Student', role: 'Seeking career information' },
					{ name: 'Employer', role: 'Provides compensation data' },
					{ name: 'Workforce Analyst', role: 'Analyzes labor market trends' },
					{ name: 'Economic Development Planner', role: 'Plans regional workforce strategies' },
					{ name: 'System', role: 'Data processing and matching' },
				],
				steps: [
					{ stepNumber: 1, actor: 'Career Advisor', action: 'Receive career guidance request from student or job seeker' },
					{ stepNumber: 2, actor: 'System', action: 'Retrieve current labor market and compensation data' },
					{ stepNumber: 3, actor: 'System', action: 'Match student skills and interests to occupational pathways' },
					{ stepNumber: 4, actor: 'Career Advisor', action: 'Review matched pathways and compensation benchmarks' },
					{ stepNumber: 5, actor: 'Career Advisor', action: 'Present options and guidance to student' },
					{ stepNumber: 6, actor: 'Student', action: 'Select career pathway and next steps' },
					{ stepNumber: 7, actor: 'Workforce Analyst', action: 'Aggregate guidance outcomes for trend analysis' },
					{ stepNumber: 8, actor: 'Employer', action: 'Provide updated compensation and demand data' },
					{ stepNumber: 9, actor: 'System', action: 'Refresh labor market benchmarks' },
					{ stepNumber: 10, actor: 'Economic Development Planner', action: 'Use aggregated data for regional workforce strategy' },
					{ stepNumber: 11, actor: 'Career Advisor', action: 'Follow up on student progress' },
					{ stepNumber: 12, actor: 'System', action: 'Track placement outcomes' },
					{ stepNumber: 13, actor: 'Workforce Analyst', action: 'Report on career guidance effectiveness' },
				],
				outcomes: [],
				dependencies: [],
				references: [],
			},

			// =============================================================
			// Government & Administrative > Operations & Decision Support
			// =============================================================

			// -----------------------------------------------------------------
			// structured-fed-data (issue #10)
			{
				id: 'structured-fed-data',
				githubIssue: 10,
				title: 'Structured Federal Government Data to Inform AI',
				description: 'As a government agency, I want structured federal education data to inform and improve AI systems used in education and workforce development.',
				categoryId: 'government-administrative',
				subcategoryId: 'operations-decision',
				tags: [],
				cedsDomains: ['implVars', 'k12', 'postsecondary', 'workforce'],
				actors: [],
				steps: [],
				outcomes: [],
				dependencies: [],
				references: [],
			},

			// -----------------------------------------------------------------
			// employment-outcomes (issue #21)
			{
				id: 'employment-outcomes',
				githubIssue: 21,
				title: 'Improving Employment Outcomes Data for Program Management',
				description: 'As a program manager, I want to improve employment outcomes data to manage and improve programs and provide information for recruiting students.',
				categoryId: 'government-administrative',
				subcategoryId: 'operations-decision',
				tags: [],
				cedsDomains: ['workforce', 'implVars'],
				actors: [
					{ name: 'System', role: 'Data processing' },
					{ name: 'User', role: 'Program manager' },
				],
				steps: [
					{ stepNumber: 1, actor: 'User', action: 'Define outcome metrics and data sources' },
					{ stepNumber: 2, actor: 'System', action: 'Link education records to employment data' },
					{ stepNumber: 3, actor: 'System', action: 'Calculate program outcome metrics' },
					{ stepNumber: 4, actor: 'User', action: 'Analyze and report outcomes' },
					{ stepNumber: 5, actor: 'User', action: 'Adjust programs based on findings' },
				],
				outcomes: [],
				dependencies: ['Education-employment data linkage', 'Privacy framework for matched data'],
				references: [],
			},

			// -----------------------------------------------------------------
			// supply-demand-analysis (issue #22)
			{
				id: 'supply-demand-analysis',
				githubIssue: 22,
				title: 'Supply-Demand Analysis to Align Education & Workforce Investment',
				description: 'As a workforce planner, I want to analyze supply and demand to align education and workforce investment to meet employer needs.',
				categoryId: 'government-administrative',
				subcategoryId: 'operations-decision',
				tags: [],
				cedsDomains: ['workforce', 'implVars', 'postsecondary'],
				actors: [
					{ name: 'System', role: 'Data analysis platform' },
					{ name: 'User', role: 'Workforce planner' },
				],
				steps: [
					{ stepNumber: 1, actor: 'User', action: 'Define analysis scope and parameters' },
					{ stepNumber: 2, actor: 'System', action: 'Aggregate education program completions data' },
					{ stepNumber: 3, actor: 'System', action: 'Aggregate employer demand and job posting data' },
					{ stepNumber: 4, actor: 'System', action: 'Identify supply-demand gaps by region and occupation' },
					{ stepNumber: 5, actor: 'User', action: 'Generate alignment recommendations' },
					{ stepNumber: 6, actor: 'User', action: 'Inform investment and policy decisions' },
					{ stepNumber: 7, actor: 'System', action: 'Track outcomes of investments' },
				],
				outcomes: [],
				dependencies: [],
				references: [],
			},

			// -----------------------------------------------------------------
			// team-use (issue #9)
			{
				id: 'team-use',
				githubIssue: 9,
				title: 'Internal Team Collaboration & Workflow',
				description: 'Internal use case for team collaboration and workflow management.',
				categoryId: 'government-administrative',
				subcategoryId: 'operations-decision',
				tags: [],
				cedsDomains: [],
				actors: [],
				steps: [],
				outcomes: [],
				dependencies: [],
				references: [],
			},

			// =============================================================
			// Health Care > Human Services
			// =============================================================

			// -----------------------------------------------------------------
			// guardianship-consent (issue #39)
			{
				id: 'guardianship-consent',
				githubIssue: 39,
				title: 'Guardianship & Consent Credentials for Education & Human Services',
				description: 'This use case describes how guardianship status and service consent can be managed through verifiable credentials rather than fragmented paper workflows.',
				categoryId: 'health-care',
				subcategoryId: 'human-services',
				tags: ['LER', 'Human Services'],
				cedsDomains: ['credentials', 'authN', 'k12'],
				actors: [],
				steps: [],
				outcomes: [],
				dependencies: [],
				references: [],
			},
		],
	}),

	// =========================================================================
	// GETTERS

	getters: {
		// ------------------------------------------------------------
		// Look up a single use case by its id

		useCaseById: (state) => {
			return (id) => state.useCases.find((uc) => uc.id === id);
		},

		// ------------------------------------------------------------
		// Group use cases by categoryId

		useCasesByCategory: (state) => {
			return state.useCases.reduce((groups, uc) => {
				if (!groups[uc.categoryId]) groups[uc.categoryId] = [];
				groups[uc.categoryId].push(uc);
				return groups;
			}, {});
		},

		// ------------------------------------------------------------
		// Group use cases by each tag

		useCasesByTag: (state) => {
			return state.useCases.reduce((groups, uc) => {
				uc.tags.forEach((tag) => {
					if (!groups[tag]) groups[tag] = [];
					groups[tag].push(uc);
				});
				return groups;
			}, {});
		},

		// ------------------------------------------------------------
		// Return use cases that touch a specific CEDS domain

		useCasesForCedsDomain: (state) => {
			return (domainId) => state.useCases.filter((uc) => uc.cedsDomains.includes(domainId));
		},

		// ------------------------------------------------------------
		// Total number of use cases

		useCaseCount: (state) => {
			return state.useCases.length;
		},

		// ------------------------------------------------------------
		// Sorted unique array of all tags across all use cases

		allLabels: (state) => {
			const tagSet = new Set();
			state.useCases.forEach((uc) => uc.tags.forEach((t) => tagSet.add(t)));
			return [...tagSet].sort();
		},

		// ------------------------------------------------------------
		// Flattened list of all taxonomy entries with parent refs (for search/filter)

		taxonomyFlat: (state) => {
			const flat = [];
			state.taxonomy.forEach((topic) => {
				flat.push({ id: topic.id, label: topic.label, type: 'topic', parentId: null });
				topic.children.forEach((driver) => {
					flat.push({ id: driver.id, label: driver.label, type: 'driver', parentId: topic.id });
					driver.children.forEach((ucId) => {
						flat.push({ id: ucId, label: ucId, type: 'useCase', parentId: driver.id });
					});
				});
			});
			return flat;
		},
	},
});
