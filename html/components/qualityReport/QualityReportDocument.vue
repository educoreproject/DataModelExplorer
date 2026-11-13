<script setup>
// QualityReportDocument.vue — draws one report or certificate from the generator's document blocks (heading, paragraph, list,
// table, callout, stamp; cli/lib.d/quality-report/lib/documentRenderer.js) in the site's own styling. It draws what the
// blocks say and nothing else: no figure is re-worded or recomputed here, and inline text is drawn as text nodes
// (qualityReportText.js), never inserted as HTML. The server refuses a page holding a block kind it does not know.

import { inlineSegmentListOf } from '@/components/qualityReport/qualityReportText';

defineProps({
	titleText: { type: String, required: true },
	blockList: { type: Array, required: true },
});
</script>

<template>
	<article class="quality-report-document" data-testid="quality-report-document">
		<h1 class="quality-report-title">
			<template v-for="(segment, segmentIndex) in inlineSegmentListOf(titleText)" :key="segmentIndex"><component :is="segment.isCode ? 'code' : 'span'" :class="{ 'font-weight-bold': segment.isStrong }">{{ segment.segmentText }}</component></template>
		</h1>
		<template v-for="(block, blockIndex) in blockList" :key="blockIndex">
			<component :is="`h${Math.min(Math.max(block.headingLevel, 2), 6)}`" v-if="block.blockKind === 'heading'" class="quality-report-heading" :class="`level-${block.headingLevel}`">
				<template v-for="(segment, segmentIndex) in inlineSegmentListOf(block.text)" :key="segmentIndex"><component :is="segment.isCode ? 'code' : 'span'" :class="{ 'font-weight-bold': segment.isStrong }">{{ segment.segmentText }}</component></template>
			</component>

			<p v-else-if="block.blockKind === 'paragraph'">
				<template v-for="(segment, segmentIndex) in inlineSegmentListOf(block.text)" :key="segmentIndex"><component :is="segment.isCode ? 'code' : 'span'" :class="{ 'font-weight-bold': segment.isStrong }">{{ segment.segmentText }}</component></template>
			</p>

			<ul v-else-if="block.blockKind === 'list'">
				<li v-for="(itemText, itemIndex) in block.itemTextList" :key="itemIndex">
					<template v-for="(segment, segmentIndex) in inlineSegmentListOf(itemText)" :key="segmentIndex"><component :is="segment.isCode ? 'code' : 'span'" :class="{ 'font-weight-bold': segment.isStrong }">{{ segment.segmentText }}</component></template>
				</li>
			</ul>

			<div v-else-if="block.blockKind === 'table'" class="quality-report-table-wrap">
				<v-table density="compact" class="quality-report-table">
					<thead>
						<tr>
							<th v-for="(column, columnIndex) in block.columnList" :key="columnIndex" :class="`text-${column.alignName === 'right' ? 'right' : 'left'}`">{{ column.titleText }}</th>
						</tr>
					</thead>
					<tbody>
						<tr v-for="(cellList, rowIndex) in block.rowList" :key="rowIndex">
							<td v-for="(cellText, columnIndex) in cellList" :key="columnIndex" :class="`text-${block.columnList[columnIndex].alignName === 'right' ? 'right number-cell' : 'left'}`">
								<template v-for="(segment, segmentIndex) in inlineSegmentListOf(cellText)" :key="segmentIndex"><component :is="segment.isCode ? 'code' : 'span'" :class="{ 'font-weight-bold': segment.isStrong }">{{ segment.segmentText }}</component></template>
							</td>
						</tr>
					</tbody>
				</v-table>
			</div>

			<v-alert v-else-if="block.blockKind === 'callout'" type="info" variant="tonal" density="compact" class="my-3">
				<div v-for="(lineText, lineIndex) in block.text.split('\n')" :key="lineIndex">
					<template v-for="(segment, segmentIndex) in inlineSegmentListOf(lineText)" :key="segmentIndex"><component :is="segment.isCode ? 'code' : 'span'" :class="{ 'font-weight-bold': segment.isStrong }">{{ segment.segmentText }}</component></template>
				</div>
			</v-alert>

			<v-sheet v-else-if="block.blockKind === 'stamp'" border rounded class="quality-report-stamp pa-3 my-3">
				<dl>
					<template v-for="(field, fieldIndex) in block.fieldList" :key="fieldIndex">
						<dt>{{ field.labelText }}</dt>
						<dd>
							<template v-for="(segment, segmentIndex) in inlineSegmentListOf(field.valueText)" :key="segmentIndex"><component :is="segment.isCode ? 'code' : 'span'" :class="{ 'font-weight-bold': segment.isStrong }">{{ segment.segmentText }}</component></template>
						</dd>
					</template>
				</dl>
			</v-sheet>
		</template>
	</article>
</template>

<style scoped>
.quality-report-document {
	max-width: 980px;
	line-height: 1.55;
	overflow-wrap: anywhere;
}
.quality-report-title {
	font-size: 1.6rem;
	margin: 0 0 12px;
	color: rgb(var(--v-theme-primary));
}
.quality-report-heading.level-2 {
	font-size: 1.25rem;
	margin: 28px 0 8px;
	padding-bottom: 4px;
	border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}
.quality-report-heading.level-3 {
	font-size: 1.08rem;
	margin: 20px 0 6px;
}
.quality-report-heading.level-4 {
	font-size: 1rem;
	margin: 16px 0 4px;
	opacity: 0.8;
}
.quality-report-document p,
.quality-report-document ul {
	margin: 0 0 12px;
}
.quality-report-document ul {
	padding-left: 1.4em;
}
.quality-report-table-wrap {
	overflow-x: auto;
	margin: 8px 0 16px;
}
.quality-report-table :deep(th) {
	font-weight: 600;
	white-space: nowrap;
}
.number-cell {
	font-variant-numeric: tabular-nums;
	white-space: nowrap;
}
.quality-report-document code {
	font-family: ui-monospace, Menlo, monospace;
	font-size: 0.86em;
	padding: 1px 4px;
	border-radius: 3px;
	background: rgba(var(--v-theme-on-surface), 0.06);
}
.quality-report-stamp dl {
	display: grid;
	grid-template-columns: max-content 1fr;
	gap: 2px 14px;
	margin: 0;
	font-size: 0.88rem;
}
.quality-report-stamp dt {
	opacity: 0.7;
}
.quality-report-stamp dd {
	margin: 0;
	overflow-wrap: anywhere;
}
</style>
