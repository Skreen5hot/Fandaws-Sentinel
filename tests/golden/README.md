# Golden Test Data

Reference data for validation. JSON files with input/expected output pairs.

Example corpus format:
```json
{
  "tests": [
    {
      "id": "test-001",
      "description": "Basic classification",
      "input": "A dog is an animal",
      "expected": { ... },
      "tags": ["smoke", "classification"]
    }
  ]
}
```
