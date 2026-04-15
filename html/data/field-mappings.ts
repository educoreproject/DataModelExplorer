// fieldMappings.js — Field-level crosswalk between education standards.
// Source: https://github.com/fibonacciskills/skills_api_translation/blob/main/field_mapping.csv
// Extended with Open Badges 3.0 and CLR 2.0 field mappings.

export const specLabels = {
  'case-1.1': 'CASE 1.1 (1EdTech)',
  'ieee-scd': 'IEEE 1484.20.3 SCD',
  'asn-ctdl': 'ASN / CE CTDL-ASN',
  'ob3':      'Open Badges 3.0',
  'clr-2.0':  'CLR Standard 2.0',
  'lif-2.0':  'LIF 2.0',
};

// Each entry maps a conceptual field across specs.
// matchStrength: 'equivalent' | 'close' | 'related'
export const fieldMappings = [
  // ──────────────────────────────────────────────────────────
  // CFDocument / Framework-level fields
  // ──────────────────────────────────────────────────────────
  {
    concept: 'Framework Identifier',
    entityType: 'CFDocument → CompetencyFramework',
    mappings: {
      'case-1.1':  { field: 'identifier',         path: 'CFDocument.identifier' },
      'ieee-scd':  { field: '@id',                 path: 'CompetencyFramework.@id' },
      'asn-ctdl':  { field: 'ceasn:identifier',    path: 'CompetencyFramework.ceasn:identifier' },
      'ob3':       { field: 'id',                  path: 'OpenBadgeCredential.id' },
      'clr-2.0':   { field: 'id',                  path: 'ClrCredential.id' },
    },
    matchStrength: 'equivalent',
    notes: 'Used to generate @id IRI (same in both SCD and CTDL formats)',
  },
  {
    concept: 'Framework URI',
    entityType: 'CFDocument → CompetencyFramework',
    mappings: {
      'case-1.1':  { field: 'uri',                 path: 'CFDocument.uri' },
      'ieee-scd':  { field: '@id',                 path: 'CompetencyFramework.@id' },
      'asn-ctdl':  { field: '@id',                 path: 'CompetencyFramework.@id' },
      'ob3':       { field: 'id',                  path: 'OpenBadgeCredential.id' },
      'clr-2.0':   { field: 'id',                  path: 'ClrCredential.id' },
    },
    matchStrength: 'equivalent',
    notes: 'Used as @id IRI if provided',
  },
  {
    concept: 'Framework Title / Name',
    entityType: 'CFDocument → CompetencyFramework',
    mappings: {
      'case-1.1':  { field: 'title',               path: 'CFDocument.title' },
      'ieee-scd':  { field: 'scd:name',             path: 'CompetencyFramework.scd:name' },
      'asn-ctdl':  { field: 'ceasn:name',           path: 'CompetencyFramework.ceasn:name' },
      'ob3':       { field: 'name',                 path: 'Achievement.name' },
      'clr-2.0':   { field: 'name',                 path: 'ClrCredential.name' },
    },
    matchStrength: 'equivalent',
    notes: 'Direct mapping — same concept, different namespace',
  },
  {
    concept: 'Framework Description',
    entityType: 'CFDocument → CompetencyFramework',
    mappings: {
      'case-1.1':  { field: 'description',          path: 'CFDocument.description' },
      'ieee-scd':  { field: 'scd:description',      path: 'CompetencyFramework.scd:description' },
      'asn-ctdl':  { field: 'ceasn:description',    path: 'CompetencyFramework.ceasn:description' },
      'ob3':       { field: 'description',           path: 'Achievement.description' },
      'clr-2.0':   { field: 'description',           path: 'ClrCredential.description' },
    },
    matchStrength: 'equivalent',
    notes: 'Direct mapping (same in all formats)',
  },
  {
    concept: 'Language',
    entityType: 'CFDocument → CompetencyFramework',
    mappings: {
      'case-1.1':  { field: 'language',             path: 'CFDocument.language' },
      'ieee-scd':  { field: 'scd:language',         path: 'CompetencyFramework.scd:language' },
      'asn-ctdl':  { field: 'ceasn:inLanguage',     path: 'CompetencyFramework.ceasn:inLanguage' },
    },
    matchStrength: 'equivalent',
    notes: 'IEEE SCD: language; ASN-CTDL: inLanguage',
  },
  {
    concept: 'Version',
    entityType: 'CFDocument → CompetencyFramework',
    mappings: {
      'case-1.1':  { field: 'version',              path: 'CFDocument.version' },
      'ieee-scd':  { field: 'scd:version',          path: 'CompetencyFramework.scd:version' },
    },
    matchStrength: 'close',
    notes: 'IEEE SCD: version; ASN-CTDL: no direct equivalent',
  },
  {
    concept: 'Date Modified',
    entityType: 'CFDocument → CompetencyFramework',
    mappings: {
      'case-1.1':  { field: 'lastChangeDateTime',   path: 'CFDocument.lastChangeDateTime' },
      'ieee-scd':  { field: 'scd:dateModified',     path: 'CompetencyFramework.scd:dateModified' },
      'asn-ctdl':  { field: 'ceasn:dateModified',   path: 'CompetencyFramework.ceasn:dateModified' },
    },
    matchStrength: 'equivalent',
    notes: 'Direct mapping (same in both formats)',
  },
  {
    concept: 'Publisher',
    entityType: 'CFDocument → CompetencyFramework',
    mappings: {
      'case-1.1':  { field: 'publisher',            path: 'CFDocument.publisher' },
      'ieee-scd':  { field: 'scd:publisher',        path: 'CompetencyFramework.scd:publisher' },
      'asn-ctdl':  { field: 'ceasn:publisher',      path: 'CompetencyFramework.ceasn:publisher' },
      'ob3':       { field: 'issuer',                path: 'OpenBadgeCredential.issuer' },
      'clr-2.0':   { field: 'issuer',                path: 'ClrCredential.issuer' },
    },
    matchStrength: 'close',
    notes: 'OB3/CLR use issuer (a Profile object) rather than publisher string',
  },
  {
    concept: 'Official Source URL',
    entityType: 'CFDocument → CompetencyFramework',
    mappings: {
      'case-1.1':  { field: 'officialSourceURL',    path: 'CFDocument.officialSourceURL' },
      'ieee-scd':  { field: 'scd:url',              path: 'CompetencyFramework.scd:url' },
      'asn-ctdl':  { field: 'ceasn:source',         path: 'CompetencyFramework.ceasn:source' },
    },
    matchStrength: 'equivalent',
    notes: 'IEEE SCD: url; ASN-CTDL: source',
  },
  {
    concept: 'Adoption / Publication Status',
    entityType: 'CFDocument → CompetencyFramework',
    mappings: {
      'case-1.1':  { field: 'adoptionStatus',       path: 'CFDocument.adoptionStatus' },
      'asn-ctdl':  { field: 'ceasn:publicationStatusType', path: 'CompetencyFramework.ceasn:publicationStatusType' },
    },
    matchStrength: 'close',
    notes: 'IEEE SCD: no equivalent; ASN-CTDL: publicationStatusType',
  },
  {
    concept: 'Education Level (Framework)',
    entityType: 'CFDocument → CompetencyFramework',
    mappings: {
      'case-1.1':  { field: 'educationLevel',       path: 'CFDocument.educationLevel' },
      'asn-ctdl':  { field: 'ceasn:educationLevelType', path: 'CompetencyFramework.ceasn:educationLevelType' },
    },
    matchStrength: 'close',
    notes: 'IEEE SCD: no equivalent at framework level; ASN-CTDL: educationLevelType',
  },
  {
    concept: 'Subject',
    entityType: 'CFDocument → CompetencyFramework',
    mappings: {
      'case-1.1':  { field: 'subject',              path: 'CFDocument.subject' },
      'asn-ctdl':  { field: 'ceasn:localSubject',   path: 'CompetencyFramework.ceasn:localSubject' },
    },
    matchStrength: 'close',
    notes: 'IEEE SCD: no equivalent; ASN-CTDL: localSubject',
  },
  {
    concept: 'Rights',
    entityType: 'CFDocument → CompetencyFramework',
    mappings: {
      'case-1.1':  { field: 'rights',               path: 'CFDocument.rights' },
      'asn-ctdl':  { field: 'ceasn:rights',         path: 'CompetencyFramework.ceasn:rights' },
    },
    matchStrength: 'equivalent',
    notes: 'IEEE SCD: no equivalent; ASN-CTDL: rights',
  },
  {
    concept: 'License',
    entityType: 'CFDocument → CompetencyFramework',
    mappings: {
      'case-1.1':  { field: 'license',              path: 'CFDocument.license' },
      'asn-ctdl':  { field: 'ceasn:license',        path: 'CompetencyFramework.ceasn:license' },
    },
    matchStrength: 'equivalent',
    notes: 'IEEE SCD: no equivalent; ASN-CTDL: license',
  },
  {
    concept: 'Notes / Comments (Framework)',
    entityType: 'CFDocument → CompetencyFramework',
    mappings: {
      'case-1.1':  { field: 'notes',                path: 'CFDocument.notes' },
      'asn-ctdl':  { field: 'ceasn:comment',        path: 'CompetencyFramework.ceasn:comment' },
    },
    matchStrength: 'close',
    notes: 'IEEE SCD: no equivalent; ASN-CTDL: comment',
  },

  // ──────────────────────────────────────────────────────────
  // CFItem / Competency-level fields
  // ──────────────────────────────────────────────────────────
  {
    concept: 'Competency Identifier',
    entityType: 'CFItem → CompetencyDefinition',
    mappings: {
      'case-1.1':  { field: 'identifier',           path: 'CFItem.identifier' },
      'ieee-scd':  { field: '@id',                  path: 'CompetencyDefinition.@id' },
      'ob3':       { field: 'id',                   path: 'Achievement.id' },
      'clr-2.0':   { field: 'id',                   path: 'Achievement.id' },
    },
    matchStrength: 'equivalent',
    notes: 'Used to generate @id IRI',
  },
  {
    concept: 'Competency URI',
    entityType: 'CFItem → CompetencyDefinition',
    mappings: {
      'case-1.1':  { field: 'uri',                  path: 'CFItem.uri' },
      'ieee-scd':  { field: '@id',                  path: 'CompetencyDefinition.@id' },
    },
    matchStrength: 'equivalent',
    notes: 'Used as @id IRI if provided',
  },
  {
    concept: 'Full Statement / Competency Text',
    entityType: 'CFItem → CompetencyDefinition',
    mappings: {
      'case-1.1':  { field: 'fullStatement',        path: 'CFItem.fullStatement' },
      'ieee-scd':  { field: 'scd:statement',        path: 'CompetencyDefinition.scd:statement' },
      'asn-ctdl':  { field: 'ceasn:competencyText', path: 'Competency.ceasn:competencyText' },
      'ob3':       { field: 'criteria.narrative',    path: 'Achievement.criteria.narrative' },
    },
    matchStrength: 'equivalent',
    notes: 'IEEE SCD: statement; ASN-CTDL: competencyText; OB3: criteria.narrative',
  },
  {
    concept: 'Abbreviated Statement / Label',
    entityType: 'CFItem → CompetencyDefinition',
    mappings: {
      'case-1.1':  { field: 'abbreviatedStatement', path: 'CFItem.abbreviatedStatement' },
      'ieee-scd':  { field: 'scd:abbreviatedStatement', path: 'CompetencyDefinition.scd:abbreviatedStatement' },
      'asn-ctdl':  { field: 'ceasn:competencyLabel', path: 'Competency.ceasn:competencyLabel' },
      'ob3':       { field: 'name',                  path: 'Achievement.name' },
    },
    matchStrength: 'equivalent',
    notes: 'IEEE SCD: abbreviatedStatement; ASN-CTDL: competencyLabel; OB3: name',
  },
  {
    concept: 'Alternative Label',
    entityType: 'CFItem → CompetencyDefinition',
    mappings: {
      'case-1.1':  { field: 'alternativeLabel',     path: 'CFItem.alternativeLabel' },
      'ieee-scd':  { field: 'scd:alternativeLabel', path: 'CompetencyDefinition.scd:alternativeLabel' },
      'asn-ctdl':  { field: 'skos:altLabel',        path: 'Competency.skos:altLabel' },
    },
    matchStrength: 'equivalent',
    notes: 'IEEE SCD: alternativeLabel; ASN-CTDL: skos:altLabel',
  },
  {
    concept: 'Concept Keywords',
    entityType: 'CFItem → CompetencyDefinition',
    mappings: {
      'case-1.1':  { field: 'conceptKeywords',      path: 'CFItem.conceptKeywords' },
      'ieee-scd':  { field: 'scd:conceptKeyword',   path: 'CompetencyDefinition.scd:conceptKeyword' },
      'asn-ctdl':  { field: 'ceasn:conceptKeyword', path: 'Competency.ceasn:conceptKeyword' },
      'ob3':       { field: 'tag',                   path: 'Achievement.tag' },
    },
    matchStrength: 'equivalent',
    notes: 'Direct mapping (array). OB3 uses tag for similar purpose',
  },
  {
    concept: 'Hierarchy Code',
    entityType: 'CFItem → CompetencyDefinition',
    mappings: {
      'case-1.1':  { field: 'hierarchyCode',        path: 'CFItem.hierarchyCode' },
      'ieee-scd':  { field: 'scd:hierarchyCode',    path: 'CompetencyDefinition.scd:hierarchyCode' },
      'asn-ctdl':  { field: 'ceasn:codedNotation',  path: 'Competency.ceasn:codedNotation' },
    },
    matchStrength: 'equivalent',
    notes: 'IEEE SCD: hierarchyCode; ASN-CTDL: codedNotation',
  },
  {
    concept: 'Human Coding Scheme',
    entityType: 'CFItem → CompetencyDefinition',
    mappings: {
      'case-1.1':  { field: 'humanCodingScheme',    path: 'CFItem.humanCodingScheme' },
      'ieee-scd':  { field: 'scd:humanCodingScheme', path: 'CompetencyDefinition.scd:humanCodingScheme' },
      'asn-ctdl':  { field: 'ceasn:codedNotation',  path: 'Competency.ceasn:codedNotation' },
    },
    matchStrength: 'close',
    notes: 'ASN-CTDL: codedNotation (or altCodedNotation for secondary codes)',
  },
  {
    concept: 'Competency Category / Type',
    entityType: 'CFItem → CompetencyDefinition',
    mappings: {
      'case-1.1':  { field: 'CFItemType',           path: 'CFItem.CFItemType' },
      'ieee-scd':  { field: 'scd:competencyCategory', path: 'CompetencyDefinition.scd:competencyCategory' },
      'asn-ctdl':  { field: 'ceasn:competencyCategory', path: 'Competency.ceasn:competencyCategory' },
      'ob3':       { field: 'achievementType',       path: 'Achievement.achievementType' },
    },
    matchStrength: 'equivalent',
    notes: 'Direct mapping (same in both formats). OB3 uses achievementType',
  },
  {
    concept: 'Language (Competency)',
    entityType: 'CFItem → CompetencyDefinition',
    mappings: {
      'case-1.1':  { field: 'language',             path: 'CFItem.language' },
      'ieee-scd':  { field: 'scd:language',         path: 'CompetencyDefinition.scd:language' },
      'asn-ctdl':  { field: 'ceasn:inLanguage',     path: 'Competency.ceasn:inLanguage' },
    },
    matchStrength: 'equivalent',
    notes: 'IEEE SCD: language; ASN-CTDL: inLanguage',
  },
  {
    concept: 'Education Level (Competency)',
    entityType: 'CFItem → CompetencyDefinition',
    mappings: {
      'case-1.1':  { field: 'educationLevel',       path: 'CFItem.educationLevel' },
      'ieee-scd':  { field: 'scd:educationLevel',   path: 'CompetencyDefinition.scd:educationLevel' },
      'asn-ctdl':  { field: 'ceasn:educationLevelType', path: 'Competency.ceasn:educationLevelType' },
    },
    matchStrength: 'close',
    notes: 'IEEE SCD: educationLevel; ASN-CTDL: educationLevelType (expects skos:Concept)',
  },
  {
    concept: 'Concept Keywords URI',
    entityType: 'CFItem → CompetencyDefinition',
    mappings: {
      'case-1.1':  { field: 'conceptKeywordsUri',   path: 'CFItem.conceptKeywordsUri' },
      'asn-ctdl':  { field: 'ceasn:conceptTerm',    path: 'Competency.ceasn:conceptTerm' },
    },
    matchStrength: 'close',
    notes: 'IEEE SCD: no equivalent; ASN-CTDL: conceptTerm (skos:Concept)',
  },
  {
    concept: 'Notes / Comments (Competency)',
    entityType: 'CFItem → CompetencyDefinition',
    mappings: {
      'case-1.1':  { field: 'notes',                path: 'CFItem.notes' },
      'asn-ctdl':  { field: 'ceasn:comment',        path: 'Competency.ceasn:comment' },
    },
    matchStrength: 'close',
    notes: 'IEEE SCD: no equivalent; ASN-CTDL: comment',
  },

  // ──────────────────────────────────────────────────────────
  // CFAssociation / Relationship-level fields
  // ──────────────────────────────────────────────────────────
  {
    concept: 'Association Identifier',
    entityType: 'CFAssociation → ResourceAssociation',
    mappings: {
      'case-1.1':  { field: 'identifier',           path: 'CFAssociation.identifier' },
      'ieee-scd':  { field: '@id',                  path: 'ResourceAssociation.@id' },
    },
    matchStrength: 'equivalent',
    notes: 'Used to generate @id IRI',
  },
  {
    concept: 'Association URI',
    entityType: 'CFAssociation → ResourceAssociation',
    mappings: {
      'case-1.1':  { field: 'uri',                  path: 'CFAssociation.uri' },
      'ieee-scd':  { field: '@id',                  path: 'ResourceAssociation.@id' },
    },
    matchStrength: 'equivalent',
    notes: 'Used as @id IRI if provided',
  },
  {
    concept: 'Child Relationship (isChildOf)',
    entityType: 'CFAssociation → ResourceAssociation',
    mappings: {
      'case-1.1':  { field: 'associationType=isChildOf', path: 'CFAssociation.associationType' },
      'ieee-scd':  { field: 'scd:relationType=hasPart',  path: 'ResourceAssociation.scd:relationType' },
      'asn-ctdl':  { field: 'ceasn:isChildOf',           path: 'Competency.ceasn:isChildOf' },
    },
    matchStrength: 'equivalent',
    notes: 'IEEE SCD: hasPart (separate ResourceAssociation); ASN-CTDL: isChildOf (direct property)',
  },
  {
    concept: 'Precedes / Prerequisite',
    entityType: 'CFAssociation → ResourceAssociation',
    mappings: {
      'case-1.1':  { field: 'associationType=precedes',         path: 'CFAssociation.associationType' },
      'ieee-scd':  { field: 'scd:relationType=precedes',        path: 'ResourceAssociation.scd:relationType' },
      'asn-ctdl':  { field: 'ceasn:prerequisiteAlignment',      path: 'Competency.ceasn:prerequisiteAlignment' },
    },
    matchStrength: 'close',
    notes: 'IEEE SCD: precedes; ASN-CTDL: prerequisiteAlignment',
  },
  {
    concept: 'Skill Level / Progression',
    entityType: 'CFAssociation → ResourceAssociation',
    mappings: {
      'case-1.1':  { field: 'associationType=hasSkillLevel',    path: 'CFAssociation.associationType' },
      'ieee-scd':  { field: 'scd:relationType=competencyLevel', path: 'ResourceAssociation.scd:relationType' },
      'asn-ctdl':  { field: 'asn:hasProgressionLevel',          path: 'Competency.asn:hasProgressionLevel' },
    },
    matchStrength: 'close',
    notes: 'IEEE SCD: competencyLevel; ASN-CTDL: hasProgressionLevel (references progression model)',
  },
  {
    concept: 'Other Association Types',
    entityType: 'CFAssociation → ResourceAssociation',
    mappings: {
      'case-1.1':  { field: 'associationType (other)',  path: 'CFAssociation.associationType' },
      'ieee-scd':  { field: 'scd:relationType',         path: 'ResourceAssociation.scd:relationType' },
      'asn-ctdl':  { field: 'various alignment props',  path: 'Competency.ceasn:alignTo / ceasn:alignFrom' },
    },
    matchStrength: 'related',
    notes: 'IEEE SCD: unmapped types pass through; ASN-CTDL: various alignment properties',
  },
  {
    concept: 'Origin Node URI',
    entityType: 'CFAssociation → ResourceAssociation',
    mappings: {
      'case-1.1':  { field: 'originNodeURI',        path: 'CFAssociation.originNodeURI' },
      'ieee-scd':  { field: 'scd:sourceNode.@id',   path: 'ResourceAssociation.scd:sourceNode.@id' },
      'asn-ctdl':  { field: 'property on origin',   path: 'Competency (direct property)' },
    },
    matchStrength: 'close',
    notes: 'IEEE SCD: sourceNode in ResourceAssociation; ASN-CTDL: direct property on Competency',
  },
  {
    concept: 'Destination Node URI',
    entityType: 'CFAssociation → ResourceAssociation',
    mappings: {
      'case-1.1':  { field: 'destinationNodeURI',   path: 'CFAssociation.destinationNodeURI' },
      'ieee-scd':  { field: 'scd:targetNode.@id',   path: 'ResourceAssociation.scd:targetNode.@id' },
      'asn-ctdl':  { field: 'value of property',    path: 'Competency (value of relationship property)' },
    },
    matchStrength: 'close',
    notes: 'IEEE SCD: targetNode in ResourceAssociation; ASN-CTDL: value of relationship property',
  },
  {
    concept: 'Sequence Number',
    entityType: 'CFAssociation → ResourceAssociation',
    mappings: {
      'case-1.1':  { field: 'sequenceNumber',       path: 'CFAssociation.sequenceNumber' },
      'ieee-scd':  { field: 'scd:sequenceNumber',   path: 'ResourceAssociation.scd:sequenceNumber' },
      'asn-ctdl':  { field: 'ceasn:listID',         path: 'Competency.ceasn:listID' },
    },
    matchStrength: 'close',
    notes: 'IEEE SCD: sequenceNumber; ASN-CTDL: listID (alphanumeric position)',
  },
  {
    concept: 'Date Modified (Association)',
    entityType: 'CFAssociation → ResourceAssociation',
    mappings: {
      'case-1.1':  { field: 'lastChangeDateTime',   path: 'CFAssociation.lastChangeDateTime' },
      'ieee-scd':  { field: 'scd:dateModified',     path: 'ResourceAssociation.scd:dateModified' },
      'asn-ctdl':  { field: 'ceasn:dateModified',   path: 'Competency.ceasn:dateModified' },
    },
    matchStrength: 'equivalent',
    notes: 'Direct mapping (same in both formats)',
  },
  {
    concept: 'Document Reference (Association)',
    entityType: 'CFAssociation → ResourceAssociation',
    mappings: {
      'case-1.1':  { field: 'CFDocumentURI',        path: 'CFAssociation.CFDocumentURI' },
      'asn-ctdl':  { field: 'ceasn:isPartOf',       path: 'Competency.ceasn:isPartOf' },
    },
    matchStrength: 'close',
    notes: 'IEEE SCD: no equivalent; ASN-CTDL: isPartOf (framework reference)',
  },

  // ──────────────────────────────────────────────────────────
  // Format-specific / structural fields
  // ──────────────────────────────────────────────────────────
  {
    concept: 'Type Declaration (@type)',
    entityType: 'Format-Specific',
    mappings: {
      'ieee-scd':  { field: '@type',                path: '@type (scd:CompetencyFramework / scd:CompetencyDefinition / scd:ResourceAssociation)' },
      'asn-ctdl':  { field: '@type',                path: '@type (ceasn:CompetencyFramework / ceasn:Competency)' },
      'ob3':       { field: 'type',                 path: 'type: ["VerifiableCredential", "OpenBadgeCredential"]' },
      'clr-2.0':   { field: 'type',                 path: 'type: ["VerifiableCredential", "ClrCredential"]' },
    },
    matchStrength: 'equivalent',
    notes: 'All formats declare type; OB3/CLR use W3C VC type arrays',
  },
  {
    concept: 'Context Declaration (@context)',
    entityType: 'Format-Specific',
    mappings: {
      'ieee-scd':  { field: '@context',             path: '@context (scd namespace)' },
      'asn-ctdl':  { field: '@context',             path: '@context (ceasn + skos namespaces)' },
      'ob3':       { field: '@context',             path: '@context (W3C VC + OB3 context)' },
      'clr-2.0':   { field: '@context',             path: '@context (W3C VC + CLR context)' },
    },
    matchStrength: 'equivalent',
    notes: 'All use JSON-LD @context with different namespace URIs',
  },
  {
    concept: 'Graph Container (@graph)',
    entityType: 'Format-Specific',
    mappings: {
      'ieee-scd':  { field: '@graph',               path: '@graph' },
      'asn-ctdl':  { field: '@graph',               path: '@graph' },
    },
    matchStrength: 'equivalent',
    notes: 'Both SCD and CTDL use @graph to contain all translated entities',
  },
  {
    concept: 'Separate Association Objects',
    entityType: 'Format-Specific',
    mappings: {
      'ieee-scd':  { field: 'scd:ResourceAssociation', path: 'ResourceAssociation (separate objects)' },
      'asn-ctdl':  { field: 'direct properties',       path: 'Relationships are direct properties on Competency' },
    },
    matchStrength: 'related',
    notes: 'IEEE SCD: separate association objects; ASN-CTDL: relationships are direct properties on Competency',
  },
  {
    concept: 'Has Child (inverse)',
    entityType: 'Format-Specific',
    mappings: {
      'asn-ctdl':  { field: 'ceasn:hasChild',       path: 'CompetencyFramework.ceasn:hasChild' },
    },
    matchStrength: 'related',
    notes: 'ASN-CTDL only: inverse of isChildOf, indicates child competencies',
  },
  {
    concept: 'Alignment Properties',
    entityType: 'Format-Specific',
    mappings: {
      'asn-ctdl':  { field: 'ceasn:alignTo / ceasn:alignFrom', path: 'Competency.ceasn:alignTo / ceasn:alignFrom' },
    },
    matchStrength: 'related',
    notes: 'ASN-CTDL only: alignment properties for equivalency assertions',
  },

  // ──────────────────────────────────────────────────────────
  // OB3 / CLR 2.0 extension fields (not in original CSV)
  // ──────────────────────────────────────────────────────────
  {
    concept: 'Credential Subject',
    entityType: 'OB3/CLR Extension',
    mappings: {
      'ob3':       { field: 'credentialSubject',     path: 'OpenBadgeCredential.credentialSubject' },
      'clr-2.0':   { field: 'credentialSubject',     path: 'ClrCredential.credentialSubject' },
    },
    matchStrength: 'equivalent',
    notes: 'Both use W3C VC credentialSubject. OB3: AchievementSubject; CLR: ClrSubject',
  },
  {
    concept: 'Achievement / Badge',
    entityType: 'OB3/CLR Extension',
    mappings: {
      'ob3':       { field: 'achievement',           path: 'AchievementSubject.achievement' },
      'clr-2.0':   { field: 'verifiableCredential[].credentialSubject.achievement', path: 'ClrSubject.verifiableCredential[].credentialSubject.achievement' },
    },
    matchStrength: 'equivalent',
    notes: 'OB3: single achievement per credential; CLR: aggregates multiple achievements',
  },
  {
    concept: 'Achievement Name',
    entityType: 'OB3/CLR Extension',
    mappings: {
      'case-1.1':  { field: 'title',                path: 'CFDocument.title' },
      'ob3':       { field: 'name',                  path: 'Achievement.name' },
      'clr-2.0':   { field: 'name',                  path: 'Achievement.name' },
    },
    matchStrength: 'close',
    notes: 'OB3/CLR Achievement.name maps loosely to CASE title or abbreviatedStatement',
  },
  {
    concept: 'Criteria Narrative',
    entityType: 'OB3/CLR Extension',
    mappings: {
      'case-1.1':  { field: 'fullStatement',        path: 'CFItem.fullStatement' },
      'ob3':       { field: 'criteria.narrative',    path: 'Achievement.criteria.narrative' },
      'clr-2.0':   { field: 'criteria.narrative',    path: 'Achievement.criteria.narrative' },
    },
    matchStrength: 'close',
    notes: 'OB3/CLR criteria.narrative is a loose equivalent of the full competency statement',
  },
  {
    concept: 'Issuer Profile',
    entityType: 'OB3/CLR Extension',
    mappings: {
      'ob3':       { field: 'issuer',                path: 'OpenBadgeCredential.issuer (Profile)' },
      'clr-2.0':   { field: 'issuer',                path: 'ClrCredential.issuer (Profile)' },
    },
    matchStrength: 'equivalent',
    notes: 'Both use a Profile object with id, type, and name',
  },
  {
    concept: 'Credential Aggregation',
    entityType: 'OB3/CLR Extension',
    mappings: {
      'clr-2.0':   { field: 'verifiableCredential', path: 'ClrSubject.verifiableCredential[]' },
    },
    matchStrength: 'related',
    notes: 'CLR 2.0 only: array of embedded VerifiableCredentials (typically OpenBadgeCredentials)',
  },
  {
    concept: 'Achievement Type',
    entityType: 'OB3/CLR Extension',
    mappings: {
      'case-1.1':  { field: 'CFItemType',           path: 'CFItem.CFItemType' },
      'ob3':       { field: 'achievementType',       path: 'Achievement.achievementType' },
      'clr-2.0':   { field: 'achievementType',       path: 'Achievement.achievementType' },
    },
    matchStrength: 'close',
    notes: 'OB3/CLR achievementType maps to CASE CFItemType',
  },
];
