Great question — and the timing is right to think carefully about this before you start, because the design decisions you make now will determine how powerful the unified graph is.

Let me reason through this systematically, drawing on what I know about both graphs.Now I have a thorough, evidence-based picture of both graphs. Let me compose a substantive answer.

---

## Beyond "Two Graphs in One DB": What I'd Actually Want

Just co-locating the two graphs gets you the join. But that's table stakes. Here are the additional features worth designing in deliberately, grounded in what I can see about the actual data:



---

### Feature 1: Lift SIF Codeset Values to First-Class Nodes

**The problem right now:** `SifCodeset` stores its values as a `values[]` array property and a `fingerprint` string. They're not traversable — you can't query "which SIF codesets contain value `PK`?" or "does this SIF codeset have all the same values as the CEDS option set?" without string manipulation.

**What to add:** A `:CodeValue` node type (or reuse `:SifCodeValue`) with a `HAS_VALUE` edge from `SifCodeset`, exactly mirroring what CEDS already does with `CedsOptionSet → HAS_VALUE → CedsOptionValue`.

**Why it matters:** With 859 SIF fields that have *both* a `cedsId` annotation *and* a codeset — representing 139 distinct CEDS IDs — there's a ready-made comparison problem waiting. Once values are first-class nodes, a single traversal can answer: *"For grade level, SIF has 22 values and CEDS has 24 — which two are CEDS-only?"*

---

### Feature 2: A `MAPS_TO` Bridge Edge with Metadata

This is the obvious one — replace the inert `cedsId` string property with a real graph edge. But the important design question is: **what properties go on the edge?**

I'd suggest the edge carry:



This matters enormously for the annotation work you described. When you're building out the 13,389 unannotated fields, you want to be able to query "show me all inferred mappings with confidence < 0.7 that haven't been reviewed" — and without edge metadata, that query is impossible.

---

### Feature 3: Codeset Alignment Edges

**The specific discovery:** There are currently **139 distinct CEDS IDs** that appear on SIF fields with codesets, and only **6 of those 139** CEDS properties actually have an option set in CEDS. So there are 133 cases where SIF has a controlled vocabulary but CEDS describes the field as a free text or typed value. And there are 6 cases (grade level, state abbreviation, address type, email type, telephone type, state ANSI code) where *both* sides have codesets — and the values almost certainly diverge.

I'd add an `ALIGNS_WITH` edge between `SifCodeset` and `CedsOptionSet`, with properties:

- `coveragePercent` — what fraction of CEDS values appear in the SIF set
- `sifOnlyValues` — values in SIF not in CEDS
- `cedsOnlyValues` — values in CEDS not in SIF
- `alignmentType` — "exact", "subset", "superset", "partial", "disjoint"

This is computable right now for those 6 pairs and would be immediately useful.

---

### Feature 4: SIF Field Embeddings

**The asymmetry I found:** Every `CedsProperty` node already has an `embedding` vector. Every `SifField` node has zero embeddings. This is the single biggest missing feature for the annotation work.

With embeddings on SIF fields, you get:
- **Semantic nearest-neighbor search**: "Which CEDS properties are most similar to this unannotated SIF field?" — runnable as a vector index query
- **Cluster analysis**: Group unannotated SIF fields by what CEDS neighborhood they semantically belong to
- **Confidence scoring**: The cosine similarity between a SIF field embedding and a candidate CEDS property embedding becomes a principled confidence score for the `MAPS_TO` edge

The embedding text for a SIF field would concatenate its `name`, `description`, parent XPath segments, and SIF object name — giving it rich semantic context.

---

### Feature 5: A `SifComplexType → CedsClass` Bridge

This is the structural insight that goes beyond field-level mapping. SIF's complex types (like `Address`, `Demographics`, `PhoneNumber`) are structural analogs to CEDS classes (like `Location Address`, `Person Demographics`). Right now there's no edge between them.

Adding `STRUCTURALLY_MAPS_TO` between `SifComplexType` and `CedsClass` would let you:
- Ask "what SIF complex type corresponds to `K12 Student Enrollment`?"
- Use the class-level mapping to *bootstrap* field-level mappings: if `Address` maps to `Location Address`, then all fields inside `Address` are candidates for properties of `Location Address`
- Make the annotation propagation algorithm structurally sound rather than just name-based

---

### Summary



The most strategically important of these is **Feature 4 — SIF field embeddings** — because it turns the annotation problem into a computable search problem. Without it, you're doing rules-based propagation and manual review. With it, you have a ranking algorithm for every one of the 13,389 unannotated fields, and the edge metadata from Feature 2 lets you track which answers you trust.

Want to start sketching the Cypher for any of these — the `MAPS_TO` edge migration, the codeset value lift, or a plan for generating the SIF field embeddings?
