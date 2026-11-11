<script setup>
// @concept: [[DataModelExplorer]]
// ⟪meaningsPolish, WORKORDER-meaningsPolish-111026, punch-list item 9⟫ "What is a meaning?": an ⓘ button beside the Meanings Explorer heading opens a panel
// over the page with TQ's approved text (verbatim) and an illustrative diagram: three standards' elements point to one meaning, which points to an ontology
// class and an ontology property. The labels are generic by TQ's ruling (the CEDS check found no "Staff Member" class or "Identifier" property; CEDS makes a
// staff ID a qualified Person Identifier), and the caption says illustrative. Closes with its X or Escape (v-dialog's own); a full-width sheet on a phone.
// Every word is meaningsVocabulary's explainer; the diagram's colours are CSS custom properties, redefined for a dark colour scheme.

import { ref } from 'vue';
import { useDisplay } from 'vuetify';
import { meaningsVocabulary } from '@/components/standardsExplorer/explorerVocabulary';

const explainerWords = meaningsVocabulary.explainer;
const isOpen = ref(false);
// the title's element id, which names the dialog (aria-labelledby falls through to Vuetify's role="dialog" element, the overlay's root)
const EXPLAINER_TITLE_ID = 'meaning-explainer-title';
const { smAndDown } = useDisplay();

// THE DIAGRAM'S GEOMETRY (one viewBox; the SVG scales to its column): the standards' elements on the left, the meaning in the middle, the ontology elements
// on the right, each box's arrow ending at the meaning's (or the ontology element's) edge
const DIAGRAM_BOX_WIDTH = 150;
const DIAGRAM_BOX_HEIGHT = 44;
const MEANING_BOX_WIDTH = 130;
const MEANING_BOX_HEIGHT = 64;
const DIAGRAM_VIEW_WIDTH = 640;
const DIAGRAM_VIEW_HEIGHT = 250;
const standardBoxList = explainerWords.standardElementLabelList.map((labelText, boxIndex) => ({ labelText, boxX: 10, boxY: 20 + boxIndex * 80 }));
const meaningBox = { labelText: explainerWords.meaningLabel, boxX: (DIAGRAM_VIEW_WIDTH - MEANING_BOX_WIDTH) / 2, boxY: (DIAGRAM_VIEW_HEIGHT - MEANING_BOX_HEIGHT) / 2 };
const ontologyBoxList = explainerWords.ontologyElementLabelList.map((labelText, boxIndex) => ({ labelText, boxX: DIAGRAM_VIEW_WIDTH - DIAGRAM_BOX_WIDTH - 10, boxY: 60 + boxIndex * 86 }));
const meaningMiddleY = meaningBox.boxY + MEANING_BOX_HEIGHT / 2;
// each standard's arrow ends at its own point on the hexagon's left edges, spread about the middle, so the three arrowheads do not pile on one vertex
const ARROW_END_SPREAD = 16;
const hexagonLeftEdgeXOf = (offsetY) => meaningBox.boxX + MEANING_BOX_WIDTH * 0.2 * (Math.abs(offsetY) / (MEANING_BOX_HEIGHT / 2));
const standardArrowList = standardBoxList.map((oneBox, boxIndex) => {
	const offsetY = (boxIndex - (standardBoxList.length - 1) / 2) * ARROW_END_SPREAD;
	return { fromX: oneBox.boxX + DIAGRAM_BOX_WIDTH, fromY: oneBox.boxY + DIAGRAM_BOX_HEIGHT / 2, toX: hexagonLeftEdgeXOf(offsetY) - 4, toY: meaningMiddleY + offsetY };
});
const ontologyArrowList = ontologyBoxList.map((oneBox) => ({ fromX: meaningBox.boxX + MEANING_BOX_WIDTH, fromY: meaningMiddleY, toX: oneBox.boxX - 4, toY: oneBox.boxY + DIAGRAM_BOX_HEIGHT / 2 }));
// the meaning drawn as the Explorer draws one: a hexagon
const meaningHexagonPoints = [
	[meaningBox.boxX + MEANING_BOX_WIDTH * 0.2, meaningBox.boxY],
	[meaningBox.boxX + MEANING_BOX_WIDTH * 0.8, meaningBox.boxY],
	[meaningBox.boxX + MEANING_BOX_WIDTH, meaningMiddleY],
	[meaningBox.boxX + MEANING_BOX_WIDTH * 0.8, meaningBox.boxY + MEANING_BOX_HEIGHT],
	[meaningBox.boxX + MEANING_BOX_WIDTH * 0.2, meaningBox.boxY + MEANING_BOX_HEIGHT],
	[meaningBox.boxX, meaningMiddleY],
]
	.map((onePoint) => onePoint.join(','))
	.join(' ');
</script>

<template>
	<span class="meaning-explainer">
		<!-- ⟪review S2⟫ the ⓘ button is the dialog's activator, so Vuetify gives focus back to it on close; the dialog is named by its title -->
		<v-dialog v-model="isOpen" :fullscreen="smAndDown" max-width="760" scrollable :aria-labelledby="EXPLAINER_TITLE_ID">
			<template #activator="{ props: activatorProps }">
				<button v-bind="activatorProps" type="button" class="meaning-explainer-open" :aria-label="explainerWords.openButtonLabel" :title="explainerWords.openButtonLabel" data-testid="meaning-explainer-open">
					<v-icon icon="mdi-information-outline" size="22" aria-hidden="true" />
					<!-- ⟪meaningsClarity Addendum C #15⟫ its words visible beside the icon, not only as a tooltip -->
					<span class="meaning-explainer-label" data-testid="meaning-explainer-label">{{ explainerWords.openButtonLabel }}</span>
				</button>
			</template>
			<section class="meaning-explainer-panel" role="document" :aria-labelledby="EXPLAINER_TITLE_ID" data-testid="meaning-explainer-panel">
				<header class="meaning-explainer-head">
					<h2 :id="EXPLAINER_TITLE_ID" class="meaning-explainer-title">{{ explainerWords.titleText }}</h2>
					<button type="button" class="meaning-explainer-close" :aria-label="explainerWords.closeButtonLabel" data-testid="meaning-explainer-close" @click="isOpen = false">
						<v-icon icon="mdi-close" size="22" aria-hidden="true" />
					</button>
				</header>
				<div class="meaning-explainer-body">
					<p v-for="(runList, paragraphIndex) in explainerWords.paragraphList" :key="paragraphIndex" class="meaning-explainer-paragraph" data-testid="meaning-explainer-paragraph">
						<template v-for="(oneRun, runIndex) in runList" :key="runIndex"><em v-if="oneRun.isEmphasis">{{ oneRun.text }}</em><template v-else>{{ oneRun.text }}</template></template>
					</p>
					<figure class="meaning-explainer-figure" data-testid="meaning-explainer-figure">
						<svg :viewBox="`0 0 ${DIAGRAM_VIEW_WIDTH} ${DIAGRAM_VIEW_HEIGHT}`" role="img" :aria-label="explainerWords.diagramLabel" class="meaning-explainer-diagram">
							<defs>
								<marker id="meaning-explainer-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
									<path d="M0,0 L10,5 L0,10 z" class="meaning-explainer-arrowhead" />
								</marker>
							</defs>
							<line v-for="(oneArrow, arrowIndex) in [...standardArrowList, ...ontologyArrowList]" :key="`arrow-${arrowIndex}`" :x1="oneArrow.fromX" :y1="oneArrow.fromY" :x2="oneArrow.toX" :y2="oneArrow.toY" class="meaning-explainer-line" marker-end="url(#meaning-explainer-arrow)" />
							<g v-for="oneBox in standardBoxList" :key="oneBox.labelText">
								<rect :x="oneBox.boxX" :y="oneBox.boxY" :width="DIAGRAM_BOX_WIDTH" :height="DIAGRAM_BOX_HEIGHT" rx="8" class="meaning-explainer-standard-box" />
								<text :x="oneBox.boxX + DIAGRAM_BOX_WIDTH / 2" :y="oneBox.boxY + DIAGRAM_BOX_HEIGHT / 2" class="meaning-explainer-box-text">{{ oneBox.labelText }}</text>
							</g>
							<polygon :points="meaningHexagonPoints" class="meaning-explainer-meaning-box" />
							<text :x="meaningBox.boxX + MEANING_BOX_WIDTH / 2" :y="meaningMiddleY" class="meaning-explainer-box-text meaning-explainer-meaning-text">{{ meaningBox.labelText }}</text>
							<g v-for="oneBox in ontologyBoxList" :key="oneBox.labelText">
								<rect :x="oneBox.boxX" :y="oneBox.boxY" :width="DIAGRAM_BOX_WIDTH" :height="DIAGRAM_BOX_HEIGHT" rx="8" class="meaning-explainer-ontology-box" />
								<text :x="oneBox.boxX + DIAGRAM_BOX_WIDTH / 2" :y="oneBox.boxY + DIAGRAM_BOX_HEIGHT / 2" class="meaning-explainer-box-text">{{ oneBox.labelText }}</text>
							</g>
						</svg>
						<figcaption class="meaning-explainer-caption" data-testid="meaning-explainer-caption">{{ explainerWords.captionText }}</figcaption>
					</figure>
				</div>
			</section>
		</v-dialog>
	</span>
</template>

<style scoped>
.meaning-explainer {
	display: inline-flex;
	align-items: center;
}
.meaning-explainer-open,
.meaning-explainer-close {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 36px;
	height: 36px;
	border: none;
	border-radius: 50%;
	background: transparent;
	color: #072a6c;
	cursor: pointer;
}
.meaning-explainer-open {
	width: auto;
	gap: 4px;
	padding: 0 10px 0 6px;
	border-radius: 18px;
}
.meaning-explainer-label {
	font-size: 14px;
	font-weight: 600;
}
.meaning-explainer-open:hover,
.meaning-explainer-open:focus-visible,
.meaning-explainer-close:hover,
.meaning-explainer-close:focus-visible {
	background: #e7ecf6;
}
.meaning-explainer-panel {
	--explainer-surface: #ffffff;
	--explainer-ink: #111827;
	--explainer-quiet-ink: #4b5563;
	--explainer-standard-fill: #f1ebf8;
	--explainer-standard-stroke: #6b3fa0;
	--explainer-meaning-fill: #00b5b8;
	--explainer-meaning-ink: #072a6c;
	--explainer-ontology-fill: #e0f6f6;
	--explainer-ontology-stroke: #00797c;
	--explainer-line: #4b5563;
	background: var(--explainer-surface);
	color: var(--explainer-ink);
	border-radius: 12px;
	display: flex;
	flex-direction: column;
	max-height: 100%;
	overflow: hidden;
}
@media (prefers-color-scheme: dark) {
	.meaning-explainer-panel {
		--explainer-surface: #111827;
		--explainer-ink: #f3f4f6;
		--explainer-quiet-ink: #cbd5e1;
		--explainer-standard-fill: #2e1f45;
		--explainer-standard-stroke: #b794e6;
		--explainer-meaning-fill: #00b5b8;
		--explainer-meaning-ink: #04121f;
		--explainer-ontology-fill: #0b3536;
		--explainer-ontology-stroke: #5fd3d5;
		--explainer-line: #cbd5e1;
	}
	.meaning-explainer-panel .meaning-explainer-close {
		color: #f3f4f6;
	}
}
.meaning-explainer-head {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding: 16px 16px 8px 24px;
}
.meaning-explainer-title {
	margin: 0;
	/* ⟪review S1⟫ the panel's own ink, so the site's heading colour cannot leave it dark on dark */
	color: var(--explainer-ink);
	font-family: 'DM Serif Display', Georgia, serif;
	font-weight: 400;
	font-size: 24px;
}
.meaning-explainer-body {
	padding: 0 24px 24px;
	overflow-y: auto;
}
.meaning-explainer-paragraph {
	margin: 0 0 12px;
	font-size: 15px;
	line-height: 1.55;
}
.meaning-explainer-figure {
	margin: 16px 0 0;
}
.meaning-explainer-diagram {
	width: 100%;
	height: auto;
	display: block;
}
.meaning-explainer-line {
	stroke: var(--explainer-line);
	stroke-width: 1.5;
}
.meaning-explainer-arrowhead {
	fill: var(--explainer-line);
}
.meaning-explainer-standard-box {
	fill: var(--explainer-standard-fill);
	stroke: var(--explainer-standard-stroke);
	stroke-width: 1.5;
}
.meaning-explainer-ontology-box {
	fill: var(--explainer-ontology-fill);
	stroke: var(--explainer-ontology-stroke);
	stroke-width: 1.5;
}
.meaning-explainer-meaning-box {
	fill: var(--explainer-meaning-fill);
}
.meaning-explainer-box-text {
	fill: var(--explainer-ink);
	font-size: 15px;
	text-anchor: middle;
	dominant-baseline: central;
}
.meaning-explainer-meaning-text {
	fill: var(--explainer-meaning-ink);
	font-weight: 700;
	font-size: 17px;
}
.meaning-explainer-caption {
	margin-top: 8px;
	font-size: 13px;
	color: var(--explainer-quiet-ink);
	text-align: center;
}
@media (max-width: 600px) {
	.meaning-explainer-panel {
		border-radius: 0;
	}
	.meaning-explainer-head {
		padding: 12px 8px 4px 16px;
	}
	.meaning-explainer-body {
		padding: 0 16px 16px;
	}
}
</style>
