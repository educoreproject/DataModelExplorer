// hr-open-crosswalk.ts — JEDx (U.S. Employment Data Standard) ↔ HR Open Standards crosswalk.
//
// AUTO-GENERATED from "Data Dictionary Revised Draft 04192026.xlsx" (9 data sheets).
// Do not hand-edit; regenerate from the source workbook. 420 mapped elements across 9 sections.
//
// Each element maps a U.S. Data Element (JEDx) to its HR Open Standards property path.
// HR Open is NOT present in the EDUcore knowledge graph — this file is the authoritative
// HR Open equivalence source. CEDS / other-standard equivalents are looked up live from the graph.
//
// Fields:
//   id              — U.S. Data Element ID (hierarchical, e.g. "I.G.3")
//   name            — U.S. Data Element name
//   definition      — U.S. (JEDx) definition
//   hrOpenProperty  — HR Open property path (e.g. "Organizations/LegalIDs/Value")
//   hrOpenFilter    — HR Open filter / discriminator condition (when present)
//   hrOpenDescription — HR Open property description
//   revisionNotes   — open questions / mapping caveats from the source workbook
//   depth           — nesting level derived from the dotted id (for indented display)

export interface HrOpenElement {
  id: string;
  name: string;
  definition: string;
  hrOpenProperty: string;
  hrOpenFilter: string;
  hrOpenDescription: string;
  revisionNotes: string;
  depth: number;
}

export interface HrOpenSection {
  sheet: string;
  id: string;
  label: string;
  group: 'Organization' | 'Worker';
  title: string;
  count: number;
  elements: HrOpenElement[];
}

export const hrOpenCrosswalk: HrOpenSection[] = [
  {
    "sheet": "I__Organization",
    "id": "I",
    "label": "Organization",
    "group": "Organization",
    "title": "Organization Identification Information",
    "count": 54,
    "elements": [
      {
        "id": "I.A",
        "name": "Organizational Identification",
        "definition": "An unique identifier of the organization.",
        "hrOpenProperty": "Organizations/LegalIDs/Value",
        "hrOpenFilter": "Organizations/OrganizationUnitTypeCode= \"Parent\"",
        "hrOpenDescription": "An identifier of the organization for legal purposes. This could be a company, state, or other kind of identifier. For example, a Business Registration Number issued by a regulatory authority.",
        "revisionNotes": "What is the proper filter? Parent, domestic ultimate, etc.?",
        "depth": 1
      },
      {
        "id": "I.B",
        "name": "Legal Name",
        "definition": "Name of the organization for all contractual purposes associated with the Federal Employer Identification Number.",
        "hrOpenProperty": "Organizations/Name",
        "hrOpenFilter": "Organizations/OrganizationUnitTypeCode= \"Parent\"",
        "hrOpenDescription": "The name of the organization",
        "revisionNotes": "What is this mapped to? What represents the legal name? \"Name\" does not specify legal name in the definition. LegalIds doesn't sound like name.",
        "depth": 1
      },
      {
        "id": "I.C",
        "name": "Trade Names",
        "definition": "A list of the names the organization operates under in different locations, as opposed to the legal name of the company. Some states require trade, DBA or fictitious business name filings to be made for the protection of consumers conducting business with the entity.",
        "hrOpenProperty": "Organizations/TradeNames",
        "hrOpenFilter": "Organizations/TradeNames",
        "hrOpenDescription": "Trade name of the organization or doing-business-as (DBA) name.",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "I.D",
        "name": "Federal Employer Identification Number (FEIN)",
        "definition": "Also known as the Employer Identification Number (EIN) or the Federal Tax Identification Number, is a unique nine-digit number assigned for the purposes of identification by the Internal Revenue Service (IRS) to business organizations operating in the United States .",
        "hrOpenProperty": "Organizations/TaxIds/Value",
        "hrOpenFilter": "Organizations/TaxIds/SchemaId = \"FEIN\"",
        "hrOpenDescription": "A government assigned identifier to distinguish an organization. This typically is a country-level tax code. For example, Federal Employer Identification Number (FEIN) in the USA.",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "I.E",
        "name": "State Unemployment Tax Account (SUTA) Number",
        "definition": "The identification number assigned by the state agency responsible for administration of the Unemployment Insurance Program in a state where the organization conducts business.",
        "hrOpenProperty": "Organizations/TaxIds/Value",
        "hrOpenFilter": "Organizations/TaxIds/SchemaId = \"SUTA\"",
        "hrOpenDescription": "An identifier of the organization for legal purposes. This could be a company, state, or other kind of identifier. For example, Data Universal Numbering System, abbreviated as DUNS.",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "I.F",
        "name": "Organization Type",
        "definition": "The legal form of the organization recognized in a given jurisdiction and characterized by the legal definition of that particular category: 01--Sole Proprietorship 02--Limited Liability Company (LLC) 03--General Partnership 04--Limited Liability Partnership (LLP) 05--Limited Partnership (LP) 06--C Corporation 07--S Corporation 08--Benefit Corporation 09--Close Corporation 10--Non-profit Corporation 11--Cooperative 12--Estate 13--Trust 14--Government--Federal 15--Government--State 16--Government--Territorial 17--Government--Tribal 18--Government--Local (e.g., Borough, City, County, Parish, School District, Special District, Town, Village)",
        "hrOpenProperty": "Organizations/TypeCode",
        "hrOpenFilter": "LegalOrganizationTypeCodeList",
        "hrOpenDescription": "Values that classify the ownership of the organization. E.g. Public, Private, Non-profit, Government, Joint Venture, Mutual.",
        "revisionNotes": "LegalOrganizationTypeCodeList is a different list than list under US Definition to the left.",
        "depth": 1
      },
      {
        "id": "I.G",
        "name": "Organization Industry Infomation (repeating)",
        "definition": "Classification systems and codes used to describe the organization's overall business activities, functions and principal products and services. Industry classification system are used to categorize businesses by their primary activity, enabling the collection, analysis, and publication of statistical data, as well as facilitating administrative, regulatory, contracting, and taxation purposes. The folliowing three fields are repeated for each entity assigning an industry classification code.",
        "hrOpenProperty": "Organizations/Industry Identifiers",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "I.G.1",
        "name": "Industry Classification System",
        "definition": "Select a number from the following list. 1. Global Industry Classification Standard (GICS): Developed by MSCI and S&P Dow Jones Indices, GICS is a 4-level classification system used to categorize companies traded on public stock exchanges. It helps investors and analysts identify, compare, and contrast competitors. 2. North American Industry Classification System (NAICS): NAICS is used by federal statistical agencies in the US, Canada, and Mexico to classify business establishments for statistical purposes. It is based on a production-oriented concept, grouping establishments into industries based on similar processes used to produce goods or services. 3. International Standard Industrial Classification of All Economic Activities (ISIC): ISIC is a system developed by the United Nations to classify economic data, allowing industries to be identified with a 2- to 4-digit code.",
        "hrOpenProperty": "Organizations/Industry Identifiers/IssuerPartyId/Value",
        "hrOpenFilter": "Organizations/Industry Identifiers/SchemeID = \"NAICS\"",
        "hrOpenDescription": "The types of industry to which the organization belongs. The Industry identifiers could be referenced to a standard taxonomy (such as NAICS) or a custom taxonomy.",
        "revisionNotes": "",
        "depth": 2
      },
      {
        "id": "I.G.2",
        "name": "Industry Classification Assigning Entity",
        "definition": "Choose a code below to indicate which entity assigned the industrial classification code: 1. Employer 2. State agency responsible for Unemployment Insurance administration. 3. U.S. Bureau of Labor Statistics 4. U.S. Census Bureau 5. Other - specify",
        "hrOpenProperty": "Organizations/Industry Identifiers/IssuerPartyId",
        "hrOpenFilter": "Organizations/Industry Identifiers/SchemeID = \"NAICS\"",
        "hrOpenDescription": "The types of industry to which the organization belongs. The Industry identifiers could be referenced to a standard taxonomy (such as NAICS) or a custom taxonomy.",
        "revisionNotes": "",
        "depth": 2
      },
      {
        "id": "I.G.3",
        "name": "Industry Classification Code",
        "definition": "The industry classification code value assigned.",
        "hrOpenProperty": "Organizations/Industry Identifiers/IssuerPartyId/Value",
        "hrOpenFilter": "Organizations/Industry Identifiers/SchemeID = \"NAICS\"",
        "hrOpenDescription": "The types of industry to which the organization belongs. The Industry identifiers could be referenced to a standard taxonomy (such as NAICS) or a custom taxonomy.",
        "revisionNotes": "",
        "depth": 2
      },
      {
        "id": "I.H",
        "name": "Business Activities, Products, & Services",
        "definition": "A description of the business activities conducted organization-wide, listed by approximate percentage of revenue or sales associated with each activity.",
        "hrOpenProperty": "Organizations/OrganizationActivity",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "I.I",
        "name": "Business Revenue",
        "definition": "The amount of business revenue of the organization, typically for the most recent fiscal year.",
        "hrOpenProperty": "Organizations/Revenue",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "I.J",
        "name": "Operating Status",
        "definition": "The current operating status of the organization. 1--Employees hired, UI liability begins 2--Operations continuing unchanged 3--Operations temporarily halted 4--Operations resumed 5--Operations permanently ceased, no successor 6--Sold all, transferred to new owner 7--Sold part, still operating remainder of business 8--Merged with another business 7--Changed organization type, operations continuing 8--Changed to new state of formation 9--Other (specify): ___________________",
        "hrOpenProperty": "Organizations/Status/StatusCode",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "I.K",
        "name": "Operating Status Change Date",
        "definition": "Specifies the date of the most recent change in the operating status.",
        "hrOpenProperty": "Organizations/Status/StatusDate",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "I.L",
        "name": "Organization Address Information (repeating)",
        "definition": "Fields describing the mailing and physical addresses of the organization's headquarters. The following fields are repeated for each address.",
        "hrOpenProperty": "Organizations/Addresses/*",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "Should this be mapped to Addresses or Communication/Address?",
        "depth": 1
      },
      {
        "id": "I.L.1",
        "name": "Address Type",
        "definition": "1. Mailing address 2. Physical address",
        "hrOpenProperty": "Organizations/Addresses/TypeCode",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "Should this be mapped to Addresses or Communication/Address?",
        "depth": 2
      },
      {
        "id": "I.L.2",
        "name": "Primary Line",
        "definition": "Address number and name of street, or P.O. Box",
        "hrOpenProperty": "Organizations/Addresses/Line",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "Should this be mapped to Addresses or Communication/Address?",
        "depth": 2
      },
      {
        "id": "I.L.3",
        "name": "Secondary Line",
        "definition": "Supplementary address information (e.g., apartment or suite number, attention information)",
        "hrOpenProperty": "Organizations/Addresses/ExtendedLines",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "Should this be mapped to Addresses or Communication/Address?",
        "depth": 2
      },
      {
        "id": "I.L.4",
        "name": "City",
        "definition": "The name of the city associated with the organization's headquarters.",
        "hrOpenProperty": "Organizations/Addresses/City",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "Should this be mapped to Addresses or Communication/Address?",
        "depth": 2
      },
      {
        "id": "I.L.5",
        "name": "Postal code",
        "definition": "The postal code (e.g., zip code) associated with the organization's headquarters.",
        "hrOpenProperty": "Organizations/Addresses/PostalCode",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "Should this be mapped to Addresses or Communication/Address?",
        "depth": 2
      },
      {
        "id": "I.L.6",
        "name": "Country code",
        "definition": "The 3-digit alpha code for a country, maintained by The International Organization for Standardization (ISO) through its ISO 3166 standard where the organization receives official mail.",
        "hrOpenProperty": "Organizations/Addresses/CountryCode",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "Should this be mapped to Addresses or Communication/Address?",
        "depth": 2
      },
      {
        "id": "I.L.7",
        "name": "Primary Political Subdivision",
        "definition": "The name of the state or territory, or the District of Columbia, associated with the organization's headquarters.",
        "hrOpenProperty": "Organizations/Addresses/CountrySubdivisions/Value",
        "hrOpenFilter": "Organizations/Addresses/CountrySubdivisions/Type = \"State\"",
        "hrOpenDescription": "The physical or mailing address of the entity. This may include the street and building number, city, region (state, province, etc.), country and postal code.",
        "revisionNotes": "Should this be mapped to Addresses or Communication/Address?",
        "depth": 2
      },
      {
        "id": "I.L.8",
        "name": "Secondary Political Subdivision",
        "definition": "The name of the sub-state borough, council of government, or county associated with the organization's headquarters.",
        "hrOpenProperty": "Organizations/Addresses/CountrySubdivisions/Value",
        "hrOpenFilter": "Organizations/Addresses/CountrySubdivisions/Type = \"County\"",
        "hrOpenDescription": "Qualifies the further divisions of the Country. These may be Districts, Regions, States, Provinces etc.",
        "revisionNotes": "Should this be mapped to Addresses or Communication/Address?",
        "depth": 2
      },
      {
        "id": "I.L.9",
        "name": "Geolocation",
        "definition": "If a physical address, the latitude and longitude of the physical address associated with the organization's headquarters. Otherwise, leave blank.",
        "hrOpenProperty": "Organizations/Addresses/Geolocation",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "Should this be mapped to Addresses or Communication/Address?",
        "depth": 2
      },
      {
        "id": "I.M",
        "name": "Contact Information (repeating)",
        "definition": "Information identifying the reasons for contact, and the person responsible for communication on that topic, and means of contacting that person. The following fields are repeated for each contact purpose and contact person.",
        "hrOpenProperty": "Organizations/Contacts",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "I.M.1",
        "name": "Contact Role",
        "definition": "The activity the contact person is responsible for: 1. General Information 2. Unemployment Insurance Tax Filing 3. 4. 5.",
        "hrOpenProperty": "Organizations/Contacts/RoleCode",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 2
      },
      {
        "id": "I.M.2",
        "name": "Contact Name",
        "definition": "The full name of the person with organizational responsiblity for communications related to the listed contact purpose.",
        "hrOpenProperty": "Organizations/Contacts/Name",
        "hrOpenFilter": "Organizations/Contacts/RoleCode = \"UI\"",
        "hrOpenDescription": "A component for capturing summary or fine-grain data comprising a person's name.",
        "revisionNotes": "",
        "depth": 2
      },
      {
        "id": "I.M.3",
        "name": "Contact Title",
        "definition": "The position title of the person with organizational responsiblity for communications related to the listed contact purpose.",
        "hrOpenProperty": "Organizations/Contacts/PositionTitle",
        "hrOpenFilter": "Organizations/Contacts/RoleCode = \"UI\"",
        "hrOpenDescription": "The position title for the contact of the organization.",
        "revisionNotes": "",
        "depth": 2
      },
      {
        "id": "I.M.4",
        "name": "Contact Phone",
        "definition": "The phone number of the person with organizational responsiblity for communications related to the listed contact purpose. Includes: • &#9;Country dialing code •&#9; Area dialing code • &#9;Number • &#9;Extension •&#9; Access code: The text that permits access to the electronic network of the associated communication number such as telephone network (e.g., 9, *70)",
        "hrOpenProperty": "Organizations/Contacts/Communication/Phone",
        "hrOpenFilter": "Organizations/Contacts/RoleCode = \"UI\"",
        "hrOpenDescription": "An array of the phone numbers of the entity.",
        "revisionNotes": "",
        "depth": 2
      },
      {
        "id": "I.M.5",
        "name": "Contact E-mail",
        "definition": "The e-mail address of the person with organizational responsiblity for communications related to to the listed contact purpose.",
        "hrOpenProperty": "Organizations/Contacts/Communication/Email",
        "hrOpenFilter": "Organizations/Contacts/RoleCode = \"UI\"",
        "hrOpenDescription": "An array of the email addresses of the entity.",
        "revisionNotes": "",
        "depth": 2
      },
      {
        "id": "I.M.6",
        "name": "Contact Fax",
        "definition": "The fax number of the person with organizational responsiblity for communications related to to the listed contact purpose.",
        "hrOpenProperty": "Organizations/Contacts/Communication/Fax",
        "hrOpenFilter": "Organizations/Contacts/RoleCode = \"UI\"",
        "hrOpenDescription": "An array of the fax numbers of the entity.",
        "revisionNotes": "",
        "depth": 2
      },
      {
        "id": "I.N",
        "name": "Client of Vendor-Worker Organization",
        "definition": "A Vendor-Worker Organization (VWO) is a firm that supplies workers to client organizations while retaining status as the employer of record. These firms manage core employment responsibilities such as payroll, tax withholding, benefits administration, and compliance with labor regulations. Although the provider remains the legal employer, the client organization typically directs the workers’ day-to-day tasks and job performance. Common examples include professional employer organizations (PEOs), staffing agencies, and employee leasing companies. This arrangement allows client organizations to access labor and workforce flexibility without taking on the full legal and administrative obligations of direct employment.",
        "hrOpenProperty": "To be determined",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "I.N.1",
        "name": "FEIN",
        "definition": "If the employer organization is a client of a Vendor-Worker Organization (VWO), enter the Federal Employer Identification Number (FEIN) of theVWO. Also known as the Employer Identification Number (EIN) or the Federal Tax Identification Number, is a unique nine-digit number assigned for the purposes of identification by the Internal Revenue Service (IRS) to business organizations operating in the United States .",
        "hrOpenProperty": "To be determined",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 2
      },
      {
        "id": "I.N.2",
        "name": "Name",
        "definition": "If the employer organization is a client of a Vendor-Worker Organization (VWO), enter the Legal Name of the VWO.",
        "hrOpenProperty": "To be determined",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 2
      },
      {
        "id": "I.N.3",
        "name": "Service Start Date",
        "definition": "If the employer organization is a client of a Vendor-Worker Organization (VWO), enter the date VWO service began.",
        "hrOpenProperty": "To be determined",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 2
      },
      {
        "id": "I.N.4",
        "name": "Service End Date",
        "definition": "If the employer organization is a former client of a Vendor-Worker Organization (VWO), enter the date VWO service ended.",
        "hrOpenProperty": "To be determined",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 2
      },
      {
        "id": "I.O",
        "name": "Predecessor FEIN(s)",
        "definition": "The Federal Employer Identification Number(s) of the employer organization(s) that sold/transferred all or part of their business to the current employer organization providing this data file (the successor). Used in cases where all or part of the current organization was previously operated under another Federal Employer Identification Number.",
        "hrOpenProperty": "Organizations/FormerTaxId/Value",
        "hrOpenFilter": "Organizations/FormerTaxId/SchemeId = \"FEIN\"",
        "hrOpenDescription": "A previous government assigned identifier to distinguish an organization. This typically is a country-level tax code.",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "I.P",
        "name": "Successor FEIN(s)",
        "definition": "The Federal Employer Identification Number(s) of the employer organization(s) to which all or part of the business of the employer organization providing this data file (the predecessor) was sold/transferred. Used in cases where all or part of the organization is now operated under another Federal Employer Identification Number.",
        "hrOpenProperty": "To be determined",
        "hrOpenFilter": "TBD",
        "hrOpenDescription": "1826",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "I.Q",
        "name": "Predecessor SUTA Number(s)",
        "definition": "The State Unemployment Tax Account Number(s) of the employer organization(s) that sold/transferred all or part of their business to the current employer organization providing this data file (the successor). Used in cases where all or part of the current organization was previously operated under another State Unemployment Tax Account Number.",
        "hrOpenProperty": "Organizations/FormerTaxId/SUTA",
        "hrOpenFilter": "Organizations/FormerTaxIds/SchemeId = \"SUTA\"",
        "hrOpenDescription": "The former legal identifiers of an organization. The issuer is most likely a country or state. For example, a Business Registration Number issued by a regulatory authority.",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "I.R",
        "name": "Successor SUTA Number(s)",
        "definition": "The State Unemployment Tax Account Number(s) of the employer organization(s) to which all or part of the business of the employer organization providing this data file (the predecessor) was sold/transferred. Used in cases where all or part of the organization is now operated under another State Unemployment Tax Account Number.",
        "hrOpenProperty": "To be determined",
        "hrOpenFilter": "TBD",
        "hrOpenDescription": "1826",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "I.S",
        "name": "Parent Organization Tax ID",
        "definition": "The tax ID of the parent organization if this organization is a wholly owned subsidiary of another organization.",
        "hrOpenProperty": "Organizations/ParentOrganization/TaxIds/Value",
        "hrOpenFilter": "Organizations/ParentOrganization/TaxIds/SchemeId = \"FEIN\"",
        "hrOpenDescription": "The tax ID of the parent company if this company is a wholly owned subsidiary of another company.",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "I.T",
        "name": "Parent Organization Name",
        "definition": "The legal name of the parent organization if this organization is a wholly-owned subsidiary of another organization.",
        "hrOpenProperty": "Organizations/ParentOrganization/Name",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "I.U",
        "name": "Owner/Corporate Officer Information (repeating)",
        "definition": "Information identifying the owners of the organization, or the officers of a corporation. These fields are repeated for each owner/corporate officer.",
        "hrOpenProperty": "Organizations/keyStakeholders/*",
        "hrOpenFilter": "Organizations/keyStakeholders/Type = \"Owner\" or \"Officer\"",
        "hrOpenDescription": "Specific people at the organization who are key stakeholders within or to an organization, e.g., a corporate officer or owner.",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "I.U.1",
        "name": "Name",
        "definition": "The legal name of an owner (or officer if a corporation) of the employing organization.",
        "hrOpenProperty": "Organizations/keyStakeholders/Name",
        "hrOpenFilter": "Organizations/keyStakeholders/Type = \"Owner\" or \"Officer\"",
        "hrOpenDescription": "A component for capturing summary or fine-grain data comprising a person's name.",
        "revisionNotes": "",
        "depth": 2
      },
      {
        "id": "I.R",
        "name": "Title",
        "definition": "The title held by an owner (or officer if a corporation) of the employing organization.",
        "hrOpenProperty": "TBD",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "I.U.3",
        "name": "Social Security Number",
        "definition": "A nine-digit number that the U.S. government issues to all U.S. citizens and eligible U.S. residents who apply for one. The government uses this number to keep track of the individual's lifetime earnings and the number of years worked.",
        "hrOpenProperty": "Organizations/keyStakeholders/TaxIds/SSN",
        "hrOpenFilter": "Organizations/keyStakeholders/Type = \"Owner\" or \"Officer\"",
        "hrOpenDescription": "A government assigned tax identifier to distinguish a person. This typically is a country-level tax code. For example, Social Security Number (SSN) in the USA.",
        "revisionNotes": "",
        "depth": 2
      },
      {
        "id": "I.U.4",
        "name": "Percent Ownership",
        "definition": "The percentage of the employing organization's market value held by the owner.",
        "hrOpenProperty": "Organizations/keyStakeholders/TaxIds/OwnershipPercent",
        "hrOpenFilter": "Organizations/keyStakeholders/Type = \"Owner\" or \"Officer\"",
        "hrOpenDescription": "The percent of the organization's market value owned by the stakeholder.",
        "revisionNotes": "",
        "depth": 2
      },
      {
        "id": "I.U.5",
        "name": "Residence Street Address",
        "definition": "The street address of the owner/corporate officer's primary residence.",
        "hrOpenProperty": "Organizations/keyStakeholders/Communication/Address/Line",
        "hrOpenFilter": "Organizations/keyStakeholders/Type = \"Owner\" or \"Officer\"Organizations/keyStakeholders/Communication/Address/TypeCode = \"Residence\"",
        "hrOpenDescription": "The physical or mailing address of the entity. This may include the street and building number, city, region (state, province, etc), country and postal code.",
        "revisionNotes": "",
        "depth": 2
      },
      {
        "id": "I.U.6",
        "name": "Residence City",
        "definition": "The name of the city in which the owner/corporate officer's primary residence is located.",
        "hrOpenProperty": "Organizations/keyStakeholders/Communication/Address/City",
        "hrOpenFilter": "Organizations/keyStakeholders/Type = \"Owner\" or \"Officer\"Organizations/keyStakeholders/Communication/Address/TypeCode = \"Residence\"",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 2
      },
      {
        "id": "I.U.7",
        "name": "Residence State",
        "definition": "The two-digit alphabetic code for the state in which the owner/corporate officer's primary residence is located.",
        "hrOpenProperty": "Organizations/keyStakeholders/Address/CountrySubdisions/Value",
        "hrOpenFilter": "Organizations/keyStakeholders/Type = \"Owner\" or \"Officer\"Organizations/keyStakeholders/Communication/Address/TypeCode = \"Residence\"Organizations/keyStakeholders/Address/CountrySubdisions/Type = \"State\"",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 2
      },
      {
        "id": "I.U.8",
        "name": "Residence Country",
        "definition": "The name of the country in which the owner/corporate officer's primary residence is located.",
        "hrOpenProperty": "Organizations/keyStakeholders/Address/CountryCode",
        "hrOpenFilter": "Organizations/keyStakeholders/Type = \"Owner\" or \"Officer\"Organizations/keyStakeholders/Communication/Address/TypeCode = \"Residence\"",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 2
      },
      {
        "id": "I.U.9",
        "name": "Residence Postal Code",
        "definition": "The postal code (e.g., ZIP Code) in which the owner/corporate officer's primary residence is located.",
        "hrOpenProperty": "Organizations/keyStakeholders/Address/PostalCode",
        "hrOpenFilter": "Organizations/keyStakeholders/Type = \"Owner\" or \"Officer\"Organizations/keyStakeholders/Communication/Address/TypeCode = \"Residence\"",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 2
      },
      {
        "id": "I.V",
        "name": "FUTA Liable",
        "definition": "If the organization is liable for contributions under the Federal Unemployment Tax Act, enter a \"1\", otherwise enter a \"0\".",
        "hrOpenProperty": "",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "I.W",
        "name": "FUTA Liability Date",
        "definition": "If the organization is liable for contributions under the Federal Unemployment Tax Act, enter first year of liability.",
        "hrOpenProperty": "",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 1
      }
    ]
  },
  {
    "sheet": "III__Establishments",
    "id": "III",
    "label": "Establishments",
    "group": "Organization",
    "title": "Organization Establishments Information",
    "count": 35,
    "elements": [
      {
        "id": "III.A",
        "name": "Organization Establishment ID",
        "definition": "A numeric identifier assigned by the organization to each physical location where the organization conducts one—or predominantly one—type of economic activity or business. If there are distinct economic activities at the same location, the site may have more than one establishment ID. Establishments are distinct from firms or companies, which may consist of multiple establishments.",
        "hrOpenProperty": "Organizations/Id",
        "hrOpenFilter": "Organizations/OrganizationUnitTypeCode=\"Establishment\"",
        "hrOpenDescription": "An identifier of the entity within an organization. A unique identifier which cannot be expressed as enumeration.",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "III.B",
        "name": "Government-assigned Establishment IDs Information",
        "definition": "Data to identify which government organization assigned the ID and what ID value they assigned. A numeric identifier assigned to the establishment by a federal or state agency. Provide information in the following two fields. See above for definition of establishment.",
        "hrOpenProperty": "Organizations/LegalIds/*",
        "hrOpenFilter": "Organizations/OrganizationUnitTypeCode=\"Establishment\"",
        "hrOpenDescription": "An identifier of the organization for legal purposes. This could be a company, state, or other kind of identifier. For example, a Business Registration Number issued by a regulatory authority.",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "III.B.1",
        "name": "Gov't Agency Assigning Establishment ID",
        "definition": "Enter the appropriate code from the following list: 1. Bureau of Labor Statistics 2. U.S. Census Bureau 3. State agency responsible for administration of the Unemployment Insurance (UI) Program. 4. Other",
        "hrOpenProperty": "Organizations/LegalIds/SchemeId",
        "hrOpenFilter": "Organizations/OrganizationUnitTypeCode=\"Establishment\"",
        "hrOpenDescription": "The identification of the agency that manages the identifier scheme.",
        "revisionNotes": "SS > Would SchemeId or SchemeAgencyID be used in this case to identify the assigning agency?",
        "depth": 2
      },
      {
        "id": "III.B.2",
        "name": "Gov't Agency Assigned Establishment ID Value",
        "definition": "A numeric identifier assigned to the establishment by the above indicated federal or state agency.",
        "hrOpenProperty": "Organizations/LegalIds/Value",
        "hrOpenFilter": "Organizations/OrganizationUnitTypeCode=\"Establishment\"Organizations/LegalIds/SchemeId = \"BLS\" for example",
        "hrOpenDescription": "The identifier.",
        "revisionNotes": "",
        "depth": 2
      },
      {
        "id": "III.C",
        "name": "Establishment Name",
        "definition": "The operating name of the organization at the location, as opposed to the legal name of the organization. Some states require trade, DBA or fictitious business name filings to be made for the protection of consumers conducting business with the entity.",
        "hrOpenProperty": "Organizations/Name",
        "hrOpenFilter": "Organizations/OrganizationUnitTypeCode=\"Establishment\"",
        "hrOpenDescription": "The operating name of a company at the location, as opposed to the legal name of the company.",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "III.D",
        "name": "Parent Organization Legal Name",
        "definition": "The legal name of the parent organization if this establishment is a wholly-owned subsidiary of another organization.",
        "hrOpenProperty": "Organizations/ParentOrganization/Name",
        "hrOpenFilter": "Organizations/OrganizationUnitTypeCode=\"Establishment\"",
        "hrOpenDescription": "The legal name of the parent company if this company is a wholly owned subsidiary of another company",
        "revisionNotes": "SS > Should this be Name or LegalIds or something else? Name doesn't specifiy legal name.",
        "depth": 1
      },
      {
        "id": "III.E",
        "name": "Parent Organization FEIN",
        "definition": "The Federal Employer Identification Number (FEIN) of the organization, also known as the Employer Identification Number (EIN) or the Federal Tax Identification Number, is a unique nine-digit number assigned by the Internal Revenue Service (IRS) to business entities operating in the United States for the purposes of identification.",
        "hrOpenProperty": "Organizations/ParentOrganizations/TaxIds/Value",
        "hrOpenFilter": "Organizations/OrganizationUnitTypeCode=\"Establishment\"Organizations/ParentOrganizations/TaxIds/SchemeId = \"FEIN\"",
        "hrOpenDescription": "A government assigned identifier to distinguish an organization. This may be assigned by a country, state, province, etc.",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "III.F",
        "name": "State Unemployment Tax Account Number",
        "definition": "The identification number assigned to the organization by the state agency responsible for administration of the Unemployment Insurance Program in the state where this establishment is located.",
        "hrOpenProperty": "Organizations/ParentOrganizations/TaxIds/Value",
        "hrOpenFilter": "Organizations/OrganizationUnitTypeCode=\"Establishment\"Organizations/ParentOrganizations/TaxIds/SchemeId = \"SUTA\"",
        "hrOpenDescription": "A government assigned identifier to distinguish an organization. This may be assigned by a country, state, province, etc.",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "III.G",
        "name": "Establishment Status",
        "definition": "The current operating status of the establishment. 1--Establishment employees hired, operations begin 2--Establishment operations continuing unchanged 3--Establishment operations temporarily halted 4--Establishment operations resumed 5--Establishment operations permanently ceased, no successor 6--Establishment sold establishment, transferred to new owner 7--Other (specify): ___________________",
        "hrOpenProperty": "Organizations/Status/StatusCode",
        "hrOpenFilter": "OrganizationUnitTypeCode=\"Establishment\"",
        "hrOpenDescription": "Specifies the current status of the entity, e.g. sold, temporarily closed, permanently closed, merged, acquired, etc.",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "III.H",
        "name": "Establishment Status Change Date",
        "definition": "Specifies the date of the most recent change in the estalishment operating status.",
        "hrOpenProperty": "Organizations/Status/StatusDate",
        "hrOpenFilter": "OrganizationUnitTypeCode=\"Establishment\"",
        "hrOpenDescription": "The date the status of the entity became effective.",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "III.I",
        "name": "Establishment Operating Level",
        "definition": "The organizational level at which the establishment operates, e.g., Unit, Department, Division, Parent, Plant, Subsidiary, Branch.",
        "hrOpenProperty": "Organizations/OrganizationUnitTypeCode",
        "hrOpenFilter": "OrganizationUnitTypeCode=\"Establishment\"",
        "hrOpenDescription": "The type of legal organization unit.",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "III.J",
        "name": "Establishment Principal Products & Services",
        "definition": "A description of the business activities conducted at the establishment, listed by approximate percentage of revenue or sales associated with each activity. Services: Describe in detail the services you provide. To whom do you provide those services? If you offer consulting, brokerage, management or similar services, what are your major activities? • EXAMPLE 1: Hair cutting & styling 65%; Manicures 25%; Facials 10% • EXAMPLE 2: Long distance trucking, less than truckload 100% • EXAMPLE 3: Marketing consulting: Planning strategy 60%; Sales forecasting 40% • EXAMPLE 4: Cleaning private homes 100% Construction or Building Trades: Is the work mostly residential or nonresidential? Single‐or Multi‐family? New or remodeling? • EXAMPLE: Electrical contractor: Wiring new homes 51%; Electrical refurbishing of office buildings 49% Goods or Products: What are they and what do you do with them? Do you design, manufacture, sell directly to consumers, distribute to wholesalers, install, repair, or do something else with them? What are these goods or products made of? • EXAMPLE 1: Major appliances: Sell to public 40%; Sell to retailers 30%; Repair 30% • EXAMPLE 2: Install fiber optic cable 100% Manufacturers: What are your main products? What are your most important materials? What are the main production methods? • EXAMPLE: Weaving cotton broad woven fabrics 80%; Spinning cotton threads 20%",
        "hrOpenProperty": "Organizations/OrganizationActivity",
        "hrOpenFilter": "OrganizationUnitTypeCode=\"Establishment\"",
        "hrOpenDescription": "A description of the business activities conducted at the establishment, listed by approximate percentage of revenue or sales associated with each activity.",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "III.K",
        "name": "Establishment Industry Information (repeating)",
        "definition": "Classification systems and codes used to describe the individual establishment's business activities, functions and principal products and services. Industry classification systems are used to categorize establishment by their primary activity, enabling the collection, analysis, and publication of statistical data, as well as facilitating administrative, regulatory, contracting, and taxation purposes. The following fields are repeated for each entity assigning an industry classification code.",
        "hrOpenProperty": "Organizations/Industry Identifiers",
        "hrOpenFilter": "OrganizationUnitTypeCode=\"Establishment\"",
        "hrOpenDescription": "The types of industry to which the organization belongs. The Industry identifiers could be referenced to a standard taxonomy (such as NAICS) or a custom taxonomy.",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "III.K.1",
        "name": "Industry Classification System",
        "definition": "Select a number from the following list. 1. Global Industry Classification Standard (GICS): Developed by MSCI and S&P Dow Jones Indices, GICS is a 4-level classification system used to categorize companies traded on public stock exchanges. It helps investors and analysts identify, compare, and contrast competitors. 2. North American Industry Classification System (NAICS): NAICS is used by federal statistical agencies in the US, Canada, and Mexico to classify business establishments for statistical purposes. It is based on a production-oriented concept, grouping establishments into industries based on similar processes used to produce goods or services. 3. International Standard Industrial Classification of All Economic Activities (ISIC): ISIC is a system developed by the United Nations to classify economic data, allowing industries to be identified with a 2- to 4-digit code.",
        "hrOpenProperty": "Organizations/Industry Identifiers/SchemeID",
        "hrOpenFilter": "OrganizationUnitTypeCode=\"Establishment\"",
        "hrOpenDescription": "The types of industry to which the organization belongs. The Industry identifiers could be referenced to a standard taxonomy (such as NAICS) or a custom taxonomy.",
        "revisionNotes": "",
        "depth": 2
      },
      {
        "id": "III.K.2",
        "name": "Industry Classification Assigning Entity",
        "definition": "Choose a code below to indicate which entity assigned the industrial classification code: 1. Employer 2. State agency responsible for Unemployment Insurance administration. 3. U.S. Bureau of Labor Statistics 4. U.S. Census Bureau 5. Other - specify",
        "hrOpenProperty": "Organizations/Industry Identifiers/IssuerPartyId",
        "hrOpenFilter": "OrganizationUnitTypeCode=\"Establishment\"",
        "hrOpenDescription": "The identification of the party that issued the identifier.",
        "revisionNotes": "",
        "depth": 2
      },
      {
        "id": "III.K.3",
        "name": "Industry Classification Code",
        "definition": "The industry classification code value assigned.",
        "hrOpenProperty": "Organizations/Industry Identifiers/Value",
        "hrOpenFilter": "OrganizationUnitTypeCode=\"Establishment\"",
        "hrOpenDescription": "The identifier.",
        "revisionNotes": "",
        "depth": 2
      },
      {
        "id": "III.L",
        "name": "Establishment Address Information (repeating)",
        "definition": "Fields describing the mailing and physical addresses of the establishment. These fields are repeating.",
        "hrOpenProperty": "Organizations/Addresses/*",
        "hrOpenFilter": "OrganizationUnitTypeCode=\"Establishment\"",
        "hrOpenDescription": "The physical or mailing address of the entity. This may include the street and building number, city, region (state, province, etc.), country and postal code.",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "III.L.1",
        "name": "Address Type",
        "definition": "1. Mailing address 2. Physical address",
        "hrOpenProperty": "Organizations/Addresses/TypeCode",
        "hrOpenFilter": "OrganizationUnitTypeCode=\"Establishment\"",
        "hrOpenDescription": "The physical or mailing address of the entity. This may include the street and building number, city, region (state, province, etc.), country and postal code.",
        "revisionNotes": "",
        "depth": 2
      },
      {
        "id": "III.L.2",
        "name": "Primary Line",
        "definition": "Address number and name of street, or P.O. Box",
        "hrOpenProperty": "Organizations/Addresses/Line",
        "hrOpenFilter": "OrganizationUnitTypeCode=\"Establishment\"",
        "hrOpenDescription": "The physical or mailing address of the entity. This may include the street and building number, city, region (state, province, etc.), country and postal code.",
        "revisionNotes": "",
        "depth": 2
      },
      {
        "id": "III.L.3",
        "name": "Secondary Line",
        "definition": "Supplementary address information (e.g., apartment or suite number, attention information)",
        "hrOpenProperty": "Organizations/Addresses/ExtendedLines",
        "hrOpenFilter": "OrganizationUnitTypeCode=\"Establishment\"",
        "hrOpenDescription": "The physical or mailing address of the entity. This may include the street and building number, city, region (state, province, etc.), country and postal code.",
        "revisionNotes": "",
        "depth": 2
      },
      {
        "id": "III.L.4",
        "name": "City",
        "definition": "The name of the city associated with the establishment.",
        "hrOpenProperty": "Organizations/Addresses/City",
        "hrOpenFilter": "OrganizationUnitTypeCode=\"Establishment\"",
        "hrOpenDescription": "The physical or mailing address of the entity. This may include the street and building number, city, region (state, province, etc.), country and postal code.",
        "revisionNotes": "",
        "depth": 2
      },
      {
        "id": "III.L.5",
        "name": "Postal code",
        "definition": "The postal code (e.g., zip code) associated with the establishment.",
        "hrOpenProperty": "Organizations/Addresses/PostalCode",
        "hrOpenFilter": "OrganizationUnitTypeCode=\"Establishment\"",
        "hrOpenDescription": "The physical or mailing address of the entity. This may include the street and building number, city, region (state, province, etc.), country and postal code.",
        "revisionNotes": "",
        "depth": 2
      },
      {
        "id": "III.L.6",
        "name": "Country code",
        "definition": "The 3-digit alpha code for a country, maintained by The International Organization for Standardization (ISO) through its ISO 3166 standard where the establishment receives official mail.",
        "hrOpenProperty": "Organizations/Addresses/CountryCode",
        "hrOpenFilter": "OrganizationUnitTypeCode=\"Establishment\"",
        "hrOpenDescription": "The physical or mailing address of the entity. This may include the street and building number, city, region (state, province, etc.), country and postal code.",
        "revisionNotes": "",
        "depth": 2
      },
      {
        "id": "III.L.7",
        "name": "Primary Political Subdivision",
        "definition": "The name of the state or territory, or the District of Columbia, associated with the establishment.",
        "hrOpenProperty": "Organizations/Addresses/CountrySubdivisions/Value",
        "hrOpenFilter": "OrganizationUnitTypeCode=\"Establishment\"Organizations/Communication/Address/CountrySubdivisions/Type = \"State\"",
        "hrOpenDescription": "The physical or mailing address of the entity. This may include the street and building number, city, region (state, province, etc.), country and postal code.",
        "revisionNotes": "",
        "depth": 2
      },
      {
        "id": "III.L.8",
        "name": "Secondary Political Subdivision",
        "definition": "The name of the sub-state borough, council of government, or county associated with the establishment.",
        "hrOpenProperty": "Organizations/Addresses/CountrySubdivisions/Value",
        "hrOpenFilter": "OrganizationUnitTypeCode=\"Establishment\"Organizations/Communication/Address/CountrySubdivisions/Type = \"County\"",
        "hrOpenDescription": "The physical or mailing address of the entity. This may include the street and building number, city, region (state, province, etc.), country and postal code.",
        "revisionNotes": "",
        "depth": 2
      },
      {
        "id": "III.L.9",
        "name": "Geolocation",
        "definition": "The latitude and longitude of the physical address associated with the establishment.",
        "hrOpenProperty": "Organizations/Addresses/Geolocation",
        "hrOpenFilter": "OrganizationUnitTypeCode=\"Establishment\"",
        "hrOpenDescription": "The physical or mailing address of the entity. This may include the street and building number, city, region (state, province, etc.), country and postal code.",
        "revisionNotes": "",
        "depth": 2
      },
      {
        "id": "III.M",
        "name": "Contact Information (repeating)",
        "definition": "Information identifying the reasons for contact, and the person responsible for communication on that topic. These fields are repeated for each contact purpose and contact person.",
        "hrOpenProperty": "Organizations/Contacts",
        "hrOpenFilter": "OrganizationUnitTypeCode=\"Establishment\"",
        "hrOpenDescription": "Specific people at the organization who are contacts. Contains information to identify a contact person associated with an organization.",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "III.M.1",
        "name": "Contact Role",
        "definition": "The activity the contact person is responsible for: 1. General Information 2. Unemployment Insurance Tax Filing 3. 4. 5.",
        "hrOpenProperty": "Organizations/Contacts/RoleCode",
        "hrOpenFilter": "OrganizationUnitTypeCode=\"Establishment\"",
        "hrOpenDescription": "The role of a contact person of the organization.",
        "revisionNotes": "",
        "depth": 2
      },
      {
        "id": "III.M.2",
        "name": "Contact Name",
        "definition": "The full name of the person with responsiblity for establishment communications related to the listed contact purpose.",
        "hrOpenProperty": "Organizations/Contacts/Name",
        "hrOpenFilter": "OrganizationUnitTypeCode=\"Establishment\"",
        "hrOpenDescription": "The name of a contact person of the organization.",
        "revisionNotes": "",
        "depth": 2
      },
      {
        "id": "III.M.3",
        "name": "Contact Title",
        "definition": "The position title of the person with responsiblity for establishment communications related to the listed contact purpose.",
        "hrOpenProperty": "Organizations/Contacts/PositionTitle",
        "hrOpenFilter": "OrganizationUnitTypeCode=\"Establishment\"",
        "hrOpenDescription": "The position title for a contact of the organization.",
        "revisionNotes": "",
        "depth": 2
      },
      {
        "id": "III.M.4",
        "name": "Contact Phone",
        "definition": "The phone number of the person with organizational responsiblity for communications related to the listed contact purpose. Includes: • &#9;Country dialing code •&#9; Area dialing code • &#9;Number • &#9;Extension •&#9; Access code: The text that permits access to the electronic network of the associated communication number such as telephone network (e.g., 9, *70)\"",
        "hrOpenProperty": "Organizations/Contacts/Communication/Phone",
        "hrOpenFilter": "OrganizationUnitTypeCode=\"Establishment\"",
        "hrOpenDescription": "The phone number for a contact of the organization.",
        "revisionNotes": "",
        "depth": 2
      },
      {
        "id": "III.M.5",
        "name": "Contact E-mail",
        "definition": "The e-mail address of the person with responsiblity for establishment communications related to to the listed contact purpose.",
        "hrOpenProperty": "Organizations/Contacts/Communication/Email",
        "hrOpenFilter": "OrganizationUnitTypeCode=\"Establishment\"",
        "hrOpenDescription": "The email for a contact of the organization.",
        "revisionNotes": "",
        "depth": 2
      },
      {
        "id": "III.M.6",
        "name": "Contact Fax",
        "definition": "The fax address of the person with responsiblity for establishment communications related to to the listed contact purpose.",
        "hrOpenProperty": "Organizations/Contacts/Communication/Fax",
        "hrOpenFilter": "OrganizationUnitTypeCode=\"Establishment\"",
        "hrOpenDescription": "The fax number for a contact of the organization.",
        "revisionNotes": "",
        "depth": 2
      },
      {
        "id": "III.N",
        "name": "Predecessor Government-assigned Establishment ID Number",
        "definition": "In cases where the establishment was: a. previously operated under another Federal Employer Identification Number, and the new organization conducts similar operations to the previous organization using some or all of the predecessor's employees, enter the Government Establishment ID Number assigned to this establishment under the previous FEIN. b. combined with other units previously reported separately under the existing FEIN--enter the Government Establishment ID Number(s) assigned to this establishment before the consolidation. c. split from other units previously reported together under the existing FEIN--enter the Government Establishment ID Number(s) assigned to the combined operations before the split. Otherwise, leave this field blank.",
        "hrOpenProperty": "Organizations/FormerTaxId/Value",
        "hrOpenFilter": "OrganizationUnitTypeCode=\"Establishment\"Organizations/FormerTaxId/SchemeId = \"FEIN\"",
        "hrOpenDescription": "The former government assigned tax identifiers to distinguish organization. This typically is a country-level tax code. For example, Federal Employer Identification Number (FEIN) in the USA.",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "III.O",
        "name": "Successor Government Establishment ID Number",
        "definition": "In cases where the establishment is now: a. operated under new Federal Employer Identification Number, and the new organization conducts similar operations to the previous organization using some or all of the predecessor's employees, enter the Government Establishment ID Number assigned to this establishment under the new FEIN. b. combined with other units previously reported separately under the existing FEIN--enter the Government Establishment ID Number(s) assigned to combined establishment after the consolidation. c. split from other units previously reported together under the existing FEIN--enter the Government Establishment ID Number(s) assigned to the separate operations after the split. Otherwise, leave this field blank.",
        "hrOpenProperty": "TBD",
        "hrOpenFilter": "OrganizationUnitTypeCode=\"Establishment\"",
        "hrOpenDescription": "1905",
        "revisionNotes": "",
        "depth": 1
      }
    ]
  },
  {
    "sheet": "IV__Jobs",
    "id": "IV",
    "label": "Jobs",
    "group": "Organization",
    "title": "Organization Jobs Information",
    "count": 16,
    "elements": [
      {
        "id": "IV.A",
        "name": "Organization Job ID",
        "definition": "A company-specific alphanumeric code assigned by the employer to classify the specific job duties of workers with the same Job Title.",
        "hrOpenProperty": "Workers/workAssignments/Job/Id",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "SS > All of job is currently mapped to: Workers/workAssignments/Job/*. I believe it should be mapped to: Organizations/Jobs/* in the future.",
        "depth": 1
      },
      {
        "id": "IV.B",
        "name": "Job Title",
        "definition": "A word or label an employer uses to describe the work of their workers with the same or similar tasks, primary duties or position in the organization. For example, finish carpenter, sales representative, vice president of marketing, or charge nurse. Task - A task is a distinct activity assigned to, or performed by, workers who are carrying out job duties that result in a specific outcome. Worker - A worker is an employee who is assigned a specific set of tasks. The term worker is equivalent to the term ‘position.’ Job - A job represents all workers in an establishment with the same or similar tasks such that they may be analyzed collectively. Occupation - An occupation is a broad term representing a defined set of responsibilities, skills, and tasks common across establishments rather than specific to an individual company.",
        "hrOpenProperty": "Workers/workAssignments/Job/Title",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "IV.C",
        "name": "Job Category Code",
        "definition": "A code used to group jobs into the following broad categories: • Executives/Senior Managers • First/Mid-Level Managers • Professionals • Technicians • Sales Workers • Administrative & Clerical Support • Crafts Workers, Skilled • Operatives, Semi-skilled • Laborers & Helpers, Unskilled • Service Workers",
        "hrOpenProperty": "Workers/workAssignments/Job/CategoryCode",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "IV.D",
        "name": "Employer Job Duties",
        "definition": "The essential activities/functions/tasks performed by workers with the same Job Title at an establishment operated by the employer. Critical/Essential Job Function The critical job function is the main purpose of the job. It consists of critical activities/duties/tasks that are integral to the job. The job would not exist without the critical job function(s), which is the primary pay factor for the job. A job’s critical function is broad. Some basic examples of critical job functions include: • Janitors clean the building and grounds. • Teachers prepare and present lessons and monitor students. • Nurses provide medical care. Most jobs have one or a very limited number of critical job functions.",
        "hrOpenProperty": "Workers/workAssignments/Job/JobResponsibilities",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "IV.E",
        "name": "Employer Job-Required Skills",
        "definition": "The essential knowledge, skills, and abilities required to perform the same Job Title at an establishment operated by the employer. Job-specific skills are those abilities that allow a candidate for employment to excel in a particular job. Some skills are attained by attending school or training programs. Others can be acquired through experiential learning on the job. The skills that are needed for a specific job are also known as a skill set.",
        "hrOpenProperty": "Workers/workAssignments/Job/RequiredCompetencyIds",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "IV.F",
        "name": "Employer Job-Required Education and Experience",
        "definition": "The essential credentials, education, and /or experience required to perform the same Job Title at an establishment operated by the employer. Specific Vocational Preparation (SVP) is the minimum amount of preparation time required by a typical worker to learn the techniques, acquire the information, and develop the aptitude needed for average performance in a specific job. SVP measures the minimum vocational preparation time needed for a job. SVP includes only vocationally relevant preparation time. Therefore, SVP excludes time spent completing general education requirements, non-vocationally relevant credentials, general experience, and probationary periods where workers aren’t actively receiving on the job training. Exclude any establishment hiring requirements that do not relate to the job’s critical tasks. SVP consists of four components: • Minimum Education • Non-Degree Credentials • Experience • On the Job Training Minimum Education measures the minimum level of formal coursework resulting in a degree required of a job, excluding general education. Experience measures the minimum amount of prior relevant work activity. Include: • Skills acquired or used in a similar job • Progressively responsible levels of work • Broad, yet related, vocational capabilities Exclude non-vocational experience requirements, such as attendance history or a general requirement of previous employment.",
        "hrOpenProperty": "Workers/workAssignments/Job/RequiredCompetencyIds",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "IV.G",
        "name": "Occupational Classification Information (repeating)",
        "definition": "Occupation - An occupation is a broad term representing a defined set of responsibilities, skills, and tasks common across establishments rather than specific to a job in an individual company. Occupational classification uses numeric coding structures to classify a job's essential work activities/functions/tasks so it can be compared across employers and industries. Claaification codes are assigned by employers, employment services orgnanizations, and statistical agencies to classify work performed into categories for collecting, calculating, comparing data about the types of work performed and and compensation offered. The folliowing fields are repeated for each entity assigning a occupation classification code.",
        "hrOpenProperty": "Workers/workAssignments/Job/StandardOccupationalClassificationCodes",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "IV.G.1",
        "name": "Occupation Classification System",
        "definition": "Choose a code below to indicated which occupational classification is used: 1. Standard Occupational Classification (SOC) - United States 2. International Standard Classification of Occupations (ISCO) 3. European Skills, Competences, Qualifications and Occupations (ESCO) 4.National Occupational Classification (NOC) - Canada 5. United Kingdom Standard Occupational Classification 6. Other - specify",
        "hrOpenProperty": "Workers/workAssignments/Job/StandardOccupationalClassificationCodes/ListId",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "SS > This was SchemeId. Now appears to be ListId.",
        "depth": 2
      },
      {
        "id": "IV.G.2",
        "name": "Occupation Classification Assigning Entity",
        "definition": "Choose a code below to indicate which entity assigned the occupational classification code: 1. Employer 2. State agency responsible for Unemployment Insurance administration. 3. U.S. Bureau of Labor Statistics 4. U.S. Census Bureau 5. Other - specify",
        "hrOpenProperty": "Workers/workAssignments/Job/StandardOccupationalClassificationCodes/IssuerPartyId",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 2
      },
      {
        "id": "IV.G.3",
        "name": "Occupation Classification Value",
        "definition": "The occupational classification code value assigned.",
        "hrOpenProperty": "Workers/workAssignments/Job/StandardOccupationalClassificationCodes/Value",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 2
      },
      {
        "id": "IV.H",
        "name": "Management Role Indicator",
        "definition": "Specifies if the job is at the management level.",
        "hrOpenProperty": "Workers/workAssignments/Job/ManagerIndicator",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "IV.I",
        "name": "Management Level",
        "definition": "If this is a manager level job, this describes the type of management level • Executive • Manager • Supervisor • First Line • Lead",
        "hrOpenProperty": "Workers/workAssignments/Job/ManagerLevel",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "IV.J",
        "name": "Wage Hour Law Coverage Indicator",
        "definition": "This determines if a job is covered by wage hour laws. In the US, a job would be considered non-exempt if the indicator is true (they are covered under the law).",
        "hrOpenProperty": "Workers/workAssignments/Job/WageHourLawCoverageIndicator",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "IV.K",
        "name": "Wage Plan Code",
        "definition": "Identifies a specific salary structure or program used either throughout, or in specific segments of, an enterprise.",
        "hrOpenProperty": "Workers/workAssignments/Job/PlanCode",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "IV.L",
        "name": "Wage Grade Code",
        "definition": "Defines the salary range or band that a job falls within, based on the formal structure. Formal pay structures are less common today than in the past, but remain common in certain sectors, such as in public-sector employment and in employment covered by collective bargaining agreements.",
        "hrOpenProperty": "Workers/workAssignments/Job/GradeCode",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "IV.M",
        "name": "Wage Step Code",
        "definition": "Pinpoints a job's specific level or point within a salary range or band.",
        "hrOpenProperty": "Workers/workAssignments/Job/StepCode",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 1
      }
    ]
  },
  {
    "sheet": "V__Positions",
    "id": "V",
    "label": "Positions",
    "group": "Organization",
    "title": "Organization Budgeted Positions Information",
    "count": 9,
    "elements": [
      {
        "id": "V.A",
        "name": "Position ID Number",
        "definition": "The Identifier of a budgeted staffing position.",
        "hrOpenProperty": "Workers/workAssignments/Position/Id",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "SS > All of Position is currently mapped to: Workers/workAssignments/Position/*. I believe it should be mapped to: Organizations/Positions/* in the future.",
        "depth": 1
      },
      {
        "id": "V.B",
        "name": "Position Job Title",
        "definition": "The title of a position.",
        "hrOpenProperty": "Workers/workAssignments/Position/Title",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "V.C",
        "name": "Position Remuneration Basis",
        "definition": "A code classifying the primary method by which remuneration for a position is provided or calculated. Examples include Hourly, Salaried, Salaried plus Commission, Commission Only, Salaried plus Bonus, etc.",
        "hrOpenProperty": "RemunerationBasisCode",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "V.D",
        "name": "Position Schedule Type",
        "definition": "The type of position schedule. Values include Full-time, Part-time, Shared-Time and FlexTime.",
        "hrOpenProperty": "Workers/workAssignments/Position/PositionScheduleType",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "V.E",
        "name": "Position Type",
        "definition": "The code of the position type. Values include DirectHire, Temporary, Contract, Internship, Seasonal, etc.",
        "hrOpenProperty": "Workers/workAssignments/Position/PositionTypeCode",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "V.F",
        "name": "Position Term",
        "definition": "The code of the position term. Values include Fixed, Permanent, Casual, Seasonal.",
        "hrOpenProperty": "Workers/workAssignments/Position/PositionTermTypeCode",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "V.G",
        "name": "Position Status",
        "definition": "Employer Job Openings - All positions in the same Job Title that are open (not filled) on a specified day of the month. A job is \"open\"\" only if it meets all three of the following conditions: 1. A specific position exists and there is work available for that position. The position can be full-time or part-time, and it can be permanent, short-term, or seasonal, and 2. The job could start within 30 days, whether or not the establishment finds a suitable candidate during that time, and 3. There is active recruiting for workers from outside the establishment location that has the opening. What is \"active recruiting?\" Active recruiting means the establishment is taking steps to fill a position. It may include advertising in newspapers, on television, or on radio; posting Internet notices; posting \"\"help wanted\"\" signs; networking with colleagues or making \"\"word of mouth\"\" announcements; accepting applications; interviewing candidates; contacting employment agencies; or soliciting employees at job fairs, state or local employment offices, or similar sources. DOES NOT INCLUDE: • Positions open only to internal transfers, promotions or demotions, or recall from layoffs • Openings for positions with start dates more than 30 days in the future • Positions for which employees have been hired, but the employees have not yet reported for work • Positions to be filled by employees of temporary help agencies, employee leasing companies, outside contractors, or consultants. A separate form is used to collect information from temporary help/employee leasing firms for these employees.",
        "hrOpenProperty": "Workers/workAssignments/Position/PositionStatusCode",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "V.H",
        "name": "Position Status Date",
        "definition": "The date the position status changed.",
        "hrOpenProperty": "Workers/workAssignments/Position/PositionStatus/Date",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "V.I",
        "name": "Job Identification",
        "definition": "A code that identifies the job related to this position.",
        "hrOpenProperty": "Workers/workAssignments/Position/JobID",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 1
      }
    ]
  },
  {
    "sheet": "VI__Assignments",
    "id": "VI",
    "label": "Assignments",
    "group": "Worker",
    "title": "Organization Work Assignments Information &#9;",
    "count": 15,
    "elements": [
      {
        "id": "VI.A",
        "name": "WorkerId",
        "definition": "Provides a unique identifier to a specific worker (an employer specific identifier).",
        "hrOpenProperty": "Workers/WorkRelationship/workAssignments/WorkerId",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "SS > All of Assignment is currently mapped to: Workers/WorkRelationship/workAssignments/*. I believe it should be mapped to: Organizations/workAssignments/* in the future.",
        "depth": 1
      },
      {
        "id": "VI.B",
        "name": "Assignment Description",
        "definition": "Description of the Work Assignment.",
        "hrOpenProperty": "Workers/WorkRelationship/workAssignments/Description",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "VI.C",
        "name": "Assignment Type",
        "definition": "The code of the assignment type. Values include DirectHire, Temporary, Contract, Internship, Seasonal, etc.",
        "hrOpenProperty": "Workers/WorkRelationship/workAssignments/assignmentTermTypeCode",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "VI.D",
        "name": "Assignment Term",
        "definition": "The code of the assignment term. Values include Fixed, Permanent, Casual, Seasonal.",
        "hrOpenProperty": "Workers/WorkRelationship/workAssignments/AssignmentTermTypeCode",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "VI.E",
        "name": "Establishment ID Number",
        "definition": "A numeric identifier assigned by the state agency responsible for the Unemployment Insurance Program to each physical location where the employer conducts business.",
        "hrOpenProperty": "Workers/WorkRelationship/workAssignments/WorkLocations/Id",
        "hrOpenFilter": "Workers/workAssignments/WorkLocations/TypeCode = \"Establishment\"",
        "hrOpenDescription": "The location of the assignment.",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "VI. F",
        "name": "Pay Frequency",
        "definition": "The period of time covered by the worker's regular pay checks. 1: monthly 2: semi-monthly (twice a month) 3: biweekly (every two weeks) 4: weekly 5: daily 6: upon delivery of product 7: variable 8: other",
        "hrOpenProperty": "Workers/WorkRelationship/workAssignments/PayCycleIntervalCode",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "VI.G",
        "name": "Date of Hire",
        "definition": "Date on which the worker was added to company payroll.",
        "hrOpenProperty": "Workers/WorkRelationship/workAssignments/HireDate",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "VI. H",
        "name": "First Work Date",
        "definition": "The actual first date the person starts work.",
        "hrOpenProperty": "Workers/workAssignments/WorkRelationship/WorkAgreement/StartWorkDate",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "VI.I",
        "name": "Probationary Status Beginning Date",
        "definition": "The first day of a worker's probationary status.",
        "hrOpenProperty": "Workers/WorkRelationship/workAssignments/WorkAgreement/probationaryDatePeriod/Start",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "VI.J",
        "name": "Probationary Status Ending Date",
        "definition": "The last day of a worker's probationary status.",
        "hrOpenProperty": "Workers/WorkRelationship/workAssignments/WorkAgreement/probationaryDatePeriod/End",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "VI.K",
        "name": "Seasonal Work Start Date",
        "definition": "The starting date of an worker's seasonal work in accordance with state law.",
        "hrOpenProperty": "Workers/WorkRelationship/workAssignments/workAgreement/StartWorkDate",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "VI.L",
        "name": "Seasonal Work Ending Date",
        "definition": "The ending date of an worker's seasonal work in accordance with state law.",
        "hrOpenProperty": "Workers/WorkRelationship/workAssignments/workAgreement/EndWorkDate",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "VI.M",
        "name": "Assigned Job Code",
        "definition": "A company-specific alphanumeric code assigned by the employer to classify the worker’s specific job duties. Enter the company-designated Job Code used to classify the employee’s job duties.",
        "hrOpenProperty": "Workers/WorkRelationship/workAssignments/Job/Code",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "VI.N",
        "name": "Position ID",
        "definition": "Identifier of the specific position at an organization.",
        "hrOpenProperty": "Workers/WorkRelationship/workAssignments/PositionId",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "VI.O",
        "name": "Unit",
        "definition": "The organizational unit the work assignment supports directly.",
        "hrOpenProperty": "Workers/WorkRelationship/workAssignments/UnitId",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 1
      }
    ]
  },
  {
    "sheet": "VII__Person_PII",
    "id": "VII",
    "label": "Person / PII",
    "group": "Worker",
    "title": "Worker Personal Identification Information",
    "count": 32,
    "elements": [
      {
        "id": "VII.A",
        "name": "Worker Identification",
        "definition": "An employer-specific, unique identifier for a specific worker.",
        "hrOpenProperty": "Workers/Id",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "VII.B",
        "name": "Social Security Number",
        "definition": "A nine-digit number that the U.S. government issues to all U.S. citizens and eligible U.S. residents who apply for one. The government uses this number to keep track of the individual's lifetime earnings and the number of years worked.",
        "hrOpenProperty": "Workers/Person/TaxIds/Value",
        "hrOpenFilter": "Workers/Person/TaxIds/SchemeId = \"SSN\"",
        "hrOpenDescription": "The legal identifier of a person. The issuer is most likely a country or state.",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "VII.C",
        "name": "Previous Social Security Number",
        "definition": "An additional SSN for an employee who has performed work under more than one Social Security Number.",
        "hrOpenProperty": "Workers/Person/FormerTaxIds/Value",
        "hrOpenFilter": "Workers/Person/FormerTaxIds/ScemeId = \"FormerSSN\"",
        "hrOpenDescription": "The previous legal identifier of a person. The issuer is most likely a country or state.",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "VII.D",
        "name": "First Name",
        "definition": "The given name of a person.",
        "hrOpenProperty": "Workers/Person/Name/GivenName",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "VII.E",
        "name": "Middle Name",
        "definition": "The middle names or initials of a person.",
        "hrOpenProperty": "Workers/Person/Name/Middle",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "VII.F",
        "name": "Last Name",
        "definition": "The family name (or surname) of a person.",
        "hrOpenProperty": "Workers/Person/Name/Family",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "VII.G",
        "name": "Second Last Name",
        "definition": "Thesecond family name (or surname) of a person, if applicable.",
        "hrOpenProperty": "Workers/Person/Name/Family",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "VII.H",
        "name": "Previous Last Name",
        "definition": "The former family name of a person (used if the person's name was changed).",
        "hrOpenProperty": "Workers/Person/Name/FormerFamily",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "VII.I",
        "name": "Name Suffix",
        "definition": "The generational designation attached to the end of a person's name (such as Jr., Sr., II, III).",
        "hrOpenProperty": "Workers/Person/Name/GenerationAffixCode",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "For the current use case, I don't think Workers/Person/Name/qualificationAffixCode is applcable.",
        "depth": 1
      },
      {
        "id": "VII.J",
        "name": "Birth Date",
        "definition": "The birth date of a person.",
        "hrOpenProperty": "Workers/Person/BirthDate",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "VII.K",
        "name": "Worker Personal Address Information (repeating)",
        "definition": "Fields describing the worker's mailing and physical addresses . The following fields are repeated for each address.",
        "hrOpenProperty": "Workers/Person/Address/*",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "Changed mapping.",
        "depth": 1
      },
      {
        "id": "VII.K.1",
        "name": "Address Type",
        "definition": "1. Mailing address 2. Physical address",
        "hrOpenProperty": "Workers/Person/Address/TypeCode",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 2
      },
      {
        "id": "VII.K.2",
        "name": "Primary Line",
        "definition": "Address number and name of street, or P.O. Box",
        "hrOpenProperty": "Workers/Person/Address/Line",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 2
      },
      {
        "id": "VII.K.3",
        "name": "Secondary Line",
        "definition": "Supplementary address information (e.g., apartment or suite number, attention information)",
        "hrOpenProperty": "Workers/Person/Address/ExtendedLines",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 2
      },
      {
        "id": "VII.K.4",
        "name": "City",
        "definition": "The name of the city associated with the worker's residence or mailing address.",
        "hrOpenProperty": "Workers/Person/Address/City",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 2
      },
      {
        "id": "VII.K.5",
        "name": "Postal code",
        "definition": "The postal code (e.g., zip code) associated with worker's residence or mailing address.",
        "hrOpenProperty": "Workers/Person/Address/PostalCode",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 2
      },
      {
        "id": "VII.K.6",
        "name": "Country code",
        "definition": "The 3-digit alpha code for a country, maintained by The International Organization for Standardization (ISO) through its ISO 3166 standard for the worker's residence.",
        "hrOpenProperty": "Workers/Person/Address/CountryCode",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 2
      },
      {
        "id": "VII.K.7",
        "name": "Primary Political Subdivision",
        "definition": "The name of the state or territory, or the District of Columbia, associated with the worker's residence or mailing address.",
        "hrOpenProperty": "Workers/Person/Address/CountrySubdivisions/Value",
        "hrOpenFilter": "Workers/Person/Address/CountrySubdivisions/Type = \"State\"",
        "hrOpenDescription": "The physical or mailing address of the entity. This may include the street and building number, city, region (state, province, etc.), country and postal code.",
        "revisionNotes": "",
        "depth": 2
      },
      {
        "id": "VII.K.8",
        "name": "Secondary Political Subdivision",
        "definition": "The name of the sub-state borough, council of government, or county associated with the worker's residence or mailing address.",
        "hrOpenProperty": "Workers/Person/Address/CountrySubdivisions/Value",
        "hrOpenFilter": "Workers/Person/Address/CountrySubdivisions/Type = \"County\"",
        "hrOpenDescription": "The physical or mailing address of the entity. This may include the street and building number, city, region (state, province, etc.), country and postal code.",
        "revisionNotes": "",
        "depth": 2
      },
      {
        "id": "VII.K.9",
        "name": "Geolocation",
        "definition": "If a physical address, the latitude and longitude of the physical address associated with the worker's residence. Otherwise, leave blank.",
        "hrOpenProperty": "Workers/Person/Address/Geollocation",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 2
      },
      {
        "id": "VII.L",
        "name": "Phone Number",
        "definition": "Worker's 10-digit phone number. Includes: •&#9; Area dialing code • &#9;Number",
        "hrOpenProperty": "Workers/Person/Communication/Phone/FormattedNumber",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "VII.M",
        "name": "Email Address",
        "definition": "Worker's personal email address.",
        "hrOpenProperty": "Workers/Person/Communication/Email/Address",
        "hrOpenFilter": "Workers/Person/Communication/Email/UseCode = \"Personal\"",
        "hrOpenDescription": "An array of the email addresses of the entity.",
        "revisionNotes": "Newly added item.",
        "depth": 1
      },
      {
        "id": "VII.N",
        "name": "Mother's Maiden Name",
        "definition": "The surname that the worker's mother used from birth, prior to its being legally changed at marriage.",
        "hrOpenProperty": "TBD",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "SS > Gap: it seems we need to add MotherMaidenName to Peson.",
        "depth": 1
      },
      {
        "id": "VII.O",
        "name": "Driver's License",
        "definition": "The state and number of the driver's license held by the worker.",
        "hrOpenProperty": "Workers/Person/LegalDocuments/DocumentType= \"Drivers License\"",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "VII.P",
        "name": "VISA Type",
        "definition": "The type of VISA held by a foreign worker that allows work in the reporting country. EB-1: Priority Worker and Persons of Extraordinary Ability EB-2: Professionals Holding Advanced Degrees and Persons of Exceptional Ability EB-3: Skilled Workers, Professionals, and Unskilled Workers (Other Workers) E-4: Certain Special Immigrants E-5: Immigrant Investors H-1B: Person in Specialty Occupation H-1B1: Free Trade Agreement (FTA) Professional - Chile, Singapore H-2A: Temporary Agricultural Worker H-2B: Temporary Non-agricultural Worker H-3: Trainee or Special Education visitor J1: Educational and cultural exchange programs L-1: Intracompany Transferee, Managerial/Executive L-2: Intracompany Transferee, Employee with Specialized Knowledge O-1: Individual with Extraordinary Ability or Achievement P-1: Individual or Team Athlete, or Member of an Entertainment Group P-2: Artist or Entertainer (Individual or Group) Reciprocal Exchange P-3: Artist or Entertainer (Individual or Gr",
        "hrOpenProperty": "Workers/Person/VISA",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "VII.Q",
        "name": "Citizenship",
        "definition": "The citizenships that a person holds. This is a legal citizenship in a country (as opposed to nationality which may or may not be a country). Enter the name(s) of the country (countries) in which the individual holds citizenship status.",
        "hrOpenProperty": "Workers/Person/Citizenship",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "VII.R",
        "name": "Military Status",
        "definition": "The worker's participation in federal or state military service, including but not limited to, the armed forces of the United States, the army national guard, the air national guard, and such additional forces as may be created by the federal or state government as authorized by law. 0--Not indicated 1--No Military Service--no former or current military service 2--Vietnam Era Veteran 3--Other Veteran--veteran, but not from the Vietnam Era 4--Active Reserve--currently on active reserve 5--Inactive Reserve--currently an inactive reserve 6--Military Spouse 7--Retired--retired from the military 8--Active duty--currently on active duty",
        "hrOpenProperty": "Workers/Person/MilitaryStatus",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "VII.S",
        "name": "Gender",
        "definition": "The gender identity preferred by the worker. 0--Declines to state 1--Female 2--Male 3--Non-binary • Self-identification is the preferred method of identifying gender. • Guidance regarding requesting gender identity from workers can be found here: XXXX",
        "hrOpenProperty": "Workers/Person/Gender",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "VII.T",
        "name": "Ethnicity",
        "definition": "The race and ethnic identity preferred by the worker. 0--Declines to state 1--Hispanic or Latino 2--White (Not Hispanic or Latino) 3--Black or African American (Not Hispanic or Latino) 4--Native Hawaiian or Other Pacific Islander (Not Hispanic or Latino) 5--Asian (Not Hispanic or Latino) 6--American Indian or Alaska Native (Not Hispanic or Latino) 7--Two or More Races (Not Hispanic or Latino) • Self-identification is the preferred method of identifying race and ethnic information. • Guidance regarding requesting race and ethnic identity from workers can be found here: XXXX",
        "hrOpenProperty": "Workers/Person/Ethnicity",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "VII.U",
        "name": "Race",
        "definition": "The race and ethnic identity preferred by the worker. 0--Declines to state 1--Hispanic or Latino 2--White (Not Hispanic or Latino) 3--Black or African American (Not Hispanic or Latino) 4--Native Hawaiian or Other Pacific Islander (Not Hispanic or Latino) 5--Asian (Not Hispanic or Latino) 6--American Indian or Alaska Native (Not Hispanic or Latino) 7--Two or More Races (Not Hispanic or Latino)",
        "hrOpenProperty": "Workers/Person/Race",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "VII.V",
        "name": "Disability",
        "definition": "An indicator of whether the worker has a known, obvious, or documented disability. Enter the appropriate letter from the list below: Y = Yes N = No • Self-identification is the preferred method of identifying disability information. • Guidance regarding requesting disability information from workers can be found here: XXXX",
        "hrOpenProperty": "Workers/Person/DisabilityIndicator",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "VII.W",
        "name": "Education Level",
        "definition": "The highest degree or level of school this person has completed?” The response categories include: 1--No schooling completed 2--Nursery school 3--Grades 1 through 11 4--12th grade—no diploma 5--Regular high school diploma 6--GED or alternative credential 7--Some college credit, but less than 1 year of college 8--1 or more years of college credit, no degree 9--Associates degree (for example: AA, AS) 10--Bachelor’s degree (for example: BA. BS) 11--Master’s degree (for example: MA, MS, MEng, MEd, MSW, MBA) 12--Professional degree beyond bachelor’s degree (for example: MD, DDS, DVM, LLB, JD) 13--Doctorate degree (for example, PhD, EdD)",
        "hrOpenProperty": "Workers/Person/Education/EducationCodeLevels/",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 1
      }
    ]
  },
  {
    "sheet": "VIII__Work_Relationship",
    "id": "VIII",
    "label": "Work Relationship",
    "group": "Worker",
    "title": "Work Relationship Information &#9;",
    "count": 46,
    "elements": [
      {
        "id": "VIII.A",
        "name": "Worker Identification",
        "definition": "An employer-specific, unique identifier for a specific worker.",
        "hrOpenProperty": "Workers/Id",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "VIII.B",
        "name": "Assigned Organization Establishment ID #",
        "definition": "The alphanumeric site code used by the organization to identify the location where the worker is assigned and receives supervision and/or support. Not necessarily where the work is actually performed, The Establishment ID is a numeric code assigned by the employer to designate different establishments or work locations operated by the company, at which workers may conduct business.",
        "hrOpenProperty": "Worker/WorkRelationship/OrganizationId",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "VIII.C",
        "name": "Assigned Job ID",
        "definition": "The organization-specific, alphanumeric code identifying the job that the worker has been assigned. This code links to the organization's table of descriptive job attributes. – If the worker performs duties of two or more occupations, report them in the employer's Job ID in which most time is spent and generated the greatest earnings during the reporting period. – Report employee job titles according to the work they are doing, not their training. Example: Report someone working as a drafter, but trained as an engineer, as a drafter.",
        "hrOpenProperty": "Worker/WorkRelationship/WorkAssignments/Job/Id",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "VIII.D",
        "name": "Assigned Position ID",
        "definition": "If the organization maintains a table of position attributes, the organization-specific, alphanumeric link to the employer's table of position attributes.",
        "hrOpenProperty": "Worker/WorkRelationship/WorkAssignments/Position/Id",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "VIII.E",
        "name": "Assigned Assignment ID",
        "definition": "If the organization maintains a table of assignment attributes, the employer-specific, alphanumeric link to the employer's table of descriptive assignment information.",
        "hrOpenProperty": "Worker/WorkRelationship/WorkAssignments/Id",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "VIII.F",
        "name": "Assigned Department",
        "definition": "The name of the department to which the worker is assigned. A department is: – a distinct division or unit responsible for specific functions, tasks, or areas of expertise, facilitating efficient management of various aspects of the business, such as sales, accounting, purchasing, finance, human resources, marketing, operations, information technology, customer service. – is used to report on functional areas and may have profit and loss responsibility. – might include a group of cost centers.",
        "hrOpenProperty": "Workers/WorkRelationship/WorkAssignments/AssignedOrganizations/Name",
        "hrOpenFilter": "Workers/WorkRelationship/WorkAssignments/AssignedOrganizations/organizationUnitTypeCode = \"Department\"",
        "hrOpenDescription": "Free text description for that entity.",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "VIII.G",
        "name": "Worker's Primary Work Location Type",
        "definition": "Primary work location type – select one of the following options to describe the location where the worker spent the majority of work hours during the reporting period: 1. Worker's assigned establishment 2. Worker's residence 3. Another physical address – not the assigned establishment or residence address 4. Mobile–If the employee spent less than one-half of her/his work time during the reporting period at any individual address",
        "hrOpenProperty": "Workers/PrimaryWorkLocation/TypeCode",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "VIII.G.1",
        "name": "Type 3 – Primary Line",
        "definition": "If Primary Work Location Type = 3, enter address number and name of street, otherwise leave blank.",
        "hrOpenProperty": "Workers/PrimaryWorkLocation/Line",
        "hrOpenFilter": "Workers/PrimaryWorkLocation/TypeCode = \"3\"",
        "hrOpenDescription": "The physical or mailing address of the entity. This may include the street and building number, city, region (state, province, etc.), country and postal code.",
        "revisionNotes": "",
        "depth": 2
      },
      {
        "id": "VIII.G.2",
        "name": "Type 3 – Secondary Line",
        "definition": "If Primary Work Location Type = 3, enter and supplementary address information (e.g., apartment or suite number), otherwise leave blank.",
        "hrOpenProperty": "Workers/PrimaryWorkLocation/ExtendedLines",
        "hrOpenFilter": "Workers/PrimaryWorkLocation/TypeCode = \"3\"",
        "hrOpenDescription": "The physical or mailing address of the entity. This may include the street and building number, city, region (state, province, etc.), country and postal code.",
        "revisionNotes": "",
        "depth": 2
      },
      {
        "id": "VIII.G.3",
        "name": "Type 3 – City",
        "definition": "If Primary Work Location Type = 3, enter the name of the city associated with the worker's primary work location, otherwise leave blank.",
        "hrOpenProperty": "Workers/PrimaryWorkLocation/City",
        "hrOpenFilter": "Workers/PrimaryWorkLocation/TypeCode = \"3\"",
        "hrOpenDescription": "The physical or mailing address of the entity. This may include the street and building number, city, region (state, province, etc.), country and postal code.",
        "revisionNotes": "",
        "depth": 2
      },
      {
        "id": "VIII.G.4",
        "name": "Type 3 – Postal code",
        "definition": "If Primary Work Location Type = 3, enter the postal code (e.g., zip code) associated with the worker's primary work location, otherwise leave blank.",
        "hrOpenProperty": "Workers/PrimaryWorkLocation/PostalCode",
        "hrOpenFilter": "Workers/PrimaryWorkLocation/TypeCode = \"3\"",
        "hrOpenDescription": "The physical or mailing address of the entity. This may include the street and building number, city, region (state, province, etc.), country and postal code.",
        "revisionNotes": "",
        "depth": 2
      },
      {
        "id": "VIII.G.5",
        "name": "Type 3 – Country code",
        "definition": "If Primary Work Location Type = 3, enter the 3-digit alpha code for a country, maintained by The International Organization for Standardization (ISO) through its ISO 3166 standard for the worker's primary work location, otherwise leave blank.",
        "hrOpenProperty": "Workers/PrimaryWorkLocation/CountryCode",
        "hrOpenFilter": "Workers/PrimaryWorkLocation/TypeCode = \"3\"",
        "hrOpenDescription": "The physical or mailing address of the entity. This may include the street and building number, city, region (state, province, etc.), country and postal code.",
        "revisionNotes": "",
        "depth": 2
      },
      {
        "id": "VIII.G.6",
        "name": "Type 3 – Primary Political Subdivision",
        "definition": "If Primary Work Location Type = 3, enter the name of the state or territory, or the District of Columbia, associated with the worker's primary work location, otherwise leave blank.",
        "hrOpenProperty": "Workers/PrimaryWorkLocation/CountrySubdivisions/Value",
        "hrOpenFilter": "Workers/PrimaryWorkLocation/TypeCode = \"3\"Workers/PrimaryWorkLocation/CountrySubdivisions/Type = \"State\"",
        "hrOpenDescription": "The physical or mailing address of the entity. This may include the street and building number, city, region (state, province, etc.), country and postal code.",
        "revisionNotes": "",
        "depth": 2
      },
      {
        "id": "VIII.G.7",
        "name": "Type 3 – Secondary Political Subdivision",
        "definition": "If Primary Work Location Type = 3, enter the name of the sub-state borough, council of government, or county associated with the worker's primary work location, otherwise leave blank.",
        "hrOpenProperty": "Workers/PrimaryWorkLocation/CountrySubdivisions/Value",
        "hrOpenFilter": "Workers/PrimaryWorkLocation/TypeCode = \"3\"Workers/PrimaryWorkLocation/CountrySubdivisions/Type = \"County\"",
        "hrOpenDescription": "The physical or mailing address of the entity. This may include the street and building number, city, region (state, province, etc.), country and postal code.",
        "revisionNotes": "",
        "depth": 2
      },
      {
        "id": "VIII.G.8",
        "name": "Type 3 – Geolocation",
        "definition": "If Primary Work Location Type = 3, enter the latitude and longitude of the physical address associated with the worker's primary work location, otherwise leave blank.",
        "hrOpenProperty": "Workers/PrimaryWorkLocation/Country/Geolocation",
        "hrOpenFilter": "Workers/PrimaryWorkLocation/TypeCode = \"3\"",
        "hrOpenDescription": "The physical or mailing address of the entity. This may include the street and building number, city, region (state, province, etc.), country and postal code.",
        "revisionNotes": "",
        "depth": 2
      },
      {
        "id": "VIII.H",
        "name": "Worker Type",
        "definition": "Enter a code from the list below to indicate the type of worker: 1. Employee — A worker paid to perform services under the control of an employing organization (that directs what and how work is done). Common-law employees are the default IRS classification. Statutory employees are a subset of these workers, with specific tax treatment under IRS rules (e.g., certain drivers, insurance agents). 2. Independent Contractor — a self-employed worker who enters into contracts with employers to perform specific work, typically on a short-term basis, where the employing organization has the right to control or direct only the result of the work and not what will be done and how it will be done. In the U.S., includes direct sellers, licensed real estate agents, and companion sitters as defined by IRS guidelines. 3.Vendor-Worker — employees, representatives, personnel, agents, independent contractors, and assistants who are employed and paid by a third-party vendor (such as a manufacturer’s representative, employees of employee leasing firms, and professional employer firms) to perform services for an organization to which they provide products and services. The third-party vendor is the employer of record. 4. Volunteer—a worker who provides services of their own accord and without compulsion or promise of remuneration.",
        "hrOpenProperty": "Workers/WorkerTypeCode",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "VIII.I",
        "name": "Name of Vendor-Worker Employer",
        "definition": "For third-party vendor workers, provide the name of the organization that is the worker's legal employer. Otherwise, leave blank.",
        "hrOpenProperty": "TBD",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "VIII.J",
        "name": "FEIN of Vendor-Worker Employer",
        "definition": "For third-party vendor workers, provide the Federal Employer Identification Number (FEIN) of the organization that is the worker's legal employer. Otherwise, leave blank.",
        "hrOpenProperty": "TBD",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "VIII.K",
        "name": "Work Term Type",
        "definition": "Enter a code from the list below to indicate the type of relationship the worker has with the organization: 1. Permanent — A type of work agreement where the worker is an employee and has the expectation of an ongoing work relationship with the firm, with no predetermined end date. May be full-time or part-time. 2. Probationary — A type of work agreement that provides a set trial period at the start of a potentially permanent position. Not a standalone category long term as workers usually convert to permanent or are let go. 3. Temporary — Employment with a predetermined end date or time-limited nature. Worker may be an employee, independent contractor, vendor worker, or volunteer. Subtypes: 3a. Temporary Fixed-Term — A type of temporary work agreement for a set period of time. Begins and ends on specified dates, or when particular events occur. Used for unpredictable workloads, contract/project work, and other limited-term needs, such as a leave of absence. May be full-time or part-time. 3b. Temporary Seasonal — A type of temporary work agreement that is tied to a particular season of the year or to cyclical demand. May be full-time or part-time. Often used in retail, agriculture, tourism, etc. 3c. Temporary Casual — Irregular, on-call, or as-needed work, no guaranteed hours.",
        "hrOpenProperty": "Workers/WorkRelationship/WorkAgreement/TermTypeCode",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "VIII.L",
        "name": "Worker–Trainee Type",
        "definition": "Enter a code from the list below to indicate the type of worker training relationship the worker has with the employer organization: 1. Apprentice — Worker enrolled in a structured, often paid, program to learn a trade or skill. Employment is tied to training, often with the intention to prepare for permanent employment. 2. Intern — Generally works for a company or organization for a short period to gain experience in a specific field. Typically for students or recent graduates, often tied to school credit or career exploration. May be paid or unpaid. 3. Extern — Short-term, observation-based experience, usually unpaid and often based on academic credit. Externships are typically short-term and more focused on observation of professionals at work to gain insight into a career or industry. 4. Not Applicable",
        "hrOpenProperty": "Workers/Trainee/TraineeTypeCode",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "VIII.M",
        "name": "Work Status",
        "definition": "The classification of an worker into one of the following four categories, indicating the worker's payroll status with the firm: • Pending = Commences at the point of job offer and acceptance, pending background checks and agreed upon waiting period. • Employment--Active = Includes paid and unpaid time engaged in actual work, paid leave time, and unpaid time off that is part of worker's regular weekly schedule. • Employment--Inactive = unpaid time off that is not part of worker's regular weekly schedule due to special circumstances. • Terminated/Post-employment = No longer employed.",
        "hrOpenProperty": "Workers/WorkRelationship/Status/StatusCode",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "VIII.N",
        "name": "Work Status Date",
        "definition": "The date on which the Work Status changes.",
        "hrOpenProperty": "Workers/WorkRelationshipStatus/StatusDate",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "VIII.O",
        "name": "Work Status Reason",
        "definition": "The reason for the worker's current Work Status: • Pending—New Hire • Pending—Rehire Employed--Active, includes paid leave • Active—Working • Active—Paid Leave Employed--Inactive • Inactive—Labor dispute--lockout • Inactive—Labor dispute--walkout • Inactive—Disciplinary suspension • Inactive—Temporary layoff • Inactive—No hours scheduled • Inactive—Furlough • Inactive—End of season • Inactive—Holiday shutdown • Inactive—Requested unpaid time off",
        "hrOpenProperty": "Workers/WorkRelationship/Status/ReasonCode",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "",
        "name": "2052",
        "definition": "",
        "hrOpenProperty": "",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 0
      },
      {
        "id": "VIII.P",
        "name": "Officer Indicator",
        "definition": "Indicates whether the worker is classified as an officer of the organization. Report a \"1\" if the individual is an officer of the company. Otherwise report a \"0\".",
        "hrOpenProperty": "Workers/OfficerIndicator",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "VIII.Q",
        "name": "Stock Owner Indicator",
        "definition": "Indicates whether the worker is a stock owner of the organization. Report a \"1\" if the individual is an owner of the company. Otherwise report a \"0\".",
        "hrOpenProperty": "Workers/StockOwnerIndicator",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "VIII.R",
        "name": "Pay Frequency",
        "definition": "The period of time covered by the worker's regular pay checks. 1: monthly 2: semi-monthly (twice a month) 3: biweekly (every two weeks) 4: weekly 5: daily 6: upon delivery of product 7: variable 8: other",
        "hrOpenProperty": "Workers/PayCycleIntervalCode",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "VIII.S",
        "name": "Date of Hire",
        "definition": "Date on which the worker was added to company payroll.",
        "hrOpenProperty": "Workers/OriginalHireDate",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "VIII.T",
        "name": "Date of Termination",
        "definition": "Date on which the worker received final compensation.",
        "hrOpenProperty": "Workers/LastPaidDate",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "Why not workerLifeCycle?",
        "depth": 1
      },
      {
        "id": "VIII.U",
        "name": "First Work Date",
        "definition": "The actual first date the person starts work.",
        "hrOpenProperty": "Workers/StartedWorkDate",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "VIII.V",
        "name": "Last Work Date",
        "definition": "The last date on which an employee actually worked for pay. This date should not reflect leave time taken at the end of employment.",
        "hrOpenProperty": "Workers/LastWorkedDate",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "Why not workerLifeCycle?",
        "depth": 1
      },
      {
        "id": "VIII.W",
        "name": "Contract Beginning Date",
        "definition": "The beginning date of a employment contract with an independent contractor.",
        "hrOpenProperty": "Workers/WorkRelationship/InceptionDate",
        "hrOpenFilter": "Workers/WorkRelationship/TypeCode = \"Independent Contractor\"",
        "hrOpenDescription": "The start date for the contract.",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "VIII.X",
        "name": "Contract Ending Date",
        "definition": "The ending date of a employment contract with an independent contractor.",
        "hrOpenProperty": "Workers/WorkRelationship/TerminationDate",
        "hrOpenFilter": "Workers/WorkRelationship/TypeCode = \"Independent Contractor\"",
        "hrOpenDescription": "The end date for the contract.",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "VIII.Y",
        "name": "Probationary Status Beginning Date",
        "definition": "The first day of a worker's probationary status.",
        "hrOpenProperty": "Workers/WorkRelationship/WorkAgreement/StartDate",
        "hrOpenFilter": "Workers/WorkRelationship/WorkAgreement/WorkTermType = \"Probationary\"",
        "hrOpenDescription": "The first day of a worker's probationary status.",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "VIII.Z",
        "name": "Probationary Status Ending Date",
        "definition": "The last day of a worker's probationary status.",
        "hrOpenProperty": "Workers/WorkRelationship/WorkAgreement/EndingDate",
        "hrOpenFilter": "Workers/WorkRelationship/WorkAgreement/WorkTermType = \"Probationary\"",
        "hrOpenDescription": "The last day of a worker's probationary status.",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "VIII.AA",
        "name": "Temporary Work Term Beginning Date",
        "definition": "The beginning date of a worker's temporary (casual, fixed-term, or seasonal) work term.",
        "hrOpenProperty": "Workers/WorkRelationship/WorkAgreement/startWorkDate",
        "hrOpenFilter": "Workers/WorkRelationship/WorkAgreement/WorkTermType = \"Seasonal\"",
        "hrOpenDescription": "The first day of a worker's seasonal work status.",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "VIII.AB",
        "name": "Temporary Work Term Ending Date",
        "definition": "The ending date of a worker's temporary (casual, fixed-term, or seasonal) work term.",
        "hrOpenProperty": "Workers/WorkRelationship/WorkAgreement/endWorkDate",
        "hrOpenFilter": "Workers/WorkRelationship/WorkAgreement/WorkTermType = \"Seasonal\"",
        "hrOpenDescription": "The last day of a worker's seasonal work status.",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "VIII.AC",
        "name": "Worker-Trainee Period Beginning Date",
        "definition": "The beginning date of a worker-trainee's training period.",
        "hrOpenProperty": "Workers/Trainee/TrainingRelationship/TrainingAgreements/workDatePeriod/Start",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "VIII.AD",
        "name": "Worker-Trainee Period Ending Date",
        "definition": "The ending date of a worker-trainee's training period.",
        "hrOpenProperty": "Workers/Trainee/TrainingRelationship/TrainingAgreements/workDatePeriod/End",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "VIII.AE",
        "name": "Return-to-Work Date",
        "definition": "The date on which a worker who had been on temporary inactive status returned to work (active status).",
        "hrOpenProperty": "Workers/ReturnToWorkDate",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "Why not workerLifeCycle?",
        "depth": 1
      },
      {
        "id": "VIII.AF",
        "name": "FLSA Indicator",
        "definition": "Identifies whether the worker is exempt or non-exempt under the Fair Labor Standards Act (FLSA).",
        "hrOpenProperty": "Workers/WageHourLawCoverageIndicator",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "VIII.AG",
        "name": "Union Status",
        "definition": "Indicates if the worker is part of a labor bargaining unit, such as a union. Enter the appropriate letter from the list below: Y = Yes N = No",
        "hrOpenProperty": "Workers/LaborBargainingUnitIndicator",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "VIII.AH",
        "name": "Unemployment Compensation Coverage Flag",
        "definition": "An indicator of whether the worker is covered by some type of federal or state unemployment insurance.",
        "hrOpenProperty": "Workers/Unemployment Compensation Coverage Indicator",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "VIII.AI",
        "name": "Worker Compensation Coverage Indicator Flag",
        "definition": "An indicator of whether the worker is covered by some type of federal or state workers' compensation insurance.",
        "hrOpenProperty": "Workers/Worker Compensation Coverage Indicator",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "VIII.AJ",
        "name": "Health Care Coverage",
        "definition": "Employer-sponsored health care coverage. Indicate which one of the following conditions applies to the worker: 1.&#9; Coverage available for worker and dependents 2.&#9; Coverage available for worker only 3.&#9; Coverage not available for worker or dependents",
        "hrOpenProperty": "TBD",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "VIII.AK",
        "name": "Family Worker",
        "definition": "Indicate which one of the following conditions applies to the worker: 1.&#9; Child paid for domestic work in their parent’s private home. 2.&#9; Child working in their parent’s sole proprietorship 3.&#9; Child working for a partnership in which each partner is a parent of the child. 4.&#9; Child working for a corporation owned by their parent. 5.&#9; Child working for a partnership where all partners are parents of the child. 6.&#9; Child working for their parent’s estate. 7. Parent working for their child’s sole proprietorship. 8.&#9; Parent working for a corporation controlled by their child. 9.&#9; Parent working for a partnership where their child is a partner. 10.&#9; Parent working for their child’s estate. 11.&#9; Parent performing domestic services for their child and •&#9; Employing child has a child or stepchild living in the home, •&#9; Employing child is a widow or widower, divorced, or living with a spouse, who because of a mental or physical condition, can't care for the child or stepchild for at least 4 continuous weeks in a calendar quarter, and •&#9; The child or stepchild is either under age 18 or requires the personal care of an adult for at least 4 continuous weeks in a calendar quarter due to a mental or physical condition. 12.&#9; Spouse working with their spouse in a “qualified joint venture” as defined by the Internal Revenue Code. 13.&#9; Not applicable.",
        "hrOpenProperty": "TBD",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 1
      }
    ]
  },
  {
    "sheet": "IX__Worker_Paid_Time_Report",
    "id": "IX",
    "label": "Worker Paid-Time Report",
    "group": "Worker",
    "title": "Worker Work-Time Information",
    "count": 35,
    "elements": [
      {
        "id": "IX.A",
        "name": "Worker Identification",
        "definition": "An employer-specific, unique identifier for a specific worker.",
        "hrOpenProperty": "WorkerPaidHoursReports/WorkerId",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "IX.B",
        "name": "Paid Time Period",
        "definition": "The period of the time for which the worker was paid.",
        "hrOpenProperty": "WorkerPaidHoursReports/reportingTimePeriod",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "IX.B.2",
        "name": "Paid Time Jurisdiction",
        "definition": "The political jurisdiction in which the hours worked were considered paid for tax purposes (city, state, region, nation)",
        "hrOpenProperty": "WorkerPaidHoursReports/reportingJurisdiction",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 2
      },
      {
        "id": "IX.C",
        "name": "Weeks Worked",
        "definition": "The number of weeks, during the paid time period, for which the worker earned, at a minimum, an amount of remuneration specified by the state based on time worked and paid leave taken. • Report a count of the number of calendar weeks (Sunday through Saturday) during the month/quarter in which the employee earned at least the state-specified amount of remuneration from the employer. • Report weeks in whole numbers • The maximum number of weeks worked in any quarter is 13. • Do not report additional weeks worked for accrued leave that the worker sold back to the company during the month/quarter. • Do not include weeks for which severance pay was received unless the state-specified minimum remuneration was earned for that week aside from the severance. Severance and termination pay compensate the worker for the separation from employment, not for weeks worked.",
        "hrOpenProperty": "WorkerPaidHoursReports/WorkedWeeks",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "IX.D",
        "name": "Days Worked",
        "definition": "The number of days, during the paid time period, for which the worker earned compensation.",
        "hrOpenProperty": "WorkerPaidHoursReports/WorkedDays",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "IX.E",
        "name": "Worked in Payroll Period Including 12th of 1st Month of Quarter",
        "definition": "A flag to indicate whether the worker worked for pay during any part of the pay period that included the 12th day of the month. • Report a \"1\" if the employee worked for pay during the pay period that included the 12th day of the month. Otherwise report a \"0\".",
        "hrOpenProperty": "WorkerPaidHoursReports/PaidForWorkInPayPeriod/paidForWorkIndicator",
        "hrOpenFilter": "WorkerPaidHoursReports/PaidForWorkInPayPeriod/IncludedDayOfMonth = \"12\"WorkerPaidHoursReports/PaidForWorkInPayPeriod/ReportedMonth = First month of reporting quarter.",
        "hrOpenDescription": "A flag to indicate whether the worker worked for pay during any part of the pay period that included the 12th day of the month.",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "IX.F",
        "name": "Worked in Payroll Period Including 12th of 2nd Month of Quarter",
        "definition": "A flag to indicate whether the worker worked for pay during any part of the pay period that included the 12th day of the month. • Report a \"1\" if the employee worked for pay during the pay period that included the 12th day of the month. Otherwise report a \"0\".",
        "hrOpenProperty": "WorkerPaidHoursReports/PaidForWorkInPayPeriod/paidForWorkIndicator",
        "hrOpenFilter": "WorkerPaidHoursReports/PaidForWorkInPayPeriod/IncludedDayOfMonth = \"12\"WorkerPaidHoursReports/PaidForWorkInPayPeriod/ReportedMonth = Second month of reporting quarter.",
        "hrOpenDescription": "A flag to indicate whether the worker worked for pay during any part of the pay period that included the 12th day of the month.",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "IX.G",
        "name": "Worked in Payroll Period Including 12th of 3rd Month of Quarter",
        "definition": "A flag to indicate whether the worker worked for pay during any part of the pay period that included the 12th day of the month. • Report a \"1\" if the employee worked for pay during the pay period that included the 12th day of the month. Otherwise report a \"0\".",
        "hrOpenProperty": "WorkerPaidHoursReports/PaidForWorkInPayPeriod/paidForWorkIndicator",
        "hrOpenFilter": "WorkerPaidHoursReports/PaidForWorkInPayPeriod/IncludedDayOfMonth = \"12\"WorkerPaidHoursReports/PaidForWorkInPayPeriod/ReportedMonth = Third month of reporting quarter.",
        "hrOpenDescription": "A flag to indicate whether the worker worked for pay during any part of the pay period that included the 12th day of the month.",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "IX.H",
        "name": "Total Hours Paid",
        "definition": "The total number of hours for which a worker received pay. Includes all actual work hours and hours of employer-paid leave that were used. Total Paid Hours = Total Hours Worked + Total Hours of Paid Leave (Paid Time Off) • &#9;If the employer tracks the employee’s hours: report the total number of hours of work and time off during the subject month/quarter for which the employee was paid by the employer. • &#9;If the employer does not track the employee’s hours: o For full-time employees, use 40 hours per week worked or on paid leave. o For part-‐time employees, estimate the number of hours. o For full-time plus, use 40 hours per week plus an estimate. •&#9; Report hours in whole numbers. Round partial hours to the nearest hour. If the fraction is \"1/2 hour/0.5 hour\" or more it should be rounded up to the next whole hour, and if it's less than 1/2 hour, it should be rounded down • Report only the number of hours actually worked, and hours actually taken on employer‐paid leave. • Report the number of hours actually worked for which overtime pay or compensatory time is earned, without regard to the overtime pay rate. Do not reflect additional hours for overtime that earns premium rates of pay. For example, if the worker works 10 hours of overtime at a pay rate of 1.5 times her/his regular hourly rate, report 10 hours worked not 15 hours. • Do not report additional hours for accrued leave that the worker sold back to the company during the month/quarter. Report the amounts paid for leave buy backs under ‘Other Cash Compensation Paid.’ • Report hours of employer‐paid compensatory time off when taken. • Do not report additional hours for severance pay. Severance and termination pay compensate the worker for the separation from employment, not for actual hours worked",
        "hrOpenProperty": "WorkerPaidHoursReports/TotalPaidHours",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "IX.H.1",
        "name": "Total Paid Hours Worked",
        "definition": "The total number of hours a worker was engaged in a paid work activity, including regular and premium hours (overtime, shift differential), rest periods and stand-by time. Includes work hours for which compensatory time off was earned. Does not include any employer-paid leave time used. Total Hours Worked = Regular Hours Worked + Total Premium Hours Worked • If the employer tracks the employee’s hours: report the total number of hours the employee was engaged in a work activity during the subject month/quarter for which the employee was paid. • Do not include hours of employer-paid leave • If the employer does not track the employee’s hours: o For full-time employees, use 40 hours per week worked. o For part-time employees, estimate the number of hours actually worked. o For full-time plus, use 40 hours per week plus an estimate. • Report hours in whole numbers. Round partial hours to the nearest hour. If the fraction is \"1/2 hour/0.5 hour\" or more it should be rounded up to the next whole hour, and if it's less than 1/2 hour, it should be rounded down. • Report only the number of hours actually worked. Do not include hours taken on employer-paid leave unless such leave is not separately tracked. For example, if the worker is paid by salary and leave hours are not separately tracked, report the worker’s total hours for the month, including any leave he/she may have taken. No hours included here should be reported under Total Hours of Paid Leave or any specific category of paid leave. • Report the number of hours actually worked for which overtime pay or compensatory time is earned, without regard to the overtime pay rate. Do not reflect additional hours for overtime that earns premium rates of pay. For example, if the worker works 10 hours of overtime at a pay rate of 1.5 times her/his regular hourly rate, report 10 hours worked not 15 hours. • Do not report additional hours for accrued leave that the worker sold back to the company during the month/quarter. Report the amounts paid for leave buy backs under ‘Other Cash Compensation Paid.’ • Do not report additional hours for severance pay. Severance and termination pay compensate the worker for the separation from employment, not for actual hours worked.",
        "hrOpenProperty": "WorkerPaidHoursReports/TotaWorkedlHours",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 2
      },
      {
        "id": "IX.H.1.a",
        "name": "Regular Pay Hours Worked",
        "definition": "The number of hours a worker actually worked, including rest periods and stand-by time, for which a standard salary, hourly rate, or other type of compensation (e.g., piece work, commission) was paid. Does not include any hours for which overtime or shift premium was paid or hours of employer-paid leave time that were used. • If the employer tracks the employee’s hours: report the total number of hours the employee was engaged in a work activity during the subject month/quarter for which the employee was paid or accrued pay at a standard salaried, hourly, or commissioned rate. • &#9;Do not include hours for which overtime or shift premium rates are paid. • &#9;Do not include hours of employer-paid leave. • &#9;Do not include hours paid in lieu of notice of termination. Report these under In-Lieu-of-Notice Leave Paid •&#9; If the employer does not track the employee’s hours: o&#9; For full-time employees, use 40 hours per week worked. o&#9; For part-time employees, estimate the number of hours actually worked. o&#9; For full-time plus, use 40 hours per week plus an estimate •&#9; Report hours in whole numbers. Round partial hours to the nearest hour. If the fraction is \"1/2 hour/0.5 hour\" or more it should be rounded up to the next whole hour, and if it's less than 1/2 hour, it should be rounded down. •&#9; Report only the number of regular hours actually worked. Do not include hours taken on paid leave unless such leave time is not separately tracked. For example, if the worker is paid by salary and leave hours are not separately tracked, report the worker’s total hours for the month, including any leave he/she may have taken. No hours included here should be reported under Total Hours of Paid Leave or any specific category of paid leave. •&#9; Do not include hours worked for which overtime pay or compensatory time is earned. •&#9; Do not report additional hours for accrued leave that the worker sold back to the company during the month/quarter. Report the amounts paid for leave buy backs under ‘Other Cash Compensation Paid.’ •&#9; Do not report additional hours for severance pay. Severance and termination pay compensate the worker for the separation from employment, not for actual hours worked.",
        "hrOpenProperty": "WorkerPaidHoursReports/RegularWorkedHours",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 3
      },
      {
        "id": "IX.H.1.b",
        "name": "Total Premium Pay Hours Worked",
        "definition": "The number of hours a worker actually worked, including stand-by time, for which a premium rate of compensation was paid. Includes overtime and hours for which shift differentials were paid such as night, holiday or weekend work. Includes hours for which compensatory time off was earned, if more than one hour of CTO was earned for each hour of actual work. Does not include any hours used of employer-paid leave time. Total Premium Hours Worked = Overtime Hours Worked + Shift Differential Hours Worked + Call-Back Hours Worked + Holiday Hours Worked + Hazardous Duty Hours Worked + Other Premium Hours Worked • If the employer tracks the employee’s hours: report the total number of hours the employee was engaged in a work activity during the subject month/quarter for which the employee was paid at a premium hourly rate. Include only hours for which overtime or shift premium was paid. • Do not include hours worked which were paid at a regular/standard rate. •&#9; Do not include hours of paid leave. •&#9; If no premium hours were worked during the month/quarter, report a zero in this field. •&#9; If the employer does not track the employee’s hours, report a zero in this field. •&#9; Report hours in whole numbers. Round partial hours to the nearest hour. If the fraction is \"1/2 hour/0.5 hour\" or more it should be rounded up to the next whole hour, and if it's less than 1/2 hour, it should be rounded down. • Report only the number of hours actually worked. Do not include hours taken on paid leave. • Report only the number of hours actually worked for which overtime pay or compensatory time was accrued without regard to the overtime pay rate. Do not reflect additional hours for overtime that earns premium rates of pay. For example, if the worker works 10 hours of overtime at a pay rate of 1.5 times her/his regular hourly rate, report 10 hours worked not 15 hours. • Do not report additional hours for accrued leave that the worker sold back to the company during the month/quarter. Report the amounts paid for leave buy backs under ‘Other Cash Compensation Paid.’ • Do not report additional hours for severance pay. Severance and termination pay compensate the worker for the separation from employment, not for actual hours worked",
        "hrOpenProperty": "WorkerPaidHoursReports/TotalPremiumWorkedHours",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 3
      },
      {
        "id": "IX.H.1.b.(1)",
        "name": "Overtime Pay Hours Worked",
        "definition": "The number of hours a worker actually worked, beyond normal daily or weekly working hours, for which a premium rate of compensation was paid, as specified in agreement, contract, or law. Does not include any hours used of employer-paid leave time. • If the employer tracks the employee’s hours: report the total number of hours the employee was engaged in overtime activity during the subject month/quarter for which the employee was paid at a premium hourly rate. Include only hours for which a premium wage rate was paid. • Do not include hours worked which were paid at a regular/standard rate. •&#9; Do not include hours of paid leave. •&#9; If no overtime hours were worked during the month/quarter, report a zero in this field. •&#9; If the employer does not track the employee’s hours, report a zero in this field. •&#9; Report hours in whole numbers. Round partial hours to the nearest hour. If the fraction is \"1/2 hour/0.5 hour\" or more it should be rounded up to the next whole hour, and if it's less than 1/2 hour, it should be rounded down. • Report only the number of hours actually worked. Do not include hours taken on paid leave. • Report only the number of hours actually worked for which overtime pay or compensatory time was accrued without regard to the overtime pay rate. Do not reflect additional hours for shift work that earns premium rates of pay. For example, if the worker works 10 hours of overtime at a pay rate of 1.5 times her/his regular hourly rate, report 10 hours worked not 15 hours. • Do not report additional hours for accrued leave that the worker sold back to the company during the month/quarter. Report the amounts paid for leave buy backs under ‘Other Cash Compensation Paid.’ • Do not report additional hours for severance pay. Severance and termination pay compensate the worker for the separation from employment, not for actual hours worked",
        "hrOpenProperty": "WorkerPaidHoursReports/PremiumWorkedHours/workedHours",
        "hrOpenFilter": "WorkerPaidHoursReports/PremiumWorkedHours/workedPayTypeCode = \"Overtime\"",
        "hrOpenDescription": "The number of hours a worker was engaged in a premium paid work activity, including premium hours (overtime, shift differential), rest periods and stand-by time. Includes work hours for which compensatory time off was earned. Does not include any employer-paid leave time used.",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "IX.H.1.b.(2)",
        "name": "Shift Differential Pay Hours Worked",
        "definition": "The number of hours a worker actually worked during alternate shifts, for which a premium rate of compensation was paid. Includes hours for which compensatory time off was earned, if more than one hour of CTO was earned for each hour of actual work. Does not include any hours used of employer-paid leave time. • If the employer tracks the employee’s hours: report the total number of hours the employee was engaged in shift work activity during the subject month/quarter for which the employee was paid at a premium hourly rate. Include only hours for which a premium wage rate was paid. • Do not include hours worked which were paid at a regular/standard rate. •&#9; Do not include hours of paid leave. •&#9; If no premium shift hours were worked during the month/quarter, report a zero in this field. •&#9; If the employer does not track the employee’s hours, report a zero in this field. •&#9; Report hours in whole numbers. Round partial hours to the nearest hour. If the fraction is \"1/2 hour/0.5 hour\" or more it should be rounded up to the next whole hour, and if it's less than 1/2 hour, it should be rounded down. • Report only the number of hours actually worked. Do not include hours taken on paid leave. • Report only the number of hours actually worked for which shift pay or compensatory time was accrued without regard to the overtime pay rate. Do not reflect additional hours for shift work that earns premium rates of pay. For example, if the worker works 10 hours of shift work at a pay rate of 1.5 times her/his regular hourly rate, report 10 hours worked not 15 hours. • Do not report additional hours for accrued leave that the worker sold back to the company during the month/quarter. Report the amounts paid for leave buy backs under ‘Other Cash Compensation Paid.’ • Do not report additional hours for severance pay. Severance and termination pay compensate the worker for the separation from employment, not for actual hours worked",
        "hrOpenProperty": "WorkerPaidHoursReports/PremiumWorkedHours/workedHours",
        "hrOpenFilter": "WorkerPaidHoursReports/PremiumWorkedHours/workedPayTypeCode = \"ShiftDifferential\"",
        "hrOpenDescription": "The number of hours a worker was engaged in a premium paid work activity, including premium hours (overtime, shift differential), rest periods and stand-by time. Includes work hours for which compensatory time off was earned. Does not include any employer-paid leave time used.",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "IX.H.1.b.(3)",
        "name": "Call-Back Pay Hours Worked",
        "definition": "The number of hours a worker actually worked after normal hours, such as during a workplace emergency, for which a premium rate of compensation was paid. Includes hours for which compensatory time off was earned, if more than one hour of CTO was earned for each hour of actual work. Does not include any hours used of employer-paid leave time. • If the employer tracks the employee’s hours: report the total number of hours the employee was engaged in call-back work activity during the subject month/quarter for which the employee was paid at a premium hourly rate. Include only hours for which a premium wage rate was paid. • Do not include hours worked which were paid at a regular/standard rate. •&#9; Do not include hours of paid leave. •&#9; If no premium call-back hours were worked during the month/quarter, report a zero in this field. •&#9; If the employer does not track the employee’s hours, report a zero in this field. •&#9; Report hours in whole numbers. Round partial hours to the nearest hour. If the fraction is \"1/2 hour/0.5 hour\" or more it should be rounded up to the next whole hour, and if it's less than 1/2 hour, it should be rounded down. • Report only the number of hours actually worked. Do not include hours taken on paid leave. • Report only the number of hours actually worked for which call-back pay or compensatory time was accrued without regard to the overtime pay rate. Do not reflect additional hours for call-back work that earns premium rates of pay. For example, if the worker works 10 hours of call-back work at a pay rate of 1.5 times her/his regular hourly rate, report 10 hours worked not 15 hours. • Do not report additional hours for accrued leave that the worker sold back to the company during the month/quarter. Report the amounts paid for leave buy backs under ‘Other Cash Compensation Paid.’ • Do not report additional hours for severance pay. Severance and termination pay compensate the worker for the separation from employment, not for actual hours worked",
        "hrOpenProperty": "WorkerPaidHoursReports/PremiumWorkedHours/workedHours",
        "hrOpenFilter": "WorkerPaidHoursReports/PremiumWorkedHours/workedPayTypeCode = \"Call-Back\"",
        "hrOpenDescription": "The number of hours a worker was engaged in a paid work activity, including regular and premium hours (overtime, shift differential), rest periods and stand-by time. Includes work hours for which compensatory time off was earned. Does not include any employer-paid leave time used.",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "IX.H.1.b.(4)",
        "name": "Holiday Hours Pay Worked",
        "definition": "The number of hours a worker actually worked over a weekend or on a company-provided holiday when weekend and holiday work was not part of the worker's regular schedule, and for which a premium rate of compensation was paid. Includes hours for which compensatory time off was earned, if more than one hour of CTO was earned for each hour of actual work. Does not include any hours used of employer-paid leave time. • If the employer tracks the employee’s hours: report the total number of hours the employee was engaged in weekend or holiday work activity during the subject month/quarter for which the employee was paid at a premium hourly rate. Include only hours for which a premium wage rate was paid. • Do not include hours worked which were paid at a regular/standard rate. •&#9; Do not include hours of paid leave. •&#9; If no premium weekend or holiday hours were worked during the month/quarter, report a zero in this field. •&#9; If the employer does not track the employee’s hours, report a zero in this field. •&#9; Report hours in whole numbers. Round partial hours to the nearest hour. If the fraction is \"1/2 hour/0.5 hour\" or more it should be rounded up to the next whole hour, and if it's less than 1/2 hour, it should be rounded down. • Report only the number of hours actually worked. Do not include hours taken on paid leave. • Report only the number of hours actually worked for which weekend or holiday pay or compensatory time was accrued without regard to the overtime pay rate. Do not reflect additional hours for call-back work that earns premium rates of pay. For example, if the worker works 10 hours of call-back work at a pay rate of 1.5 times her/his regular hourly rate, report 10 hours worked not 15 hours. • Do not report additional hours for accrued leave that the worker sold back to the company during the month/quarter. Report the amounts paid for leave buy backs under ‘Other Cash Compensation Paid.’ • Do not report additional hours for severance pay. Severance and termination pay compensate the worker for the separation from employment, not for actual hours worked",
        "hrOpenProperty": "WorkerPaidHoursReports/PremiumWorkedHours/workedHours",
        "hrOpenFilter": "WorkerPaidHoursReports/PremiumWorkedHours/workedPayTypeCode = \"Holiday\"",
        "hrOpenDescription": "The number of hours a worker was engaged in a premium paid work activity, including premium hours (overtime, shift differential), rest periods and stand-by time. Includes work hours for which compensatory time off was earned. Does not include any employer-paid leave time used.",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "IX.H.1.b.(5)",
        "name": "Hazardous Duty Pay Hours Worked",
        "definition": "The number of hours a worker actually worked in situations where individuals may be directly exposed to hazards on the job (e.g., handling explosives or hazardous chemicals), for which a premium rate of compensation was paid. Includes hours for which compensatory time off was earned, if more than one hour of CTO was earned for each hour of actual work. Does not include any hours used of employer-paid leave time. • If the employer tracks the employee’s hours: report the total number of hours the employee was engaged in hazardous work activity during the subject month/quarter for which the employee was paid at a premium hourly rate. Include only hours for which a premium wage rate was paid. • Do not include hours worked which were paid at a regular/standard rate. •&#9; Do not include hours of paid leave. •&#9; If no hazardous duty hours were worked during the month/quarter, report a zero in this field. •&#9; If the employer does not track the employee’s hours, report a zero in this field. •&#9; Report hours in whole numbers. Round partial hours to the nearest hour. If the fraction is \"1/2 hour/0.5 hour\" or more it should be rounded up to the next whole hour, and if it's less than 1/2 hour, it should be rounded down. • Report only the number of hours actually worked. Do not include hours taken on paid leave. • Report only the number of hours actually worked for which hazardous duty pay or compensatory time was accrued without regard to the overtime pay rate. Do not reflect additional hours for call-back work that earns premium rates of pay. For example, if the worker works 10 hours of hazardous work at a pay rate of 1.5 times her/his regular hourly rate, report 10 hours worked not 15 hours. • Do not report additional hours for accrued leave that the worker sold back to the company during the month/quarter. Report the amounts paid for leave buy backs under ‘Other Cash Compensation Paid.’ • Do not report additional hours for severance pay. Severance and termination pay compensate the worker for the separation from employment, not for actual hours worked",
        "hrOpenProperty": "WorkerPaidHoursReports/PremiumWorkedHours/workedHours",
        "hrOpenFilter": "WorkerPaidHoursReports/PremiumWorkedHours/workedPayTypeCode = \"Hazardous\"",
        "hrOpenDescription": "The number of hours a worker was engaged in a paid work activity, including regular and premium hours (overtime, shift differential), rest periods and stand-by time. Includes work hours for which compensatory time off was earned. Does not include any employer-paid leave time used.",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "IX.H.1.b.(6)",
        "name": "Other Premium Pay Hours Worked",
        "definition": "The number of hours a worker actually worked in other situations for which a premium rate of compensation was paid. Includes hours for which compensatory time off was earned, if more than one hour of CTO was earned for each hour of actual work. Does not include any hours used of employer-paid leave time. • If the employer tracks the employee’s hours: report the total number of hours the employee was engaged in other activities during the subject month/quarter for which the employee was paid at a premium hourly rate. Include only hours for which a premium wage rate was paid. • Do not include hours worked which were paid at a regular/standard rate. •&#9; Do not include hours of paid leave. •&#9; If no other premium hours were worked during the month/quarter, report a zero in this field. •&#9; If the employer does not track the employee’s hours, report a zero in this field. •&#9; Report hours in whole numbers. Round partial hours to the nearest hour. If the fraction is \"1/2 hour/0.5 hour\" or more it should be rounded up to the next whole hour, and if it's less than 1/2 hour, it should be rounded down. • Report only the number of hours actually worked. Do not include hours taken on paid leave. • Report only the number of hours actually worked for which other premium activities pay or compensatory time was accrued without regard to the overtime pay rate. Do not reflect additional hours for call-back work that earns premium rates of pay. For example, if the worker works 10 hours of premium work at a pay rate of 1.5 times her/his regular hourly rate, report 10 hours worked not 15 hours. • Do not report additional hours for accrued leave that the worker sold back to the company during the month/quarter. Report the amounts paid for leave buy backs under ‘Other Cash Compensation Paid.’ • Do not report additional hours for severance pay. Severance and termination pay compensate the worker for the separation from employment, not for actual hours worked",
        "hrOpenProperty": "WorkerPaidHoursReports/PremiumWorkedHours/workedHours",
        "hrOpenFilter": "WorkerPaidHoursReports/PremiumWorkedHours/workedPayTypeCode = \"Other\"",
        "hrOpenDescription": "The number of hours a worker was engaged in a premium paid work activity, including premium hours (overtime, shift differential), rest periods and stand-by time. Includes work hours for which compensatory time off was earned. Does not include any employer-paid leave time used.",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "IX.H.2",
        "name": "Total Hours of Paid Leave (Paid Time Off)",
        "definition": "The total number of hours of employer-paid time used by a worker for any type of absence from work when used. Total Hours of Paid Leave (Paid Time Off) - Paid Administrative Leave Hours Used + Paid Bereavement Leave Hours Used + Paid Compensatory Time Off (CTO) Hours Used + Paid Consolidated Time Off (PTO) Hours Used + Paid Education Leave Hours Used + Paid Family Leave Hours Used + Paid Holiday Leave Hours Used + Paid In-Lieu-of-Notice Leave Hours Used + Paid Jury Duty Leave Hours Used + Paid Military Duty Leave Hours Used + Paid Sick Leave Hours Used • &#9;If the employer tracks the employee’s paid leave hours: report the total number of hours the employee was paid by the employer or accrued pay for absence from work during the subject month/quarter. • If the employer does not separately track the employee’s leave hours or does not provide any type of paid leave, report a zero in this field. • Report hours in whole numbers. Round partial hours to the nearest hour. If the fraction is \"1/2 hour/0.5 hour\" or more it should be rounded up to the next whole hour, and if it's less than 1/2 hour, it should be rounded down. • Include any hours paid in lieu of notice of termination. • &#9;Report only the actual number of hours of employer-paid leave. Do not report hours taken on paid leave unless such leave is separately tracked. No hours included here should be reported under Total Hours Worked, Regular Hours Worked, or Premium Hours Worked. •&#9; Do not report additional hours for accrued leave that the worker sold back to the company during the month/quarter. Report the amounts paid for leave buy backs under ‘Other Cash Compensation Paid.’ •&#9; Do not report additional hours for severance pay. Severance and termination pay compensate the worker for the separation from employment, not for personal leave.",
        "hrOpenProperty": "WorkerPaidHoursReports/totalPaidTimeOffHours",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 2
      },
      {
        "id": "IX.H.2.a",
        "name": "Paid Administrative Leave Hours Used",
        "definition": "The number of hours of employer-paid leave that a worker used at the discretion or direction of the employer. Administrative Time Off is not deducted from the worker's leave balances. • If the employer separately tracks the employee’s Administrative Leave hours: report the number of hours the employee was paid by the employer or accrued pay for absence from work using Bereavement Leave during the subject month/quarter. • &#9;If the employer does not separately track the employee’s Administrative leave hours or does not provide paid bereavement leave, report a zero in this field. •&#9; Report hours in whole numbers. Round partial hours to the nearest hour. If the fraction is \"1/2 hour/0.5 hour\" or more it should be rounded up to the next whole hour, and if it's less than 1/2 hour, it should be rounded down. • Report only the actual number of hours of employer-paid Administrative leave. Do not report hours taken on paid Administrative leave unless such leave is separately tracked. No hours included here should be reported under Total Hours Worked, Regular Hours Worked, or Premium Hours Worked.",
        "hrOpenProperty": "WorkerPaidHoursReports/paidTimeOffHours/timeOffHours",
        "hrOpenFilter": "WorkerPaidHoursReports/paidTimeOffHours/timeOffTypeCode = \"Administrative Leave\"",
        "hrOpenDescription": "The number of hours of employer-paid time used by a worker for any type of absence from work including vacation, sickness, bereavement, maternity, family care, jury duty, education, meals, military duty, administrative time off, sabbatical, or other personal leave. Includes hours of compensatory time off (CTO) when used.",
        "revisionNotes": "",
        "depth": 3
      },
      {
        "id": "IX.H.2.b",
        "name": "Paid Bereavement Leave Hours Used",
        "definition": "When the employer offers such benefit as a separate accrued leave, the number of hours of employer-paid leave that a worker used because of the death of a family or household member. • If the employer separately tracks the employee’s Bereavement Leave hours: report the number of hours the employee was paid by the employer or accrued pay for absence from work using Bereavement Leave during the subject month/quarter. • &#9;If the employer does not separately track the employee’s bereavement leave hours or does not provide paid bereavement leave, report a zero in this field. •&#9; Report hours in whole numbers. Round partial hours to the nearest hour. If the fraction is \"1/2 hour/0.5 hour\" or more it should be rounded up to the next whole hour, and if it's less than 1/2 hour, it should be rounded down. • Report only the actual number of hours of employer-paid bereavement leave. Do not report hours taken on paid bereavement leave unless such leave is separately tracked. No hours included here should be reported under Total Hours Worked, Regular Hours Worked, or Premium Hours Worked. •&#9; Do not report additional hours for accrued bereavement leave that the worker sold back to the company during the month/quarter. Report the amounts paid for leave buy backs under ‘Other Cash Compensation Paid.’",
        "hrOpenProperty": "WorkerPaidHoursReports/paidTimeOffHours/timeOffHours",
        "hrOpenFilter": "WorkerPaidHoursReports/paidTimeOffHours/timeOffTypeCode = \"Bereavement Leave\"",
        "hrOpenDescription": "The number of hours of employer-paid time used by a worker for any type of absence from work including vacation, sickness, bereavement, maternity, family care, jury duty, education, meals, military duty, administrative time off, sabbatical, or other personal leave. Includes hours of compensatory time off (CTO) when used.",
        "revisionNotes": "",
        "depth": 3
      },
      {
        "id": "IX.H.2.c",
        "name": "Paid Compensatory Time Off (CTO) Hours Used",
        "definition": "The number of hours of previously earned employer-paid Compensatory Time Off that was used by a worker for personal leave. Generally, CTO is granted and accrued in lieu of overtime pay for irregular or occasional overtime work. • If the employer separately tracks the employee’s CTO leave hours: report the number of hours the employee was paid by the employer or accrued pay for absence from work using CTO during the subject month/quarter. • If the employer does not separately track the employee’s CTO leave hours or does not provide paid CTO, report a zero in this field • Report hours in whole numbers. Round partial hours to the nearest hour. If the fraction is \"1/2 hour/0.5 hour\" or more it should be rounded up to the next whole hour, and if it's less than 1/2 hour, it should be rounded down. • Report only the actual number of hours of employer-paid CTO absence. Do not report hours taken on paid CTO absence unless such leave is separately tracked. No hours included here should be reported under Total Hours Worked, Regular Hours Worked, or Premium Hours Worked. • &#9;Do not report additional hours for accrued CTO that the worker sold back to the company during the month/quarter. Report the amounts paid for leave buy backs under ‘Other Cash Compensation Paid.’ &#9;",
        "hrOpenProperty": "WorkerPaidHoursReports/paidTimeOffHours/timeOffHours",
        "hrOpenFilter": "WorkerPaidHoursReports/paidTimeOffHours/timeOffTypeCode = \"Compensatory\"",
        "hrOpenDescription": "The number of hours of employer-paid time used by a worker for any type of absence from work including vacation, sickness, bereavement, maternity, family care, jury duty, education, meals, military duty, administrative time off, sabbatical, or other personal leave. Includes hours of compensatory time off (CTO) when used.",
        "revisionNotes": "",
        "depth": 3
      },
      {
        "id": "IX.H.2.d",
        "name": "Paid Consolidated Time Off (PTO) Hours Used",
        "definition": "When the employer offers such benefit as a separate accrued leave, the number of hours of general-purpose employer paid leave that a worker was entitled to, and used at her/his discretion for vacations, family leave, holidays, sick leave, rest and relaxation, and other personal business or emergencies. • If the employer separately tracks the employee’s Consolidated Paid Time Off hours: report the number of hours the employee was paid by the employer or accrued pay for absence from work using their Consolidated Personal Leave during the subject month/quarter. • If the employer does not separately track the employee’s leave hours or does not provide Consolidated PTO, report a zero in this field. • Report hours in whole numbers. Round partial hours to the nearest hour. If the fraction is \"1/2 hour/0.5 hour\" or more it should be rounded up to the next whole hour, and if it's less than 1/2 hour, it should be rounded down. • Report only the actual number of hours of employer-paid absence using Consolidated Paid Time Off. Do not report hours taken on paid Consolidated PTO absence unless such leave is separately tracked. No hours included here should be reported under Total Hours Worked, Regular Hours Worked, or Premium Hours Worked. • Do not report additional hours for accrued Consolidated PTO that the worker sold back to the company during the month/quarter. Report the amounts paid for leave buy backs under ‘Other Cash Compensation Paid.’",
        "hrOpenProperty": "WorkerPaidHoursReports/paidTimeOffHours/timeOffHours",
        "hrOpenFilter": "WorkerPaidHoursReports/paidTimeOffHours/timeOffTypeCode = \"Consolidated\"",
        "hrOpenDescription": "The number of hours of employer-paid time used by a worker for any type of absence from work including vacation, sickness, bereavement, maternity, family care, jury duty, education, meals, military duty, administrative time off, sabbatical, or other personal leave. Includes hours of compensatory time off (CTO) when used.",
        "revisionNotes": "",
        "depth": 3
      },
      {
        "id": "IX.H.2.e",
        "name": "Paid Education Leave Hours Used",
        "definition": "When the employer offers such benefit as a separate accrued leave, the number of hours a worker was paid by the employer to pursue outside, non-in-service, education. • If the employer separately tracks the employee’s Education Leave hours: report the number of hours the employee was paid by the employer or accrued pay for absence from work using their Education Leave during the subject month/quarter. • If the employer does not separately track the employee’s Education Leave hours or does not provide paid Family Leave, report a zero in this field. • Report hours in whole numbers. Round partial hours to the nearest hour. If the fraction is \"1/2 hour/0.5 hour\" or more it should be rounded up to the next whole hour, and if it's less than 1/2 hour, it should be rounded down. • Report only the actual number of hours of employer-paid absence using Education Leave. Do not report hours taken on paid Education Leave unless such leave is separately tracked. No hours included here should be reported under Total Hours Worked, Regular Hours Worked, or Premium Hours Worked. • Do not report additional hours for accrued Education Leave that the worker sold back to the company during the month/quarter. Report the amounts paid for leave buy backs under ‘Other Cash Compensation Paid.’",
        "hrOpenProperty": "WorkerPaidHoursReports/paidTimeOffHours/timeOffHours",
        "hrOpenFilter": "WorkerPaidHoursReports/paidTimeOffHours/timeOffTypeCode = \"Education\"",
        "hrOpenDescription": "The number of hours of employer-paid time used by a worker for any type of absence from work including vacation, sickness, bereavement, maternity, family care, jury duty, education, meals, military duty, administrative time off, sabbatical, or other personal leave. Includes hours of compensatory time off (CTO) when used.",
        "revisionNotes": "",
        "depth": 3
      },
      {
        "id": "IX.H.2.f",
        "name": "Paid Family Leave Hours Used",
        "definition": "When the employer offers such benefit as a separate accrued leave, the number of hours a worker was paid by the employer to care for a family member, including child, maternity, paternity, or elder care leave. • If the employer separately tracks the employee’s Family Leave hours: report the number of hours the employee was paid by the employer or accrued pay for absence from work using their Family Leave during the subject month/quarter. • If the employer does not separately track the employee’s Family Leave hours or does not provide paid Family Leave, report a zero in this field. • Report hours in whole numbers. Round partial hours to the nearest hour. If the fraction is \"1/2 hour/0.5 hour\" or more it should be rounded up to the next whole hour, and if it's less than 1/2 hour, it should be rounded down. • Report only the actual number of hours of employer-paid absence using Family Leave. Do not report hours taken on paid Family Leave unless such leave is separately tracked. No hours included here should be reported under Total Hours Worked, Regular Hours Worked, or Premium Hours Worked. • Do not report additional hours for accrued Family Leave that the worker sold back to the company during the month/quarter. Report the amounts paid for leave buy backs under ‘Other Cash Compensation Paid.’",
        "hrOpenProperty": "WorkerPaidHoursReports/paidTimeOffHours/timeOffHours",
        "hrOpenFilter": "WorkerPaidHoursReports/paidTimeOffHours/timeOffTypeCode = \"Family\"",
        "hrOpenDescription": "The number of hours of employer-paid time used by a worker for any type of absence from work including vacation, sickness, bereavement, maternity, family care, jury duty, education, meals, military duty, administrative time off, sabbatical, or other personal leave. Includes hours of compensatory time off (CTO) when used.",
        "revisionNotes": "",
        "depth": 3
      },
      {
        "id": "IX.H.2.g",
        "name": "Total Paid Holiday Leave Hours Used",
        "definition": "When the employer offers such benefit as a separate accrued leave, the number of hours a worker was paid by the employer for absence from work on days of special religious, cultural, social, or patriotic significance, on which work and business ordinarily cease. Includes public and floating holiday paid leave. Holiday Leave Hours Used = Public Holiday Leave Hours Used + Floating Holiday Leave Hours Used • If the employer separately tracks the employee’s Holiday Leave hours: report the number of hours the employee was paid by the employer or accrued pay for absence from work using their Holiday Leave during the subject month/quarter. • If the employer does not separately track the employee’s Holiday Leave hours or does not provide paid Holiday Leave, report a zero in this field. • Report hours in whole numbers. Round partial hours to the nearest hour. If the fraction is \"1/2 hour/0.5 hour\" or more it should be rounded up to the next whole hour, and if it's less than 1/2 hour, it should be rounded down. • Report only the actual number of hours of employer-paid absence using Holiday Leave. Do not report hours taken on paid Holiday Leave unless such leave is separately tracked. No hours included here should be reported under Total Hours Worked, Regular Hours Worked, or Premium Hours Worked. • Do not report additional hours for accrued Holiday Leave that the worker sold back to the company during the month/quarter. Report the amounts paid for leave buy backs under ‘Other Cash Compensation Paid.’",
        "hrOpenProperty": "WorkerPaidHoursReports/totalHolidayPaidTimeOffHours",
        "hrOpenFilter": "WorkerPaidHoursReports/paidTimeOffHours/timeOffTypeCode = \"Family\"",
        "hrOpenDescription": "Total Holiday Leave Hours Used - When the employer offers such benefit as a separate accrued leave, the number of hours a worker was paid by the employer for absence from work on days of special religious, cultural, social, or patriotic significance, on which work and business ordinarily cease. Includes public and floating holiday paid leave",
        "revisionNotes": "",
        "depth": 3
      },
      {
        "id": "IX.H.2.g.(1)",
        "name": "Paid Public Holiday Leave Hours Used",
        "definition": "When the employer offers such benefit as a separate accrued leave, the number of hours a worker was paid by the employer for absence from work on publicly recognized days of special religious, cultural, social, or patriotic significance, on which work and business ordinarily cease. • If the employer separately tracks the employee’s Public Holiday Leave hours: report the number of hours the employee was paid by the employer or accrued pay for absence from work using their Holiday Leave during the subject month/quarter. • If the employer does not separately track the employee’s Public Holiday Leave hours or does not provide paid Public Holiday Leave, report a zero in this field. • Report hours in whole numbers. Round partial hours to the nearest hour. If the fraction is \"1/2 hour/0.5 hour\" or more it should be rounded up to the next whole hour, and if it's less than 1/2 hour, it should be rounded down. • Report only the actual number of hours of employer-paid absence using Public Holiday Leave. Do not report hours taken on paid Public Holiday Leave unless such leave is separately tracked. No hours included here should be reported under Total Hours Worked, Regular Hours Worked, or Premium Hours Worked. • Do not report additional hours for accrued Public Holiday Leave that the worker sold back to the company during the month/quarter. Report the amounts paid for leave buy backs under ‘Other Cash Compensation Paid.’",
        "hrOpenProperty": "WorkerPaidHoursReports/paidTimeOffHours/timeOffHours",
        "hrOpenFilter": "WorkerPaidHoursReports/paidTimeOffHours/timeOffTypeCode = \"Public Holiday\"",
        "hrOpenDescription": "The number of hours of employer-paid time used by a worker for any type of absence from work including vacation, sickness, bereavement, maternity, family care, jury duty, education, meals, military duty, administrative time off, sabbatical, or other personal leave. Includes hours of compensatory time off (CTO) when used.",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "IX.H.2.g.(2)",
        "name": "Paid Floating Holiday Leave Hours Used",
        "definition": "When the employer offers such benefit as a separate accrued leave, the number of hours a worker was paid by the employer for absence from work offered as a substitution for a public holiday, to be used at a worker’s discretion. • If the employer separately tracks the employee’s Floating Holiday Leave hours: report the number of hours the employee was paid by the employer or accrued pay for absence from work using their Floating Holiday Leave during the subject month/quarter. • If the employer does not separately track the employee’s Floating Holiday Leave hours or does not provide paid Holiday Leave, report a zero in this field. • Report hours in whole numbers. Round partial hours to the nearest hour. If the fraction is \"1/2 hour/0.5 hour\" or more it should be rounded up to the next whole hour, and if it's less than 1/2 hour, it should be rounded down. • Report only the actual number of hours of employer-paid absence using Floating Holiday Leave. Do not report hours taken on paid Floating Holiday Leave unless such leave is separately tracked. No hours included here should be reported under Total Hours Worked, Regular Hours Worked, or Premium Hours Worked. • Do not report additional hours for accrued Floating Holiday Leave that the worker sold back to the company during the month/quarter. Report the amounts paid for leave buy backs under ‘Other Cash Compensation Paid.’",
        "hrOpenProperty": "WorkerPaidHoursReports/paidTimeOffHours/timeOffHours",
        "hrOpenFilter": "WorkerPaidHoursReports/paidTimeOffHours/timeOffTypeCode = \"Floating Holiday\"",
        "hrOpenDescription": "The number of hours of employer-paid time used by a worker for any type of absence from work including vacation, sickness, bereavement, maternity, family care, jury duty, education, meals, military duty, administrative time off, sabbatical, or other personal leave. Includes hours of compensatory time off (CTO) when used.",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "IX.H.2.h",
        "name": "Paid In-Lieu-of-Notice Leave Hours Used",
        "definition": "The number of hours a worker does not work as a result of the employer's decision not to provide a required notice of termination and for which the worker was paid. • Report the number of hours the employee was paid by the employer or accrued pay for absence from work as a result of the employer's decision not to provide a required notice of termination during the subject month/quarter. • Report hours in whole numbers. Round partial hours to the nearest hour. If the fraction is \"1/2 hour/0.5 hour\" or more it should be rounded up to the next whole hour, and if it's less than 1/2 hour, it should be rounded down. • Report only the actual number of hours of employer-paid absence as a result of the employer's decision not to provide a required notice of termination. No hours included here should be reported under Total Hours Worked, Regular Hours Worked, or Premium Hours Worked.",
        "hrOpenProperty": "WorkerPaidHoursReports/paidTimeOffHours/timeOffHours",
        "hrOpenFilter": "WorkerPaidHoursReports/paidTimeOffHours/timeOffTypeCode = \"In-Lieu-of-Notice\"",
        "hrOpenDescription": "The number of hours of employer-paid time used by a worker for any type of absence from work including vacation, sickness, bereavement, maternity, family care, jury duty, education, meals, military duty, administrative time off, sabbatical, or other personal leave. Includes hours of compensatory time off (CTO) when used.",
        "revisionNotes": "",
        "depth": 3
      },
      {
        "id": "IX.H.2.i",
        "name": "Paid Jury Duty Leave Hours Used",
        "definition": "When the employer offers such benefit as a separate accrued leave, the number of hours a worker was paid by the employer for absence from work when he/she was summoned to serve as a juror. • If the employer separately tracks the employee’s Jury Duty Leave hours: report the number of hours the employee was paid by the employer or accrued pay for absence from work using their Jury Duty Leave during the subject month/quarter. • If the employer does not separately track the employee’s Jury Duty Leave hours or does not provide paid Jury Duty Leave, report a zero in this field. • Report hours in whole numbers. Round partial hours to the nearest hour. If the fraction is \"1/2 hour/0.5 hour\" or more it should be rounded up to the next whole hour, and if it's less than 1/2 hour, it should be rounded down. • Report only the actual number of hours of employer-paid absence using Jury Duty Leave. Do not report hours taken on paid Jury Duty Leave unless such leave is separately tracked. No hours included here should be reported under Total Hours Worked, Regular Hours Worked, or Premium Hours Worked.",
        "hrOpenProperty": "WorkerPaidHoursReports/paidTimeOffHours/timeOffHours",
        "hrOpenFilter": "WorkerPaidHoursReports/paidTimeOffHours/timeOffTypeCode = \"Jury Duty\"",
        "hrOpenDescription": "The number of hours of employer-paid time used by an employee for any type of absence from work including vacation, sickness, bereavement, maternity, family care, jury duty, education, meals, military duty, administrative time off, sabbatical, or other personal leave. Includes hours of compensatory time off (CTO) when used.",
        "revisionNotes": "",
        "depth": 3
      },
      {
        "id": "IX.H.2.j",
        "name": "Paid Military Duty Leave Hours Used",
        "definition": "When the employer offers such benefit as a separate accrued leave, the number of hours a worker was paid by the employer for absence from work to fulfill military commitments. • If the employer separately tracks the employee’s Military Duty Leave hours: report the number of hours the employee was paid by the employer or accrued pay for absence from work using their Military Duty Leave during the subject month/quarter. • If the employer does not separately track the employee’s Military Duty Leave hours or does not provide paid Military Leave, report a zero in this field. • Report hours in whole numbers. Round partial hours to the nearest hour. If the fraction is \"1/2 hour/0.5 hour\" or more it should be rounded up to the next whole hour, and if it's less than 1/2 hour, it should be rounded down. • Report only the actual number of hours of employer-paid absence using Military Duty Leave. Do not report hours taken on paid Military Duty Leave unless such leave is separately tracked. No hours included here should be reported under Total Hours Worked, Regular Hours Worked, or Premium Hours Worked.",
        "hrOpenProperty": "WorkerPaidHoursReports/paidTimeOffHours/timeOffHours",
        "hrOpenFilter": "WorkerPaidHoursReports/paidTimeOffHours/timeOffTypeCode = \"Military\"",
        "hrOpenDescription": "The number of hours of employer-paid time used by a worker for any type of absence from work including vacation, sickness, bereavement, maternity, family care, jury duty, education, meals, military duty, administrative time off, sabbatical, or other personal leave. Includes hours of compensatory time off (CTO) when used.",
        "revisionNotes": "",
        "depth": 3
      },
      {
        "id": "IX.H.2.k",
        "name": "Paid Sick Leave Hours Used",
        "definition": "When the employer offers such benefit as a separate accrued leave, the number of hours a worker was paid for absence from work when he/she was unable to work because of a non-work-related illness or injury. • If the employer separately tracks the employee’s Sick Leave hours: report the number of hours the employee was paid by the employer or accrued pay for absence from work using their Sick Leave during the subject month/quarter. • If the employer does not separately track the employee’s Sick Leave hours or does not provide paid Sick Leave, report a zero in this field • Report hours in whole numbers. Round partial hours to the nearest hour. If the fraction is \"1/2 hour/0.5 hour\" or more it should be rounded up to the next whole hour, and if it's less than 1/2 hour, it should be rounded down. • Report only the actual number of hours of employer-paid absence using Sick Leave. Do not report hours taken on paid Sick Leave unless such leave is separately tracked. No hours included here should be reported under Total Hours Worked, Regular Hours Worked, or Premium Hours Worked. • Do not report additional hours for accrued Sick Leave that the worker sold back to the company during the month/quarter. Report the amounts paid for leave buy backs under ‘Other Cash Compensation Paid.’",
        "hrOpenProperty": "WorkerPaidHoursReports/paidTimeOffHours/timeOffHours",
        "hrOpenFilter": "WorkerPaidHoursReports/paidTimeOffHours/timeOffTypeCode = \"Sick\"",
        "hrOpenDescription": "The number of hours of employer-paid time used by a worker for any type of absence from work including vacation, sickness, bereavement, maternity, family care, jury duty, education, meals, military duty, administrative time off, sabbatical, or other personal leave. Includes hours of compensatory time off (CTO) when used.",
        "revisionNotes": "",
        "depth": 3
      },
      {
        "id": "IX.H.2.l",
        "name": "Paid Vacation Leave Hours Used",
        "definition": "When the employer offers such benefit as a separate accrued leave, the number of hours a worker was paid for absence from work for recreation, relaxation, and rest. Paid vacations are typically provided on an annual basis and taken in blocks of days or weeks. • If the employer separately tracks the employee’s Vacation Leave hours: report the number of hours the employee was paid by the employer or accrued pay for absence from work using their Vacation Leave during the subject month/quarter. • If the employer does not separately track the employee’s Vacation Leave hours or does not provide paid Vacation Leave, report a zero in this field. • Report hours in whole numbers. Round partial hours to the nearest hour. If the fraction is \"1/2 hour/0.5 hour\" or more it should be rounded up to the next whole hour, and if it's less than 1/2 hour, it should be rounded down. • Report only the actual number of hours of employer-paid absence using Vacation Leave. Do not report hours taken on paid Vacation Leave unless such leave is separately tracked. No hours included here should be reported under Total Hours Worked, Regular Hours Worked, or Premium Hours Worked. • Do not report additional hours for accrued Vacation Leave that the worker sold back to the company during the month/quarter. Report the amounts paid for leave buy backs under ‘Other Cash Compensation Paid.’",
        "hrOpenProperty": "WorkerPaidHoursReports/paidTimeOffHours/timeOffHours",
        "hrOpenFilter": "WorkerPaidHoursReports/paidTimeOffHours/timeOffTypeCode = \"Vacation\"",
        "hrOpenDescription": "The number of hours of employer-paid time used by a worker for any type of absence from work including vacation, sickness, bereavement, maternity, family care, jury duty, education, meals, military duty, administrative time off, sabbatical, or other personal leave. Includes hours of compensatory time off (CTO) when used.",
        "revisionNotes": "",
        "depth": 3
      },
      {
        "id": "IX.H.2.m",
        "name": "Other Paid Personal Leave Hours Used",
        "definition": "The number of hours a worker was paid for absence from work for any purpose not captured in another specific type of leave authorized by the employer. • Report the number of hours the employee was paid by the employer or accrued pay for absence from work any absence from work not captured in another specific type of leave authorized by the employer during the subject month/quarter. • If the employer does not separately track other types of paid leave or does not provide any other types of paid personal leave, report a zero in this field • Include hours paid in lieu of notice of termination. • Report hours in whole numbers. Round partial hours to the nearest hour. If the fraction is \"1/2 hour/0.5 hour\" or more it should be rounded up to the next whole hour, and if it's less than 1/2 hour, it should be rounded down. • Report only the actual number of hours of employer-paid absence using Other Paid Personal Leave. Do not report hours taken on paid Other Paid Personal Leave unless such leave is separately tracked. No hours included here should be reported under Total Hours Worked, Regular Hours Worked, or Premium Hours Worked. • Do not report additional hours for accrued Other Paid Personal Leave that the worker sold back to the company during the month/quarter. Report the amounts paid for leave buy backs under ‘Other Cash Compensation Paid.’",
        "hrOpenProperty": "WorkerPaidHoursReports/paidTimeOffHours/timeOffHours",
        "hrOpenFilter": "WorkerPaidHoursReports/paidTimeOffHours/timeOffTypeCode = \"Other\"",
        "hrOpenDescription": "The number of hours of employer-paid time used by a worker for any type of absence from work including vacation, sickness, bereavement, maternity, family care, jury duty, education, meals, military duty, administrative time off, sabbatical, or other personal leave. Includes hours of compensatory time off (CTO) when used.",
        "revisionNotes": "",
        "depth": 3
      },
      {
        "id": "IX.I",
        "name": "Total Unpaid Hours Worked",
        "definition": "The number of hours a worker worked without pay.",
        "hrOpenProperty": "",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 1
      }
    ]
  },
  {
    "sheet": "X__Worker_Comp_Report",
    "id": "X",
    "label": "Worker Compensation Report",
    "group": "Worker",
    "title": "Worker Compensation Information",
    "count": 178,
    "elements": [
      {
        "id": "X.A",
        "name": "Worker Identification",
        "definition": "An employer-specific, unique identifier for a specific worker.",
        "hrOpenProperty": "WorkerCompensationReports/WorkerId",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "X.B",
        "name": "Compensation Time Period",
        "definition": "The period of work time for which the compensation was paid.",
        "hrOpenProperty": "WorkerCompensationReports/ReportingTimePeriod",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "X.B.2",
        "name": "Compensation Jurisdiction",
        "definition": "The political jurisdiction in which the compensation was considered paid for tax purposes (city, state, region, nation)",
        "hrOpenProperty": "WorkerCompensationReports/Jurisdiction",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 2
      },
      {
        "id": "X.C",
        "name": "Total Compensation",
        "definition": "The total monetary amount of all cash, cash-equivalent and non-cash compensation that was paid by the employer to a worker for her or his services, for work or time off from work. Includes payments directly to the worker such as salary, hourly wages, commissions, bonuses, lump-sum, residuals, severance, tips, and incentive, piecework, and job or production-based payments, as well as the monetary value of non-cash fringe benefits paid indirectly to the worker, such as employer-paid portions of Social Security, Medicare, Unemployment Insurance, health/dental/vision insurance, retirement benefits, educational benefits, and relocation expenses, and meals and lodging provided for the employer’s benefit. Total Compensation = Total Cash (Direct) Compensation (Gross Pay) + Total Non-Cash (Indirect) Compensation • Enter the total dollar amount of compensation paid by the employer for the worker’s work time or time off and for the worker’s non-cash fringe benefits funded by the employer during the subject month/quarter. • These amounts should be calculated prior to reduction for withholding of any discretionary or required deductions. This is generally the dollar amount of all compensation reported in box 5, Medicare wages and tips, on federal Form W-2. • Do not reduce compensation amounts to reflect worker’s tax deductions, bonds, union dues, exemptions, withholding, health insurance, or pay deferral plans such as 401(k); the reported figures should equal the pre-tax gross amounts. • Report wages when paid, when constructively paid, or when worker receives remuneration other than cash. Amounts are constructively paid when credited to the worker’s account or set apart for the worker so they may be drawn at any time, although not actually in her or his possession. • Examples of non-cash fringe benefits paid indirectly to the worker: , employer-paid portions of Social Security, Medicare, Unemployment Insurance, health/dental/vision insurance, retirement benefits, educational benefits, and relocation expenses, and meals and lodging provided for the employer’s benefit.",
        "hrOpenProperty": "TotalCompensationAmount",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "X.C.1",
        "name": "Total Direct Cash Compensation",
        "definition": "The total monetary amount of all forms of cash or cash-equivalent (currency, coin, check, or direct deposit) compensation paid by the employer directly to the worker for her or his services, for work or time off from work. Includes, but is not limited to, salary, hourly wages, commissions, bonuses, lump-sum, residuals, severance, tips, and incentive, piecework, and job or production-based payments. Includes payments for leave time taken and leave buy backs. Total Cash (Direct) Compensation (Gross Pay) = Salary Paid + Total Hourly Wages Paid + Total Leave Paid + Total Other Cash Compensation Paid • Enter the total dollar amount of cash or cash equivalent compensation paid by the employer for the worker’s work time or time off during the subject month/quarter. • Do not include the dollar amount of non-cash fringe benefits funded by the employer. • These amounts should be calculated prior to reduction for withholding of any discretionary or required deductions. This is generally the amount of cash compensation reported in box 5, Medicare wages and tips, on federal Form W-2. • If worker was not paid cash compensation during the subject month/quarter report a zero in this field. • Do not reduce compensation amounts to reflect worker’s tax deductions, bonds, union dues, exemptions, withholding, health insurance, or pay deferral plans such as 401(k); the reported figures should equal the pre-tax gross amounts. • Report cash compensation when paid or when constructively paid. Amounts are constructively paid when credited to the worker’s account or set apart for the worker so they may be drawn at any time, although not actually in her or his possession.",
        "hrOpenProperty": "WorkerCompensationReports/DirectCompensation/",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 2
      },
      {
        "id": "X.C.1.a",
        "name": "Salary Paid",
        "definition": "The agreed upon fixed or set monetary amount of cash or cash-equivalent (currency, coin, check, or direct deposit) compensation paid by the employer to a worker for her or his services, that was not based on hours worked or production level. Salary is commonly paid in fixed intervals, for example, monthly payments of one-twelfth of the annual salary. • Enter the total dollar amount of Salary Paid by the employer for the worker’s work time or time off during the subject month/quarter. • Do not include other forms of compensation other than salary. • If worker is not paid by salary as defined above, report a zero in this field. • Do not reduce compensation amounts to reflect worker’s tax deductions, bonds, union dues, exemptions, withholding, health insurance, or pay deferral plans such as 401(k); the reported figures should equal the pre-tax gross amounts. • Report salary when paid or when constructively paid. Amounts are constructively paid when credited to the worker’s account or set apart for the worker so they may be drawn at any time, although not actually in her or his possession. • Report the amounts paid for leave buy backs under ‘Other Cash Compensation Paid.’",
        "hrOpenProperty": "WorkerCompensationReports/DirectCompensation/SalaryAmount",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 3
      },
      {
        "id": "X.C.1.b",
        "name": "Total Hourly Wages Paid",
        "definition": "The total monetary amount of cash or cash-equivalent (currency, coin, check, or direct deposit) compensation paid by the employer to a worker for her or his services based on hourly rates of pay and the number of hours worked. Includes pay for both regular hours (straight-time) and premium hours (overtime, shift differentials) worked. Total Hourly Wages Paid = Regular Hourly Wages Paid + Premium Hourly Wages Paid • Enter the total dollar amount of hourly wages paid by the employer for the worker’s work time during the subject month/quarter. • Do not reduce compensation amounts to reflect worker’s tax deductions, bonds, union dues, exemptions, withholding, health insurance, or pay deferral plans such as 401(k); the reported figures should equal the pre-tax gross amounts. • Do not include other forms of compensation other than hourly wages. • Do not include pay for time off from work or amounts paid to buy back accrued leave. • If worker is not paid hourly wages as defined above, report a zero in this field. • Report Total Hourly Wages when paid or when constructively paid. Amounts are constructively paid when credited to the worker’s account or set apart for the worker so they may be drawn at any time, although not actually in her or his possession. • Report amounts paid to buy back accrued leave under Other Cash Compensation Paid.",
        "hrOpenProperty": "WorkerCompensationReports/DirectCompensation/TotalHourlyWageAmount",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 3
      },
      {
        "id": "X.C.1.b.(1)",
        "name": "Regular Hourly Wages Paid",
        "definition": "The total monetary amount of cash or cash-equivalent (currency, coin, check, or direct deposit) compensation paid by the employer to a worker for her or his services based on a regular (standard, straight-time) hourly rate of pay and the number of straight-time (non-premium) hours worked. (Regular Hourly Wages Paid = regular hourly rate X Regular Hours Worked) • Enter the total dollar amount of Regular Hourly Wages paid by the employer for the worker’s work time during the subject month/quarter. • Do not reduce amounts paid for Regular Hourly Wages to reflect worker’s tax deductions, bonds, union dues, exemptions, withholding, health insurance, or pay deferral plans such as 401(k); the reported figures should equal the pre-tax gross amounts. • Do not include other compensation other than Regular Hourly Wages. Do not include wages paid at overtime or shift differential rates. • Do not include pay for time off from work or amounts paid to buy back accrued leave. • If worker is not paid Regular Hourly Wages as defined above, report a zero in this field. • Report Regular Hourly Wages when paid or when constructively paid. Amounts are constructively paid when credited to the worker’s account or set apart for the worker so they may be drawn at any time, although not actually in her or his possession. • Report amounts paid to buy back accrued leave under Other Cash Compensation Paid.",
        "hrOpenProperty": "WorkerCompensationReports/DirectCompensation/RegularHourlyWagesAmount",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "X.C.1.b.(2)",
        "name": "Total Premium Hourly Wages Paid",
        "definition": "The monetary amount of cash or cash-equivalent (currency, coin, check, or direct deposit) compensation paid to a worker based on a premium hourly rate of pay and the number of premium hours worked, including overtime and hours for which shift differentials are paid such as night, holiday or weekend work. Total Premium Hourly Wages Paid = Overtime Hourly Wages Paid + Shift Differential Hourly Wages Paid + Call-Back Hourly Wages Paid + Holiday Hourly Wages Paid + Hazardous Duty Hourly Wages Paid + Other Premium Hourly Wages Paid (Premium Hourly Wages Paid = premium hourly rate X Premium Hours Worked) • Enter the total dollar amount of Premium Hourly Wages paid by the employer for the worker’s work time during the subject month/quarter. • Do not reduce amounts paid for Premium Hourly Wages to reflect worker’s tax deductions, bonds, union dues, exemptions, withholding, health insurance, or pay deferral plans such as 401(k); the reported figures should equal the pre-tax gross amounts. • Do not include other compensation other than Premium Hourly Wages. Include only wages paid at overtime or shift differential rates. • Do not include pay for time off from work or amounts paid to buy back accrued leave. • If worker is not paid Premium Hourly Wages as defined above, report a zero in this field. • Report Premium Hourly Wages when paid or when constructively paid. Amounts are constructively paid when credited to the worker’s account or set apart for the worker so they may be drawn at any time, although not actually in her or his possession.",
        "hrOpenProperty": "WorkerCompensationReports/DirectCompensation/TotalPremiumHourlyWageAmount",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "X.C.1.b.(2)(a)",
        "name": "Overtime Hourly Wages Paid",
        "definition": "The monetary amount of cash or cash-equivalent (currency, coin, check, or direct deposit) compensation paid to a worker based on an overtime hourly rate of pay and the number of overtime hours worked. (Overtime Hourly Wages Paid = overtime hourly rate X Overtime Hours Worked ) • Enter the total dollar amount of Overtime Hourly Wages paid by the employer for the worker’s work time during the subject month/quarter. • Do not reduce amounts paid for Overtime Hourly Wages to reflect worker’s tax deductions, bonds, union dues, exemptions, withholding, health insurance, or pay deferral plans such as 401(k); the reported figures should equal the pre-tax gross amounts. • Do not include other compensation other than Overtime Hourly Wages. Include only wages paid at overtime rates. • Do not include pay for time off from work or amounts paid to buy back accrued leave. • If worker is not paid Overtime Hourly Wages as defined above, report a zero in this field. • Report Overtime Hourly Wages when paid or when constructively paid. Amounts are constructively paid when credited to the worker’s account or set apart for the worker so they may be drawn at any time, although not actually in her or his possession.",
        "hrOpenProperty": "WorkerCompensationReports/DirectCompensation/PremiumHourlyWagesAmount/workedPayAmount",
        "hrOpenFilter": "WorkerCompensationReports/DirectCompensation/PremiumHourlyWagesAmount/TypeCode = \"Overtime\"",
        "hrOpenDescription": "The monetary amount of cash or cash-equivalent (currency, coin, check, or direct deposit) compensation paid by the employer to a worker for her or his services",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "X.C.1.b.(2)(b)",
        "name": "Shift Differential Hourly Wages Paid",
        "definition": "The monetary amount of cash or cash-equivalent (currency, coin, check, or direct deposit) compensation paid to a worker based on a shift differential hourly rate of pay and the number of shift differential hours worked. (Shift Differential Hourly Wages Paid = shift differential hourly rate X Shift Differential Hours Worked) • Enter the total dollar amount of Shift Differential Hourly Wages paid by the employer for the worker’s work time during the subject month/quarter. • Do not reduce amounts paid for Shift Differential Hourly Wages to reflect worker’s tax deductions, bonds, union dues, exemptions, withholding, health insurance, or pay deferral plans such as 401(k); the reported figures should equal the pre-tax gross amounts. • Do not include other compensation other than Shift Differential Hourly Wages. Include only wages paid at shift-differential rates. • Do not include pay for time off from work or amounts paid to buy back accrued leave. • If worker is not paid Shift Differential Hourly Wages as defined above, report a zero in this field. • Report Shift Differential Hourly Wages when paid or when constructively paid. Amounts are constructively paid when credited to the worker’s account or set apart for the worker so they may be drawn at any time, although not actually in her or his possession.",
        "hrOpenProperty": "WorkerCompensationReports/DirectCompensation/PremiumHourlyWagesAmount/workedPayAmount",
        "hrOpenFilter": "WorkerCompensationReports/DirectCompensation/PremiumHourlyWagesAmount/TypeCode = \"Shift Differential\"",
        "hrOpenDescription": "The monetary amount of cash or cash-equivalent (currency, coin, check, or direct deposit) compensation paid by the employer to a worker for her or his services",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "X.C.1.b.(2)(c)",
        "name": "Call-Back Hourly Wages Paid",
        "definition": "The monetary amount of cash or cash-equivalent (currency, coin, check, or direct deposit) compensation paid to a worker based on a call-back hourly rate of pay and the number of overtime hours worked. (Call-Back Hourly Wages Paid = call-back hourly rate X Call-Back Hours Worked ) • Enter the total dollar amount of Call-Back Hourly Wages paid by the employer for the worker’s work time during the subject month/quarter. • Do not reduce amounts paid for Call-Back Hourly Wages to reflect worker’s tax deductions, bonds, union dues, exemptions, withholding, health insurance, or pay deferral plans such as 401(k); the reported figures should equal the pre-tax gross amounts. • Do not include other compensation other than Call-Back Hourly Wages. Include only wages paid at call-back rates. • Do not include pay for time off from work or amounts paid to buy back accrued leave. • If worker is not paid Call-Back Hourly Wages as defined above, report a zero in this field. • Report Call-Back Hourly Wages when paid or when constructively paid. Amounts are constructively paid when credited to the worker’s account or set apart for the worker so they may be drawn at any time, although not actually in her or his possession.",
        "hrOpenProperty": "WorkerCompensationReports/DirectCompensation/PremiumHourlyWagesAmount/workedPayAmount",
        "hrOpenFilter": "WorkerCompensationReports/DirectCompensation/PremiumHourlyWagesAmount/TypeCode = \"Call-Back\"",
        "hrOpenDescription": "The monetary amount of cash or cash-equivalent (currency, coin, check, or direct deposit) compensation paid by the employer to a worker for her or his services",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "X.C.1.b.(2)(d)",
        "name": "Holiday Hourly Wages Paid",
        "definition": "The monetary amount of cash or cash-equivalent (currency, coin, check, or direct deposit) compensation paid to a worker based on a holiday hourly rate of pay and the number of holiday hours worked. (Holiday Hourly Wages Paid = holiday hourly rate X Holiday Hours Worked) • Enter the total dollar amount of Holiday Hourly Wages paid by the employer for the worker’s work time during the subject month/quarter. • Do not reduce amounts paid for Holiday Hourly Wages to reflect worker’s tax deductions, bonds, union dues, exemptions, withholding, health insurance, or pay deferral plans such as 401(k); the reported figures should equal the pre-tax gross amounts. • Do not include other compensation other than Holiday Hourly Wages. Include only wages paid at holiday rates. • Do not include pay for time off from work or amounts paid to buy back accrued leave. • If worker is not paid Holiday Hourly Wages as defined above, report a zero in this field. • Report Holiday Hourly Wages when paid or when constructively paid. Amounts are constructively paid when credited to the worker’s account or set apart for the worker so they may be drawn at any time, although not actually in her or his possession.",
        "hrOpenProperty": "WorkerCompensationReports/DirectCompensation/PremiumHourlyWagesAmount/workedPayAmount",
        "hrOpenFilter": "WorkerCompensationReports/DirectCompensation/PremiumHourlyWagesAmount/TypeCode = \"Holiday\"",
        "hrOpenDescription": "The monetary amount of cash or cash-equivalent (currency, coin, check, or direct deposit) compensation paid by the employer to a worker for her or his services",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "X.C.1.b.(2)(e)",
        "name": "Hazardous Duty Hourly Wages Paid",
        "definition": "The monetary amount of cash or cash-equivalent (currency, coin, check, or direct deposit) compensation paid to a worker based on a hazardous duty hourly rate of pay and the number of hazardous duty hours worked. (Hazardous Duty Hourly Wages Paid = hazardous duty hourly rate X Hazardous Duty Hours Worked) • Enter the total dollar amount of Hazardous Duty Hourly Wages paid by the employer for the worker’s work time during the subject month/quarter. • Do not reduce amounts paid for Hazardous Duty Hourly Wages to reflect worker’s tax deductions, bonds, union dues, exemptions, withholding, health insurance, or pay deferral plans such as 401(k); the reported figures should equal the pre-tax gross amounts. • Do not include other compensation other than Hazardous Duty Hourly Wages. Include only wages paid at Hazardous Duty rates. • Do not include pay for time off from work or amounts paid to buy back accrued leave. • If worker is not paid Hazardous Duty Hourly Wages as defined above, report a zero in this field. • Report Hazardous Duty Hourly Wages when paid or when constructively paid. Amounts are constructively paid when credited to the worker’s account or set apart for the worker so they may be drawn at any time, although not actually in her or his possession.",
        "hrOpenProperty": "WorkerCompensationReports/DirectCompensation/PremiumHourlyWagesAmount/workedPayAmount",
        "hrOpenFilter": "WorkerCompensationReports/DirectCompensation/PremiumHourlyWagesAmount/TypeCode = \"Hazardous Duty\"",
        "hrOpenDescription": "The monetary amount of cash or cash-equivalent (currency, coin, check, or direct deposit) compensation paid by the employer to a worker for her or his services",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "X.C.1.b.(2)(f)",
        "name": "Other Premium Hourly Wages Paid",
        "definition": "The monetary amount of cash or cash-equivalent (currency, coin, check, or direct deposit) compensation paid to a worker based on the hourly rate of pay for Other Premium Work Hours and the number of Other Premium Hours Worked. (Other Premium Hourly Wages Paid = other premium hourly rate X Other Premium Hours Worked) • Enter the total dollar amount of Overtime Hourly Wages paid by the employer for the worker’s work time during the subject month/quarter. • Do not reduce amounts paid for Overtime Hourly Wages to reflect worker’s tax deductions, bonds, union dues, exemptions, withholding, health insurance, or pay deferral plans such as 401(k); the reported figures should equal the pre-tax gross amounts. • Do not include other compensation other than Overtime Hourly Wages. Include only wages paid at overtime rates. • Do not include pay for time off from work or amounts paid to buy back accrued leave. • If worker is not paid Overtime Hourly Wages as defined above, report a zero in this field. • Report Overtime Hourly Wages when paid or when constructively paid. Amounts are constructively paid when credited to the worker’s account or set apart for the worker so they may be drawn at any time, although not actually in her or his possession.",
        "hrOpenProperty": "WorkerCompensationReports/DirectCompensation/PremiumHourlyWagesAmount/workedPayAmount",
        "hrOpenFilter": "WorkerCompensationReports/DirectCompensation/PremiumHourlyWagesAmount/TypeCode = \"Other Premum\"",
        "hrOpenDescription": "The monetary amount of cash or cash-equivalent (currency, coin, check, or direct deposit) compensation paid by the employer to a worker for her or his services",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "X.C.1.c",
        "name": "Total Leave Paid",
        "definition": "The total monetary amount the employer paid to a worker for any type of absence from work including vacation, sickness, bereavement, maternity, family care, jury duty, education, military duty, administrative time off, sabbatical, or other personal leave. Includes compensatory time off (CTO) when used. Total Leave Paid = Administrative Leave Paid + Bereavement Leave Paid + Compensatory Time Off (CTO) Paid + Consolidated Paid Time Off (PTO) Paid + Education Leave Paid + Family Leave Paid + Holiday Leave Paid + In-Lieu-of-Notice Leave Paid + Jury Duty Leave Paid + Military Duty Leave Paid + Sick Leave Paid + Vacation Leave Paid + Other Personal Leave Paid • If the employer separately tracks the amount paid for the worker’s leave hours: enter the total dollar amount paid by the employer for all of the worker’s time off from work during the subject month/quarter. • If the employer does not separately track the amount paid for the worker’s leave hours or does not provide any type of paid leave, report a zero in this field. • Do not reduce amounts paid for leave time to reflect worker’s tax deductions, bonds, union dues, exemptions, withholding, health insurance, or pay deferral plans such as 401(k); the reported figures should equal the pre-tax gross amounts. • Do not include amounts paid to buy back accrued leave, report these under Other Cash Compensation Paid. • No amounts included here should be reported under Salary Paid, Total Hourly Wages Paid, Regular Hourly Wages Paid, or Premium Hourly Wages Paid. • Report Total Leave Paid amounts when paid or constructively paid. Amounts are constructively paid when credited to the worker’s account or set apart for the worker so they may be drawn at any time, although not actually in her or his possession.",
        "hrOpenProperty": "WorkerCompensationReports/DirectCompensation/TotalPaidTimeoffAmount",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 3
      },
      {
        "id": "X.C.1.c.(1)",
        "name": "Administrative Leave Paid",
        "definition": "The monetary amount paid by the employer to a worker for her/his Administrative Time Off as directed or granted at the discretion of the employer. ATO is not deducted from the worker's leave balances. • If the employer separately tracks the amount paid for the worker’s Administrative Leave, enter the total dollar amount paid by the employer for the worker’s time off from work using Administrative Leave during the subject month/quarter. • Do not reduce amounts paid for Administrative Leave to reflect worker’s tax deductions, bonds, union dues, exemptions, withholding, health insurance, or pay deferral plans such as 401(k); the reported figures should equal the pre-tax gross amounts. • No amounts included here should be reported under Salary Paid, Total Hourly Wages Paid, Regular Hourly Wages Paid, or Premium Hourly Wages Paid. • Report Administrative Leave Paid amounts when paid or constructively paid. Amounts are constructively paid when credited to the worker’s account or set apart for the worker so they may be drawn at any time, although not actually in her or his possession.",
        "hrOpenProperty": "WorkerCompensationReports/DirectCompensation/PaidTimeOffAmount/TimeOffPayAmount",
        "hrOpenFilter": "WorkerCompensationReports/DirectCompensation/PaidTimeOffAmount/TimeOffPayType = \"Administrative\"",
        "hrOpenDescription": "The monetary amount the employer paid to a worker for any type of absence from work including vacation, sickness, bereavement, maternity, family care, jury duty, education, military duty, administrative time off, sabbatical, or other personal leave. Includes compensatory time off (CTO) when used.",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "X.C.1.c.(2)",
        "name": "Bereavement Leave Paid",
        "definition": "When the employer offers such benefit as a separate accrued leave, the monetary amount the employer paid to a worker for absence from work due to the death of a family or household member. • If the employer separately tracks the amount paid for the worker’s Bereavement Leave, enter the total dollar amount paid by the employer for the worker’s time off from work using Bereavement Leave during the subject month/quarter. • Do not reduce amounts paid for Bereavement Leave to reflect worker’s tax deductions, bonds, union dues, exemptions, withholding, health insurance, or pay deferral plans such as 401(k); the reported figures should equal the pre-tax gross amounts. • If the employer does not offer Bereavement Leave as a separate accrued leave, enter a zero in this field. • No amounts included here should be reported under Salary Paid, Total Hourly Wages Paid, Regular Hourly Wages Paid, or Premium Hourly Wages Paid. • Report Bereavement Leave Paid amounts when paid or constructively paid. Amounts are constructively paid when credited to the worker’s account or set apart for the worker so they may be drawn at any time, although not actually in her or his possession.",
        "hrOpenProperty": "WorkerCompensationReports/DirectCompensation/PaidTimeOffAmount/TimeOffPayAmount",
        "hrOpenFilter": "WorkerCompensationReports/DirectCompensation/PaidTimeOffAmount/TimeOffPayType = \"Bereavement\"",
        "hrOpenDescription": "The monetary amount the employer paid to a worker for any type of absence from work including vacation, sickness, bereavement, maternity, family care, jury duty, education, military duty, administrative time off, sabbatical, or other personal leave. Includes compensatory time off (CTO) when used.",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "X.C.1.c.(3)",
        "name": "Compensatory Time Off (CTO) Paid",
        "definition": "The monetary amount paid by the employer to a worker for her/his previously earned Compensatory Time Off used for personal leave. Generally, CTO is granted and accrued in lieu of overtime pay for irregular or occasional overtime work and is used by the worker for personal leave. • If the employer separately tracks the amount paid for the worker’s Compensatory Time Off, enter the total dollar amount paid for her/his CTO used during the subject month/quarter. • If the employer does not separately track the amount paid for the worker’s Compensatory Time Off, enter a zero in this field. • Do not reduce amounts paid for CTO to reflect worker’s tax deductions, bonds, union dues, exemptions, withholding, health insurance, or pay deferral plans such as 401(k); the reported figures should equal the pre-tax gross amounts. • Do not include amounts paid to buy back accrued CTO, report these under Other Cash Compensation Paid • No amounts included here should be reported under Salary Paid, Total Hourly Wages Paid, Regular Hourly Wages Paid, or Premium Hourly Wages Paid. • Report amounts paid for CTO when paid or constructively paid. Amounts are constructively paid when credited to the worker’s account or set apart for the worker so they may be drawn at any time, although not actually in her or his possession.",
        "hrOpenProperty": "WorkerCompensationReports/DirectCompensation/PaidTimeOffAmount/TimeOffPayAmount",
        "hrOpenFilter": "WorkerCompensationReports/DirectCompensation/PaidTimeOffAmount/TimeOffPayType = \"Compensatory\"",
        "hrOpenDescription": "The monetary amount the employer paid to a worker for any type of absence from work including vacation, sickness, bereavement, maternity, family care, jury duty, education, military duty, administrative time off, sabbatical, or other personal leave. Includes compensatory time off (CTO) when used.",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "X.C.1.c.(4)",
        "name": "Consolidated Paid Time Off (PTO) Leave Paid",
        "definition": "When the employer offers such benefit as a separate accrued leave, the monetary amount a worker was paid for general purpose personal leave that a worker used, at her/his discretion for vacations, family leave, holidays, sick leave, rest and relaxation, and other personal business or emergencies. • If the employer separately tracks the amount paid for the worker’s Consolidated Paid Time Off (PTO), enter the total dollar amount paid by the employer for the worker’s time off from work using Consolidated PTO during the subject month/quarter. • If the employer does not offer Consolidated PTO as a separate accrued leave, enter a zero in this field. • Do not reduce amounts paid for Consolidated PTO to reflect worker’s tax deductions, bonds, union dues, exemptions, withholding, health insurance, or pay deferral plans such as 401(k); the reported figures should equal the pre-tax gross amounts. • Do not include amounts paid to buy back Consolidated PTO, report these under Other Cash Compensation Paid. • No amounts included here should be reported under Salary Paid, Total Hourly Wages Paid, Regular Hourly Wages Paid, or Premium Hourly Wages Paid. • Report Consolidated PTO paid amounts when paid or constructively paid. Amounts are constructively paid when credited to the worker’s account or set apart for the worker so they may be drawn at any time, although not actually in her or his possession.",
        "hrOpenProperty": "WorkerCompensationReports/DirectCompensation/PaidTimeOffAmount/TimeOffPayAmount",
        "hrOpenFilter": "WorkerCompensationReports/DirectCompensation/PaidTimeOffAmount/TimeOffPayType = \"Consolidated\"",
        "hrOpenDescription": "The monetary amount the employer paid to a worker for any type of absence from work including vacation, sickness, bereavement, maternity, family care, jury duty, education, military duty, administrative time off, sabbatical, or other personal leave. Includes compensatory time off (CTO) when used.",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "X.C.1.c.(5)",
        "name": "Education Leave Paid",
        "definition": "When the employer offers such benefit as a separate accrued leave, the monetary amount a worker was paid for absence from work to pursue outside, non-in-service, education. • If the employer separately tracks time used for Education Leave, enter the total dollar amount paid by the employer for the worker’s time off from work using Education Leave during the subject month/quarter. • Do not reduce amounts paid for Education Leave to reflect worker’s tax deductions, bonds, union dues, exemptions, withholding, health insurance, or pay deferral plans such as 401(k); the reported figures should equal the pre-tax gross amounts. • If the employer does not track time used for Education Leave, enter a zero in this field. • No amounts included here should be reported under Salary Paid, Total Hourly Wages Paid, Regular Hourly Wages Paid, or Premium Hourly Wages Paid. • Report Education Leave Paid amounts when paid or constructively paid. Amounts are constructively paid when credited to the worker’s account or set apart for the worker so they may be drawn at any time, although not actually in her or his possession.",
        "hrOpenProperty": "WorkerCompensationReports/DirectCompensation/PaidTimeOffAmount/TimeOffPayAmount",
        "hrOpenFilter": "WorkerCompensationReports/DirectCompensation/PaidTimeOffAmount/TimeOffPayType = \"Education\"",
        "hrOpenDescription": "The monetary amount the employer paid to a worker for any type of absence from work including vacation, sickness, bereavement, maternity, family care, jury duty, education, military duty, administrative time off, sabbatical, or other personal leave. Includes compensatory time off (CTO) when used.",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "X.C.1.c.(6)",
        "name": "Family Leave Paid",
        "definition": "When the employer offers such benefit as a separate accrued leave, the monetary amount a worker was paid for absence from work to care for a family member, including child, maternity, paternity, or elder care leave. • If the employer separately tracks time used for Family Leave, enter the total dollar amount paid by the employer for the worker’s time off from work using Family Leave during the subject month/quarter. • Do not reduce amounts paid for Family Leave to reflect worker’s tax deductions, bonds, union dues, exemptions, withholding, health insurance, or pay deferral plans such as 401(k); the reported figures should equal the pre-tax gross amounts. • If the employer does not track time used for Family Leave, enter a zero in this field. • No amounts included here should be reported under Salary Paid, Total Hourly Wages Paid, Regular Hourly Wages Paid, or Premium Hourly Wages Paid. • Report Family Leave Paid amounts when paid or constructively paid. Amounts are constructively paid when credited to the worker’s account or set apart for the worker so they may be drawn at any time, although not actually in her or his possession.",
        "hrOpenProperty": "WorkerCompensationReports/DirectCompensation/PaidTimeOffAmount/TimeOffPayAmount",
        "hrOpenFilter": "WorkerCompensationReports/DirectCompensation/PaidTimeOffAmount/TimeOffPayType = \"Family\"",
        "hrOpenDescription": "The monetary amount the employer paid to a worker for any type of absence from work including vacation, sickness, bereavement, maternity, family care, jury duty, education, military duty, administrative time off, sabbatical, or other personal leave. Includes compensatory time off (CTO) when used.",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "X.C.1.c.(7)",
        "name": "Total Holiday Leave Paid",
        "definition": "When the employer offers such benefit as a separate accrued leave, the monetary amount a worker was paid for absence from work on days of special religious, cultural, social, or patriotic significance, on which work and business ordinarily cease. Includes both public and floating holiday leaves offered by the employer. Workers may receive either full or partial pay for holidays. Holiday Leave Paid = Public Holiday Leave Paid + Floating Holiday Leave Paid • If the employer separately tracks time used for Holiday Leave, enter the total dollar amount paid by the employer for the worker’s time off from work using Holiday Leave during the subject month/quarter. • Do not reduce amounts paid for Holiday Leave to reflect worker’s tax deductions, bonds, union dues, exemptions, withholding, health insurance, or pay deferral plans such as 401(k); the reported figures should equal the pre-tax gross amounts. • If the employer does not track time used for Holiday Leave, enter a zero in this field. • No amounts included here should be reported under Salary Paid, Total Hourly Wages Paid, Regular Hourly Wages Paid, or Premium Hourly Wages Paid. • Report Holiday Leave Paid amounts when paid or constructively paid. Amounts are constructively paid when credited to the worker’s account or set apart for the worker so they may be drawn at any time, although not actually in her or his possession.",
        "hrOpenProperty": "WorkerCompensationReports/DirectCompensation/TotalHolidayPaidTimeOffAmount",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "X.C.1.c.(7)(a)",
        "name": "Public Holiday Leave Paid",
        "definition": "When the employer offers such benefit as a separate accrued leave, the monetary amount a worker was paid for absence from work on publicly recognized days of special religious, cultural, social, or patriotic significance, on which work and business ordinarily cease. Workers may receive either full or partial pay for holidays. • If the employer separately tracks time used for Public Holiday Leave, enter the total dollar amount paid by the employer for the worker’s time off from work using Public Holiday Leave during the subject month/quarter. • Do not reduce amounts paid for Public Holiday Leave to reflect worker’s tax deductions, bonds, union dues, exemptions, withholding, health insurance, or pay deferral plans such as 401(k); the reported figures should equal the pre-tax gross amounts. • If the employer does not track time used for Public Holiday Leave, enter a zero in this field. • No amounts included here should be reported under Salary Paid, Total Hourly Wages Paid, Regular Hourly Wages Paid, or Premium Hourly Wages Paid. • Report Public Holiday Leave Paid amounts when paid or constructively paid. Amounts are constructively paid when credited to the worker’s account or set apart for the worker so they may be drawn at any time, although not actually in her or his possession.",
        "hrOpenProperty": "WorkerCompensationReports/DirectCompensation/PaidTimeOffAmount/TimeOffPayAmount",
        "hrOpenFilter": "WorkerCompensationReports/DirectCompensation/PaidTimeOffAmount/TimeOffPayType = \"PublicHoliday\"",
        "hrOpenDescription": "The monetary amount the employer paid to a worker for any type of absence from work including vacation, sickness, bereavement, maternity, family care, jury duty, education, military duty, administrative time off, sabbatical, or other personal leave. Includes compensatory time off (CTO) when used.",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "X.C.1.c.(7)(b)",
        "name": "Floating Holiday Leave Paid",
        "definition": "When the employer offers such benefit as a separate accrued leave, the monetary amount a worker was paid for absence from work on days of special religious, cultural, social, or patriotic significance, on which work and business ordinarily cease. Workers may receive either full or partial pay for holidays. • If the employer separately tracks time used for Floating Holiday Leave, enter the total dollar amount paid by the employer for the worker’s time off from work using Floating Holiday Leave during the subject month/quarter. • Do not reduce amounts paid for Holiday Leave to reflect worker’s tax deductions, bonds, union dues, exemptions, withholding, health insurance, or pay deferral plans such as 401(k); the reported figures should equal the pre-tax gross amounts. • If the employer does not track time used for Floating Holiday Leave, enter a zero in this field. • No amounts included here should be reported under Salary Paid, Total Hourly Wages Paid, Regular Hourly Wages Paid, or Premium Hourly Wages Paid. • Report Floating Holiday Leave Paid amounts when paid or constructively paid. Amounts are constructively paid when credited to the worker’s account or set apart for the worker so they may be drawn at any time, although not actually in her or his possession.",
        "hrOpenProperty": "WorkerCompensationReports/DirectCompensation/PaidTimeOffAmount/TimeOffPayAmount",
        "hrOpenFilter": "WorkerCompensationReports/DirectCompensation/PaidTimeOffAmount/TimeOffPayType = \"FloatingHoliday\"",
        "hrOpenDescription": "The monetary amount the employer paid to a worker for any type of absence from work including vacation, sickness, bereavement, maternity, family care, jury duty, education, military duty, administrative time off, sabbatical, or other personal leave. Includes compensatory time off (CTO) when used.",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "X.C.1.c.(8)",
        "name": "In-Lieu-of-Notice Leave Paid",
        "definition": "The monetary amount the employer paid for hours not worked as a result of the employer's decision not to provide required advance notice of termination. • Enter the total dollar amount paid by the employer for the worker’s time off from work using In-Lieu-of-Notice Leave during the subject month/quarter. • Do not reduce amounts paid for In-Lieu-of-Notice Leave to reflect worker’s tax deductions, bonds, union dues, exemptions, withholding, health insurance, or pay deferral plans such as 401(k); the reported figures should equal the pre-tax gross amounts. • No amounts included here should be reported under Salary Paid, Total Hourly Wages Paid, Regular Hourly Wages Paid, or Premium Hourly Wages Paid. • Report In-Lieu-of-Notice Leave Paid amounts when paid or constructively paid. Amounts are constructively paid when credited to the worker’s account or set apart for the worker so they may be drawn at any time, although not actually in her or his possession.",
        "hrOpenProperty": "WorkerCompensationReports/DirectCompensation/PaidTimeOffAmount/TimeOffPayAmount",
        "hrOpenFilter": "WorkerCompensationReports/DirectCompensation/PaidTimeOffAmount/TimeOffPayType = \"InLieuofNotice\"",
        "hrOpenDescription": "The monetary amount the employer paid to a worker for any type of absence from work including vacation, sickness, bereavement, maternity, family care, jury duty, education, military duty, administrative time off, sabbatical, or other personal leave. Includes compensatory time off (CTO) when used.",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "X.C.1.c.(9)",
        "name": "Jury Duty Leave Paid",
        "definition": "When the employer offers such benefit as a separate accrued leave, the monetary amount the employer paid for the time a worker was absent from work when he/she was summoned to serve as a juror. Employer payments commonly make up the difference between the worker’s regular pay and the court’s jury allowance. • Enter the total dollar amount paid by the employer for the worker’s time off from work for Jury Duty Leave during the subject month/quarter. • Do not reduce amounts paid for Jury Duty Leave to reflect worker’s tax deductions, bonds, union dues, exemptions, withholding, health insurance, or pay deferral plans such as 401(k); the reported figures should equal the pre-tax gross amounts. • If the employer does not offer Jury Duty Leave as a separate accrued leave, enter a zero in this field. • No amounts included here should be reported under Salary Paid, Total Hourly Wages Paid, Regular Hourly Wages Paid, or Premium Hourly Wages Paid. • Report Jury Duty Leave Paid amounts when paid or constructively paid. Amounts are constructively paid when credited to the worker’s account or set apart for the worker so they may be drawn at any time, although not actually in her or his possession.",
        "hrOpenProperty": "WorkerCompensationReports/DirectCompensation/PaidTimeOffAmount/TimeOffPayAmount",
        "hrOpenFilter": "WorkerCompensationReports/DirectCompensation/PaidTimeOffAmount/TimeOffPayType = \"JuryDuty\"",
        "hrOpenDescription": "The monetary amount the employer paid to a worker for any type of absence from work including vacation, sickness, bereavement, maternity, family care, jury duty, education, military duty, administrative time off, sabbatical, or other personal leave. Includes compensatory time off (CTO) when used.",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "X.C.1.c.(10)",
        "name": "Military Duty Leave Paid",
        "definition": "When the employer offers such benefit as a separate accrued leave, the monetary amount the employer paid for the time a worker was absent from work to fulfill her/his military commitments. Employer payments commonly make up the difference between the worker’s regular pay and the amount they receive from the military. • Enter the total dollar amount paid by the employer for the worker’s time off from work for Military Duty Leave during the subject month/quarter. • Do not reduce amounts paid for Military Duty Leave to reflect worker’s tax deductions, bonds, union dues, exemptions, withholding, health insurance, or pay deferral plans such as 401(k); the reported figures should equal the pre-tax gross amounts. • If the employer does not offer Military Duty Leave as a separate leave, enter a zero in this field. • No amounts included here should be reported under Salary Paid, Total Hourly Wages Paid, Regular Hourly Wages Paid, or Premium Hourly Wages Paid. • Report Military Duty Leave Paid amounts when paid or constructively paid. Amounts are constructively paid when credited to the worker’s account or set apart for the worker so they may be drawn at any time, although not actually in her or his possession.",
        "hrOpenProperty": "TBD",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "SS > Gap. We don't have a total military leave category. Can it be calculated field that is the sum of the following two items?",
        "depth": 4
      },
      {
        "id": "X.C.1.c.(10)(a)",
        "name": "Reserve Training Time Leave Paid",
        "definition": "Employer payments for weekend or equivalent individual drill training services for National Guard and United States Armed Forces reservists",
        "hrOpenProperty": "WorkerCompensationReports/DirectCompensation/PaidTimeOffAmount/TimeOffPayAmount",
        "hrOpenFilter": "WorkerCompensationReports/DirectCompensation/PaidTimeOffAmount/TimeOffPayType = \"Reserves\"",
        "hrOpenDescription": "The monetary amount the employer paid to a worker for any type of absence from work including vacation, sickness, bereavement, maternity, family care, jury duty, education, military duty, administrative time off, sabbatical, or other personal leave. Includes compensatory time off (CTO) when used.",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "X.C.1.c.(10)(b)",
        "name": "Active Duty Leave Paid",
        "definition": "Employer payments gratuitously made to former employees on active duty with the armed forces of the United States, if those payments are designed to supplement amounts received by them from the federal government",
        "hrOpenProperty": "WorkerCompensationReports/DirectCompensation/PaidTimeOffAmount/TimeOffPayAmount",
        "hrOpenFilter": "WorkerCompensationReports/DirectCompensation/PaidTimeOffAmount/TimeOffPayType = \"ActiveDuty\"",
        "hrOpenDescription": "The monetary amount the employer paid to a worker for any type of absence from work including vacation, sickness, bereavement, maternity, family care, jury duty, education, military duty, administrative time off, sabbatical, or other personal leave. Includes compensatory time off (CTO) when used.",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "X.C.1.c.(10)(c)",
        "name": "All Other Military Duty Leave Paid",
        "definition": "Any other payments made by an employer voluntarily and without contractual obligation, to or in behalf of a person for periods during which such person performs military services in the armed forces of the United States or any State",
        "hrOpenProperty": "WorkerCompensationReports/DirectCompensation/PaidTimeOffAmount/TimeOffPayAmount",
        "hrOpenFilter": "WorkerCompensationReports/DirectCompensation/PaidTimeOffAmount/TimeOffPayType = \"OtherMilitary\"",
        "hrOpenDescription": "The monetary amount the employer paid to a worker for any type of absence from work including vacation, sickness, bereavement, maternity, family care, jury duty, education, military duty, administrative time off, sabbatical, or other personal leave. Includes compensatory time off (CTO) when used.",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "X.C.1.c.(11)",
        "name": "Sick Leave Paid",
        "definition": "When the employer offers such benefit as a separate accrued leave, the monetary amount the employer pays the worker for time he/she was absent from work when he/she was unable to work because of a non-work-related illness or injury. • If the employer offers Sick Leave as a separate accrued leave, enter the total dollar amount paid by the employer for the worker’s time off from work using Sick Leave during the subject month/quarter. • If the employer does not offer Sick Leave as a separate leave, enter a zero in this field. • Do not reduce amounts paid for Sick Leave to reflect worker’s tax deductions, bonds, union dues, exemptions, withholding, health insurance, or pay deferral plans such as 401(k); the reported figures should equal the pre-tax gross amounts. • Do not include amounts paid to buy back accrued Sick Leave, report these under Other Cash Compensation Paid. • No amounts included here should be reported under Salary Paid, Total Hourly Wages Paid, Regular Hourly Wages Paid, or Premium Hourly Wages Paid. • Report Sick Leave Paid amounts when paid or constructively paid. Amounts are constructively paid when credited to the worker’s account or set apart for the worker so they may be drawn at any time, although not actually in her or his possession.",
        "hrOpenProperty": "WorkerCompensationReports/DirectCompensation/PaidTimeOffAmount/TimeOffPayAmount",
        "hrOpenFilter": "WorkerCompensationReports/DirectCompensation/PaidTimeOffAmount/TimeOffPayType = \"Sick\"",
        "hrOpenDescription": "The monetary amount the employer paid to a worker for any type of absence from work including vacation, sickness, bereavement, maternity, family care, jury duty, education, military duty, administrative time off, sabbatical, or other personal leave. Includes compensatory time off (CTO) when used.",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "X.C.1.c.(12)",
        "name": "Vacation Leave Paid",
        "definition": "When the employer offers such benefit as a separate accrued leave, the monetary amount paid to a worker for vacation leave time used. • If the employer offers Vacation Leave as a separate accrued leave, enter the total dollar amount paid by the employer for the worker’s time off from work using Vacation Leave during the subject month/quarter. • If the employer does not offer Vacation Leave as a separate leave, enter a zero in this field. • Do not reduce amounts paid for Vacation Leave to reflect worker’s tax deductions, bonds, union dues, exemptions, withholding, health insurance, or pay deferral plans such as 401(k); the reported figures should equal the pre-tax gross amounts. • Do not include amounts paid to buy back accrued Vacation Leave, report these under Other Cash Compensation Paid. • No amounts included here should be reported under Salary Paid, Total Hourly Wages Paid, Regular Hourly Wages Paid, or Premium Hourly Wages Paid. • Report Vacation Leave Paid amounts when paid or constructively paid. Amounts are constructively paid when credited to the worker’s account or set apart for the worker so they may be drawn at any time, although not actually in her or his possession.",
        "hrOpenProperty": "WorkerCompensationReports/DirectCompensation/PaidTimeOffAmount/TimeOffPayAmount",
        "hrOpenFilter": "WorkerCompensationReports/DirectCompensation/PaidTimeOffAmount/TimeOffPayType = \"Vacation\"",
        "hrOpenDescription": "The monetary amount the employer paid to a worker for any type of absence from work including vacation, sickness, bereavement, maternity, family care, jury duty, education, military duty, administrative time off, sabbatical, or other personal leave. Includes compensatory time off (CTO) when used.",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "X.C.1.c.(13)",
        "name": "Accrued Leave Paid at Termination",
        "definition": "The total monetary amount paid to a worker for accumulated leave time earned and unused at termination of employment.",
        "hrOpenProperty": "WorkerCompensationReports/DirectCompensation/PaidTimeOffAmount/TimeOffPayAmount",
        "hrOpenFilter": "WorkerCompensationReports/DirectCompensation/PaidTimeOffAmount/TimeOffPayType = \"AccruedLeave\"",
        "hrOpenDescription": "The monetary amount the employer paid to a worker for any type of absence from work including vacation, sickness, bereavement, maternity, family care, jury duty, education, military duty, administrative time off, sabbatical, or other personal leave. Includes compensatory time off (CTO) when used.",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "X.C.1.c.(14)",
        "name": "Other Personal Leave Paid",
        "definition": "The monetary amount paid to a worker for absence from work for any purpose not captured in another specific type of leave authorized by the employer. • Enter the total dollar amount paid by the employer for the worker’s time off from work for any purpose not captured in another specific type of leave authorized by the employer during the subject month/quarter. • If the employer does not offer any Other Personal Leave, enter a zero in this field. • Do not reduce amounts paid for Other Personal Leave to reflect worker’s tax deductions, bonds, union dues, exemptions, withholding, health insurance, or pay deferral plans such as 401(k); the reported figures should equal the pre-tax gross amounts. • Do not include amounts paid to buy back accrued Other Personal Leave, report these under Other Cash Compensation Paid. • No amounts included here should be reported under Salary Paid, Total Hourly Wages Paid, Regular Hourly Wages Paid, or Premium Hourly Wages Paid. • Report Other Personal Leave Paid amounts when paid or constructively paid. Amounts are constructively paid when credited to the worker’s account or set apart for the worker so they may be drawn at any time, although not actually in her or his possession.",
        "hrOpenProperty": "WorkerCompensationReports/DirectCompensation/PaidTimeOffAmount/TimeOffPayAmount",
        "hrOpenFilter": "WorkerCompensationReports/DirectCompensation/PaidTimeOffAmount/TimeOffPayType = \"OtherLeave\"",
        "hrOpenDescription": "The monetary amount the employer paid to a worker for any type of absence from work including vacation, sickness, bereavement, maternity, family care, jury duty, education, military duty, administrative time off, sabbatical, or other personal leave. Includes compensatory time off (CTO) when used.",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "X.C.1.d",
        "name": "Total Other Direct Cash Compensation Paid",
        "definition": "The total monetary amount of cash or cash-equivalent (currency, coin, check, or direct deposit) compensation paid to a worker other than salary, hourly wages, and paid leave. Includes, but is not limited to bonuses, commissions, lump-sum, residuals, severance, tips, and incentive, piecework, production-based payments, and buy back of accrued leave. Total Other Cash Compensation Paid = Back Wages Paid + Bonuses Paid + Commissions Paid + Piecework, Performance-Based, or Contract Work Paid + Residuals Paid + Severance Paid + Tips Paid + All Other Cash Compensation Paid • Enter the total dollar amount of Other Cash Compensation paid by the employer for the worker’s services during the subject month/quarter. • Do not reduce Other Cash Compensation amounts to reflect worker’s tax deductions, bonds, union dues, exemptions, withholding, health insurance, or pay deferral plans such as 401(k); the reported figures should equal the pre-tax gross amounts. • Do not include the dollar amount of non-cash fringe benefits funded by the employer. • If worker is not paid Other Cash Compensation during the subject month/quarter report a zero in this field. • Report Other Cash Compensation when paid or when constructively paid. Amounts are constructively paid when credited to the worker’s account or set apart for the worker so they may be drawn at any time, although not actually in her or his possession.",
        "hrOpenProperty": "WorkerCompensationReports/DirectCompensation/TotalOtherCompensationAmount",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 3
      },
      {
        "id": "X.C.1.d.(1)",
        "name": "Back Wages Paid",
        "definition": "The monetary amount of payments made to a worker for work done in the past that was withheld at the time, or for work that could have been done had the worker not been prevented from doing so. May include back pay paid in settlement of worker claims. • Enter the total dollar amount of Back Wages paid by the employer for the worker’s services during the subject or previous month/quarter. • Do not include any other remuneration or the dollar amount of non-cash fringe benefits funded by the employer. • Do not reduce Back Wages amounts to reflect worker’s tax deductions, bonds, union dues, exemptions, withholding, health insurance, or pay deferral plans such as 401(k); the reported figures should equal the pre-tax gross amounts. • If worker is not paid Back Wages during the subject month/quarter report a zero in this field. • Report Back Wages when paid or when constructively paid. Amounts are constructively paid when credited to the worker’s account or set apart for the worker so they may be drawn at any time, although not actually in her or his possession.",
        "hrOpenProperty": "WorkerCompensationReports/DirectCompensation/OtherCompensationAmount/WorkedPayAmount",
        "hrOpenFilter": "WorkerCompensationReports/DirectCompensation/OtherCompensationAmount/WorkedPayTypeCode = \"BackWages\"",
        "hrOpenDescription": "The monetary amount of cash or cash-equivalent (currency, coin, check, or direct deposit) compensation paid to a worker other than salary, hourly wages, and paid leave. Includes, but is not limited to bonuses, commissions, lump-sum, residuals, severance, tips, and incentive, piecework, production-based payments, and buy back of accrued leave.",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "X.C.1.d.(2)",
        "name": "Total Bonuses Paid",
        "definition": "The monetary amount added to salary or wages on a periodic basis, especially as a reward for good performance. Includes production-based and non-production-based bonuses. Total Bonuses Paid = Production Bonuses Paid + Other Bonuses Paid • Enter the total dollar amount of Bonuses paid by the employer for the worker’s services during the subject month/quarter. • Do not include any other remuneration or the dollar amount of non-cash fringe benefits funded by the employer. • Do not reduce Bonus amounts to reflect worker’s tax deductions, bonds, union dues, exemptions, withholding, health insurance, or pay deferral plans such as 401(k); the reported figures should equal the pre-tax gross amounts. • If worker is not paid Bonuses during the subject month/quarter report a zero in this field. • Report Bonuses when paid or when constructively paid. Amounts are constructively paid when credited to the worker’s account or set apart for the worker so they may be drawn at any time, although not actually in her or his possession.",
        "hrOpenProperty": "TBD",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "SS > Gap. We don't have a total bonuses category. Can it be calculated field that is the sum of the following two items?",
        "depth": 4
      },
      {
        "id": "X.C.1.d.(2)(a)",
        "name": "Production Bonuses Paid",
        "definition": "The monetary amount added to salary or wages based on production in excess of a quota or on completion of a job in less than standard time. • Enter the total dollar amount of Production Bonuses paid by the employer for the worker’s services during the subject month/quarter. • Do not include any other remuneration or the dollar amount of non-cash fringe benefits funded by the employer. • Do not reduce Production Bonus amounts to reflect worker’s tax deductions, bonds, union dues, exemptions, withholding, health insurance, or pay deferral plans such as 401(k); the reported figures should equal the pre-tax gross amounts. • If worker is not paid Production Bonuses during the subject month/quarter report a zero in this field. • Report Production Bonuses when paid or when constructively paid. Amounts are constructively paid when credited to the worker’s account or set apart for the worker so they may be drawn at any time, although not actually in her or his possession.",
        "hrOpenProperty": "TBD",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "SS > Gap. We don't have a total bonuses category.",
        "depth": 4
      },
      {
        "id": "X.C.1.d.(2)(b)",
        "name": "Other Bonuses Paid",
        "definition": "The monetary amount added to salary or wages on a periodic basis, as a reward for good performance NOT based on production levels. Includes, for example, attendance, holiday bonuses, profit-sharing payments, and year-end bonuses. • Enter the total dollar amount of Other Bonuses paid by the employer for the worker’s services during the subject month/quarter. • Do not include any other remuneration or the dollar amount of non-cash fringe benefits funded by the employer. • Do not reduce Other Bonus amounts to reflect worker’s tax deductions, bonds, union dues, exemptions, withholding, health insurance, or pay deferral plans such as 401(k); the reported figures should equal the pre-tax gross amounts. • If worker is not paid Other Bonuses during the subject month/quarter report a zero in this field. • Report Other Bonuses when paid or when constructively paid. Amounts are constructively paid when credited to the worker’s account or set apart for the worker so they may be drawn at any time, although not actually in her or his possession.",
        "hrOpenProperty": "TBD",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "SS > Gap. We don't have a total bonuses category.",
        "depth": 4
      },
      {
        "id": "X.C.1.d.(3)",
        "name": "Commissions Paid",
        "definition": "The monetary amount of payments made as an incentive to a worker based on sales procured. Payments often will be calculated on the basis of a percentage of the goods sold. • Enter the total dollar amount of Commissions paid by the employer for the worker’s services during the subject month/quarter. • Do not include any other remuneration or the dollar amount of non-cash fringe benefits funded by the employer. • Do not reduce Commission amounts to reflect worker’s tax deductions, bonds, union dues, exemptions, withholding, health insurance, or pay deferral plans such as 401(k); the reported figures should equal the pre-tax gross amounts. • If worker is not paid Commissions during the subject month/quarter report a zero in this field. • Report Commissions when paid or when constructively paid. Amounts are constructively paid when credited to the worker’s account or set apart for the worker so they may be drawn at any time, although not actually in her or his possession.",
        "hrOpenProperty": "WorkerCompensationReports/DirectCompensation/OtherCompensationAmount/WorkedPayAmount",
        "hrOpenFilter": "WorkerCompensationReports/DirectCompensation/OtherCompensationAmount/WorkedPayTypeCode = \"Commissions\"",
        "hrOpenDescription": "The monetary amount of cash or cash-equivalent (currency, coin, check, or direct deposit) compensation paid to a worker other than salary, hourly wages, and paid leave. Includes, but is not limited to bonuses, commissions, lump-sum, residuals, severance, tips, and incentive, piecework, production-based payments, and buy back of accrued leave.",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "X.C.1.d.(4)",
        "name": "Piecework, Performance-Based, or Contract Work Paid",
        "definition": "The monetary amount paid to a worker based on a fixed rate for each unit produced or action performed regardless of time required. • Enter the total dollar amount paid by the employer for the worker’s Piece Work or Performance-Based Work services during the subject month/quarter. • For payments to independent contract workers, enter dollar amount paid for work performed. • Do not include any other remuneration or the dollar amount of non-cash fringe benefits funded by the employer. • Do not reduce amounts paid for Piece Work or Performance-Based Work to reflect worker’s tax deductions, bonds, union dues, exemptions, withholding, health insurance, or pay deferral plans such as 401(k); the reported figures should equal the pre-tax gross amounts. • If worker is not paid for Piece Work or Performance-Based Work during the subject month/quarter report a zero in this field. • Do not include any base pay that is not directly determined by the production level of the worker. • Report amounts paid for Piece Work or Performance-Based Work when paid or when constructively paid. Amounts are constructively paid when credited to the worker’s account or set apart for the worker so they may be drawn at any time, although not actually in her or his possession.",
        "hrOpenProperty": "WorkerCompensationReports/DirectCompensation/OtherCompensationAmount/WorkedPayAmount",
        "hrOpenFilter": "WorkerCompensationReports/DirectCompensation/OtherCompensationAmount/WorkedPayTypeCode = \"Performance\"",
        "hrOpenDescription": "The monetary amount of cash or cash-equivalent (currency, coin, check, or direct deposit) compensation paid to a worker other than salary, hourly wages, and paid leave. Includes, but is not limited to bonuses, commissions, lump-sum, residuals, severance, tips, and incentive, piecework, production-based payments, and buy back of accrued leave.",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "X.C.1.d.(5)",
        "name": "Residuals Paid",
        "definition": "The monetary amount of contractual payments made to a worker in periods of time subsequent to when they have provided a good or service. These payments are based on the revenues generated by the good or service the worker provided. Residual payments are most often associated with the entertainment industry, since movies and music can generate revenues long after they are originally released. • Enter the total dollar amount paid by the employer for the worker’s Residual earnings during the month/quarter. • Do not reduce Residuals amounts paid to reflect worker’s tax deductions, bonds, union dues, exemptions, withholding, health insurance, or pay deferral plans such as 401(k); the reported figures should equal the pre-tax gross amounts. • Do not include any other remuneration or the dollar amount of non-cash fringe benefits funded by the employer. • If the worker had no Residuals during the month/quarter, report a zero in this field. • Report Residuals when paid or when constructively paid. Amounts are constructively paid when credited to the worker’s account or set apart for the worker so they may be drawn at any time, although not actually in her or his possession.",
        "hrOpenProperty": "WorkerCompensationReports/DirectCompensation/OtherCompensationAmount/WorkedPayAmount",
        "hrOpenFilter": "WorkerCompensationReports/DirectCompensation/OtherCompensationAmount/WorkedPayTypeCode = \"Residuals\"",
        "hrOpenDescription": "The monetary amount of cash or cash-equivalent (currency, coin, check, or direct deposit) compensation paid to a worker other than salary, hourly wages, and paid leave. Includes, but is not limited to bonuses, commissions, lump-sum, residuals, severance, tips, and incentive, piecework, production-based payments, and buy back of accrued leave.",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "X.C.1.d.(6)",
        "name": "Total Severance Paid",
        "definition": "The total monetary amount paid to a worker upon termination of employment. It is usually based on length of employment for which a worker is eligible upon termination. Total Severance Paid = Legally-required Severance Paid + Discretionary Severance Paid • Enter the total dollar amount paid by the employer for the worker’s Severance pay during the month/quarter. • Do not reduce Severance amounts paid to reflect worker’s tax deductions, bonds, union dues, exemptions, withholding, health insurance, or pay deferral plans such as 401(k); the reported figures should equal the pre-tax gross amounts. • Do not include any other remuneration or the dollar amount of non-cash fringe benefits funded by the employer. • If the worker had no Severance during the month/quarter, report a zero in this field. • Report Severance when paid or when constructively paid. Amounts are constructively paid when credited to the worker’s account or set apart for the worker so they may be drawn at any time, although not actually in her or his possession.",
        "hrOpenProperty": "TBD",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "SS > Gap. We don't have a total severance category. Can it be calculated field that is the sum of the following two items?",
        "depth": 4
      },
      {
        "id": "X.C.1.d.(6)(a)",
        "name": "Legally-required Severance Paid",
        "definition": "The monetary amount paid to a worker upon termination of employment due to a legal judgement or contract requirement. It is usually based on length of employment for which a worker is eligible upon termination. • Enter the total dollar amount paid by the employer for the worker’s Legally-required Severance pay during the month/quarter. • Do not reduce Legally-required Severance amounts paid to reflect worker’s tax deductions, bonds, union dues, exemptions, withholding, health insurance, or pay deferral plans such as 401(k); the reported figures should equal the pre-tax gross amounts. • Do not include any other remuneration or the dollar amount of non-cash fringe benefits funded by the employer. • If the worker had no Legally-required Severance Paid during the month/quarter, report a zero in this field. • Report Legally-required Severance when paid or when constructively paid. Amounts are constructively paid when credited to the worker’s account or set apart for the worker so they may be drawn at any time, although not actually in her or his possession.",
        "hrOpenProperty": "TBD",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "SS > Gap. We don't have a total severance category.",
        "depth": 4
      },
      {
        "id": "X.C.1.d.(6)(b)",
        "name": "Discretionary Severance Paid",
        "definition": "The monetary amount paid to a worker upon termination of employment at the discretion of the employert. It is usually based on length of employment for which a worker is eligible upon termination. • Enter the total dollar amount paid by the employer for the worker’s Discretionary Severance pay during the month/quarter. • Do not reduce Discretionary Severance amounts paid to reflect worker’s tax deductions, bonds, union dues, exemptions, withholding, health insurance, or pay deferral plans such as 401(k); the reported figures should equal the pre-tax gross amounts. • Do not include any other remuneration or the dollar amount of non-cash fringe benefits funded by the employer. • If the worker had no Discretionary Severance Paid during the month/quarter, report a zero in this field. • Report Discretionary Severance when paid or when constructively paid. Amounts are constructively paid when credited to the worker’s account or set apart for the worker so they may be drawn at any time, although not actually in her or his possession.",
        "hrOpenProperty": "TBD",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "SS > Gap. We don't have a total severance category.",
        "depth": 4
      },
      {
        "id": "X.C.1.d.(7)",
        "name": "Cash Tips Paid",
        "definition": "Tips (IRC sections 3121(a)(12), 3306(s) and 6053(a) and IRS instructions for form 940) The cash amount, reported by the worker to the employer, of gratuities paid by customers to the worker, over and above payment due for services, and is: (1) received while performing services which constitute employment, and (2) included in a written statement furnished to the employer pursuant to IRC section 6053(a). • Do not include non-cash tips (see non-cash payments) • Enter the total dollar amount of Cash Tips Paid to the worker during the subject month/quarter. • Do not reduce Cash Tip Paid amounts to reflect worker’s tax deductions, bonds, union dues, exemptions, withholding, health insurance, or pay deferral plans such as 401(k); the reported figures should equal the pre-tax gross amounts. • Do not include other compensation such as salary, hourly wages, commissions, piecework, performance-based work, severance, or bonuses. • Report Tips when paid or when constructively paid. Amounts are constructively paid when credited to the worker’s account or set apart for the worker so they may be drawn at any time, although not actually in her or his possession.",
        "hrOpenProperty": "WorkerCompensationReports/DirectCompensation/OtherCompensationAmount/WorkedPayAmount",
        "hrOpenFilter": "WorkerCompensationReports/DirectCompensation/OtherCompensationAmount/WorkedPayTypeCode = \"CashTips\"",
        "hrOpenDescription": "The monetary amount of cash or cash-equivalent (currency, coin, check, or direct deposit) compensation paid to a worker other than salary, hourly wages, and paid leave. Includes, but is not limited to bonuses, commissions, lump-sum, residuals, severance, tips, and incentive, piecework, production-based payments, and buy back of accrued leave.",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "X.C.1.d.(8)",
        "name": "Board of Director Fees Paid",
        "definition": "Compensation paid for services as a member of the Board of Directors of the organization, excluding reimbursement of expenses or other non‑regular forms of compensation, before reductions for contributions to or deferrals under any deferred compensation plan sponsored by the organization.",
        "hrOpenProperty": "WorkerCompensationReports/DirectCompensation/OtherCompensationAmount/WorkedPayAmount",
        "hrOpenFilter": "WorkerCompensationReports/DirectCompensation/OtherCompensationAmount/WorkedPayTypeCode = \"DirectorFees\"",
        "hrOpenDescription": "The monetary amount of cash or cash-equivalent (currency, coin, check, or direct deposit) compensation paid to a worker other than salary, hourly wages, and paid leave. Includes, but is not limited to bonuses, commissions, lump-sum, residuals, severance, tips, and incentive, piecework, production-based payments, and buy back of accrued leave.",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "X.C.1.d.(9)",
        "name": "Business Expenses Reimbursed - Accountable Plan",
        "definition": "(26 CFR § 1.62-2, 26 U.S. Code § 162, IRS Pub. 15, section 5, IRC section 1.62-2(c)) Employee expenses (including allowances, subsistence, and per diem) reimbursed under an accountable plan. To be an accountable plan, your reimbursement or allowance arrangement must require your employees to meet all three of the following rules. 1) They must have paid or incurred allowable expenses while performing services as your employees. The reimbursement or advance must be payment for the expenses and must not be an amount that would have otherwise been paid to the employee as wages. 2) They must substantiate these expenses to you within a reasonable period of time. 3º They must return any amounts in excess of substantiated expenses within a reasonable period of time.Expenses reimbursed under an accountable plan that do not exceed specified government rates for per diem or standard mileage. The following was suspended by the Tax Cuts and Jobs Act (P.L. 115-97) for the tax years 2018 through 2025. Qualified moving expense reimbursement (IRC sections 132(g)(1) and 3306(b)(7)) Amounts received (directly or indirectly) by an individual from an employer as a payment for (or a reimbursement of) expenses which would be deductible as moving expenses under IRC section 217 if directly paid or incurred by the individual. Does not include any payment for (or reimbursement of) an expense actually deducted by the individual in a prior taxable year.\"",
        "hrOpenProperty": "WorkerCompensationReports/DirectCompensation/OtherCompensationAmount/WorkedPayAmount",
        "hrOpenFilter": "WorkerCompensationReports/DirectCompensation/OtherCompensationAmount/WorkedPayTypeCode = \"AccountableExpenses\"",
        "hrOpenDescription": "The monetary amount of cash or cash-equivalent (currency, coin, check, or direct deposit) compensation paid to a worker other than salary, hourly wages, and paid leave. Includes, but is not limited to bonuses, commissions, lump-sum, residuals, severance, tips, and incentive, piecework, production-based payments, and buy back of accrued leave.",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "X.C.1.d.(10)",
        "name": "Business Expenses Reimbursed - Nonaccountable Plan",
        "definition": "Employee expenses (including allowances, subsistence, and per diem) reimbursed under an nonaccountable plan. Employer payments are treated as paid under a nonaccountable plan if: 1) The employee isn't required to or doesn't substantiate timely those expenses to the employer with receipts or other documentation, 2) Employer advances an amount to the employee for business expenses and the employee isn't required to or doesn't return timely any amount they don’t use for business expenses, 3) Employer advances or pays an amount to the employee regardless of whether they reasonably expect the employee to have expenses related to the business, or 4) Employer pays an amount as a reimbursement that would have otherwise been paid as wages.",
        "hrOpenProperty": "WorkerCompensationReports/DirectCompensation/OtherCompensationAmount/WorkedPayAmount",
        "hrOpenFilter": "WorkerCompensationReports/DirectCompensation/OtherCompensationAmount/WorkedPayTypeCode = \"NonaccountableExpenses\"",
        "hrOpenDescription": "The monetary amount of cash or cash-equivalent (currency, coin, check, or direct deposit) compensation paid to a worker other than salary, hourly wages, and paid leave. Includes, but is not limited to bonuses, commissions, lump-sum, residuals, severance, tips, and incentive, piecework, production-based payments, and buy back of accrued leave.",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "X.C.1.d.(11)",
        "name": "Cafeteria Plan Payments",
        "definition": "(IRC sections 125 and 3306(b)(5)(G) and IRS publication 15-B) A cafeteria plan, including a Flexible Spending Arrangement (FSA), provides participants an opportunity to receive qualified benefits on a pre-tax basis. It is a written plan that allows employees to choose between receiving cash or taxable benefits, instead of certain qualified benefits for which the law provides an exclusion from wages. If an employee chooses to receive a qualified benefit under the plan, the fact that the employee could have received cash, or a taxable benefit instead won't make the qualified benefit taxable. Generally, a cafeteria plan doesn't include any plan that offers a benefit that defers pay. However, a cafeteria plan can include a qualified 401(k) plan as a benefit. Also, certain life insurance plans maintained by educational institutions can be offered as a benefit even though they defer pay. Qualified benefits. A cafeteria plan can include the following non-taxable benefits, see detailed discussion under each title. •&#9;Accident and health benefits (but not Archer medical savings accounts (Archer MSAs) or long-term care insurance). •&#9;Adoption assistance. •&#9;Dependent care assistance. •&#9;Group-term life insurance coverage (including costs that can't be excluded from wages). •&#9;HSAs. Distributions from an HSA may be used to pay eligible long-term care insurance premiums or to pay for qualified long-term care services.",
        "hrOpenProperty": "WorkerCompensationReports/DirectCompensation/OtherCompensationAmount/WorkedPayAmount",
        "hrOpenFilter": "WorkerCompensationReports/DirectCompensation/OtherCompensationAmount/WorkedPayTypeCode = \"Cafeteria\"",
        "hrOpenDescription": "The monetary amount of cash or cash-equivalent (currency, coin, check, or direct deposit) compensation paid to a worker other than salary, hourly wages, and paid leave. Includes, but is not limited to bonuses, commissions, lump-sum, residuals, severance, tips, and incentive, piecework, production-based payments, and buy back of accrued leave.",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "X.C.1.d.(12)",
        "name": "Employee Achievement Awards Paid (IRC 74(c))",
        "definition": "(IRC sections 74(c) and 3306(b)(16) and IRS publication 15-B) The value of any tangible personal property given to an employee as an award for either length of service or safety achievement up to the following amounts: •&#9;$400 for awards that aren't qualified plan awards. •&#9;$1,600 for all awards, whether or not qualified plan awards. A qualified plan award is an achievement award given as part of an established written plan or program that doesn't favor highly compensated employees as to eligibility or benefits. An achievement award must meet all the following requirements. •&#9;It is given to an employee for length of service or safety achievement. •&#9;It is awarded as part of a meaningful presentation. •&#9;It is awarded under conditions and circumstances that don't create a significant likelihood of disguised pay. Achievement awards do not include awards of cash, cash equivalents, gift cards, gift coupons, or gift certificates (other than arrangements granting only the right to select and receive tangible personal property from a limited assortment of items preselected or preapproved by the employer). Also, they don’t include vacations, meals, lodging, tickets to theater or sporting events, stocks, bonds, other securities, and other similar items.",
        "hrOpenProperty": "WorkerCompensationReports/DirectCompensation/OtherCompensationAmount/WorkedPayAmount",
        "hrOpenFilter": "WorkerCompensationReports/DirectCompensation/OtherCompensationAmount/WorkedPayTypeCode = \"AchievementAwards\"",
        "hrOpenDescription": "The monetary amount of cash or cash-equivalent (currency, coin, check, or direct deposit) compensation paid to a worker other than salary, hourly wages, and paid leave. Includes, but is not limited to bonuses, commissions, lump-sum, residuals, severance, tips, and incentive, piecework, production-based payments, and buy back of accrued leave.",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "X.C.1.d.(13)",
        "name": "Equity Compensation (Stock Options & Restricted Stock Units)",
        "definition": "The dollar amount of the difference between fair market value and strike price for stock options when excercised, or for Restricted Stock Units when vested.",
        "hrOpenProperty": "WorkerCompensationReports/DirectCompensation/OtherCompensationAmount/WorkedPayAmount",
        "hrOpenFilter": "WorkerCompensationReports/DirectCompensation/OtherCompensationAmount/WorkedPayTypeCode = \"Equity\"",
        "hrOpenDescription": "The monetary amount of cash or cash-equivalent (currency, coin, check, or direct deposit) compensation paid to a worker other than salary, hourly wages, and paid leave. Includes, but is not limited to bonuses, commissions, lump-sum, residuals, severance, tips, and incentive, piecework, production-based payments, and buy back of accrued leave.",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "X.C.1.d.(14)",
        "name": "Workers' Compensation Paid",
        "definition": "Workers' compensation payments to the worker after a work-related injury or illness.",
        "hrOpenProperty": "WorkerCompensationReports/DirectCompensation/OtherCompensationAmount/WorkedPayAmount",
        "hrOpenFilter": "WorkerCompensationReports/DirectCompensation/OtherCompensationAmount/WorkedPayTypeCode = \"WorkersComp\"",
        "hrOpenDescription": "The monetary amount of cash or cash-equivalent (currency, coin, check, or direct deposit) compensation paid to a worker other than salary, hourly wages, and paid leave. Includes, but is not limited to bonuses, commissions, lump-sum, residuals, severance, tips, and incentive, piecework, production-based payments, and buy back of accrued leave.",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "X.C.1.d.(15)",
        "name": "Payments in the nature of workers' compensation— public employees",
        "definition": "Payment made to public employees (such as government workers, teachers, law enforcement, and other municipal/state/federal employees) in the nature of workers’ compensation under Internal Revenue Code section 104(a)(1)",
        "hrOpenProperty": "WorkerCompensationReports/DirectCompensation/OtherCompensationAmount/WorkedPayAmount",
        "hrOpenFilter": "WorkerCompensationReports/DirectCompensation/OtherCompensationAmount/WorkedPayTypeCode = \"WorkersCompNature\"",
        "hrOpenDescription": "The monetary amount of cash or cash-equivalent (currency, coin, check, or direct deposit) compensation paid to a worker other than salary, hourly wages, and paid leave. Includes, but is not limited to bonuses, commissions, lump-sum, residuals, severance, tips, and incentive, piecework, production-based payments, and buy back of accrued leave.",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "X.C.1.d.(16)",
        "name": "Sickness and accident disability payments directly to employee, not workers' compensation",
        "definition": "Payments directly to an employee or any of his dependents under a plan or system established by an employer which makes provision for his employees generally (or for his employees generally and their dependents) or for a class or classes of his employees (or for a class or classes of his employees and their dependents), on account of sickness or accident disability.",
        "hrOpenProperty": "WorkerCompensationReports/DirectCompensation/OtherCompensationAmount/WorkedPayAmount",
        "hrOpenFilter": "WorkerCompensationReports/DirectCompensation/OtherCompensationAmount/WorkedPayTypeCode = \"Disability\"",
        "hrOpenDescription": "The monetary amount of cash or cash-equivalent (currency, coin, check, or direct deposit) compensation paid to a worker other than salary, hourly wages, and paid leave. Includes, but is not limited to bonuses, commissions, lump-sum, residuals, severance, tips, and incentive, piecework, production-based payments, and buy back of accrued leave.",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "X.C.1.d.(17)",
        "name": "Other Non-specified Cash Compensation Paid",
        "definition": "Any other cash payments, not specified elsewhere, made by the employer to the worker.",
        "hrOpenProperty": "WorkerCompensationReports/DirectCompensation/OtherCompensationAmount/WorkedPayAmount",
        "hrOpenFilter": "WorkerCompensationReports/DirectCompensation/OtherCompensationAmount/WorkedPayTypeCode = \"Non-specfied\"",
        "hrOpenDescription": "The monetary amount of cash or cash-equivalent (currency, coin, check, or direct deposit) compensation paid to a worker other than salary, hourly wages, and paid leave. Includes, but is not limited to bonuses, commissions, lump-sum, residuals, severance, tips, and incentive, piecework, production-based payments, and buy back of accrued leave.",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "X.C.2",
        "name": "Total Indirect, Non-Cash Compensation",
        "definition": "The total monetary value of compensation and contributions paid by the employer for the worker’s legally required and discretionary non-cash fringe benefits. These payments represent indirect compensation to the worker. Total Non-Cash (Indirect) Compensation = Total Legally Required Benefits Paid + Total Discretionary Benefits Paid • Enter the total dollar amount of Non-cash Compensation paid by the employer for the worker’s services during the subject month/quarter. • Do not include the dollar amount of worker contributions to non-cash fringe benefits. • Legally required fringe benefits include: Social Security, Medicare, FUTA, state Unemployment Insurance, and Workers’ Compensation. • Non-legally required fringe benefits include but are not limited to: Adoption Assistance, Childcare Assistance, Company Vehicles Use, Death Benefits, Product/Service Discounts, Education Assistance, worker Assistance Program Coverage, Gift Certificates and Gift Cards, Legal Services Coverage Paid, Lodging, Meal Discounts, Merchandise Provided, Personal Travel Paid, Relocation Assistance, and Stock Options.",
        "hrOpenProperty": "WorkerCompensationReports/TotalIndirectCompensationAmount",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 2
      },
      {
        "id": "X.C.2.a",
        "name": "Total Legally Required Benefits Paid",
        "definition": "The total monetary value of compensation paid by the employer for worker’s legally required non-cash fringe benefits, including employer contributions to Social Security, Medicare, FUTA, state Unemployment Insurance, Workers’ Compensation, and any other state-mandated benefits. Total Legally Required Benefits Paid = Social Security Contributions Paid + Medicare Contributions Paid + Federal Unemployment Insurance Contributions Paid + State Unemployment Insurance Contributions Paid + Workers’ Compensation Contributions Paid + Other Legally Required Contributions Paid • Enter the total dollar amount paid for the employer’s share of Social Security, Medicare, Federal Unemployment Insurance, State Unemployment Insurance, and Workers’ Compensation during the month/quarter.",
        "hrOpenProperty": "WorkerCompensationReports/IndirectCompensation/TotalNonVoluntaryBenefitAmount",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 3
      },
      {
        "id": "X.C.2.a.(1)",
        "name": "Social Security Contributions Paid",
        "definition": "The total monetary value of employer contributions deposited for the worker’s legally required Social Security benefits. • Enter the total dollar amount of employer’s contribution to Social Security on behalf of the worker. • Do not include the dollar amount of the worker’s contributions (withholding) to Social Security.",
        "hrOpenProperty": "WorkerCompensationReports/IndirectCompensation/NonVoluntaryBenefitAmount/Amount",
        "hrOpenFilter": "WorkerCompensationReports/IndirectCompensation/NonVoluntaryBenefitAmount/TypeCode = \"SocialSecurityContributions\"",
        "hrOpenDescription": "The monetary value of compensation paid by the employer for worker’s legally required non-cash fringe benefits, including employer contributions to Social Security, Medicare, FUTA, state Unemployment Insurance, Workers’ Compensation, and any other state-mandated benefits.",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "X.C.2.a.(2)",
        "name": "Medicare Contributions Paid",
        "definition": "The total monetary value of employer contributions deposited for the worker’s legally required Medicare benefits. • Enter the total dollar amount of employer’s contribution to Medicare on behalf of the worker. • Do not include the dollar amount of the worker’s contributions (withholding) to Medicare.",
        "hrOpenProperty": "WorkerCompensationReports/IndirectCompensation/NonVoluntaryBenefitAmount/Amount",
        "hrOpenFilter": "WorkerCompensationReports/IndirectCompensation/NonVoluntaryBenefitAmount/TypeCode = \"MedicareContributions\"",
        "hrOpenDescription": "The monetary value of compensation paid by the employer for worker’s legally required non-cash fringe benefits, including employer contributions to Social Security, Medicare, FUTA, state Unemployment Insurance, Workers’ Compensation, and any other state-mandated benefits.",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "X.C.2.a.(3)",
        "name": "Federal Unemployment Insurance Contributions Paid",
        "definition": "The total monetary value of employer contributions deposited for the worker’s legally required Federal Unemployment Insurance benefits under the Federal Unemployment Tax Act (FUTA). • Enter the total dollar amount of employer’s tax under the FUTA on behalf of the worker.",
        "hrOpenProperty": "WorkerCompensationReports/IndirectCompensation/NonVoluntaryBenefitAmount/Amount",
        "hrOpenFilter": "WorkerCompensationReports/IndirectCompensation/NonVoluntaryBenefitAmount/TypeCode = \"FederalUIContributions\"",
        "hrOpenDescription": "The monetary value of compensation paid by the employer for worker’s legally required non-cash fringe benefits, including employer contributions to Social Security, Medicare, FUTA, state Unemployment Insurance, Workers’ Compensation, and any other state-mandated benefits.",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "X.C.2.a.(4)",
        "name": "State Unemployment Insurance Contributions Paid",
        "definition": "The total monetary value of employer contributions deposited for the worker’s legally required State Unemployment Insurance benefits. • Enter the total dollar amount of employer’s tax for State Unemployment Insurance on behalf of the worker. • Do not include the dollar amount of the worker’s contributions (withholding) to State Unemployment Insurance.",
        "hrOpenProperty": "WorkerCompensationReports/IndirectCompensation/NonVoluntaryBenefitAmount/Amount",
        "hrOpenFilter": "WorkerCompensationReports/IndirectCompensation/NonVoluntaryBenefitAmount/TypeCode = \"StateUIContributions\"",
        "hrOpenDescription": "The monetary value of compensation paid by the employer for worker’s legally required non-cash fringe benefits, including employer contributions to Social Security, Medicare, FUTA, state Unemployment Insurance, Workers’ Compensation, and any other state-mandated benefits.",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "X.C.2.a.(5)",
        "name": "Workers’ Compensation Contributions Paid",
        "definition": "The total monetary value of employer contributions deposited to provide for the worker’s legally required Workers’ Compensation benefits. • Enter the total dollar amount of employer’s insurance premiums or tax paid for Workers’ Compensation on behalf of the worker. • Do not include the dollar amount of the worker’s contributions (withholding) to Social Security.",
        "hrOpenProperty": "WorkerCompensationReports/IndirectCompensation/NonVoluntaryBenefitAmount/Amount",
        "hrOpenFilter": "WorkerCompensationReports/IndirectCompensation/NonVoluntaryBenefitAmount/TypeCode = \"WorkersCompensationContributions\"",
        "hrOpenDescription": "The monetary value of compensation paid by the employer for worker’s legally required non-cash fringe benefits, including employer contributions to Social Security, Medicare, FUTA, state Unemployment Insurance, Workers’ Compensation, and any other state-mandated benefits.",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "X.C.2.a.(6)",
        "name": "Other Legally Required Contributions Paid",
        "definition": "The total monetary value of other employer contributions made to federal, state, of locally required fringe benefits not included in another specific category of legally required fringe benefits. • Enter the total dollar amount of employer’s contributions to other federal, state, of locally required fringe benefits not included in another specific category of legally required fringe benefits. • Do not include the dollar amount of the worker’s contributions to such benefits. • Some states require health insurance or other benefits.",
        "hrOpenProperty": "WorkerCompensationReports/IndirectCompensation/NonVoluntaryBenefitAmount/Amount",
        "hrOpenFilter": "WorkerCompensationReports/IndirectCompensation/NonVoluntaryBenefitAmount/TypeCode = \"OtherRequiredContributions\"",
        "hrOpenDescription": "The monetary value of compensation paid by the employer for worker’s legally required non-cash fringe benefits, including employer contributions to Social Security, Medicare, FUTA, state Unemployment Insurance, Workers’ Compensation, and any other state-mandated benefits.",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "X.C.2.b",
        "name": "Total Discretionary Benefits Paid",
        "definition": "The total monetary value of employer-paid contributions for discretionary fringe benefits provided to the worker, including, but not limited to, insurance premiums, retirement and savings accounts, adoption assistance, childcare assistance, company vehicle use, product/service discounts, education assistance, employee assistance program coverage, gift certificates and gift cards, legal services coverage, lodging, meal discounts, merchandise provided, personal travel, relocation assistance, and stock options. Total Discretionary Benefits Paid = Total Accident and Health Benefit Plan Contributions + Adoption assistance contributions +Athletic Facility Costs + Cafeteria Plan Contributions + Total Certain Fringe Benefits + Dependent care assistance + Education assistance +Employee Stock Options + Health Service Loan Repayments + Legal Insurance Premiums Paid + Total Life Insurance Premiums Paid +Lodging on Business Premises + Meals on Business Premises + Military Benefits + Noncash Payments + Outplacement Services + Total Discretionary Retirement Benefit Contributions + Scholarship and Fellowship Payments + Service Not in the Course of the Employer's Trade or Business + Supplemental Unemployment Insurance Premiums Paid + Tax Payments for Employee + Temporary Work Relocation Payments + Tuition Reduction + All Other Discretionary Benefits Paid • Enter the total dollar amount of all of the employer’s contributions during the month/quarter for the worker’s discretionary fringe benefits. • Do not include the dollar amount of the worker’s contributions to these benefits.",
        "hrOpenProperty": "WorkerCompensationReports/IndirectCompensation/TotalVoluntaryBenefitAmount/Amount",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 3
      },
      {
        "id": "X.C.2.b.(1)",
        "name": "Total Accident and Health Benefit Plan Contributions",
        "definition": "Sum of contributions to: Accident or health plans + Medical or hospital expense payments + Death benefits + Health/medical saving account contributions + Payments unrelated to absence from work + Payments for sick leave or medical or hospital expenses after 6 months following the last calendar month in which the employee worked for the employer + Payments after an employee's death or disability retirement + Payments to survivor or estate after calendar year of employee's death + Payments to sick pay plan attributable to employee contributions",
        "hrOpenProperty": "TBD",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "X.C.2.b.(1)(a)",
        "name": "Accident or health plans",
        "definition": "(IRC sections 105, IRC sections 106(a), 106(b)(2), 3306(b)(2), and 7702(B)(c)) and IRS publication 15-B) Employer contributions to an accident and health plan (IRC section 1.105-5) for an employee, to provide support on account of sickness or accident disability, including the following: •&#9;Contributions to the cost of accident or health insurance including dental and vision insurance and qualified long-term care insurance (IRC sections 106(b)(2), 3306(b)(2), and 7702(B)(c)). •&#9;Contributions to a separate trust or fund that directly or through insurance provides accident or health benefits (IRC sections 1.106-1 and 3306(b)(2)). •&#9;Contributions to Archer Medical Savings Accounts (MSAs) (IRC sections 106(b) and 3306(b)(17)). •&#9;Contributions to Health Savings Accounts (HSAs) (IRC sections 106(d) and 3306(b)(18)). •&#9;COBRA premiums (IRC section 54.4980B-8). The amounts paid to maintain medical coverage for an employee under the Combined Omnibus Budget Reconciliation Act of 1986 (COBRA), regardless of the length of employment, whether the premiums are paid directly or as reimbursement to the employee for premiums paid, and whether the employee's separation is permanent or temporary. An accident or health plan is an arrangement that provides benefits for employees, their spouses, their dependents, and their children (under age 27 at the end of the tax year) in the event of personal injury or sickness. The plan may be insured or noninsured and doesn't need to be in writing. Direct payments to the employee may be included only if made under a workers’ compensation law. Includes direct payments to the employee for specific permanent injuries (such as the loss of the use of an arm or leg). These payments must be figured without regard to the period the employee is absent from work. Includes payments made under qualified small employer health reimbursement arrangements (QSEHRAs) pursuant to IRC section 9831(d)(2). QSEHRAs allow eligible small employers to pay or reimburse medical care expenses, including health insurance premiums, of eligible employees and their family members.",
        "hrOpenProperty": "TBD",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "X.C.2.b.(1)(b)",
        "name": "Medical or hospital expense payments",
        "definition": "(IRC sections 105(b), 213(d), and 3306(b)(2)) Payments to, or on behalf of an employee under a definite plan or system established by an employer which makes provision for his employees generally (or for his employees generally and their dependents) or for a class or classes of his employees (or for a class or classes of his employees and their dependents), on account of medical or hospitalization expenses in connection with sickness or accident disability, or for insurance covering these expenses.",
        "hrOpenProperty": "TBD",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "X.C.2.b.(1)(c)",
        "name": "Death benefits",
        "definition": "(IRC section 3306(b)(2)) The amount of any payment (including any amount paid by an employer for insurance or annuities, or into a fund, to provide for any such payment) made to, or on behalf of, an employee or any of his dependents under a plan or system established by an employer which makes provision for his employees generally (or for his employees generally and their dependents) or for a class or classes of his employees (or for a class or classes of his employees and their dependents), on account of the death of the employee.",
        "hrOpenProperty": "TBD",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "X.C.2.b.(1)(d)",
        "name": "Total Health/Medical Saving Account Contributions",
        "definition": "All employer contributions for the employee's health and medical sa vings accounts. Total Health/medical Saving Account Contributions = Archer Medical Savings Accounts (MSA) contributions + Health Savings Accounts (HSAs) contributions + Other health/medical saving account contributions",
        "hrOpenProperty": "TBD",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "X.C.2.b.(1)(d)[1]",
        "name": "Archer Medical Savings Accounts (MSA)",
        "definition": "(IRC sections 106(b) and 3306(b)(17)) Archer Medical Savings Accounts (MSA) Employer contributions to an employee’s Archer MSA to the extent such amounts do not exceed the limitation under section 220(b)(1) (determined without regard to this subsection) which is applicable to the employee for the taxable year.",
        "hrOpenProperty": "TBD",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "X.C.2.b.(1)(d)[2]",
        "name": "Health Savings Accounts (HSAs)",
        "definition": "(IRC sections 106(d) and IRS publications 15 and 69) Health Savings Accounts (HSAs) Employer contributions, up to specified dollar limits, to the HSA of a qualified individual. An HSA is an account owned by a qualified individual who is an employee or former employee. Contributions to the account are used to pay current or future medical expenses of the account owner, their spouse, and any qualified dependent. The medical expenses must not be reimbursable by insurance or other sources and their payment from HSA funds (distribution) won't give rise to a medical expense deduction on the individual's federal in-come tax return.",
        "hrOpenProperty": "TBD",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "X.C.2.b.(1)(d)[3]",
        "name": "Other Health/Medical Savings Account Contributions",
        "definition": "All employer contributions to the employee's health and medical sa vings accounts that do not qualify under the definitions of Archer Medical Savings Accounts (MSA) or Health Savings Accounts (HSAs) above.",
        "hrOpenProperty": "TBD",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "X.C.2.b.(1)(e)",
        "name": "Payments unrelated to absence from work",
        "definition": "(IRC section 105(c)) Accident or health insurance payments unrelated to absence from work aren't sick pay and aren't subject to FUTA taxes. These include payments for: a. &#9;Permanent loss of a member or function of the body, b. &#9;Permanent loss of the use of a member or function of the body, or c. &#9;Permanent disfigurement of the body.",
        "hrOpenProperty": "TBD",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "X.C.2.b.(1)(f)",
        "name": "Payments for sick leave or medical or hospital expenses after 6 months following the last calendar month in which the employee worked for the employer",
        "definition": "(IRC section 3306(b)(4)) Payment on account of sickness or accident disability, or medical or hospitalization expenses in connection with sickness or accident disability, made by an employer to, or on behalf of, an employee after the expiration of 6 calendar months following the last calendar month in which the employee worked for such employer.",
        "hrOpenProperty": "TBD",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "X.C.2.b.(1)(g)",
        "name": "Payments after an employee's death or disability retirement",
        "definition": "(IRC section 3306(b)(10) and IRS publication 15-A) Amounts paid by an employer to an employee or any of his dependents under a definite plan or system, as defined under Sick Pay Plan in IRS publication 15-A, on or after the termination of the employment relationship because of death or disability retirement. These amounts do not include amounts paid if they would have been paid even if the employment relationship hadn't terminated because of death or disability retirement.",
        "hrOpenProperty": "TBD",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "X.C.2.b.(1)(h)",
        "name": "Payments to a survivor or estate after calendar year of employee's death",
        "definition": "(IRC section 3306(b)(15) and IRS publication 15-B) Payment made by an employer to a survivor or the estate of a former employee after the calendar year in which such employee died.",
        "hrOpenProperty": "TBD",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "X.C.2.b.(1)(i)",
        "name": "Payments to sick pay plan attributable to employee contributions",
        "definition": "(IRS publication 15-A) Payments, or parts of payments, attributable to employee contributions to a sick pay plan made with after-tax dollars. Contributions to a sick pay plan made on behalf of employees with employees' pre-tax dollars under a cafeteria plan are employer contributions.",
        "hrOpenProperty": "TBD",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "X.C.2.b.(2)",
        "name": "Adoption assistance",
        "definition": "(IRC 137) (a) Exclusion.-- (1) In general.--Gross income of an employee does not include amounts paid or expenses incurred by the employer for qualified adoption expenses in connection with the adoption of a child by an employee if such amounts are furnished pursuant to an adoption assistance program. (2) $10,000 exclusion for adoption of child with special needs regardless of expenses.--In the case of an adoption of a child with special needs which becomes final during a taxable year, the qualified adoption expenses with respect to such adoption for such year shall be increased by an amount equal to the excess (if any) of $10,000 over the actual aggregate qualified adoption expenses with respect to such adoption during such taxable year and all prior taxable years. (b) Limitations.-- (1) Dollar limitation.--The aggregate of the amounts paid or expenses incurred which may be taken into account under subsection (a) for all taxable years with respect to the adoption of a child by the taxpayer shall not exceed $10,000. (2) Income limitation.--The amount excludable from gross income under subsection (a) for any taxable year shall be reduced (but not below zero) by an amount which bears the same ratio to the amount so excludable (determined without regard to this paragraph but with regard to paragraph (1)) as-- (A) the amount (if any) by which the taxpayer's adjusted gross income exceeds $150,000, bears to (B) $40,000. (3) Determination of adjusted gross income.--For purposes of paragraph (2), adjusted gross income shall be determined-- (A) without regard to this section and sections 85(c) 1221, 911, 931, and 933, and (B) after the application of sections 86, 135, 219, and 469. (c) Adoption assistance program.--For purposes of this section, an adoption assistance program is a separate written plan of an employer for the exclusive benefit of such employer's employees-- (1) under which the employer provides such employees with adoption assistance, and (2) which meets requirements similar to the requirements of paragraphs (2), (3), (5), and (6) of section 127(b). An adoption reimbursement program operated under section 1052 of title 10, United States Code (relating to armed forces) or section 541 of title 14, United States Code 2 (relating to members of the Coast Guard) shall be treated as an adoption assistance program for purposes of this section. (d) Qualified adoption expenses.--For purposes of this section, the term “qualified adoption expenses” has the meaning given such term by section 23(d) (determined without regard to reimbursements under this section). (e) Certain rules to apply.--Rules similar to the rules of subsections (e), (f), and (g) of section 23 shall apply for purposes of this section. (f) Adjustments for inflation.--In the case of a taxable year beginning after December 31, 2002, each of the dollar amounts in subsection (a)(2) and paragraphs (1) and (2)(A) of subsection (b) shall be increased by an amount equal to-- (1) such dollar amount, multiplied by (2)the cost-of-living adjustment determined under section 1(f)(3) for the calendar year in which the taxable year begins, determined by substituting “calendar year 2001” for “calendar year 2016” in subparagraph (A)(ii) thereof. If any amount as increased under the preceding sentence is not a multiple of $10, such amount shall be rounded to the nearest multiple of $10.",
        "hrOpenProperty": "WorkerCompensationReports/IndirectCompensation/VoluntaryBenefitAmount/Amount",
        "hrOpenFilter": "WorkerCompensationReports/IndirectCompensation/VoluntaryBenefitAmount/TypeCode = \"AdoptionAssistance\"",
        "hrOpenDescription": "The monetary value of employer-paid contributions for discretionary fringe benefits provided to the worker, including insurance, retirement, and savings.",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "X.C.2.b.(3)",
        "name": "Athletic Facility Costs",
        "definition": "(IRC sections 132(J)(4) and 3306(b)(16) and IRS publication 15-B) The value of an employee's use of an employer-operated on-premises gym or other athletic facility if substantially all use of the facility during the calendar year is by your employees, their spouses, and their dependent children or stepchildren under age 25. Doesn't include any athletic facility if access to the facility is made available to the general public through the sale of memberships, the rental of the facility, or a similar arrangement, or that is a facility for residential use, such as athletic facilities that are part of a resort.",
        "hrOpenProperty": "WorkerCompensationReports/IndirectCompensation/VoluntaryBenefitAmount/Amount",
        "hrOpenFilter": "WorkerCompensationReports/IndirectCompensation/VoluntaryBenefitAmount/TypeCode = \"AthleticFacility\"",
        "hrOpenDescription": "The monetary value of employer-paid contributions for discretionary fringe benefits provided to the worker, including insurance, retirement, and savings.",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "X.C.2.b.(4)",
        "name": "Cafeteria Plan Contributions",
        "definition": "(IRC sections 125 and 3306(b)(5)(G) and IRS publication 15-B) Employer contributions to a cafeteria plan for the employee or beneficiary. Qualified benefits. A cafeteria plan can include the following non-taxable benefits. •&#9;Accident and health benefits (but not Archer medical savings accounts (Archer MSAs) or long-term care insurance). •&#9;Adoption assistance. •&#9;Dependent care assistance. •&#9;Group-term life insurance coverage (including costs that can't be excluded from wages). •&#9;HSAs. Distributions from an HSA may be used to pay eligible long-term care insurance premiums or to pay for qualified long-term care services. A cafeteria plan, including a Flexible Spending Arrangement (FSA), provides participants an opportunity to receive qualified benefits on a pre-tax basis. It is a written plan that allows employees to choose between receiving cash or taxable benefits, instead of certain qualified benefits for which the law provides an exclusion from wages. If an employee chooses to receive a qualified benefit under the plan, the fact that the employee could have received cash, or a taxable benefit instead won't make the qualified benefit taxable. Generally, a cafeteria plan doesn't include any plan that offers a benefit that defers pay. However, a cafeteria plan can include a qualified 401(k) plan as a benefit. Also, certain life insurance plans maintained by educational institutions can be offered as a benefit even though they defer pay.",
        "hrOpenProperty": "WorkerCompensationReports/IndirectCompensation/VoluntaryBenefitAmount/Amount",
        "hrOpenFilter": "WorkerCompensationReports/IndirectCompensation/VoluntaryBenefitAmount/TypeCode = \"CaafeteriaPlan\"",
        "hrOpenDescription": "The monetary value of employer-paid contributions for discretionary fringe benefits provided to the worker, including insurance, retirement, and savings.",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "X.C.2.b.(5)",
        "name": "Total Certain Fringe Benefits",
        "definition": "The total monetary value of employer-paid contributions for certain fringe benefits. Total Certain Fringe Benefits = No-additional-cost services + Employee discounts + Working condition benefits + De minimis benefits + Qualified transportation fringe benefits + Qualified moving expense reimbursements + Qualified retirement planning services + Qualified military base realignment and closure fringe",
        "hrOpenProperty": "TBD",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "X.C.2.b.(5)(a)",
        "name": "No-additional-cost services",
        "definition": "(IRC section 132(b) and 3306(b)(16) and IRS publication 15-B)) Services provided to an employee if it doesn't cause the employer to incur any substantial additional costs. The service must be offered to customers in the ordinary course of the line of business in which the employee performs substantial services. No-additional-cost services are excess capacity services, such as airline, bus, or train tickets; hotel rooms; or telephone services provided free, at a reduced price, or through a cash rebate to employees working in those lines of business. Services that aren't included as no-additional-cost services are non-excess capacity services, such as the facilitation by a stock brokerage firm of the purchase of stock by employees.",
        "hrOpenProperty": "TBD",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "X.C.2.b.(5)(b)",
        "name": "Employee discounts",
        "definition": "(IRC section 132(c) and 3306(b)(16) and IRS publication 15-B)) A price reduction given to an employee on property, or services offered to customers in the ordinary course of the line of business in which the employee performs substantial services, including property or service provided at no charge (in which case only part of the discount may be excludable as a qualified employee discount) or at a reduced price. It also includes benefits provided through a partial or total cash rebate. Discounts can be up to the following limits: •&#9;For a discount on services, 20% of the price you charge nonemployee customers for the service. •&#9;For a discount on merchandise or other property, your gross profit percentage times the price you charge nonemployee customers for the property. The benefit may be provided either directly by the employer or in-directly through a third party. For example, an employee of an appliance manufacturer may receive a qualified employee discount on the manufacturer's appliances purchased at a retail store that offers the appliances for sale to customers. Employee discounts don't include: •&#9;Discounts on real property or discounts on personal property of a kind commonly held for investment (such as stocks or bonds). •&#9;Discounts on a line of business of the employer for which the employee doesn't provide substantial services. •&#9;Discounts on property or services of a kind that aren't offered for sale to customers. •&#9;Discounts on items sold in an employee store that aren't sold to the public. •&#9;Discounts provided by another employer through a reciprocal agreement. •&#9;Discounts to highly compensated employees under a program that favors those employees.",
        "hrOpenProperty": "TBD",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "X.C.2.b.(5)(c)",
        "name": "Working condition benefits",
        "definition": "(IRC section 132(d) and 3306(b)(16) and IRS publication 15-B)) The value property and services provided to an employee so that the employee can perform their job, to the extent the cost of the property or services would be allowable as a business expense or depreciation expense deduction to the employee if they had paid for it. The employee must meet any substantiation requirements that apply. Examples of working condition benefits include: •&#9;an employee's use of a company car for business. •&#9;an employer-provided cell phone provided primarily for non-compensatory business purposes. •&#9;job-related education provided to an employee. •&#9;a cash payment you provide for an employee's expenses for a specific or prearranged business activity if such expenses would otherwise be allowable as a business expense or depreciation expense deduction to the employee. Working condition benefits do not include the following items. •&#9;A service or property provided under a flexible spending account in which you agree to provide the employee, over a time period, a certain level of unspecified noncash benefits with a predetermined cash value. •&#9;A physical examination program you provide, even if mandatory. •&#9;Any item to the extent the payment would be allowable as a deduction to the employee as an expense for a trade or business other than the employer’s trade or business.",
        "hrOpenProperty": "TBD",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "X.C.2.b.(5)(d)",
        "name": "De minimis benefits",
        "definition": "(IRC sections 132(e) and 3306(b)(16), IRS Instructions for Form 940, and IRS publication 15-B)) A de minimis benefit is any property or service an employer provides to an employee that has so little value (taking into account how frequently you provide similar benefits to your employees) that accounting for it would be unreasonable or administratively impracticable. De minimis benefits include the personal use of an employer-provided cell phone, provided primarily for non-compensatory business reasons. A cell phone is provided primarily for non-compensatory business purposes if there are substantial business reasons for providing the cell phone, such as the employer's: •&#9;Need to contact the employee at all times for work-related emergencies, •&#9;Requirement that the employee be available to speak with clients at times when the employee is away from the office, and •&#9;Need to speak with clients located in other time zones at times outside the employee's normal workday. De minimis benefits also include any occasional meal you provide to an employee if it has so little value (taking into account how frequently meals are provided to the employees) that accounting for it would be unreasonable or administratively impracticable. The exclusion applies, for example, to the following items. •&#9;Coffee, doughnuts, or soft drinks. •&#9;Occasional meals or meal money provided to enable an employee to work overtime, if the meal money is not figured on the basis of hours worked, or the meals or meal money are not provided on a regular or routine basis. •&#9;Occasional parties or picnics for employees and their guests. De minimis benefits does not include cash and cash equivalent fringe benefits (for example, gift certificates, gift cards, and the use of a charge card or credit card), no matter how little. Neither does it include the value of a cell phone provided to promote goodwill of an employee, to attract a prospective employee, or as a means of providing additional compensation to an employee. A de minimis transportation benefit is any local transportation benefit provided to an employee if it has so little value (taking into account how frequently transportation is provided to employees) that accounting for it would be unreasonable or administratively impracticable. For example, it applies to occasional local transportation fare given an employee because the employee is working overtime if the benefit is reasonable and isn't based on hours worked. It does not include local transportation fare provided on a regular or routine basis. De minimis transportation benefits include: •&#9;Public transit passes, tokens, or fare cards the employer provides at a discount to defray the employee's commuting costs on the public transit system if the discount doesn't exceed $21 in any month. •&#9;Vouchers or similar instruments that are exchangeable solely for tokens, fare cards, or other instruments that enable the employee to use the public transit system if the value of the vouchers and other instruments in any month doesn't exceed $21 •&#9;Reimbursements of employee costs of commuting on a public transit system, provided the employee doesn't receive more than $21 in reimbursements for commuting costs in any month. The reimbursement must be made under a bona fide reimbursement arrangement, with established appropriate procedures for verifying on a periodic basis that the employee's use of public transportation for commuting is consistent with the value of the benefit provided. The Tax Cuts and Jobs Act (P.L. 115-97) removed qualified bicycle commuting reimbursements as de minimis for the tax years 2018 through 2025. •&#9;The exclusion doesn't apply to the provision of any benefit to defray public transit expenses incurred for personal travel other than commuting.",
        "hrOpenProperty": "TBD",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "X.C.2.b.(5)(e)",
        "name": "Qualified transportation fringe benefits",
        "definition": "(IRC section 132(f) and 3306(b)(16) and IRS publication 15-B)) Includes the value of: •&#9;A ride in a commuter highway vehicle between the employee's home and workplace, •&#9;A transit pass, or •&#9;Qualified parking up to the following limits: •&#9;$315 per month for combined commuter highway vehicle transportation and transit passes. •&#9;$315 per month for qualified parking. Qualified transportation benefits can be provided directly by the employer or through a bona fide reimbursement arrangement. A bona fide reimbursement arrangement requires that the employee incur and substantiate expenses for qualified transportation benefits before reimbursement. However, cash reimbursements for transit passes qualify only if a voucher or a similar item that the employee can exchange only for a transit pass isn't readily available for direct distribution by the employer to the employee. A voucher is readily available for direct distribution only if an employer can obtain it from a voucher provider that doesn't impose fare media charges or other restrictions that effectively prevent the employer from obtaining vouchers.",
        "hrOpenProperty": "TBD",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "X.C.2.b.(5)(f)",
        "name": "Qualified moving expense reimbursements",
        "definition": "(IRC section 132(g) and 3306(b)(9) and IRS publications 3 and 15-B) Payment of moving expenses, including moving household goods and personal effects and travel, of a member of the Armed Forces on active duty and whose move is due to a military order and the result of a permanent change of station. The following was suspended by the Tax Cut and Job Act (P.L. 115-97) for the tax years 2018 through 2025. Qualified moving expense reimbursements Amounts received (directly or indirectly) by an individual from an employer as a payment for (or a reimbursement of) expenses which would be deductible as moving expenses under IRC section 217 if directly paid or incurred by the individual. Does not include any payment for (or reimbursement of) an expense actually deducted by the individual in a prior taxable year.",
        "hrOpenProperty": "TBD",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "X.C.2.b.(5)(g)",
        "name": "Qualified military base realignment and closure fringe",
        "definition": "(IRC sections 132(i), and 3306(b)(16), 42 U.S.C. 3374, and IRS publication 15-B)) Payments under the authority of section 1013 of the Demonstration Cities and Metropolitan Development Act of 1966 (42 U.S.C. 3374) (as in effect on the date of the enactment of the American Recovery and Reinvestment Tax Act of 2009).",
        "hrOpenProperty": "TBD",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "X.C.2.b.(6)",
        "name": "Dependent care assistance (IRC 129)",
        "definition": "(IRC sections 129 and 3306(b)(13) and IRS publication 15-B) The payment of up to $5,000 ($2,500 for married employee filing separate return), for household and dependent care services paid directly or indirectly, or provided to, an employee under a written dependent care assistance program (DCAP) that covers only your employees. The services must be for a qualifying person's care and must be provided to allow the employee to work. The program must meet the requirements described in IRC section 129(d).",
        "hrOpenProperty": "WorkerCompensationReports/IndirectCompensation/VoluntaryBenefitAmount/Amount",
        "hrOpenFilter": "WorkerCompensationReports/IndirectCompensation/VoluntaryBenefitAmount/TypeCode = \"DependentCareAssistance\"",
        "hrOpenDescription": "The monetary value of employer-paid contributions for discretionary fringe benefits provided to the worker, including insurance, retirement, and savings.",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "X.C.2.b.(7)",
        "name": "Education assistance (IRC 127)",
        "definition": "(IRC sections 127, 221(d)(1). and 3306(b)(13) and IRS publication 15-B) Amounts the employer paid or incurred for employees' education expenses, including graduate-level courses, under an educational assistance program, up to $5,250. These expenses generally include the cost of books, equipment, fees, supplies, and tuition. Also included are payments made after March 27, 2020, and before January 1, 2026, whether paid to the employee or to a lender, of principal or interest on any qualified education loan (as defined in IRC section 221(d)(1)) incurred by the employee for education of the employee. However, these expenses don't include the cost of a course or other education involving sports, games, or hobbies, unless the education: •&#9;Has a reasonable relationship to your business, or •&#9;Is required as part of a degree program. Education expenses don't include the cost of tools or supplies (other than textbooks) the employee is allowed to keep at the end of the course. Nor do they include the cost of lodging, meals, or transportation. The employee must be able to provide substantiation to the employer that the educational assistance provided was used for qualifying education expenses. An educational assistance program is a separate written plan that provides educational assistance only to the employer’s employees. The program qualifies only if all of the following tests are met: •&#9;The program benefits employees who qualify under rules set up by you that don't favor highly compensated employees. To determine whether your program meets this test, don't consider employees excluded from your program who are covered by a collective bargaining agreement if there is evidence that educational assistance was a subject of good-faith bargaining. •&#9;The program doesn't provide more than 5% of its benefits during the year for shareholders or owners (or their spouses or dependents). A shareholder or owner is someone who owns (on any day of the year) more than 5% of the stock or of the capital or profits interest of your business. •&#9;The program doesn't allow employees to choose to receive cash or other benefits that must be included in gross income instead of educational assistance. •&#9;You give reasonable notice of the program to eligible employees.",
        "hrOpenProperty": "WorkerCompensationReports/IndirectCompensation/VoluntaryBenefitAmount/Amount",
        "hrOpenFilter": "WorkerCompensationReports/IndirectCompensation/VoluntaryBenefitAmount/TypeCode = \"EducationAssistance\"",
        "hrOpenDescription": "The monetary value of employer-paid contributions for discretionary fringe benefits provided to the worker, including insurance, retirement, and savings.",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "X.C.2.b.(8)",
        "name": "Employee Stock Options",
        "definition": "(IRC sections 422(b), 423(b), and 3306(b)(19) and IRS publication 15-B) Remuneration resulting from the exercise of an incentive stock option pursuant to IRC section 422(b)) or under an employee stock purchase plan pursuant to IRC section 423(b)), or any disposition by the individual of such stock.",
        "hrOpenProperty": "WorkerCompensationReports/IndirectCompensation/VoluntaryBenefitAmount/Amount",
        "hrOpenFilter": "WorkerCompensationReports/IndirectCompensation/VoluntaryBenefitAmount/TypeCode = \"StockOptions\"",
        "hrOpenDescription": "The monetary value of employer-paid contributions for discretionary fringe benefits provided to the worker, including insurance, retirement, and savings.",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "X.C.2.b.(9)",
        "name": "Health Service Loan Repayments",
        "definition": "U.S. Code § 108(f) Programs that help repay student loans for individuals working in specific health-related professions, often in underserved areas or critical shortage facilities.",
        "hrOpenProperty": "WorkerCompensationReports/IndirectCompensation/VoluntaryBenefitAmount/Amount",
        "hrOpenFilter": "WorkerCompensationReports/IndirectCompensation/VoluntaryBenefitAmount/TypeCode = \"HealthServiceLoanRepayments\"",
        "hrOpenDescription": "The monetary value of employer-paid contributions for discretionary fringe benefits provided to the worker, including insurance, retirement, and savings.",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "X.C.2.b.(10)",
        "name": "Group Legal Insurance Premiums Paid",
        "definition": "The cost of providing prepaid group legal services to the employee.",
        "hrOpenProperty": "WorkerCompensationReports/IndirectCompensation/VoluntaryBenefitAmount/Amount",
        "hrOpenFilter": "WorkerCompensationReports/IndirectCompensation/VoluntaryBenefitAmount/TypeCode = \"GroupLegalInsurancePremiums\"",
        "hrOpenDescription": "The monetary value of employer-paid contributions for discretionary fringe benefits provided to the worker, including insurance, retirement, and savings.",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "X.C.2.b.(11)",
        "name": "Total Life Insurance Premiums Paid",
        "definition": "The total monetary value of employer-paid contributions for life insurance fringe benefits.",
        "hrOpenProperty": "TBD",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "X.C.2.b.(11)(a)",
        "name": "Group-Term Life Insurance Coverage",
        "definition": "(IRC section 3306(b)(2)(C) and IRS publication 15-B) Employer contributions to the cost for life insurance coverage that meets all the following conditions. •&#9;It provides a general death benefit that isn't included in income. •&#9;It is provided to a group of employees. See The 10-employee rule, later. •&#9;It provides an amount of insurance to each employee based on a formula that prevents individual selection. This formula must use factors such as the employee's age, years of service, pay, or position. •&#9;The employer provides it under a policy they directly or indirectly carry. Even if you don't pay any of the policy's cost, you’re considered to carry it if you arrange for payment of its cost by your employees and charge at least one employee less than, and at least one other employee more than, the cost of their insurance. Determine the cost of the insurance, for this purpose, as explained under Coverage over the limit, later. Group-term life insurance doesn't include the following insurance. •&#9;Insurance that doesn't provide general death benefits, such as travel insurance or a policy providing only accidental death benefits. •&#9;Life insurance on the life of your employee's spouse or dependent. (However, if the face value of the policy is less than $2,000, it may be included as a de minimis benefit.) •&#9;Insurance provided under a policy that provides a permanent benefit (an economic value that extends beyond 1 policy year, such as paid-up or cash-surrender value), unless certain requirements are met.",
        "hrOpenProperty": "TBD",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "X.C.2.b.(11)(b)",
        "name": "Other Life insurance Coverage",
        "definition": "Employer contributions to life insurance for the employee that do not meet the requirements listed under Group-Term Life Insurance.",
        "hrOpenProperty": "TBD",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "X.C.2.b.(12)",
        "name": "Total Lodging on Business Premises",
        "definition": "The total monetary value of employer-paid contributions for lodging on business premises. Total Lodging on Business Premises = Qualified Lodging on Business Premises + Other Lodging on Business Premises",
        "hrOpenProperty": "TBD",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "X.C.2.b.(12)(a)",
        "name": "Qualified Lodging on Business Premises",
        "definition": "(IRC sections 119 and 3306(b)(14) and IRS publication 15-B) The value of lodging furnished to an employee if it meets the following tests. •&#9;It is furnished on business premises. •&#9;It is furnished for the employer’s convenience. •&#9;The employee must accept it as a condition of employment. Does not include the value of lodging if the employee may choose to receive additional pay instead of lodging. Also doesn't include cash allowances for lodging.",
        "hrOpenProperty": "TBD",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "X.C.2.b.(12)(b)",
        "name": "Other Lodging on Business Premises",
        "definition": "The value of lodging furnished to an employee if it does not meet the following tests. •&#9;It is furnished on business premises. •&#9;It is furnished for the employer’s convenience. •&#9;The employee must accept it as a condition of employment. Includes the value of lodging if the employee may choose to receive additional pay instead of lodging. Also includes cash allowances for lodging.",
        "hrOpenProperty": "TBD",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "X.C.2.b.(13)",
        "name": "Total Meals on Business Premises",
        "definition": "The total monetary value of employer-paid contributions for meals on business premises. Total Meals on Business Premises = Qualified Meals on Business Premises + Other Meals on Business Premises",
        "hrOpenProperty": "TBD",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "X.C.2.b.(13)",
        "name": "Qualified Meals on Business Premises",
        "definition": "(IRC sections 119 and 3306(b)(14) and IRS publication 15-B) The value of meals you furnish to an employee if they meet the following tests: •&#9;They are furnished on your business premises, and •&#9;They are furnished for your convenience. •&#9;Or, more than half of all the employer’s employees receive meals on premises meeting the above tests. Does not include the value of meals if you the employee is allowed to choose to receive additional pay instead of meals. Also doesn’t include cash allowances for meals.",
        "hrOpenProperty": "TBD",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "X.C.2.b.(13)",
        "name": "Other Meals on Business Premises",
        "definition": "The value of meals you furnish to an employee if they do not meet all of the following tests: •&#9;They are furnished on your business premises, and •&#9;They are furnished for your convenience. •&#9;Or, more than half of all the employer’s employees receive meals on premises meeting the above tests. Includes the value of meals if you the employee is allowed to choose to receive additional pay instead of meals. Also includes cash allowances for meals.",
        "hrOpenProperty": "TBD",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "X.C.2.b.(14)",
        "name": "Military Benefits",
        "definition": "(IRC sections 132(n)(1), 134(b)(4), 134 (b)(5) and 3306(b)(13) and IRS publications 3 and 15-B) Dependent care assistance program Payments for dependent care: (A) received by any member or former member of the uniformed services of the United States or any dependent of such member by reason of such member’s status or service as a member of such uniformed services, and (B) was excludable from gross income on September 9, 1986, under any provision of law, regulation, or administrative practice which was in effect on such date. Qualified military base realignment and closure fringe Payments under the authority of section 1013 of the Demonstration Cities and Metropolitan Development Act of 1966 (42 U.S.C. 3374) (as in effect on the date of the enactment of the American Recovery and Reinvestment Tax Act of 2009). Travel Benefits Under Operation Hero Miles The value of travel benefit provided under section 2613 of title 10, United States Code (as in effect on the date of the enactment of this paragraph).",
        "hrOpenProperty": "WorkerCompensationReports/IndirectCompensation/VoluntaryBenefitAmount/Amount",
        "hrOpenFilter": "WorkerCompensationReports/IndirectCompensation/VoluntaryBenefitAmount/TypeCode = \"MilitaryFringe\"",
        "hrOpenDescription": "The monetary value of employer-paid contributions for discretionary fringe benefits provided to the worker, including insurance, retirement, and savings.",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "X.C.2.b.(15)",
        "name": "Total Noncash Payments",
        "definition": "Sum of the value of all payments made in a medium other than cash. Total Noncash Payments = Noncash Payments for Agricultural Services + Noncash Payments for Domestic Services + Noncash Payments for Sevices Not in the Course of the Employer's Business + Noncash Payments to Employees not Legally Permitted to Work in the United States + Noncash Tips",
        "hrOpenProperty": "TBD",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "X.C.2.b.(15)(a)",
        "name": "Noncash Payments for Agricultural Services",
        "definition": "(IRC sections 3306(b)(7) & (11) and IRS publication 15-B) Value of payments in a medium other than cash for Agricultural labor",
        "hrOpenProperty": "TBD",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "X.C.2.b.(15)(b)",
        "name": "Noncash Payments for Domestic Services",
        "definition": "Value of payments in a medium other than cash for Domestic Services",
        "hrOpenProperty": "TBD",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "X.C.2.b.(15)(c)",
        "name": "Noncash Payments for Sevices Not in the Course of the Employer's Business",
        "definition": "(IRC sections 3306(b)(7) & (11) and IRS publication 15-B) Value of payments in a medium other than cash for Sevices Not in the Course of the Employer's Business",
        "hrOpenProperty": "TBD",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "X.C.2.b.(15)(d)",
        "name": "Noncash Payments to Employees not Legally Permitted to Work in the United States",
        "definition": "Value of payments in a medium other than cash for sevices performed by employees not legally permitted to work in the United States",
        "hrOpenProperty": "TBD",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "X.C.2.b.(15)(e)",
        "name": "Noncash Tips",
        "definition": "Payments in any medium other than cash for agricultural labor if they are “de minimis” in relation to the amount of cash wages paid to the farmworkers, or are not intended to be treated as the cash equivalent of wages, or as the cash payment of wages. (excludes services not in the course of the employer's business)",
        "hrOpenProperty": "TBD",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "X.C.2.b.(15)(f)",
        "name": "All Other Noncash Payments",
        "definition": "Payments in any medium other than cash for domestic labor (not covered by FUTA)",
        "hrOpenProperty": "TBD",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "X.C.2.b.(16)",
        "name": "Outplacement Services",
        "definition": "(IRC section 132(d) and 3306(b)(16) and IRS publications 15-A and 15-B)) The value of these services if: •&#9;You derive a substantial business benefit from providing the services (such as improved employee morale or business image) separate from the benefit that you would receive from the mere payment of additional compensation, and •&#9;The employee would be able to deduct the cost of the services as employee business expenses if they had paid for them.",
        "hrOpenProperty": "WorkerCompensationReports/IndirectCompensation/VoluntaryBenefitAmount/Amount",
        "hrOpenFilter": "WorkerCompensationReports/IndirectCompensation/VoluntaryBenefitAmount/TypeCode = \"Outplacement\"",
        "hrOpenDescription": "The monetary value of employer-paid contributions for discretionary fringe benefits provided to the worker, including insurance, retirement, and savings.",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "X.C.2.b.(17)",
        "name": "Total Employer Retirement Benefit Contributions",
        "definition": "The total monetary value of discretionary employer contributions to the employee’s retirement benefits, including defined benefit and defined contribution plans. Includes but is not limited to: • Defined Benefit Pension Plan Contributions • 401(k) Plan Contributions • Roth 401(k) Plan Contributions • 403(b) Plan Contributions • 457 Plan Contributions • SIMPLE Plan Contributions • SEP Plan Contributions • Enter the total dollar amount of all of the employer’s contributions during the month/quarter for the worker’s discretionary retirement or savings benefits. • Do not include the dollar amount of the worker’s contributions to these benefits.",
        "hrOpenProperty": "TBD",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "X.C.2.b.(17)(a)",
        "name": "Total Qualified Pension, Profit-sharing, and Stock Bonus Plans – IRC § 401(a)",
        "definition": "The total employer contributions to Qualified Pension Plans – IRC § 401(a), IRC § 412, plus Qualified Profit-Sharing and Stock Bonus Plans – IRC § 401(a), 401(k)",
        "hrOpenProperty": "TBD",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "X.C.2.b.(17)(a)[1]",
        "name": "Qualified Pension Plans – IRC § 401(a), IRC § 412",
        "definition": "Employer contributions to qualified pension plans that meet the Qualification Requirements for Pension Plans specified in IRC § 401(a) and the Minimum Funding Standards for Pension Plans specified in IRC § 412 .",
        "hrOpenProperty": "TBD",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "X.C.2.b.(17)(a)[2]",
        "name": "Total Qualified Profit-Sharing and Stock Bonus Plans – IRC § 401(a), 401(k)",
        "definition": "The total employer contributions to Qualified Profit-Sharing and Stock Bonus Plan w/o employee cash option plus Qualified Profit-Sharing and Stock Bonus Plans with employeee cash option",
        "hrOpenProperty": "TBD",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "X.C.2.b.(17)(a)[2]a",
        "name": "Qualified Profit-Sharing and Stock Bonus Plan w/o employee cash option",
        "definition": "Employer contributions to following IRS qualified retirement plans where the employee has no option to receive cash instead of employer contribution into a fund: • &#9;Qualified Profit-Sharing and Stock Bonus Plans – IRC § 401(a), IRC § 401(k), IRC § 402, IRC § 404(a)(3), IRC § 415(c)",
        "hrOpenProperty": "TBD",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "X.C.2.b.(17)(a)[2]b",
        "name": "Qualified Profit-Sharing and Stock Bonus Plans with employeee cash option",
        "definition": "Employer contributions to following IRS qualified retirement plans where the employee has the option to receive cash instead of employer contribution into a fund: • &#9;Qualified Profit-Sharing and Stock Bonus Plans – IRC § 401(a), IRC § 401(k), IRC § 402, IRC § 404(a)(3), IRC § 415(c)",
        "hrOpenProperty": "TBD",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "X.C.2.b.(17)(a)[3]",
        "name": "Qualified Employee Stock Ownership Plans (ESOPs) – IRC § 401(a), IRC § 409",
        "definition": "Qualified Employee Stock Ownership Plans (ESOPs) – IRC § 401(a), IRC § 409",
        "hrOpenProperty": "TBD",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "X.C.2.b.(17)(a)[4]",
        "name": "Qualified Annuity Plans – IRC § 401(a), IRC § 403(a)",
        "definition": "Qualified Annuity Plans – IRC § 401(a), IRC § 403(a)",
        "hrOpenProperty": "TBD",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "X.C.2.b.(17)(a)[5]",
        "name": "Qualified Church Retirement Plans – IRC § 401(a), IRC § 410(d)",
        "definition": "Qualified Church Retirement Plans – IRC § 401(a), IRC § 410(d)",
        "hrOpenProperty": "TBD",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "X.C.2.b.(17)(a)[6]",
        "name": "Qualified Governmental Retirement Plans – IRC § 401(a), IRC § 414(d)",
        "definition": "Qualified Governmental Retirement Plans – IRC § 401(a), IRC § 414(d)",
        "hrOpenProperty": "TBD",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "X.C.2.b.(17)(b)",
        "name": "Tax-Sheltered Annuity Plans (TSAs) – IRC § 403(b)",
        "definition": "(IRC sections 403(b) and (IRC 3306(b)(5)(D)) Payments made to, or on behalf of, an employee or his beneficiary under or to an annuity contract which, at the time of such payment, is a plan described in IRC section 403(b), other than a payment for the purchase of such contract which is made by reason of a salary reduction agreement (whether evidenced by a written instrument or otherwise).",
        "hrOpenProperty": "TBD",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "X.C.2.b.(17)(c)",
        "name": "Simplified Employee Pension (SEP) IRA – § 408(k)",
        "definition": "(IRC sections 408(k)(1), 408(k)(6), and 3306(b)(5)(C)) An employer's SEP and SARSEP contributions to an employee's individual retirement arrangement (IRA) are excluded from the employee's gross income plan (IRC section 408(k)(1)). Does not include amounts contributed under a salary reduction SEP agreement described in IRC section 408(k)(6)).",
        "hrOpenProperty": "TBD",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "X.C.2.b.(17)(d)",
        "name": "Savings Incentive Match Plan for Employees (SIMPLE IRA) – IRC § 408(p)",
        "definition": "(IRC sections 408(p) and 3306(b)(5)(H) and IRS publication 15-A) Matching employer contributions under an arrangement to which section 408(p) applies, other than any elective contributions under paragraph (2)(A)(i) thereof.",
        "hrOpenProperty": "TBD",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "X.C.2.b.(17)(e)",
        "name": "Governmental Deferred Compensation Plans – IRC § 457",
        "definition": "(IRC sections 457(b), 457(f), 3306(b)(5)(E) and 3121(v)(3)) Payments made to, or on behalf of, an employee or his beneficiary under or to an exempt governmental deferred compensation plan (as defined in IRC section 3121(v)(3)). The term “exempt governmental deferred compensation plan” means any plan providing for deferral of compensation established and maintained for its employees by the United States, by a State or political subdivision thereof, or by an agency or instrumentality of any of the foregoing. Such term does not include— (A) &#9;any plan to which section 83, 402(b), 403(c), 457(a), or 457(f)(1) applies, (B) &#9;any annuity contract described in section 403(b), and (C) &#9;the Thrift Savings Fund (within the meaning of subchapter III of chapter 84 of title 5, United States Code).",
        "hrOpenProperty": "TBD",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "X.C.2.b.(17)(f)",
        "name": "Pension cost-of-living supplements",
        "definition": "(IRC sections IRC 1002(2)(B)(ii) and 3306(b)(5)(F) and ERISA section 3(2)(B)(ii)) Payments to supplement pension benefits under a plan or trust described in any of the foregoing provisions of this paragraph to take into account some portion or all of the increase in the cost of living (as determined by the Secretary of Labor) since retirement but only if such supplemental payments are under a plan which is treated as a welfare plan under section 3(2)(B)(ii) of the Employee Retirement Income Security Act of 1974.",
        "hrOpenProperty": "TBD",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "X.C.2.b.(17)(g)",
        "name": "Retirement Planning Services",
        "definition": "(IRC sections 132(h) and 219(g)(5), and 3306(b)(16), and IRS publication 15-B)) The value of any retirement planning advice or information provided to an employee or their spouse if the employer maintains a qualified retirement plan. A qualified retirement plan includes a plan, contract, pension, or account described in IRC section 219(g)(5). In addition to employer plan advice and information, the services provided may include general advice and information on retirement. Retirement planning services does not include services for tax preparation, accounting, legal, or brokerage services or those provided a highly compensated employee that aren't available on the same terms to each member of a group of employees normally provided education and information about the employer's qualified retirement plan.",
        "hrOpenProperty": "TBD",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "X.C.2.b.(17)(h)",
        "name": "Other Employer Discretionary Retirement Contributions",
        "definition": "Includes IRC section 404; Nonqualified Deferred Compensation (NQDC) Plans – IRC § 409A (Do Not Meet IRC § 401(a) Requirements)",
        "hrOpenProperty": "TBD",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "X.C.2.b.(18)",
        "name": "Scholarship and Fellowship Payments",
        "definition": "(IRC sections 117 and 3306(b)(16) and IRS publications 15-A and 970) A qualified scholarship is any amount granted as a scholarship or fellowship that is used for: •&#9;Tuition and fees required to enroll in, or to attend, an educational institution; or •&#9;Fees, books, supplies, and equipment that are required for courses at the educational institution. Qualified payments do not include: •&#9;Any amount paid for teaching, research, or other services required as a condition of receiving the scholarship or tuition reduction, unless. received under the National Health Service Corps Scholarship Program; the Armed Forces Health Professions Scholarship and Financial Assistance Program; or a comprehensive student work-learning-service program operated by a work college, as defined in section 448(e) of the Higher Education Act of 1965. •&#9;Any amounts paid for room and board.",
        "hrOpenProperty": "WorkerCompensationReports/IndirectCompensation/VoluntaryBenefitAmount/Amount",
        "hrOpenFilter": "WorkerCompensationReports/IndirectCompensation/VoluntaryBenefitAmount/TypeCode = \"Scholarship\"",
        "hrOpenDescription": "The monetary value of employer-paid contributions for discretionary fringe benefits provided to the worker, including insurance, retirement, and savings.",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "X.C.2.b.(19)",
        "name": "Service Not in the Course of the Employer's Trade or Business",
        "definition": "(IRC section 3306(c)(3)) Cash payments for such service of less than $50 and such service is performed by an individual who is regularly employed by such employer to perform such service. For purposes of this paragraph, an individual shall be deemed to be regularly employed by an employer during a calendar quarter only if— (A) &#9;on each of some 24 days during such quarter such individual performs for such employer for some portion of the day service not in the course of the employer’s trade or business, or (B) &#9;such individual was regularly employed (as determined under subparagraph (A)) by such employer in the performance of such service during the preceding calendar quarter.",
        "hrOpenProperty": "WorkerCompensationReports/IndirectCompensation/VoluntaryBenefitAmount/Amount",
        "hrOpenFilter": "WorkerCompensationReports/IndirectCompensation/VoluntaryBenefitAmount/TypeCode = \"NotInCourseOf\"",
        "hrOpenDescription": "The monetary value of employer-paid contributions for discretionary fringe benefits provided to the worker, including insurance, retirement, and savings.",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "X.C.2.b.(20)",
        "name": "Supplemental Unemployment Insurance Premiums Paid",
        "definition": "(IRC section 501(c)(17), IRS publication 15-A, and IRS Revenue Rulings 56-249, 58-128, 60-33, 90-72) Employer contributions under a plan to provide supplemental unemployment compensation benefits (consistent with IRC section 501(c)(17) and IRS Revenue Rulings 90-72) that meet the following requirements set forth in IRS Revenue Ruling 56-249 and is in compliance with the standards set forth in Internal Revenue Service Revenue Rulings 58-128 and 60-3: •&#9;Benefits are paid only to unemployed former employees who are laid off by the employer. •&#9;Eligibility for benefits depends on meeting prescribed conditions after termination. •&#9;The amount of weekly benefits payable is based upon state unemployment benefits, other compensation allowable under state law, and the amount of regular weekly pay. •&#9;The right to benefits doesn't accrue until a prescribed period after termination. •&#9;Benefits aren't attributable to the performance of particular services. •&#9;No employee has any right to the benefits until qualified and eligible to receive benefits. •&#9;Benefits may not be paid in a lump sum.",
        "hrOpenProperty": "WorkerCompensationReports/IndirectCompensation/VoluntaryBenefitAmount/Amount",
        "hrOpenFilter": "WorkerCompensationReports/IndirectCompensation/VoluntaryBenefitAmount/TypeCode = \"SupplementalUI\"",
        "hrOpenDescription": "The monetary value of employer-paid contributions for discretionary fringe benefits provided to the worker, including insurance, retirement, and savings.",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "X.C.2.b.(21)",
        "name": "Total Tax Payments for Employee",
        "definition": "(IRC section 3306(b)(6) and IRS publication 15-B) Payments by an employer to an employee for domestic service in a private home of the employer or for agricultural labor (without deduction from the remuneration of the employee) of: •&#9;the FICA taxes (Social Security and Medicare taxes) imposed upon an employee under IRC section 3101, or •&#9;any payment required from an employee under a state unemployment compensation law.",
        "hrOpenProperty": "TBD",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "X.C.2.b.(21)(a)",
        "name": "Total FICA Payments for Employee",
        "definition": "Total employer payment of employee share of FICA taxes (Social Security and Medicare taxes), without deduction from the remuneration of the employee",
        "hrOpenProperty": "TBD",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "X.C.2.b.(21)(a)[1]",
        "name": "FICA Payments for Domestic Service Employee",
        "definition": "(IRC section 3306(b)(6) and IRS publication 15-B) Employer payment of employee share of FICA taxes (Social Security and Medicare taxes), without deduction from the remuneration of the employee, with respect to remuneration paid to an employee for domestic service in a private home of the employer; pursuant to IRC section 3101",
        "hrOpenProperty": "TBD",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "X.C.2.b.(21)(a)[2]",
        "name": "FICA Payments for Agricultural Labor Employee",
        "definition": "(IRC section 3306(b)(6) and IRS publication 15-B) Employer payment of employee share of FICA taxes (Social Security and Medicare taxes), without deduction from the remuneration of the employee, with respect to remuneration paid to an employee for agricultural labor; pursuant to IRC section 3101",
        "hrOpenProperty": "TBD",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "X.C.2.b.(21)(a)[3]",
        "name": "All Other FICA Payments for Employee",
        "definition": "All other employer payment of employee share of FICA taxes (Social Security and Medicare taxes), without deduction from the remuneration of the employee, with respect to remuneration paid to an employee/.",
        "hrOpenProperty": "TBD",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "X.C.2.b.(21)(b)",
        "name": "Unemployment Insurance Tax Payments for Employee",
        "definition": "(IRC section 3306(b)(6) and IRS publication 15-B) Employer payment of employee share of unemployment taxes required from an employee under a state unemployment compensation law, without deduction from the remuneration of the employee, for domestic service in a private home of the employer or for agricultural labor.",
        "hrOpenProperty": "TBD",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "X.C.2.b.(22)",
        "name": "Temporary Work Relocation Payments",
        "definition": "(IRC section 132(g) and 3306(b)(16) and IRS publication 15-A) Travel expenses reimbursed or paid directly by the employer in accordance with an accountable plan when an employee is given a temporary work assignment away from their regular place of work. Generally, a temporary work assignment in a single location is one that is realistically expected to last (and does in fact last) for 1 year or less. Does not include payments for living expenses for indefinite temporary relocations (other than qualified moving expenses paid to a member of the U.S. Armed Forces on active duty who moves because of a permanent change of station due to a military order). For the travel expenses to be included: •&#9;The new work location must be outside of the city or general area of the employee’s regular workplace or post of duty, •&#9;The travel expenses must otherwise be allowed as a deduction by the employee, and •&#9;The expenses must be for the period during which the employee is at the temporary work location. Does not include payments for personal expenses of an employee during their temporary work assignment, such as expenses for home leave for family members or for vacations.",
        "hrOpenProperty": "WorkerCompensationReports/IndirectCompensation/VoluntaryBenefitAmount/Amount",
        "hrOpenFilter": "WorkerCompensationReports/IndirectCompensation/VoluntaryBenefitAmount/TypeCode = \"TemporaryRelocation\"",
        "hrOpenDescription": "The monetary value of employer-paid contributions for discretionary fringe benefits provided to the worker, including insurance, retirement, and savings.",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "X.C.2.b.(23)",
        "name": "Tuition Reduction",
        "definition": "(IRC sections 117(d), 132(h) and IRS publications 15-B and 970) The value of a qualified tuition reduction an educational institution provides from the employee's wages for undergraduate education (or graduate education if the employee performs teaching or research activities). A tuition reduction for undergraduate education generally qualifies for this exclusion if it is for the education of one of the following individuals: 1.&#9; A current employee. 2. &#9;A former employee who retired or left on disability. 3. &#9;A surviving spouse of an individual who died while an employee. 4. &#9;A surviving spouse of a former employee who retired or left on disability. 5. &#9;A dependent child or spouse of any individual listed in (1) through (4) above.",
        "hrOpenProperty": "WorkerCompensationReports/IndirectCompensation/VoluntaryBenefitAmount/Amount",
        "hrOpenFilter": "WorkerCompensationReports/IndirectCompensation/VoluntaryBenefitAmount/TypeCode = \"TuitionReduction\"",
        "hrOpenDescription": "The monetary value of employer-paid contributions for discretionary fringe benefits provided to the worker, including insurance, retirement, and savings.",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "X.C.2.b.(24)",
        "name": "All Other Discretionary Benefits Paid",
        "definition": "The cash value of any other employer contributions to discretionary benefits offered to the worker, not specifically listed above.",
        "hrOpenProperty": "WorkerCompensationReports/IndirectCompensation/VoluntaryBenefitAmount/Amount",
        "hrOpenFilter": "WorkerCompensationReports/IndirectCompensation/VoluntaryBenefitAmount/TypeCode = \"OtherVoluntary\"",
        "hrOpenDescription": "The monetary value of employer-paid contributions for discretionary fringe benefits provided to the worker, including insurance, retirement, and savings.",
        "revisionNotes": "",
        "depth": 4
      },
      {
        "id": "X.D",
        "name": "Taxable Compensation",
        "definition": "Categories of compensation that are typically taxed by federal, state, and local authorities. This is not a total as these categories are taxed independently.",
        "hrOpenProperty": "Just a group label. Not totaled and a reported category.",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "X.D.1",
        "name": "W-2 Wages, Tips, and Other Compensation",
        "definition": "Data reported in Box 1 of the U.S. Department of the Treasury, Internal Revenue Service Form W-2.",
        "hrOpenProperty": "WorkerCompensationReports/TaxableCompensationAmount/Amount",
        "hrOpenFilter": "WorkerCompensationReports/TaxableCompensationAmount/TypeCode = \"W2Box1\"",
        "hrOpenDescription": "Type and monetary value reported on government forms. In the US, an example would be the Internal Revenue Service Form W-2.",
        "revisionNotes": "",
        "depth": 2
      },
      {
        "id": "X.D.2",
        "name": "W-2 Social Security Wages",
        "definition": "Data reported in Box 3 of the U.S. Department of the Treasury, Internal Revenue Service Form W-2.",
        "hrOpenProperty": "WorkerCompensationReports/TaxableCompensationAmount/Amount",
        "hrOpenFilter": "WorkerCompensationReports/TaxableCompensationAmount/TypeCode = \"W2Box3\"",
        "hrOpenDescription": "Type and monetary value reported on government forms. In the US, an example would be the Internal Revenue Service Form W-2.",
        "revisionNotes": "",
        "depth": 2
      },
      {
        "id": "X.D.3",
        "name": "W-2 Medicare Wages & Tips",
        "definition": "Data reported in Box 5 of the U.S. Department of the Treasury, Internal Revenue Service Form W-2.",
        "hrOpenProperty": "WorkerCompensationReports/TaxableCompensationAmount/Amount",
        "hrOpenFilter": "WorkerCompensationReports/TaxableCompensationAmount/TypeCode = \"W2Box5\"",
        "hrOpenDescription": "Type and monetary value reported on government forms. In the US, an example would be the Internal Revenue Service Form W-2.",
        "revisionNotes": "",
        "depth": 2
      },
      {
        "id": "X.D.4",
        "name": "W-2 Social Security Tips",
        "definition": "Data reported in Box 7 of the U.S. Department of the Treasury, Internal Revenue Service Form W-2.",
        "hrOpenProperty": "WorkerCompensationReports/TaxableCompensationAmount/Amount",
        "hrOpenFilter": "WorkerCompensationReports/TaxableCompensationAmount/TypeCode = \"W2Box7\"",
        "hrOpenDescription": "Type and monetary value reported on government forms. In the US, an example would be the Internal Revenue Service Form W-2.",
        "revisionNotes": "",
        "depth": 2
      },
      {
        "id": "X.D.5",
        "name": "W-2 State Wages, Tips, Etc.",
        "definition": "Data reported in Box 16 of the U.S. Department of the Treasury, Internal Revenue Service Form W-2.",
        "hrOpenProperty": "WorkerCompensationReports/TaxableCompensationAmount/Amount",
        "hrOpenFilter": "WorkerCompensationReports/TaxableCompensationAmount/TypeCode = \"W2Box16\"",
        "hrOpenDescription": "Type and monetary value reported on government forms. In the US, an example would be the Internal Revenue Service Form W-2.",
        "revisionNotes": "",
        "depth": 2
      },
      {
        "id": "X.D.6",
        "name": "State Unemployment Insurance Wages",
        "definition": "The amount of the worker's pay that is subject to taxation under Unemployment Compensation laws of states, territories, or the District of Columbia.",
        "hrOpenProperty": "WorkerCompensationReports/TaxableCompensationAmount/Amount",
        "hrOpenFilter": "WorkerCompensationReports/TaxableCompensationAmount/TypeCode = \"StateUIWages\"",
        "hrOpenDescription": "Type and monetary value reported on government forms. In the US, an example would be the Internal Revenue Service Form W-2.",
        "revisionNotes": "",
        "depth": 2
      },
      {
        "id": "X.D.7",
        "name": "State Disability Insurance Wages",
        "definition": "The amount of the worker's pay that is subject to taxation under Disability Insurance laws.",
        "hrOpenProperty": "WorkerCompensationReports/TaxableCompensationAmount/Amount",
        "hrOpenFilter": "WorkerCompensationReports/TaxableCompensationAmount/TypeCode = \"StateDIWages\"",
        "hrOpenDescription": "Type and monetary value reported on government forms. In the US, an example would be the Internal Revenue Service Form W-2.",
        "revisionNotes": "",
        "depth": 2
      },
      {
        "id": "X.D.8",
        "name": "W-2 Local Wages, Tips, Etc.",
        "definition": "Data reported in Box 18 of the U.S. Department of the Treasury, Internal Revenue Service Form W-2.",
        "hrOpenProperty": "WorkerCompensationReports/TaxableCompensationAmount/Amount",
        "hrOpenFilter": "WorkerCompensationReports/TaxableCompensationAmount/TypeCode = \"W2Box18\"",
        "hrOpenDescription": "Type and monetary value reported on government forms. In the US, an example would be the Internal Revenue Service Form W-2.",
        "revisionNotes": "",
        "depth": 2
      },
      {
        "id": "X.D.9",
        "name": "Workers' Compensation Wages",
        "definition": "The amount of the worker's total compensation that is used to determine employer payments for Workers' Compensation insurance.",
        "hrOpenProperty": "WorkerCompensationReports/TaxableCompensationAmount/Amount",
        "hrOpenFilter": "WorkerCompensationReports/TaxableCompensationAmount/TypeCode = \"WorkersCompWages\"",
        "hrOpenDescription": "Type and monetary value reported on government forms. In the US, an example would be the Internal Revenue Service Form W-2.",
        "revisionNotes": "",
        "depth": 2
      },
      {
        "id": "X.D.10",
        "name": "Other Programs Taxable Compensation",
        "definition": "Other state or locally specific fees and taxes based on payroll.",
        "hrOpenProperty": "WorkerCompensationReports/TaxableCompensationAmount/Amount",
        "hrOpenFilter": "WorkerCompensationReports/TaxableCompensationAmount/TypeCode = \"Other\"",
        "hrOpenDescription": "Type and monetary value reported on government forms. In the US, an example would be the Internal Revenue Service Form W-2.",
        "revisionNotes": "",
        "depth": 2
      },
      {
        "id": "X.D.11",
        "name": "Wages Paid Out of State (Reported In Other Jurisdictions)",
        "definition": "The total amount of cash (direct) compensation (gross pay) paid to the employee that is reported to other states for work done in those states.",
        "hrOpenProperty": "TotalWithholdingAmount",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 2
      },
      {
        "id": "X.E",
        "name": "Total Compensation Withheld",
        "definition": "The total amount withheld by the employer from the worker's pay for all purposes. Total Compensation Withheld = Total Tax Withheld + Total Insurance Premiums Withheld + Total Other Withholding",
        "hrOpenProperty": "WorkerCompensationReports/TotalWorkerWithholdingAmount",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 1
      },
      {
        "id": "X.E.1",
        "name": "Total Taxes Withheld",
        "definition": "The total monetary amount withheld by the employer from the worker's pay to cover the worker's contribution to taxes. Total Tax Withheld = Federal Income Tax Withheld + Federal Medicare Tax Withheld + Federal Social Security Tax Withheld + Local Taxes Withheld + State Income Tax Withheld + Unemployment Insurance Tax Withheld + Workers' Compensation Fees & Taxes Withheld",
        "hrOpenProperty": "WorkerCompensationReports/WorkerWithholding/TotalTaxWithholdingAmount",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 2
      },
      {
        "id": "X.E.1.a",
        "name": "Federal Income Tax Withheld",
        "definition": "Amount to be included in IRS Form W-2 Box 2",
        "hrOpenProperty": "WorkerCompensationReports/WorkerWithholding/TaxWithholdingAmount/Amount",
        "hrOpenFilter": "WorkerCompensationReports/WorkerWithholding/TaxWithholdingAmount/TypeCode = \"FederalIncomeTax\"",
        "hrOpenDescription": "The monetary amount withheld by the employer from the worker's pay to cover the worker's contribution to taxes.",
        "revisionNotes": "",
        "depth": 3
      },
      {
        "id": "X.E.1.b",
        "name": "Federal Medicare Tax Withheld",
        "definition": "Amount to be included in IRS Form W-2 Box 6",
        "hrOpenProperty": "WorkerCompensationReports/WorkerWithholding/TaxWithholdingAmount/Amount",
        "hrOpenFilter": "WorkerCompensationReports/WorkerWithholding/TaxWithholdingAmount/TypeCode = \"FederalMedicareTax\"",
        "hrOpenDescription": "The monetary amount withheld by the employer from the worker's pay to cover the worker's contribution to taxes.",
        "revisionNotes": "",
        "depth": 3
      },
      {
        "id": "X.E.1.c",
        "name": "Federal Social Security Tax Withheld",
        "definition": "Amount to be included in IRS Form W-2 Box 4",
        "hrOpenProperty": "WorkerCompensationReports/WorkerWithholding/TaxWithholdingAmount/Amount",
        "hrOpenFilter": "WorkerCompensationReports/WorkerWithholding/TaxWithholdingAmount/TypeCode = \"FederalSocialSecurityTax\"",
        "hrOpenDescription": "The monetary amount withheld by the employer from the worker's pay to cover the worker's contribution to taxes.",
        "revisionNotes": "",
        "depth": 3
      },
      {
        "id": "X.E.1.d",
        "name": "Local Income Taxes Withheld",
        "definition": "Amount to be included in IRS Form W-2 Box 19",
        "hrOpenProperty": "WorkerCompensationReports/WorkerWithholding/TaxWithholdingAmount/Amount",
        "hrOpenFilter": "WorkerCompensationReports/WorkerWithholding/TaxWithholdingAmount/TypeCode = \"LocalIncomeTax\"",
        "hrOpenDescription": "The monetary amount withheld by the employer from the worker's pay to cover the worker's contribution to taxes.",
        "revisionNotes": "",
        "depth": 3
      },
      {
        "id": "X.E.1.e",
        "name": "State Income Tax Withheld",
        "definition": "Amount to be included in IRS Form W-2 Box 17",
        "hrOpenProperty": "WorkerCompensationReports/WorkerWithholding/TaxWithholdingAmount/Amount",
        "hrOpenFilter": "WorkerCompensationReports/WorkerWithholding/TaxWithholdingAmount/TypeCode = \"StateIncomeTax\"",
        "hrOpenDescription": "The monetary amount withheld by the employer from the worker's pay to cover the worker's contribution to taxes.",
        "revisionNotes": "",
        "depth": 3
      },
      {
        "id": "X.E.1.f",
        "name": "Unemployment Insurance Tax Withheld",
        "definition": "The amount withheld by the employer from the worker's pay to cover the worker's contribution to Unemployment Insurance.",
        "hrOpenProperty": "WorkerCompensationReports/WorkerWithholding/TaxWithholdingAmount/Amount",
        "hrOpenFilter": "WorkerCompensationReports/WorkerWithholding/TaxWithholdingAmount/TypeCode = \"UnemployementInsuranceTax\"",
        "hrOpenDescription": "The monetary amount withheld by the employer from the worker's pay to cover the worker's contribution to taxes.",
        "revisionNotes": "",
        "depth": 3
      },
      {
        "id": "X.E.1.g",
        "name": "Workers' Compensation Fees & Taxes Withheld",
        "definition": "The amount withheld by the employer from the worker's pay to cover the worker's contribution to Workers' Compensation insurance.",
        "hrOpenProperty": "WorkerCompensationReports/WorkerWithholding/TaxWithholdingAmount/Amount",
        "hrOpenFilter": "WorkerCompensationReports/WorkerWithholding/TaxWithholdingAmount/TypeCode = \"WorkersCompensationTax\"",
        "hrOpenDescription": "The monetary amount withheld by the employer from the worker's pay to cover the worker's contribution to taxes.",
        "revisionNotes": "",
        "depth": 3
      },
      {
        "id": "X.E.1.h",
        "name": "State Disability Insurance Tax Withheld",
        "definition": "The amount withheld by the employer from the worker's pay to cover the worker's contribution to State Disability Insurance.",
        "hrOpenProperty": "WorkerCompensationReports/WorkerWithholding/TaxWithholdingAmount/Amount",
        "hrOpenFilter": "WorkerCompensationReports/WorkerWithholding/TaxWithholdingAmount/TypeCode = \"WorkersCompensationTax\"",
        "hrOpenDescription": "The monetary amount withheld by the employer from the worker's pay to cover the worker's contribution to taxes.",
        "revisionNotes": "",
        "depth": 3
      },
      {
        "id": "X.E.1.h",
        "name": "Other Taxes Withheld",
        "definition": "All other taxes withheld not included above.",
        "hrOpenProperty": "WorkerCompensationReports/WorkerWithholding/TaxWithholdingAmount/Amount",
        "hrOpenFilter": "WorkerCompensationReports/WorkerWithholding/TaxWithholdingAmount/TypeCode = \"OtherTax\"",
        "hrOpenDescription": "The total monetary amount withheld by the employer from the worker's pay to cover the worker's contribution to insurance premiums.",
        "revisionNotes": "",
        "depth": 3
      },
      {
        "id": "X.E.2",
        "name": "Total Insurance Premiums Withheld",
        "definition": "The total monetary amount withheld by the employer from the worker's pay to cover the worker's contribution to insurance premiums.",
        "hrOpenProperty": "WorkerCompensationReports/WorkerWithholding/TotalInsurancePremiumsWithholdingAmount",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 2
      },
      {
        "id": "X.E.2.a",
        "name": "Health, Dental, Vision Insurance Premiums Withheld",
        "definition": "The amount withheld by the employer from the worker's pay to cover the worker's contribution to health, dental, and vision insurance coverage.",
        "hrOpenProperty": "WorkerCompensationReports/WorkerWithholding/InsurancePremiumsWithholdingAmount/Amount",
        "hrOpenFilter": "WorkerCompensationReports/WorkerWithholding/InsurancePremiumsWithholdingAmount/TypeCode = \"HeathDentalVisionInsurancePremiums\"",
        "hrOpenDescription": "The monetary amount withheld by the employer from the worker's pay to cover the worker's contribution to insurance premiums.",
        "revisionNotes": "",
        "depth": 3
      },
      {
        "id": "X.E.2.b",
        "name": "Life Insurance Premiums Withheld",
        "definition": "The amount withheld by the employer from the worker's pay to cover the worker's contribution to life insurance coverage.",
        "hrOpenProperty": "WorkerCompensationReports/WorkerWithholding/InsurancePremiumsWithholdingAmount/Amount",
        "hrOpenFilter": "WorkerCompensationReports/WorkerWithholding/InsurancePremiumsWithholdingAmount/TypeCode = \"LifeInsurancePremiums\"",
        "hrOpenDescription": "The monetary amount withheld by the employer from the worker's pay to cover the worker's contribution to insurance premiums.",
        "revisionNotes": "",
        "depth": 3
      },
      {
        "id": "X.E.2.c",
        "name": "Other Insurance Premiums Withheld",
        "definition": "The amount withheld by the employer from the worker's pay to cover the worker's contribution to insurance coverage other than medical and life insurance.",
        "hrOpenProperty": "WorkerCompensationReports/WorkerWithholding/InsurancePremiumsWithholdingAmount/Amount",
        "hrOpenFilter": "WorkerCompensationReports/WorkerWithholding/InsurancePremiumsWithholdingAmount/TypeCode = \"OtherInsurancePremiums\"",
        "hrOpenDescription": "The total monetary amount withheld by the employer from the worker's pay to cover the worker's contribution to retirement.",
        "revisionNotes": "",
        "depth": 3
      },
      {
        "id": "X.E.3",
        "name": "Total Retirement Contributions Withheld",
        "definition": "The total monetary amount withheld from the worker's pay to cover the worker's contribution to retirement plans, including defined benefit and defined contribution plans. Includes but is not limited to: • Defined Benefit Pension Plan Contributions • 401(k) Plan Contributions • Roth 401(k) Plan Contributions • 403(b) Plan Contributions • 457 Plan Contributions • SIMPLE Plan Contributions • SEP Plan Contributions Total Retirement Contributions Withheld =",
        "hrOpenProperty": "WorkerCompensationReports/WorkerWithholding/TotalRetirementWithholdingAmount",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 2
      },
      {
        "id": "X.E.3.a",
        "name": "Defined Benefit Pension Plan Contributions Withheld",
        "definition": "The monetary amount withheld by the employer from the worker's pay to cover the worker's contribution to a defined benefit pension plan.",
        "hrOpenProperty": "WorkerCompensationReports/WorkerWithholding/RetirementWithholdingAmount/Amount",
        "hrOpenFilter": "WorkerCompensationReports/WorkerWithholding/RetirementWithholdingAmount'TypeCode = \"DefinedBenefitPensionContributions\"",
        "hrOpenDescription": "Monetary amount withheld by the employer from the worker's pay to cover the worker's contribution to retirement.",
        "revisionNotes": "",
        "depth": 3
      },
      {
        "id": "X.E.3.b",
        "name": "Other Retirement Contributions Withheld",
        "definition": "The monetary amount withheld by the employer from the worker's pay to cover the worker's contribution to other retirement benefit plans.",
        "hrOpenProperty": "WorkerCompensationReports/WorkerWithholding/RetirementWithholdingAmount/Amount",
        "hrOpenFilter": "WorkerCompensationReports/WorkerWithholding/RetirementWithholdingAmount'TypeCode = \"OtherPensionContributions\"",
        "hrOpenDescription": "The total of all other monetary amounts withheld by the employer from the worker's pay for other than taxes, insurance and retirement.",
        "revisionNotes": "",
        "depth": 3
      },
      {
        "id": "X.E.4",
        "name": "All Other Withholding",
        "definition": "Total of all other amounts withheld by the employer from the worker's pay for other than taxes, insurance and retirement. Total Other Withholding = Flexible Spending Account Withheld + Job-related Expenses Withheld + Wage Garnishments Withheld + All Other Withholding",
        "hrOpenProperty": "WorkerCompensationReports/WorkerWithholding/TotalOtherWithholdingAmount",
        "hrOpenFilter": "",
        "hrOpenDescription": "",
        "revisionNotes": "",
        "depth": 2
      },
      {
        "id": "X.E.4.a",
        "name": "Flexible Spending Account Withheld",
        "definition": "The amount withheld by the employer from the worker's pay to cover the worker's contribution to savings accounts to pay for qualified expenses related to medical, dental, and childcare costs.",
        "hrOpenProperty": "WorkerCompensationReports/WorkerWithholding/OtherWithholdingAmount/Amount",
        "hrOpenFilter": "WorkerCompensationReports/WorkerWithholding/OtherWithholdingAmount/TypeCode = \"FlexibleSpendingAccount\"",
        "hrOpenDescription": "Monetary amount withheld by the employer from the worker's pay for other than taxes, insurance, and retirement.",
        "revisionNotes": "",
        "depth": 3
      },
      {
        "id": "X.E.4.b",
        "name": "Education--529 Savings Plan Withheld",
        "definition": "The amount withheld by the employer from the worker's pay to cover the worker's contribution to savings accounts to pay for future expenses associated with college or other qualified post-secondary training.",
        "hrOpenProperty": "WorkerCompensationReports/WorkerWithholding/OtherWithholdingAmount/Amount",
        "hrOpenFilter": "WorkerCompensationReports/WorkerWithholding/OtherWithholdingAmount/TypeCode = \"529SavingPlanAccount\"",
        "hrOpenDescription": "Monetary amount withheld by the employer from the worker's pay for other than taxes, insurance, and retirement.",
        "revisionNotes": "",
        "depth": 3
      },
      {
        "id": "X.E.4.c",
        "name": "Job-related Expenses Withheld",
        "definition": "The amount withheld by the employer from the worker's pay to cover the worker's debt for uniforms, advances, property damage, meals, lodging, tools, equipment, etc.",
        "hrOpenProperty": "WorkerCompensationReports/WorkerWithholding/OtherWithholdingAmount/Amount",
        "hrOpenFilter": "WorkerCompensationReports/WorkerWithholding/OtherWithholdingAmount/TypeCode = \"JobRelatedExpenses\"",
        "hrOpenDescription": "Monetary amount withheld by the employer from the worker's pay for other than taxes, insurance, and retirement.",
        "revisionNotes": "",
        "depth": 3
      },
      {
        "id": "X.E.4.d",
        "name": "Wage Garnishments Withheld",
        "definition": "The amount withheld by the employer from the employee's pay to cover legally required wage garnishments.",
        "hrOpenProperty": "WorkerCompensationReports/WorkerWithholding/OtherWithholdingAmount/Amount",
        "hrOpenFilter": "WorkerCompensationReports/WorkerWithholding/OtherWithholdingAmount/TypeCode = \"WageGarnishments\"",
        "hrOpenDescription": "Monetary amount withheld by the employer from the worker's pay for other than taxes, insurance, and retirement.",
        "revisionNotes": "",
        "depth": 3
      },
      {
        "id": "X.E.4.e",
        "name": "All Other Non-Specified Withholding",
        "definition": "The amount withheld by the employer to cover any other deduction from the worker's pay not covered under another specific category.",
        "hrOpenProperty": "WorkerCompensationReports/WorkerWithholding/OtherWithholdingAmount/Amount",
        "hrOpenFilter": "WorkerCompensationReports/WorkerWithholding/OtherWithholdingAmount/TypeCode = \"Nonspecified\"",
        "hrOpenDescription": "Monetary amount withheld by the employer from the worker's pay for other than taxes, insurance, and retirement.",
        "revisionNotes": "",
        "depth": 3
      }
    ]
  }
];

export const hrOpenCrosswalkMeta = {
  source: 'Data Dictionary Revised Draft 04192026.xlsx',
  sectionCount: 9,
  elementCount: 420,
};
