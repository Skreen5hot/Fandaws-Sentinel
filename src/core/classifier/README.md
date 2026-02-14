# Classifier

**Spec Reference:** Section 3.2.2

Routes parsed statements to the appropriate knowledge-building workflow via enum matching.

**Input:** `ParseResult` node
**Output:** `ClassificationAction` node (workflow type + extracted operands)

**Routing Rules:**
- "X is a Y" → classification workflow
- "X has Y" → property workflow
- Any other verb → custom relationship workflow

**Performance Target:** < 1ms per classification.
