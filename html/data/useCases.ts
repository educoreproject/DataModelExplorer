export interface UseCase {
	issueNumber: number;
	title: string;
	topicId: string;
	driverName: string;
	labels: string[];
	description: string;
}

export const useCases: UseCase[] = [
	// All Learning Counts > LER Issuing
	{ issueNumber: 2, title: 'LER Issuance', topicId: 'all-learning-counts', driverName: 'LER Issuing', labels: ['All Learning Counts', 'LER'], description: 'Issue a Learning and Employment Record from institutional data systems.' },
	{ issueNumber: 6, title: 'LER Issuance from SLDS', topicId: 'all-learning-counts', driverName: 'LER Issuing', labels: ['All Learning Counts', 'LER'], description: 'Issue LERs from State Longitudinal Data Systems.' },
	{ issueNumber: 38, title: 'Recognition of Informal, Community-Based, & Entrepreneurial Learning', topicId: 'all-learning-counts', driverName: 'LER Issuing', labels: ['All Learning Counts', 'LER'], description: 'Recognize and credential informal, community-based, and entrepreneurial learning experiences.' },

	// All Learning Counts > LER Verifying
	{ issueNumber: 3, title: 'LER Verification', topicId: 'all-learning-counts', driverName: 'LER Verifying', labels: ['All Learning Counts', 'LER'], description: 'Verify the authenticity and validity of a Learning and Employment Record.' },
	{ issueNumber: 7, title: 'Privacy-Preserving Proof of Employment', topicId: 'all-learning-counts', driverName: 'LER Verifying', labels: ['Workforce', 'LER'], description: 'Prove employment history without revealing sensitive details.' },
	{ issueNumber: 31, title: 'Verification of Program Completion & Job Readiness Training', topicId: 'all-learning-counts', driverName: 'LER Verifying', labels: ['Workforce', 'LER'], description: 'Verify that a learner has completed a workforce readiness program.' },

	// All Learning Counts > LER Wallets & Digital Credentials
	{ issueNumber: 12, title: 'Digital Wallets & Verifiable Credentials', topicId: 'all-learning-counts', driverName: 'LER Wallets & Digital Credentials', labels: ['LER'], description: 'Store, manage, and selectively share verifiable credentials in a digital wallet.' },
	{ issueNumber: 25, title: 'Digital Wallet Storage, Control, and Selective Sharing of LERs', topicId: 'all-learning-counts', driverName: 'LER Wallets & Digital Credentials', labels: ['All Learning Counts', 'Workforce', 'LER'], description: 'Give individuals control over storing and sharing their LERs.' },
	{ issueNumber: 32, title: 'Workforce Readiness & Digital Literacy Recognition Through Stackable Credentials', topicId: 'all-learning-counts', driverName: 'LER Wallets & Digital Credentials', labels: ['All Learning Counts', 'Workforce', 'LER'], description: 'Build stackable credentials for workforce readiness and digital literacy.' },
	{ issueNumber: 39, title: 'Guardianship & Consent Credentials for Education & Human Services', topicId: 'all-learning-counts', driverName: 'LER Wallets & Digital Credentials', labels: ['LER', 'Human Services'], description: 'Manage guardianship and consent through verifiable credentials.' },
	{ issueNumber: 40, title: 'Privacy-Preserving & Selectively Disclosed Opportunity Access', topicId: 'all-learning-counts', driverName: 'LER Wallets & Digital Credentials', labels: ['All Learning Counts', 'Workforce', 'LER'], description: 'Access opportunities while preserving privacy through selective disclosure.' },

	// All Learning Counts > Workforce LER Applications
	{ issueNumber: 4, title: 'Workplace Training Recognition', topicId: 'all-learning-counts', driverName: 'Workforce LER Applications', labels: ['All Learning Counts', 'Workforce', 'LER'], description: 'Recognize and credential employer-provided training in an interoperable format.' },
	{ issueNumber: 15, title: 'Career Navigation & Advising', topicId: 'all-learning-counts', driverName: 'Workforce LER Applications', labels: ['All Learning Counts', 'Workforce'], description: 'Use LERs to power career navigation and academic advising.' },
	{ issueNumber: 26, title: 'Skills-Based Job Application with a Verifiable LER', topicId: 'all-learning-counts', driverName: 'Workforce LER Applications', labels: ['Workforce', 'LER'], description: 'Apply for jobs using skills-based credentials from an LER.' },
	{ issueNumber: 27, title: 'Resume-to-Structure LER Conversion for Reuse Across Hiring Systems', topicId: 'all-learning-counts', driverName: 'Workforce LER Applications', labels: ['Workforce', 'LER'], description: 'Convert traditional resumes into structured LER data.' },
	{ issueNumber: 28, title: 'Passive Candidate Discovery and Employer Matching Using an LER', topicId: 'all-learning-counts', driverName: 'Workforce LER Applications', labels: ['Workforce', 'LER'], description: 'Enable employers to discover candidates through LER data matching.' },
	{ issueNumber: 29, title: 'Career Pathway Navigation & Opportunity Discovery Using an LER', topicId: 'all-learning-counts', driverName: 'Workforce LER Applications', labels: ['Workforce', 'LER'], description: 'Navigate career pathways and discover opportunities via LER data.' },
	{ issueNumber: 30, title: 'Job Board-to-ATS Transfer for Partial Application Completion', topicId: 'all-learning-counts', driverName: 'Workforce LER Applications', labels: ['Workforce', 'LER'], description: 'Transfer LER data from job boards to applicant tracking systems.' },
	{ issueNumber: 33, title: 'Employer-Issued Skill Recognition for Career Mobility & Portability', topicId: 'all-learning-counts', driverName: 'Workforce LER Applications', labels: ['Workforce', 'LER'], description: 'Enable employer-issued skill recognitions that are portable across organizations.' },
	{ issueNumber: 34, title: 'Inclusive LER Support for Nonlinear & Marginalized Worker Journeys', topicId: 'all-learning-counts', driverName: 'Workforce LER Applications', labels: ['Workforce', 'LER'], description: 'Support nonlinear career paths and marginalized worker journeys through inclusive LER design.' },
	{ issueNumber: 35, title: 'State or Regional LER Ecosystem for Talent Pipelines & Pathway Coordination', topicId: 'all-learning-counts', driverName: 'Workforce LER Applications', labels: ['All Learning Counts', 'Workforce', 'LER'], description: 'Coordinate talent pipelines at state or regional level using LER ecosystems.' },
	{ issueNumber: 36, title: 'Educator Licensure & Teacher Talent Pipeline Using Wallet-Based LER', topicId: 'all-learning-counts', driverName: 'Workforce LER Applications', labels: ['All Learning Counts', 'Workforce', 'LER'], description: 'Manage educator licensure and teacher talent pipelines via wallet-based LERs.' },
	{ issueNumber: 37, title: 'Military-to-Civilian Skill Translation for Hiring', topicId: 'all-learning-counts', driverName: 'Workforce LER Applications', labels: ['All Learning Counts', 'LER', 'Military'], description: 'Translate military skills and experiences into civilian workforce credentials.' },

	// AI-Empowered Learning
	{ issueNumber: 11, title: 'Connecting AI Evaluations to Educational Outcomes', topicId: 'ai-empowered', driverName: 'AI Integration with Integrity', labels: [], description: 'Connect AI evaluation tools to educational outcome data using governed semantics.' },
	{ issueNumber: 14, title: 'AI Context & Closed Loop', topicId: 'ai-empowered', driverName: 'AI Context & Closed Loop', labels: [], description: 'Enable closed-loop AI systems that maintain learner context across interactions.' },
	{ issueNumber: 10, title: 'Structured Federal Government Data to Inform AI', topicId: 'ai-empowered', driverName: 'Structured Data for AI', labels: [], description: 'Structure federal government education data to make it AI-ready.' },

	// Government & Administrative > Federal K-12 Reporting
	{ issueNumber: 1, title: 'Federal K-12 EDFacts Reporting', topicId: 'government-admin', driverName: 'Federal K-12 Reporting', labels: ['Administration / Operations'], description: 'Meet federal EDFacts reporting requirements using interoperable data standards.' },
	{ issueNumber: 5, title: 'Special Education Federal Reporting FS002', topicId: 'government-admin', driverName: 'Federal K-12 Reporting', labels: ['Administration / Operations'], description: 'Report special education data for federal FS002 requirements.' },

	// Government & Administrative > Workforce Data Systems
	{ issueNumber: 16, title: 'Initial and ongoing unemployment insurance benefit payments', topicId: 'government-admin', driverName: 'Workforce Data Systems', labels: [], description: 'Process initial and ongoing UI benefit payments using interoperable workforce data.' },
	{ issueNumber: 18, title: 'Reemployment of UI benefit recipients', topicId: 'government-admin', driverName: 'Workforce Data Systems', labels: [], description: 'Support reemployment of unemployment insurance benefit recipients.' },
	{ issueNumber: 21, title: 'Improving employment outcomes data', topicId: 'government-admin', driverName: 'Workforce Data Systems', labels: [], description: 'Improve the quality and accessibility of employment outcomes data.' },

	// Government & Administrative > Government Statistical Reporting
	{ issueNumber: 19, title: 'Benchmarking HR analytics and talent recruitment and management', topicId: 'government-admin', driverName: 'Government Statistical Reporting', labels: [], description: 'Benchmark HR analytics for talent recruitment and management.' },
	{ issueNumber: 20, title: 'Benchmarking current compensation and career guidance', topicId: 'government-admin', driverName: 'Government Statistical Reporting', labels: [], description: 'Benchmark compensation data and career guidance services.' },
	{ issueNumber: 22, title: 'Supply-demand analysis for education and workforce alignment', topicId: 'government-admin', driverName: 'Government Statistical Reporting', labels: [], description: 'Analyze supply-demand dynamics for education and workforce alignment.' },
	{ issueNumber: 23, title: 'Produce granular and timely government statistical reports', topicId: 'government-admin', driverName: 'Government Statistical Reporting', labels: [], description: 'Produce timely, granular statistical reports for government decision-making.' },
];
