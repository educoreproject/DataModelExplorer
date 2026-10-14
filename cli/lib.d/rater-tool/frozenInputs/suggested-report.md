# CEDS Rater: suggested candidate lists report

*Written by `raterTool.js -buildSuggested`. Gold: `GOLD_EVAL_261013_jevQuestionPerBridge`. Sample seed: `cedsRater-humanTruthSet-101426`. 150 elements.*

## 1. The rules

How each element's suggested candidate list is built (lane RATER; SPEC §6). The query text is the element's name with camelCase and underscores split into words and a leading @ dropped, then its definition (when it has one), then its owner's name split the same way. The meaning leg embeds that text with the DME's query embedder and asks the DME's vector index for property-tier CEDS tuples; the words leg runs BM25 over the DME's fulltext index on CEDS properties (name + definition) with the words OR-joined (the DME's own AND rule finds nothing for a name + definition query), expanding each property hit to its tuples. The two lists interleave meaning 1, words 1, meaning 2, ... ; a tuple already taken, or a card identical to one taken (same class + property + qualifiers), joins that card instead of taking a slot; at cardCap new cards stop. Cards are stored unordered (sorted by tuple id); each rater sees their own shuffle.

Per method: top 15. Cap: 20 cards. Interleave order: meaning, words. Words join: OR.

## 2. List sizes

| cards in the list | elements |
|:---|---:|
| 20 | 150 |

| method | elements with a full top 15 | elements with fewer | elements with none |
|:---|---:|---:|---:|
| meaning | 150 | 0 | 0 |
| words | 149 | 1 | 0 |

## 3. Overlap between the methods (cards kept)

| standard | cards | found by both | meaning only | words only |
|:---|---:|---:|---:|---:|
| Ed-Fi | 1000 | 166 | 431 | 403 |
| PESC | 1000 | 186 | 416 | 398 |
| SIF | 1000 | 155 | 437 | 408 |
| all | 3000 | 507 | 1284 | 1209 |

## 4. Merging

- the same tuple found by both methods (counted once): 507
- a different tuple with an identical card (same class + property + qualifiers), collapsed into the card: 0
- new cards beyond the cap of 20, not kept: 991
- cards carrying more than one tuple id: 0
- cards with a qualifier: 44
- cards without a CEDS ID: 0

