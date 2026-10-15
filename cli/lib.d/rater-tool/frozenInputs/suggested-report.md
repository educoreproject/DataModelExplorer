# CEDS Rater: suggested candidate lists report

*Written by `raterTool.js -buildSuggested`. Gold: `GOLD_EVAL_261013_jevQuestionPerBridge`. Sample seed: `cedsRater-humanTruthSet-101426-r2`. 150 elements.*

## 1. The rules

How each element's suggested candidate list is built (lane RATER; SPEC §6). The query text is the element's name with camelCase and underscores split into words and a leading @ dropped, then its definition (when it has one), then its owner's name split the same way. The meaning leg embeds that text with the DME's query embedder and asks the DME's vector index for property-tier CEDS tuples; the words leg runs BM25 over the DME's fulltext index on CEDS properties (name + definition) with the words OR-joined (the DME's own AND rule finds nothing for a name + definition query), expanding each property hit to its tuples. The two lists interleave meaning 1, words 1, meaning 2, ... ; a tuple already taken, or a card identical to one taken (same class + property + qualifiers), joins that card instead of taking a slot; at cardCap new cards stop. Cards are stored unordered (sorted by tuple id); each rater sees their own shuffle. Revision 3 (TQ-approved exception to "no machine results"): for an element with isMappedInGold, every property-tier tuple the gold maps it to (EXACT/CLOSE/BROAD/NARROW_MATCH, through the same members as isMappedInGold) is put on the list as an ordinary card if the searches did not already put it there; when that overflows cardCap, the lowest-ranked non-gold cards (the last taken in interleave order) leave. A gold card is never dropped. The gold decides only what is on the list, never how a card looks or where it sits.

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
| Ed-Fi | 997 | 222 | 392 | 381 |
| PESC | 999 | 225 | 392 | 379 |
| SIF | 987 | 180 | 420 | 381 |
| all | 2983 | 627 | 1204 | 1141 |

## 4. Merging

- the same tuple found by both methods (counted once): 639
- a different tuple with an identical card (same class + property + qualifiers), collapsed into the card: 0
- distinct search cards ranked beyond the cap of 20 (before the gold injection): 844
- cards carrying more than one tuple id: 0
- cards with a qualifier: 88
- cards without a CEDS ID: 0

## 5. Gold injection (revision 3)

TQ-approved exception to "no machine results": every property-tier tuple the gold maps a mapped element to is on that element's list. A gold tuple the searches had not put on the list is injected as an ordinary card; when the list then passes the cap, the lowest-ranked non-gold cards (the last taken in interleave order) leave. "Gold on the search list" counts mapped items whose search-built list (revision 2) already held at least one gold tuple. A gold tuple ranked by a search but beyond the cap counts as injected.

| standard | mapped items | gold on the search list | none on it | items touched | gold tuples | tuples injected | cards injected | cards displaced | gold cards over the cap |
|:---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Ed-Fi | 40 | 37 | 3 | 3 | 40 | 3 | 3 | 3 | 0 |
| PESC | 40 | 38 | 2 | 4 | 47 | 4 | 4 | 4 | 0 |
| SIF | 40 | 35 | 5 | 7 | 43 | 7 | 7 | 7 | 0 |
| all | 120 | 110 | 10 | 14 | 130 | 14 | 14 | 14 | 0 |

- gold tuples that are not property-tier (not cards; reported, not injected): 0
- unmapped items: no gold tuple is asked for; their lists are the search-built lists unchanged

