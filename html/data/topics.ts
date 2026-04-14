export interface Topic {
	id: string;
	title: string;
	emoji: string;
	description: string;
	color: string;
	driverCount: number;
	useCaseCount: number;
	drivers: string[];
}

export const topics: Topic[] = [
	{
		id: 'all-learning-counts',
		title: 'All Learning Counts',
		emoji: '\uD83D\uDCDC',
		description: 'Every learning experience, skill, and credential recognized and portable across institutions and employers.',
		color: '#5B3FD3',
		driverCount: 4,
		useCaseCount: 21,
		drivers: [
			'LER Issuing',
			'LER Verifying',
			'LER Wallets & Digital Credentials',
			'Workforce LER Applications',
		],
	},
	{
		id: 'ai-empowered',
		title: 'AI-Empowered Learning',
		emoji: '\uD83E\uDD16',
		description: 'AI systems working with education and workforce data using consistent, governed semantics.',
		color: '#0891B2',
		driverCount: 3,
		useCaseCount: 5,
		drivers: [
			'AI Integration with Integrity',
			'AI Context & Closed Loop',
			'Structured Data for AI',
		],
	},
	{
		id: 'government-admin',
		title: 'Government & Administrative',
		emoji: '\uD83C\uDFDB\uFE0F',
		description: 'Federal and state reporting, unemployment insurance, and workforce data systems.',
		color: '#EA580C',
		driverCount: 3,
		useCaseCount: 8,
		drivers: [
			'Federal K-12 Reporting',
			'Workforce Data Systems',
			'Government Statistical Reporting',
		],
	},
	{
		id: 'health-care',
		title: 'Health Care',
		emoji: '\uD83C\uDFE5',
		description: 'Credential verification, licensure portability, and workforce pipeline for healthcare.',
		color: '#1E40AF',
		driverCount: 2,
		useCaseCount: 3,
		drivers: [
			'Licensure & Credentialing',
			'Healthcare Workforce Pipeline',
		],
	},
];
