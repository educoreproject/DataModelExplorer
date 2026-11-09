# Specification Viewer — bundled graph data

The Specification Viewer (`/explore/specification-viewer`) reads each standard's
structure and its CEDS concepts from files bundled with the site, so it works
whether or not the server's graph endpoints are deployed. Both are built from
the EDUcore graph by the scripts here.

| file | built by | what it holds |
| --- | --- | --- |
| `html/data/spec-elements/<SPEC>.json` | `build-spec-models.cjs` | every class and property, each with its `stableId` and its **trail** (the sections above it) |
| `html/data/spec-elements/<SPEC>.codes.json` | `build-spec-models.cjs` | the spec's code lists (loaded only when a property with one is opened) |
| `html/data/spec-elements/manifest.json` | `build-spec-models.cjs` | counts and profile per spec (the spec picker) |
| `html/data/educore-equivalents-snapshot.json` | `build-concept-snapshot.cjs` | every CEDS concept (HubReference) any standard maps to, its CEDS anchors, and every matched element |

## How each standard is read

Always by the graph's **structural edges**, never by splitting the dotted `path`
property (it is lossy: SIF folds six different `Name` fields into
`AccountingPeriod.Name`).

| profile | standards | hierarchy |
| --- | --- | --- |
| model | CEDS, Ed-Fi, LIF, CTDL, CTDL-ASN, CTDL-QData, CASE, CLR, Open Badges, Ed-API, JEDx, DCTAP | entity (root `HAS_CLASS`) › nested classes (`HAS_CLASS`, LIF) › property (`HAS_PROPERTY`; a CTDL property under every class that owns it). `SUBCLASS_OF` is shown as "extends". |
| taxonomy | CIP, SOC | `SUBCLASS_OF` is the hierarchy: CIP family › series › program; SOC major › minor › broad › occupation |
| messages | PESC, MedBiquitous | message / schema version (from the stableId) › class › property |
| xpath | SIF | object › element path (from the field's XPath stableId) › field; complex types under "Types" |
| elements | SEDM | element group › section › element (properties hang off no class) |

Intermediate groups that exist only in a stableId (JEDx `organization.taxIds[].agencyUri`)
become sections. A property typed by a class (`REFERENCES`) links to it; a property
with a code list (`HAS_OPTION_SET` → `HAS_VALUE`) lists its codes.

## Regenerate

1. Run the read-only Cypher written at the top of each script against the graph
   and save each result (a single `rows` column) to a file.
2. Build the models, then the concept snapshot (it labels matched elements from the models):

```bash
node html/scripts/specificationViewer/build-spec-models.cjs classes.json properties-nonSIF.json properties-SIF.json -- codeSets.json
node html/scripts/specificationViewer/build-concept-snapshot.cjs edges.json anchors.json
```

3. Check:

```bash
node html/test/specificationViewer/structure.test.mjs
node html/test/specificationViewer/concepts.test.mjs
node html/test/specificationViewer/compile-components.mjs
```

Some assertions name specific graph facts (LIF's nine entities, CEDS P000040
"Address City", Ed-Fi `School.City`); if a re-forge changes those, update the test.
