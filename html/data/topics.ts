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
		id: 'sedm',
		title: 'SEDM',
		emoji: '\uD83C\uDFDB\uFE0F',
		description: 'Special Education Data Model — federal reporting, Section 618 compliance, IDEA, and EdFacts data workflows.',
		color: '#EA580C',
		driverCount: 3,
		useCaseCount: 11,
		drivers: [
			'Section 618 Federal Reporting',
			'IDEA Compliance',
			'EdFacts Reporting',
		],
	},
	{
		id: 'p20w-ler',
		title: 'P20W+LER',
		emoji: '\uD83D\uDCDC',
		description: 'PK-20-Workforce lifelong learning ecosystem — Learning and Employment Records, digital wallets, AI-empowered learning, and workforce data systems.',
		color: '#5B3FD3',
		driverCount: 6,
		useCaseCount: 34,
		drivers: [
			'LER Issuing',
			'LER Verifying',
			'LER Wallets & Digital Credentials',
			'Workforce LER Applications',
			'AI-Empowered Learning',
			'Workforce Data Systems',
		],
	},
];
