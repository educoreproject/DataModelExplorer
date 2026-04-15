export interface Persona {
	id: string;
	title: string;
	description: string;
	icon: string;
}

export const personas: Persona[] = [
	{
		id: 'school-admin',
		title: 'School / District Admin',
		description: 'I manage student data and need systems to talk to each other',
		icon: 'mdi-school',
	},
	{
		id: 'developer',
		title: 'Developer / Implementer',
		description: 'I build integrations and need to know which specs and APIs to use',
		icon: 'mdi-code-braces',
	},
	{
		id: 'vendor',
		title: 'EdTech Vendor',
		description: 'My product needs to interoperate with district and credential systems',
		icon: 'mdi-store',
	},
	{
		id: 'researcher',
		title: 'Researcher / Policy',
		description: 'I study education data systems, standards, or policy',
		icon: 'mdi-flask',
	},
	{
		id: 'employer',
		title: 'Employer / Workforce',
		description: 'I want to verify credentials and hire based on demonstrated skills',
		icon: 'mdi-briefcase',
	},
	{
		id: 'standards-body',
		title: 'Standards Body',
		description: 'I work on education data standards, governance, or alignment',
		icon: 'mdi-gavel',
	},
];
