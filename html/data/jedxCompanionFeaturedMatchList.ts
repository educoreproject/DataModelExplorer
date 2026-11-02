// jedxCompanionFeaturedMatchList.ts — the close matches the JEDx companion page features in its Linkage panel
// (SPEC-companionPages-102826, "six to eight close matches with clear rationales", chosen by the Phase 4 builder under
// the mandate, 2026-10-28, on the compile of GOLD_EVAL_261026_respelled with the 2026-08-20 dictionary).
//
// A choice names the dictionary element by elementId (none of these is among the three elementIds the dictionary
// repeats) and the match by hubName and matchName. The page looks each one up in the CURRENT compile; one that
// the compile no longer holds is listed as missing, never quietly dropped, so a new golden or dictionary that moves a
// featured match is visible on the page. The figures shown (confidence, rationale) always come from the compile.
//
// Why these: each is a CLOSE_MATCH whose mapping confidence is 0.7 or more and whose relation probability (in the judge's
// rationale) is 0.61 to 0.76, among the higher of the 88 close matches; the element and the hub term read as the same
// idea to a non-specialist; and together they cover five JEDx objects, both hubs, and two HR Open properties that several
// dictionary elements share (where the filter conditions tell those elements apart). whyFeaturedText is EDUcore's own
// note, shown apart from the judge's rationale.

export interface JedxFeaturedMatch {
	elementId: string;
	hubName: string;
	matchName: string;
	whyFeaturedText: string;
}

export const jedxCompanionFeaturedMatchList: JedxFeaturedMatch[] = [
	{ elementId: 'VIII.S', hubName: 'CEDS', matchName: 'Hire Date', whyFeaturedText: 'The date a worker was taken on: added to payroll in the dictionary\u2019s words, hired in CEDS\u2019s.' },
	{ elementId: 'VIII.AG', hubName: 'CEDS', matchName: 'Has Union Membership Status', whyFeaturedText: 'A yes/no about union membership on both sides; the JEDx property is named for the labor bargaining unit, so the scope may differ.' },
	{ elementId: 'IV.B', hubName: 'CEDS', matchName: 'Position Title', whyFeaturedText: 'The everyday title of a job; JEDx keeps it on the Job, CEDS on the staff position.' },
	{ elementId: 'X.C.1.a', hubName: 'CEDS', matchName: 'Staff Compensation Base Salary', whyFeaturedText: 'Pay for salaried work; JEDx reports the amount paid in a reporting period, CEDS the base salary, so the two are near but not the same.' },
	{ elementId: 'VIII.V', hubName: 'CEDS', matchName: 'Employment End Date', whyFeaturedText: 'The end of the working relationship, seen from the payroll side and from the employment record.' },
	{ elementId: 'VIII.R', hubName: 'CTDL', matchName: 'Payment Pattern Type', whyFeaturedText: 'A CTDL example: how often a worker is paid, which CTDL describes as a payment pattern.' },
	{ elementId: 'III.M.4', hubName: 'CTDL', matchName: 'Telephone', whyFeaturedText: 'A shared HR Open property: the same JEDx phone property serves more than one dictionary element.' },
	{ elementId: 'VIII.G.4', hubName: 'CEDS', matchName: 'Address Postal Code', whyFeaturedText: 'One JEDx postal-code property serves five dictionary elements; the filter conditions say which address each one means.' },
];
