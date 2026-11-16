// dataModelsMenuItemList.ts — the options menu under the Data Models title (TQ 2026-11-08: a hamburger that "opens menu of
// options, starts with certification"). The menu draws exactly these items, in this order; a new option is a new entry here.

export interface DataModelsMenuItem {
	menuItemName: string;
	titleText: string;
	subtitleText: string;
	iconName: string;
	routePath: string;
}

export const dataModelsMenuItemList: DataModelsMenuItem[] = [
	{
		menuItemName: 'certification',
		titleText: 'Certification',
		subtitleText: 'Mapping-quality report and per-standard certificates',
		iconName: 'mdi-certificate-outline',
		routePath: '/dm/certification',
	},
	{
		menuItemName: 'explorer',
		titleText: 'Explorer',
		subtitleText: 'Ask the Data Model Explorer',
		iconName: 'mdi-graph',
		routePath: '/dm/explorer',
	},
];
