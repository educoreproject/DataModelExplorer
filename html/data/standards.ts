export interface Standard {
	name: string;
	organization: string;
	category: string;
	burden: 'Low' | 'Medium' | 'High';
	status: string;
	description: string;
}

export const standards: Standard[] = [
	// Learner Records
	{
		name: 'CEDS (Common Education Data Standards)',
		organization: 'NCES / US Department of Education',
		category: 'Learner Records',
		burden: 'Medium',
		status: 'Active',
		description: 'A national collaborative effort to develop voluntary, common data standards for a key set of education data elements across the P-20W+ spectrum.',
	},
	{
		name: 'SIF (Schools Interoperability Framework)',
		organization: 'Access 4 Learning (A4L)',
		category: 'Learner Records',
		burden: 'High',
		status: 'Active',
		description: 'Data model and infrastructure specification for sharing data between K-12 institutions and applications.',
	},
	{
		name: 'Ed-Fi Data Standard',
		organization: 'Ed-Fi Alliance',
		category: 'Learner Records',
		burden: 'Medium',
		status: 'Active',
		description: 'An open data standard for K-12 education enabling real-time data exchange between student information systems and analytics platforms.',
	},
	// Competency Frameworks
	{
		name: 'CTDL-ASN (Achievement Standards Network)',
		organization: 'Credential Engine',
		category: 'Competency Frameworks',
		burden: 'Low',
		status: 'Active',
		description: 'The competency schema in the CTDL family, covering competencies, competency frameworks, rubrics, concept schemes, and progression models as linked open data.',
	},
	// Credential Transparency
	{
		name: 'CTDL (Credential Transparency Description Language)',
		organization: 'Credential Engine',
		category: 'Credential Transparency',
		burden: 'Low',
		status: 'Active',
		description: 'A family of three interoperable linked open data schemas (CTDL, CTDL-ASN, CTDL QData) for describing and linking structured, discoverable data across learning and work ecosystems — credentials, organizations, competencies, learning opportunities, pathways, and outcome metrics.',
	},
	{
		name: 'CTDL QData (Quantitative Data)',
		organization: 'Credential Engine',
		category: 'Credential Transparency',
		burden: 'Low',
		status: 'Active',
		description: 'The quantitative data schema in the CTDL family, describing outcome and projection metrics such as employment, earnings, and completion measures linked to credentials and organizations.',
	},
	{
		name: 'PESC (Postsecondary Electronic Standards Council)',
		organization: 'PESC',
		category: 'Credential Transparency',
		burden: 'Medium',
		status: 'Active',
		description: 'XML standards for the electronic exchange of student academic records, transcripts, and credentials in postsecondary education.',
	},
	// Digital Credentials
	{
		name: 'Open Badges / CLR (Comprehensive Learner Record)',
		organization: '1EdTech',
		category: 'Digital Credentials',
		burden: 'Low',
		status: 'Active',
		description: 'Standards for issuing and verifying digital badges and comprehensive learner records as verifiable credentials.',
	},
	// Data Standards
	{
		name: 'JEDx (Job and Education Data Exchange)',
		organization: 'US Chamber of Commerce Foundation',
		category: 'Data Standards',
		burden: 'Low',
		status: 'Active',
		description: 'A framework for exchanging job-relevant education and employment data to improve workforce alignment.',
	},
	{
		name: 'SEDM (Special Education Data Model)',
		organization: 'CIID / IDEA',
		category: 'Data Standards',
		burden: 'Medium',
		status: 'Active',
		description: 'Data model supporting IDEA compliance and special education reporting across states and districts.',
	},
	{
		name: 'CIP (Classification of Instructional Programs)',
		organization: 'NCES',
		category: 'Data Standards',
		burden: 'Low',
		status: 'Active',
		description: 'A taxonomic scheme for classifying instructional programs used to organize and report education data.',
	},
];

export const standardCategories = [
	'Learner Records',
	'Competency Frameworks',
	'Credential Transparency',
	'Digital Credentials',
	'Data Standards',
];
