export interface UseCase {
	issueNumber: number;
	title: string;
	topicId: string;
	driverName: string;
	labels: string[];
	description: string;
	complete?: boolean;
}

export const useCases: UseCase[] = [
	// SEDM > Section 618 Federal Reporting
	{ issueNumber: 41, title: 'Section 618 Child Count and Educational Environments Reporting', topicId: 'sedm', driverName: 'Section 618 Federal Reporting', labels: ['SEDM'], description: 'Report unduplicated child counts and educational environments under Section 618.' },
	{ issueNumber: 42, title: 'Section 618 Assessment Data Reporting', topicId: 'sedm', driverName: 'Section 618 Federal Reporting', labels: ['SEDM'], description: 'Report assessment participation and performance data for children with disabilities.' },
	{ issueNumber: 43, title: 'Section 618 Exiting Special Education Reporting', topicId: 'sedm', driverName: 'Section 618 Federal Reporting', labels: ['SEDM'], description: 'Report data on children exiting special education programs.' },
	{ issueNumber: 44, title: 'Section 618 Personnel Reporting', topicId: 'sedm', driverName: 'Section 618 Federal Reporting', labels: ['SEDM'], description: 'Report special education personnel counts and qualifications.' },
	{ issueNumber: 45, title: 'Section 618 Dispute Resolution Reporting', topicId: 'sedm', driverName: 'Section 618 Federal Reporting', labels: ['SEDM'], description: 'Report dispute resolution activities including mediations and due process complaints.' },
	{ issueNumber: 46, title: 'Section 618 MOE Reduction and CEIS Reporting', topicId: 'sedm', driverName: 'Section 618 Federal Reporting', labels: ['SEDM'], description: 'Report maintenance of effort reductions and coordinated early intervening services.' },

	// SEDM > IDEA Compliance
	{ issueNumber: 47, title: 'IDEA Part C Early Intervention Reporting', topicId: 'sedm', driverName: 'IDEA Compliance', labels: ['SEDM'], description: 'Report early intervention services data under IDEA Part C.' },
	{ issueNumber: 48, title: 'Child Find and Identification (Including Disproportionality Monitoring)', topicId: 'sedm', driverName: 'IDEA Compliance', labels: ['SEDM'], description: 'Identify children with disabilities and monitor racial/ethnic disproportionality.' },
	{ issueNumber: 49, title: 'Initial Referral and Evaluation', topicId: 'sedm', driverName: 'IDEA Compliance', labels: ['SEDM'], description: 'Process initial referrals and evaluations for special education eligibility.' },

	// SEDM > EdFacts Reporting
	{ issueNumber: 1, title: 'Federal K-12 EDFacts Reporting', topicId: 'sedm', driverName: 'EdFacts Reporting', labels: ['Administration / Operations'], description: 'Meet federal EDFacts reporting requirements using interoperable data standards.' },
	{ issueNumber: 5, title: 'Special Education Federal Reporting FS002', topicId: 'sedm', driverName: 'EdFacts Reporting', labels: ['Administration / Operations'], description: 'Report special education data for federal FS002 requirements.', complete: true },

	// P20W+LER > LER Issuing
	{ issueNumber: 2, title: 'LER Issuance', topicId: 'p20w-ler', driverName: 'LER Issuing', labels: ['P20W+LER', 'LER'], description: 'Issue a Learning and Employment Record from institutional data systems.', complete: true },
	{ issueNumber: 6, title: 'LER Issuance from SLDS', topicId: 'p20w-ler', driverName: 'LER Issuing', labels: ['P20W+LER', 'LER'], description: 'Issue LERs from State Longitudinal Data Systems.' },
	{ issueNumber: 4, title: 'Workplace Training Recognition', topicId: 'p20w-ler', driverName: 'LER Issuing', labels: ['P20W+LER', 'Workforce', 'LER'], description: 'Recognize and credential employer-provided training in an interoperable format.' },
	{ issueNumber: 32, title: 'Workforce Readiness & Digital Literacy Recognition Through Stackable Credentials', topicId: 'p20w-ler', driverName: 'LER Issuing', labels: ['P20W+LER', 'Workforce', 'LER'], description: 'Build stackable credentials for workforce readiness and digital literacy.' },
	{ issueNumber: 36, title: 'Educator Licensure & Teacher Talent Pipeline Using Wallet-Based LER', topicId: 'p20w-ler', driverName: 'LER Issuing', labels: ['P20W+LER', 'Workforce', 'LER'], description: 'Manage educator licensure and teacher talent pipelines via wallet-based LERs.' },
	{ issueNumber: 37, title: 'Military-to-Civilian Skill Translation for Hiring', topicId: 'p20w-ler', driverName: 'LER Issuing', labels: ['P20W+LER', 'LER', 'Military'], description: 'Translate military skills and experiences into civilian workforce credentials.' },
	{ issueNumber: 38, title: 'Recognition of Informal, Community-Based, & Entrepreneurial Learning', topicId: 'p20w-ler', driverName: 'LER Issuing', labels: ['P20W+LER', 'LER'], description: 'Recognize and credential informal, community-based, and entrepreneurial learning experiences.' },
	{ issueNumber: 33, title: 'Employer-Issued Skill Recognition for Career Mobility & Portability', topicId: 'p20w-ler', driverName: 'LER Issuing', labels: ['Workforce', 'LER'], description: 'Enable employer-issued skill recognitions that are portable across organizations.' },

	// P20W+LER > LER Verifying
	{ issueNumber: 3, title: 'LER Verification', topicId: 'p20w-ler', driverName: 'LER Verifying', labels: ['P20W+LER', 'LER'], description: 'Verify the authenticity and validity of a Learning and Employment Record.' },
	{ issueNumber: 7, title: 'Privacy-Preserving Proof of Employment', topicId: 'p20w-ler', driverName: 'LER Verifying', labels: ['Workforce', 'LER'], description: 'Prove employment history without revealing sensitive details.' },
	{ issueNumber: 26, title: 'Skills-Based Job Application with a Verifiable LER', topicId: 'p20w-ler', driverName: 'LER Verifying', labels: ['Workforce', 'LER'], description: 'Apply for jobs using skills-based credentials from an LER.' },
	{ issueNumber: 31, title: 'Verification of Program Completion & Job Readiness Training', topicId: 'p20w-ler', driverName: 'LER Verifying', labels: ['Workforce', 'LER'], description: 'Verify that a learner has completed a workforce readiness program.' },
	{ issueNumber: 40, title: 'Privacy-Preserving & Selectively Disclosed Opportunity Access', topicId: 'p20w-ler', driverName: 'LER Verifying', labels: ['P20W+LER', 'Workforce', 'LER'], description: 'Access opportunities while preserving privacy through selective disclosure.' },

	// P20W+LER > LER Wallets & Digital Credentials
	{ issueNumber: 12, title: 'Digital Wallets & Verifiable Credentials', topicId: 'p20w-ler', driverName: 'LER Wallets & Digital Credentials', labels: ['LER'], description: 'Store, manage, and selectively share verifiable credentials in a digital wallet.' },
	{ issueNumber: 25, title: 'Digital Wallet Storage, Control, and Selective Sharing of LERs', topicId: 'p20w-ler', driverName: 'LER Wallets & Digital Credentials', labels: ['P20W+LER', 'Workforce', 'LER'], description: 'Give individuals control over storing and sharing their LERs.' },
	{ issueNumber: 39, title: 'Guardianship & Consent Credentials for Education & Human Services', topicId: 'p20w-ler', driverName: 'LER Wallets & Digital Credentials', labels: ['LER', 'Human Services'], description: 'Manage guardianship and consent through verifiable credentials.' },

	// P20W+LER > Workforce LER Applications
	{ issueNumber: 15, title: 'Career Navigation & Advising', topicId: 'p20w-ler', driverName: 'Workforce LER Applications', labels: ['P20W+LER', 'Workforce'], description: 'Use LERs to power career navigation and academic advising.' },
	{ issueNumber: 27, title: 'Resume-to-Structured LER Conversion for Reuse Across Hiring Systems', topicId: 'p20w-ler', driverName: 'Workforce LER Applications', labels: ['Workforce', 'LER'], description: 'Convert traditional resumes into structured LER data.' },
	{ issueNumber: 28, title: 'Passive Candidate Discovery and Employer Matching Using an LER', topicId: 'p20w-ler', driverName: 'Workforce LER Applications', labels: ['Workforce', 'LER'], description: 'Enable employers to discover candidates through LER data matching.' },
	{ issueNumber: 29, title: 'Career Pathway Navigation & Opportunity Discovery Using an LER', topicId: 'p20w-ler', driverName: 'Workforce LER Applications', labels: ['Workforce', 'LER'], description: 'Navigate career pathways and discover opportunities via LER data.' },
	{ issueNumber: 30, title: 'Job Board-to-ATS Transfer for Partial Application Completion', topicId: 'p20w-ler', driverName: 'Workforce LER Applications', labels: ['Workforce', 'LER'], description: 'Transfer LER data from job boards to applicant tracking systems.' },
	{ issueNumber: 34, title: 'Inclusive LER Support for Nonlinear & Marginalized Worker Journeys', topicId: 'p20w-ler', driverName: 'Workforce LER Applications', labels: ['Workforce', 'LER'], description: 'Support nonlinear career paths and marginalized worker journeys through inclusive LER design.' },
	{ issueNumber: 35, title: 'State or Regional LER Ecosystem for Talent Pipelines & Pathway Coordination', topicId: 'p20w-ler', driverName: 'Workforce LER Applications', labels: ['P20W+LER', 'Workforce', 'LER'], description: 'Coordinate talent pipelines at state or regional level using LER ecosystems.' },

	// P20W+LER > AI-Empowered Learning
	{ issueNumber: 11, title: 'Connecting AI Evaluations to Educational Outcomes', topicId: 'p20w-ler', driverName: 'AI-Empowered Learning', labels: [], description: 'Connect AI evaluation tools to educational outcome data using governed semantics.' },
	{ issueNumber: 14, title: 'AI Context & Closed Loop', topicId: 'p20w-ler', driverName: 'AI-Empowered Learning', labels: [], description: 'Enable closed-loop AI systems that maintain learner context across interactions.' },
	{ issueNumber: 10, title: 'Structured Federal Government Data to Inform AI', topicId: 'p20w-ler', driverName: 'AI-Empowered Learning', labels: [], description: 'Structure federal government education data to make it AI-ready.' },

	// P20W+LER > Workforce Data Systems
	{ issueNumber: 16, title: 'Initial and ongoing unemployment insurance benefit payments', topicId: 'p20w-ler', driverName: 'Workforce Data Systems', labels: [], description: 'Process initial and ongoing UI benefit payments using interoperable workforce data.' },
	{ issueNumber: 18, title: 'Reemployment of UI benefit recipients', topicId: 'p20w-ler', driverName: 'Workforce Data Systems', labels: [], description: 'Support reemployment of unemployment insurance benefit recipients.' },
	{ issueNumber: 19, title: 'Benchmarking HR analytics and talent recruitment and management', topicId: 'p20w-ler', driverName: 'Workforce Data Systems', labels: [], description: 'Benchmark HR analytics for talent recruitment and management.' },
	{ issueNumber: 20, title: 'Benchmarking current compensation and career guidance', topicId: 'p20w-ler', driverName: 'Workforce Data Systems', labels: [], description: 'Benchmark compensation data and career guidance services.' },
	{ issueNumber: 21, title: 'Improving employment outcomes data', topicId: 'p20w-ler', driverName: 'Workforce Data Systems', labels: [], description: 'Improve the quality and accessibility of employment outcomes data.' },
	{ issueNumber: 22, title: 'Supply-demand analysis for education and workforce alignment', topicId: 'p20w-ler', driverName: 'Workforce Data Systems', labels: [], description: 'Analyze supply-demand dynamics for education and workforce alignment.' },
	{ issueNumber: 23, title: 'Produce granular and timely government statistical reports', topicId: 'p20w-ler', driverName: 'Workforce Data Systems', labels: [], description: 'Produce timely, granular statistical reports for government decision-making.' },
];
