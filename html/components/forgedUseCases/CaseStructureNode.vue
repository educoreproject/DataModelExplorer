<script setup>
// @concept: [[DataModelExplorer]]
// One node of the use-case Structure outline (PLAN-useCaseStructureTab-103026): its own line (kind, name, stableId), its
// properties behind a disclosure, and one disclosure group per outgoing edge type, each child drawn by this same component
// with the edge's properties on its line. A cited element links into the Standards Explorer and another case links to its
// page; neither opens, so the outline cannot loop (the server shapes it so). Which disclosures are open is the tab's
// state: this component only reads openPathSet and asks for a toggle.

import CaseStructureNode from './CaseStructureNode.vue';
import { pathTextOf, FAMILY_CATALOG_STABLE_ID } from '@/components/standardsExplorer/explorerVocabulary';

const props = defineProps({
	outlineNode: { type: Object, required: true },
	nodePath: { type: String, required: true },
	openPathSet: { type: Object, required: true },
	edgeLine: { type: Object, default: null },
});
const emit = defineEmits(['toggle-path']);

// how each kind of node is marked on its line (data, not a branch)
const KIND_MARK_BY_NODE_KIND = Object.freeze({
	useCase: { kindText: 'use case', kindColour: 'primary' },
	part: { kindText: 'part', kindColour: 'grey-darken-1' },
	citedElement: { kindText: 'cited element', kindColour: 'success' },
	otherCase: { kindText: 'another case', kindColour: 'info' },
	shownAbove: { kindText: 'shown above', kindColour: 'grey' },
});

const groupPathOf = (edgeType) => `${props.nodePath}>${edgeType}`;
const propertyPathOf = () => `${props.nodePath}>@properties`;
const isOpen = (pathText) => props.openPathSet.has(pathText);
const valueTextOf = (propertyValue) => (typeof propertyValue === 'string' ? propertyValue : JSON.stringify(propertyValue));
const explorerLinkOf = (citedStableId) => ({ path: '/explore/graphicModelExplorer', query: { path: pathTextOf([FAMILY_CATALOG_STABLE_ID, citedStableId]) } });
const forgedCaseLinkOf = (caseStableId) => `/explore/use-cases/forged/${encodeURIComponent(caseStableId)}`;
const roleLabelOf = (outlineNode) => outlineNode.labelList.filter((labelName) => !['ForgedNode', 'StandardBase'].includes(labelName)).join(' · ');
</script>

<template>
	<div class="structure-node" :data-testid="`structure-node-${outlineNode.nodeKind}`">
		<div v-if="edgeLine" class="structure-edge-line" data-testid="structure-edge-line">
			<code class="structure-edge-type">{{ edgeLine.edgeType }}</code>
			<span v-for="oneProperty in edgeLine.edgePropertyList" :key="oneProperty.propertyName" class="structure-edge-property">{{ oneProperty.propertyName }}: {{ valueTextOf(oneProperty.propertyValue) }}</span>
			<span class="structure-arrow">↓</span>
		</div>
		<div class="structure-node-line">
			<v-chip size="x-small" variant="tonal" :color="KIND_MARK_BY_NODE_KIND[outlineNode.nodeKind].kindColour" class="mr-1">{{ KIND_MARK_BY_NODE_KIND[outlineNode.nodeKind].kindText }}</v-chip>
			<span class="structure-role">{{ roleLabelOf(outlineNode) }}</span>
			<NuxtLink v-if="outlineNode.nodeKind === 'citedElement'" :to="explorerLinkOf(outlineNode.nodeStableId)" class="structure-name" data-testid="structure-cited-link">{{ outlineNode.standardSource }} {{ outlineNode.nodeName || outlineNode.nodeStableId }}</NuxtLink>
			<NuxtLink v-else-if="outlineNode.nodeKind === 'otherCase'" :to="forgedCaseLinkOf(outlineNode.nodeStableId)" class="structure-name" data-testid="structure-case-link">{{ outlineNode.nodeName || outlineNode.nodeStableId }}</NuxtLink>
			<span v-else class="structure-name">{{ outlineNode.nodeName || '(no name)' }}</span>
			<code class="structure-stable-id">{{ outlineNode.nodeStableId }}</code>
			<button
				v-if="outlineNode.propertyList.length"
				type="button"
				class="structure-toggle structure-property-toggle"
				:data-testid="`structure-properties-toggle`"
				@click="emit('toggle-path', propertyPathOf())"
			>
				<v-icon size="small" :icon="isOpen(propertyPathOf()) ? 'mdi-menu-down' : 'mdi-menu-right'" />properties ({{ outlineNode.propertyList.length }})
			</button>
		</div>
		<div v-if="isOpen(propertyPathOf())" class="structure-property-list" data-testid="structure-property-list">
			<div v-for="oneProperty in outlineNode.propertyList" :key="oneProperty.propertyName"><span class="structure-property-name">{{ oneProperty.propertyName }}</span> {{ valueTextOf(oneProperty.propertyValue) }}</div>
		</div>
		<div v-for="oneGroup in outlineNode.groupList" :key="oneGroup.edgeType" class="structure-group">
			<button type="button" class="structure-toggle structure-group-toggle" :data-testid="`structure-group-${oneGroup.edgeType}`" @click="emit('toggle-path', groupPathOf(oneGroup.edgeType))">
				<v-icon size="small" :icon="isOpen(groupPathOf(oneGroup.edgeType)) ? 'mdi-menu-down' : 'mdi-menu-right'" />
				<span :class="{ 'structure-unworded': !oneGroup.isWorded }">{{ oneGroup.groupLabel }}</span>
				<span class="structure-group-edge">({{ oneGroup.edgeType }})</span>
				<span class="structure-group-count">{{ oneGroup.childList.length }}</span>
			</button>
			<div v-if="isOpen(groupPathOf(oneGroup.edgeType))" class="structure-children" :data-testid="`structure-children-${oneGroup.edgeType}`">
				<CaseStructureNode
					v-for="(oneChild, childIndex) in oneGroup.childList"
					:key="`${oneChild.edgeIndex}`"
					:outline-node="oneChild.childNode"
					:node-path="`${groupPathOf(oneGroup.edgeType)}#${childIndex}`"
					:open-path-set="openPathSet"
					:edge-line="oneChild"
					@toggle-path="(pathText) => emit('toggle-path', pathText)"
				/>
			</div>
		</div>
	</div>
</template>

<style scoped>
.structure-node { margin: 2px 0; }
.structure-node-line { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; font-size: 13px; line-height: 1.6; }
.structure-edge-line { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; color: #6b7280; font-size: 11px; margin-top: 4px; }
.structure-edge-type { font-size: 11px; color: #4b5563; }
.structure-edge-property { background: #f3f4f6; border-radius: 3px; padding: 0 4px; }
.structure-arrow { color: #9ca3af; }
.structure-role { font-size: 11px; color: #6b7280; }
.structure-name { font-weight: 600; }
.structure-stable-id { font-size: 11px; color: #6b7280; }
.structure-toggle { display: inline-flex; align-items: center; gap: 4px; background: none; border: none; cursor: pointer; padding: 0; color: inherit; font: inherit; }
.structure-property-toggle { font-size: 11px; color: #6b7280; }
.structure-property-list { margin: 2px 0 4px 22px; padding: 4px 8px; border-left: 2px solid #e5e7eb; font-size: 12px; color: #374151; word-break: break-word; }
.structure-property-name { font-family: monospace; color: #6b7280; margin-right: 6px; }
.structure-group { margin-left: 18px; }
.structure-group-toggle { font-size: 13px; font-weight: 600; margin-top: 2px; }
.structure-group-edge { font-size: 11px; font-weight: 400; color: #6b7280; font-family: monospace; }
.structure-group-count { font-size: 11px; font-weight: 400; color: #fff; background: #9ca3af; border-radius: 8px; padding: 0 6px; }
.structure-unworded { color: #b45309; }
.structure-children { margin-left: 14px; padding-left: 8px; border-left: 1px dashed #d1d5db; }
</style>
