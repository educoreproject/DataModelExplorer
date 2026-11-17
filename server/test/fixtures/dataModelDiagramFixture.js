'use strict';
// dataModelDiagramFixture — CASE 1.1 as the graph held it on 2026-11-17 (read through the standard-data-model mapper's queries): every
// class and every property (type, required, the class of CASE it refers to, mapped to a hub), and one class (CFDocumentDType) with its
// neighbours. Used by data-model-diagram.test.js, which needs no graph.

// per class, one property a line: name|dataType|required (1/0)|the class it refers to|mapped (1/0)
const propertyTextByClassName = {
	CFAssociationDType: 'sequenceNumber|integer|0||0 destinationNodeURI||1|LinkGenURIDType|1 notes|string|0||0 identifier|string|1||0 CFDocumentURI||0|LinkURIDType|0 CFAssociationGroupingURI||0|LinkURIDType|1 lastChangeDateTime|string|1||0 uri|string|1||1 associationType||1||1 extensions||0|CFAssociationExtensionDType|0 originNodeURI||1|LinkGenURIDType|1',
	CFAssociationExtensionDType: '',
	CFAssociationGroupingDType: 'description|string|0||0 identifier|string|1||0 lastChangeDateTime|string|1||0 extensions||0|CFAssociationGroupingExtensionDType|0 uri|string|1||1 title|string|1||0',
	CFAssociationGroupingExtensionDType: '',
	CFAssociationSetDType: 'CFAssociations|array|1|CFPckgAssociationDType|0 CFItem||1|CFItemDType|0',
	CFConceptDType: 'title|string|1||1 description|string|0||0 uri|string|1||1 identifier|string|1||1 extensions||0|CFConceptExtensionDType|0 hierarchyCode|string|1||1 lastChangeDateTime|string|1||0 keywords|string|0||1',
	CFConceptExtensionDType: '',
	CFConceptSetDType: 'CFConcepts|array|1|CFConceptDType|0',
	CFDefinitionDType: 'CFItemTypes|array|0|CFItemTypeDType|0 CFConcepts|array|0|CFConceptDType|0 CFAssociationGroupings|array|0|CFAssociationGroupingDType|0 CFLicenses|array|0|CFLicenseDType|0 CFSubjects|array|0|CFSubjectDType|1 extensions||0|CFDefinitionExtensionDType|0',
	CFDefinitionExtensionDType: '',
	CFDocumentDType: 'identifier|string|1||1 notes|string|0||0 language|string|0||1 statusEndDate|string|0||0 publisher|string|0||1 version|string|0||0 officialSourceURL|string|0||1 licenseURI||0|LinkURIDType|1 lastChangeDateTime|string|1||0 title|string|1||0 extensions||0|CFDocumentExtensionDType|0 uri|string|1||1 statusStartDate|string|0||0 subjectURI|array|0|LinkURIDType|0 adoptionStatus|string|0||1 description|string|0||0 creator|string|1||1 caseVersion|string|0||0 frameworkType|string|0||1 subject|array|0||0 CFPackageURI||1|LinkURIDType|0',
	CFDocumentExtensionDType: '',
	CFDocumentSetDType: 'CFDocuments|array|1|CFDocumentDType|0',
	CFItemDType: 'alternativeLabel|string|0||1 CFItemTypeURI||0|LinkURIDType|0 lastChangeDateTime|string|1||0 CFItemType|string|0||1 subjectURI|array|0|LinkURIDType|0 statusStartDate|string|0||1 conceptKeywordsURI||0|LinkURIDType|0 statusEndDate|string|0||1 conceptKeywords|array|0||1 identifier|string|1||1 notes|string|0||1 listEnumeration|string|0||1 uri|string|1||1 subject|array|0||1 abbreviatedStatement|string|0||0 educationLevel|array|0||1 extensions||0|CFItemExtensionDType|0 language|string|0||1 CFDocumentURI||1|LinkURIDType|0 licenseURI||0|LinkURIDType|1 fullStatement|string|1||1 humanCodingScheme|string|0||1',
	CFItemExtensionDType: '',
	CFItemTypeDType: 'identifier|string|1||0 description|string|1||1 uri|string|1||1 typeCode|string|0||0 title|string|1||1 hierarchyCode|string|1||1 lastChangeDateTime|string|1||0 extensions||0|CFItemTypeExtensionDType|0',
	CFItemTypeExtensionDType: '',
	CFItemTypeSetDType: 'CFItemTypes|array|1|CFItemTypeDType|0',
	CFLicenseDType: 'licenseText|string|1||1 description|string|0||1 extensions||0|CFLicenseExtensionDType|0 lastChangeDateTime|string|1||0 uri|string|1||1 title|string|1||1 identifier|string|1||1',
	CFLicenseExtensionDType: '',
	CFPackageDType: 'CFDocument||1|CFPckgDocumentDType|0 CFDefinitions||0|CFDefinitionDType|0 CFRubrics|array|0|CFRubricDType|0 CFAssociations|array|0|CFPckgAssociationDType|1 CFItems|array|0|CFPckgItemDType|0 extensions||0|CFPackageExtensionDType|0',
	CFPackageExtensionDType: '',
	CFPckgAssociationDType: 'destinationNodeURI||1|LinkGenURIDType|1 identifier|string|1||0 associationType||1||1 extensions||0|CFAssociationExtensionDType|0 CFAssociationGroupingURI||0|LinkURIDType|1 originNodeURI||1|LinkGenURIDType|1 uri|string|1||1 sequenceNumber|integer|0||0 lastChangeDateTime|string|1||0 notes|string|0||0',
	CFPckgDocumentDType: 'subjectURI|array|0|LinkURIDType|0 notes|string|0||0 creator|string|1||1 statusEndDate|string|0||1 uri|string|1||1 adoptionStatus|string|0||1 licenseURI||0|LinkURIDType|1 language|string|0||1 statusStartDate|string|0||0 frameworkType|string|0||1 identifier|string|1||1 publisher|string|0||1 extensions||0|CFDocumentExtensionDType|0 title|string|1||0 officialSourceURL|string|0||1 version|string|0||0 description|string|0||1 caseVersion|string|0||0 subject|array|0||0 lastChangeDateTime|string|1||0',
	CFPckgItemDType: 'identifier|string|1||1 extensions||0|CFItemExtensionDType|0 CFItemType|string|0||1 alternativeLabel|string|0||1 CFItemTypeURI||0|LinkURIDType|0 language|string|0||1 statusEndDate|string|0||1 subject|array|0||1 conceptKeywordsURI||0|LinkURIDType|0 humanCodingScheme|string|0||1 notes|string|0||1 fullStatement|string|1||1 statusStartDate|string|0||1 licenseURI||0|LinkURIDType|1 abbreviatedStatement|string|0||0 subjectURI|array|0|LinkURIDType|0 conceptKeywords|array|0||1 lastChangeDateTime|string|1||0 educationLevel|array|0||1 listEnumeration|string|0||1 uri|string|1||1',
	CFRubricCriterionDType: 'category|string|0||1 position|integer|0||1 identifier|string|1||0 lastChangeDateTime|string|1||0 description|string|0||1 rubricId|string|0||1 extensions||0|CFRubricCriterionExtensionDType|0 CFRubricCriterionLevels|array|0|CFRubricCriterionLevelDType|1 CFItemURI||0|LinkURIDType|0 uri|string|1||0 weight|number|0||1',
	CFRubricCriterionExtensionDType: '',
	CFRubricCriterionLevelDType: 'quality|string|0||1 feedback|string|0||1 position|integer|0||1 score|number|0||1 uri|string|1||0 description|string|0||1 rubricCriterionId|string|0||0 lastChangeDateTime|string|1||0 extensions|array|0|CFRubricCriterionLevelExtensionDType|0 identifier|string|1||1',
	CFRubricCriterionLevelExtensionDType: '',
	CFRubricDType: 'description|string|0||1 extensions||0|CFRubricExtensionDType|0 uri|string|1||1 CFRubricCriteria|array|0|CFRubricCriterionDType|1 lastChangeDateTime|string|1||0 identifier|string|1||0 title|string|0||1',
	CFRubricExtensionDType: '',
	CFSubjectDType: 'description|string|0||1 identifier|string|1||0 extensions||0|CFSubjectExtensionDType|0 title|string|1||0 uri|string|1||1 hierarchyCode|string|1||1 lastChangeDateTime|string|1||0',
	CFSubjectExtensionDType: '',
	CFSubjectSetDType: 'CFSubjects|array|1|CFSubjectDType|1',
	LinkGenURIDType: 'title|string|1||0 targetType||0||1 uri|string|1||1 identifier|string|1||0',
	LinkURIDType: 'title|string|1||0 uri|string|1||1 identifier|string|1||0',
	imsx_CodeMinorDType: 'imsx_codeMinorField|array|1|imsx_CodeMinorFieldDType|0',
	imsx_CodeMinorFieldDType: 'imsx_codeMinorFieldName|string|1||1 imsx_codeMinorFieldValue|string|1||0',
	imsx_StatusInfoDType: 'imsx_severity|string|1||0 imsx_codeMajor|string|1||0 imsx_description|string|0||0 imsx_codeMinor||0|imsx_CodeMinorDType|0',
};

const standard = { stableId: 'case:root', name: 'CASE', version: '1.1', source: 'CASE' };
const stableIdOf = (className) => `case:${className}`;

const classList = Object.keys(propertyTextByClassName).map((className) => ({ stableId: stableIdOf(className), name: className, source: 'CASE' }));

// the standard-data-model mapper's standardPropertyList rows
const propertyList = Object.entries(propertyTextByClassName).flatMap(([className, propertyText]) =>
	propertyText
		.split(' ')
		.filter(Boolean)
		.map((oneLine) => {
			const [name, dataType, isRequiredText, referencedClassName, isMappedText] = oneLine.split('|');
			return {
				classStableId: stableIdOf(className),
				name,
				dataType: dataType || null,
				isRequired: isRequiredText === '1',
				referencedClassStableId: referencedClassName ? stableIdOf(referencedClassName) : null,
				referencedClassName: referencedClassName || null,
				isMapped: isMappedText === '1',
			};
		}),
);

// CFDocumentDType alone, for the class map
const documentClass = {
	focusClass: { stableId: stableIdOf('CFDocumentDType'), name: 'CFDocumentDType', source: 'CASE' },
	propertyList: propertyList.filter((oneProperty) => oneProperty.classStableId === stableIdOf('CFDocumentDType')),
	neighbourList: [
		{ stableId: stableIdOf('LinkURIDType'), name: 'LinkURIDType', source: 'CASE', direction: 'refersTo', propertyNameList: ['licenseURI', 'subjectURI', 'CFPackageURI'], isOtherStandard: false },
		{ stableId: stableIdOf('CFDocumentExtensionDType'), name: 'CFDocumentExtensionDType', source: 'CASE', direction: 'refersTo', propertyNameList: ['extensions'], isOtherStandard: false },
		{ stableId: stableIdOf('CFDocumentSetDType'), name: 'CFDocumentSetDType', source: 'CASE', direction: 'referredBy', propertyNameList: ['CFDocuments'], isOtherStandard: false },
	],
};

module.exports = { standard, classList, propertyList, documentClass };
