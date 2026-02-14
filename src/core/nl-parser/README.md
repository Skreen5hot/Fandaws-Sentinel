# NLParser

**Spec Reference:** Section 3.2.1

Parses user utterances into structured semantic frames using grammar-based and regex extraction. No probabilistic inference.

**Input:** JSON-LD `UserUtterance` node (raw text + conversation context)
**Output:** JSON-LD `ParseResult` node (subject, predicate, object, verb type, confidence)

**Determinism Guarantee:** Identical utterance + context → identical ParseResult.

**Performance Target:** < 5ms per utterance.
