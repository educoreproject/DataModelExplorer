'use strict';

// documentRenderer.js — one document model, two renderings (markdown and a self-contained HTML page), so the report and
// the certificates say exactly the same thing in both forms. The builders (reportBuilder.js, certificateBuilder.js) write
// blocks; they never write markup.
//
// @interface DocumentBlock — every block is one of BLOCK_KIND_LIST:
//   { blockKind: 'heading', headingLevel: 1-4, text }
//   { blockKind: 'paragraph', text }
//   { blockKind: 'list', itemTextList }
//   { blockKind: 'table', columnList: [{ titleText, alignName: 'left' | 'right' }], rowList: [[cellText, ...]] }
//   { blockKind: 'callout', text }            a highlighted note (blockquote in markdown)
//   { blockKind: 'stamp', fieldList: [{ labelText, valueText }] }   the build stamp
// Inline text may carry **bold** and `code`; nothing else is interpreted.
//
// @interface BlockRendererSet — one per format in RENDERER_SET_BY_FORMAT_NAME:
//   renderBlock[blockKind](block) -> text;  wrapDocument({ titleText, bodyText, pageKindName }) -> text
//
//   renderDocument({ formatName, titleText, blockList, pageKindName }) -> text   (an unknown format or block kind throws)

const BLOCK_KIND_LIST = Object.freeze(['heading', 'paragraph', 'list', 'table', 'callout', 'stamp']);

const escapeHtml = (plainText) => `${plainText}`.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const inlineHtmlOf = (inlineText) => escapeHtml(inlineText).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/`([^`]+)`/g, '<code>$1</code>');
const markdownCellOf = (cellText) => `${cellText}`.replace(/\|/g, '\\|').replace(/\n/g, ' ');

const MARKDOWN_RENDERER_SET = Object.freeze({
	renderBlock: Object.freeze({
		heading: (block) => `${'#'.repeat(block.headingLevel)} ${block.text}`,
		paragraph: (block) => block.text,
		list: (block) => block.itemTextList.map((itemText) => `- ${itemText}`).join('\n'),
		table: (block) => [
			`| ${block.columnList.map((oneColumn) => markdownCellOf(oneColumn.titleText)).join(' | ')} |`,
			`|${block.columnList.map((oneColumn) => (oneColumn.alignName === 'right' ? '---:' : ':---')).join('|')}|`,
			...block.rowList.map((cellList) => `| ${cellList.map(markdownCellOf).join(' | ')} |`),
		].join('\n'),
		callout: (block) => `> ${block.text.split('\n').join('\n> ')}`,
		stamp: (block) => block.fieldList.map((oneField) => `- **${oneField.labelText}:** ${oneField.valueText}`).join('\n'),
	}),
	wrapDocument: ({ titleText, bodyText }) => `# ${titleText}\n\n${bodyText}\n`,
});

const PAGE_STYLE_TEXT = `
:root { --ink: #1d2430; --muted: #5b6573; --line: #d8dde4; --panel: #f5f7fa; --accent: #2f5d8a; --page: #ffffff; --callout: #fff8e6; --calloutLine: #e0b84f; }
@media (prefers-color-scheme: dark) { :root { --ink: #e6e9ee; --muted: #a3adbb; --line: #3a4350; --panel: #20262f; --accent: #8cb4e0; --page: #14181e; --callout: #2b2618; --calloutLine: #9c7d2c; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--page); color: var(--ink); font: 16px/1.55 -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; }
main { max-width: 980px; margin: 0 auto; padding: 32px 16px 64px; }
h1 { font-size: 1.9rem; margin: 0 0 8px; } h2 { font-size: 1.35rem; margin: 36px 0 8px; border-bottom: 1px solid var(--line); padding-bottom: 4px; }
h3 { font-size: 1.1rem; margin: 24px 0 6px; } h4 { font-size: 1rem; margin: 18px 0 4px; color: var(--muted); }
.tableWrap { overflow-x: auto; margin: 8px 0 16px; }
table { border-collapse: collapse; font-size: 0.9rem; min-width: 60%; }
th, td { border-bottom: 1px solid var(--line); padding: 5px 10px; vertical-align: top; } th { background: var(--panel); text-align: left; }
td.right, th.right { text-align: right; font-variant-numeric: tabular-nums; }
code { font: 0.85em ui-monospace, Menlo, monospace; background: var(--panel); padding: 1px 4px; border-radius: 3px; overflow-wrap: anywhere; }
.callout { background: var(--callout); border-left: 4px solid var(--calloutLine); padding: 10px 14px; margin: 12px 0; }
.stamp { background: var(--panel); border: 1px solid var(--line); border-radius: 6px; padding: 10px 16px; font-size: 0.88rem; }
.stamp dl { display: grid; grid-template-columns: max-content 1fr; gap: 2px 14px; margin: 0; } .stamp dt { color: var(--muted); } .stamp dd { margin: 0; overflow-wrap: anywhere; }
.certificate main { max-width: 820px; } .certificate h1 { color: var(--accent); }
@media print { body { background: #fff; color: #000; } .certificate main { padding-top: 0; } }
`;

const HTML_RENDERER_SET = Object.freeze({
	renderBlock: Object.freeze({
		heading: (block) => `<h${block.headingLevel}>${inlineHtmlOf(block.text)}</h${block.headingLevel}>`,
		paragraph: (block) => `<p>${inlineHtmlOf(block.text)}</p>`,
		list: (block) => `<ul>${block.itemTextList.map((itemText) => `<li>${inlineHtmlOf(itemText)}</li>`).join('')}</ul>`,
		table: (block) => `<div class="tableWrap"><table><thead><tr>${block.columnList.map((oneColumn) => `<th class="${oneColumn.alignName}">${inlineHtmlOf(oneColumn.titleText)}</th>`).join('')}</tr></thead><tbody>${block.rowList
			.map((cellList) => `<tr>${cellList.map((cellText, columnIndex) => `<td class="${block.columnList[columnIndex].alignName}">${inlineHtmlOf(cellText)}</td>`).join('')}</tr>`)
			.join('')}</tbody></table></div>`,
		callout: (block) => `<div class="callout">${block.text.split('\n').map(inlineHtmlOf).join('<br>')}</div>`,
		stamp: (block) => `<div class="stamp"><dl>${block.fieldList.map((oneField) => `<dt>${inlineHtmlOf(oneField.labelText)}</dt><dd>${inlineHtmlOf(oneField.valueText)}</dd>`).join('')}</dl></div>`,
	}),
	wrapDocument: ({ titleText, bodyText, pageKindName }) =>
		`<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(titleText)}</title><style>${PAGE_STYLE_TEXT}</style></head>\n<body class="${pageKindName}"><main><h1>${inlineHtmlOf(titleText)}</h1>\n${bodyText}\n</main></body></html>\n`,
});

const RENDERER_SET_BY_FORMAT_NAME = Object.freeze({ markdown: MARKDOWN_RENDERER_SET, html: HTML_RENDERER_SET });

const renderDocument = ({ formatName, titleText, blockList, pageKindName }) => {
	const rendererSet = RENDERER_SET_BY_FORMAT_NAME[formatName];
	if (!rendererSet) {
		throw new Error(`documentRenderer: unknown format '${formatName}'; known: ${Object.keys(RENDERER_SET_BY_FORMAT_NAME).join(', ')}`);
	}
	const bodyText = blockList
		.map((block) => {
			if (BLOCK_KIND_LIST.indexOf(block.blockKind) === -1) {
				throw new Error(`documentRenderer: unknown block kind '${block.blockKind}'; known: ${BLOCK_KIND_LIST.join(', ')}`);
			}
			return rendererSet.renderBlock[block.blockKind](block);
		})
		.join('\n\n');
	return rendererSet.wrapDocument({ titleText, bodyText, pageKindName });
};

module.exports = { renderDocument, BLOCK_KIND_LIST, RENDERER_SET_BY_FORMAT_NAME };
