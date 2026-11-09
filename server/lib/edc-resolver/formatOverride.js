'use strict';

// formatOverride — ?format=json or ?format=html chooses the form of an /edc answer over the Accept header (WORKORDER-edcHumanPages-110926), so a person in a browser can
// see the machine form and a script can fetch the page. PURE.
//
//   formatOverrideOf({ edcRequestPath, answerFormatList }) → { edcRequestPath, overrideFormat? } | { refusalText }
//     edcRequestPath comes back with every format part taken out and every other part kept VERBATIM, in order (the resolver reads ?page=N itself, and a kind that
//     takes no query refuses one, so format must never reach it). No format part: no overrideFormat. A value not in answerFormatList, an empty one, or format given
//     twice is refused by name. The value is compared as written: it is never decoded, so format=%6Ason is refused, not read as json.

const FORMAT_PARAMETER_NAME = 'format';

const formatOverrideOf = ({ edcRequestPath, answerFormatList }) => {
	const queryStartIndex = edcRequestPath.indexOf('?');
	if (queryStartIndex === -1) {
		return { edcRequestPath };
	}
	const pathText = edcRequestPath.slice(0, queryStartIndex);
	const queryPartList = edcRequestPath.slice(queryStartIndex + 1).split('&');
	const isFormatPart = (queryPart) => queryPart.split('=')[0] === FORMAT_PARAMETER_NAME;
	const formatPartList = queryPartList.filter(isFormatPart);
	if (formatPartList.length === 0) {
		return { edcRequestPath };
	}
	if (formatPartList.length > 1) {
		return { refusalText: `${FORMAT_PARAMETER_NAME} is given ${formatPartList.length} times; give it once, as one of ${answerFormatList.join(', ')}` };
	}
	const [formatPart] = formatPartList;
	const formatText = formatPart.indexOf('=') === -1 ? '' : formatPart.slice(formatPart.indexOf('=') + 1);
	if (!answerFormatList.includes(formatText)) {
		return { refusalText: `${FORMAT_PARAMETER_NAME}='${formatText}' is not a form this resolver answers; give one of ${answerFormatList.join(', ')}` };
	}
	const keptPartList = queryPartList.filter((queryPart) => !isFormatPart(queryPart));
	return { edcRequestPath: keptPartList.length === 0 ? pathText : `${pathText}?${keptPartList.join('&')}`, overrideFormat: formatText };
};

module.exports = { formatOverrideOf, FORMAT_PARAMETER_NAME };
