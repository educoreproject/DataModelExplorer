// companionPanelRegistry.js — which panels a compiled companion page shows, in order, by the page's compilerName (the
// same name that picks its compiler on the server, compilers/compiler-registry.js). Each panel names its component, its
// title, whom it serves and what it is best used for, and which part of the compile answer it is given (propsOf). A
// compiled page whose compilerName is not here is shown with its stamps and a notice, never with another compiler's
// panels. The audiences are the spec's table (SPEC-companionPages-102826, "The JEDx page").

import JedxDictionaryPanel from '@/components/companionPages/JedxDictionaryPanel.vue';
import JedxLinkagePanel from '@/components/companionPages/JedxLinkagePanel.vue';
import JedxArkansasPanel from '@/components/companionPages/JedxArkansasPanel.vue';
import JedxGuidePanel from '@/components/companionPages/JedxGuidePanel.vue';
import JedxObjectModelPanel from '@/components/companionPages/JedxObjectModelPanel.vue';
import JedxNotLinkedPanel from '@/components/companionPages/JedxNotLinkedPanel.vue';
import CompanionAskDmePanel from '@/components/companionPages/CompanionAskDmePanel.vue';

const payloadPropsOf = (compileAnswer) => ({ payload: compileAnswer.payload });

export const companionPanelListByCompilerName = Object.freeze({
	jedxDictionary: [
		{ panelName: 'dictionary', panelComponent: JedxDictionaryPanel, panelTitle: "Steve Saxton's dictionary", audienceText: 'HR and workforce staff', bestUsedForText: 'looking up any element: its definition and the HR Open property that carries it', propsOf: payloadPropsOf },
		{ panelName: 'linkage', panelComponent: JedxLinkagePanel, panelTitle: 'Linkage to CEDS and CTDL', audienceText: 'everyone', bestUsedForText: 'following an element through HR Open and the JEDx graph to its CEDS and CTDL equivalents, with how sure each match is', propsOf: payloadPropsOf },
		{ panelName: 'arkansas', panelComponent: JedxArkansasPanel, panelTitle: 'Arkansas pilot', audienceText: 'state data stewards', bestUsedForText: 'seeing which dictionary elements the pilot sheet marks, program by program', propsOf: (compileAnswer) => ({ arkansasPilot: compileAnswer.payload.arkansasPilot }) },
		{ panelName: 'guide', panelComponent: JedxGuidePanel, panelTitle: 'The Guide', audienceText: 'implementers', bestUsedForText: 'understanding what the dictionary is for and how it is meant to be applied', propsOf: payloadPropsOf },
		{ panelName: 'objectModel', panelComponent: JedxObjectModelPanel, panelTitle: 'Object model', audienceText: 'developers', bestUsedForText: "getting to HR Open's JEDx model and to the JEDx objects in this graph", propsOf: payloadPropsOf },
		{ panelName: 'notLinked', panelComponent: JedxNotLinkedPanel, panelTitle: 'Not yet linked', audienceText: 'Steve Saxton and the working group', bestUsedForText: 'finding the elements that have no HR Open path yet, or whose path does not resolve, and why', propsOf: payloadPropsOf },
		{ panelName: 'askDme', panelComponent: CompanionAskDmePanel, panelTitle: 'Ask the Data Model Explorer', audienceText: 'everyone', bestUsedForText: 'asking the DME about one JEDx object, with a question tested for consistent answers', propsOf: () => ({}) },
	],
});
