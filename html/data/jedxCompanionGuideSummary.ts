// jedxCompanionGuideSummary.ts — the JEDx companion page's summary of the Guide (SPEC-companionPages-102826, the Guide
// panel: "Summary and a download of the Guide"). Written by the Phase 4 builder on 2026-10-28 from the Guide's own text
// (its title page, table of contents and Executive Summary). A summary is about ONE version of the document, so it names
// the sha256 of the file it was written from; when the current guide source has another sha256, the page says the
// summary was written for an earlier version instead of presenting it as a summary of the new one.

export interface JedxGuideSummary {
	writtenForSha256: string;
	writtenForFileName: string;
	publisherText: string;
	markingText: string;
	summaryParagraphList: string[];
	sectionTitleList: string[];
}

export const jedxCompanionGuideSummary: JedxGuideSummary = {
	writtenForSha256: 'e95579f3e89b46622c080016eda84d54970a755cbd044edc9e599fa9c3e7527b',
	writtenForFileName: 'Guide_to_Applying_the_JEDx_Workforce_Data_Dictionary_Revised_2026-09-08 Copy.docx',
	publisherText: 'U.S. Chamber of Commerce Foundation',
	markingText: 'Draft – Not for Distribution',
	summaryParagraphList: [
		'The Guide explains how the JEDx Workforce Data Dictionary can be applied to collect, exchange, link and use workforce information. It argues that common definitions, and keeping stable reference information (organizations, establishments, jobs, positions, assignments) apart from changing information about work relationships, locations, hours and pay, make reporting cheaper, more timely and more comparable across jurisdictions.',
		'It works through five use cases: unemployment insurance administration, workforce development and education programs, labor market information and analytics, Medicaid and SNAP benefits verification, and Learning and Employment Records. It says implementation needs common identifiers, governed reference data, defined update frequencies and role-based access, and it does not prescribe a reporting system or architecture.',
	],
	sectionTitleList: [
		'1. Introduction: purpose, history, scope and audience of the dictionary',
		'2. Problems the dictionary addresses',
		'3. The dictionary’s conceptual framework: organizations and their work structures, individuals, the organization–worker relationship, work time and compensation',
		'4. Applying the dictionary to the five use cases',
		'Appendix A. Case study: Arkansas data systems modernization',
	],
};
