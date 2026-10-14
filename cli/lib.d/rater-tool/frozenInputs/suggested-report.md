# CEDS Rater: suggested candidate lists report

*Written by `raterTool.js -buildSuggested`. Gold: `GOLD_EVAL_261013_jevQuestionPerBridge`. Sample seed: `cedsRater-humanTruthSet-101426-r2`. 150 elements.*

## 1. The rules

How each element's suggested candidate list is built (lane RATER; SPEC §6). The query text is the element's name with camelCase and underscores split into words and a leading @ dropped, then its definition (when it has one), then its owner's name split the same way. The meaning leg embeds that text with the DME's query embedder and asks the DME's vector index for property-tier CEDS tuples; the words leg runs BM25 over the DME's fulltext index on CEDS properties (name + definition) with the words OR-joined (the DME's own AND rule finds nothing for a name + definition query), expanding each property hit to its tuples. The two lists interleave meaning 1, words 1, meaning 2, ... ; a tuple already taken, or a card identical to one taken (same class + property + qualifiers), joins that card instead of taking a slot; at cardCap new cards stop. Cards are stored unordered (sorted by tuple id); each rater sees their own shuffle.

Per method: top 15. Cap: 20 cards. Interleave order: meaning, words. Words join: OR.

## 2. List sizes

| cards in the list | elements |
|:---|---:|
| 15 | 1 |
| 16 | 1 |
| 17 | 1 |
| 18 | 2 |
| 19 | 1 |
| 20 | 144 |

| method | elements with a full top 15 | elements with fewer | elements with none |
|:---|---:|---:|---:|
| meaning | 149 | 1 | 0 |
| words | 148 | 1 | 1 |

## 3. Overlap between the methods (cards kept)

| standard | cards | found by both | meaning only | words only |
|:---|---:|---:|---:|---:|
| Ed-Fi | 997 | 223 | 393 | 381 |
| PESC | 999 | 225 | 391 | 383 |
| SIF | 987 | 180 | 424 | 383 |
| all | 2983 | 628 | 1208 | 1147 |

## 4. Merging

- the same tuple found by both methods (counted once): 628
- a different tuple with an identical card (same class + property + qualifiers), collapsed into the card: 0
- new cards beyond the cap of 20, not kept: 855
- cards carrying more than one tuple id: 0
- cards with a qualifier: 87
- cards without a CEDS ID: 0

