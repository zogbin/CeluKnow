# CeluKnow - AI Agent Integration Guide

You have access to `celuknow`, a CLI tool for querying a personal knowledge base (CeluKnow 仓颉智库). Use it to search, retrieve, and explore knowledge.

## Quick Install

```bash
cd cli && npm install && npm run build
export CELUKNOW_SERVER=http://localhost:3001
# Login to get a token (valid 7 days)
celuknow login -u <username> -p <password>
export CELUKNOW_TOKEN=<token>
```

## Core Query Command

The most important command is `query` - it uses FTS5 BM25 full-text search with scoring:

```bash
# Basic search (returns ranked results with snippets)
celuknow query "machine learning" -l 5

# Full content for LLM processing
celuknow query "API design" --full --json

# With related documents (same category)
celuknow query "project timeline" --related

# With scoring explanation
celuknow query "authentication" --explain --json

# Filter by relevance threshold
celuknow query "error handling" --min-score 0.5

# Markdown output (human-readable)
celuknow query "architecture" --md
```

## Other Commands

```bash
celuknow index           # Show knowledge index structure
celuknow get <id>        # Get document by ID
celuknow get <id> --related   # With related docs + graph links
celuknow search <text>   # Legacy keyword search
celuknow list            # List all documents
```

## Output Format

Use `--json` for structured output suitable for LLM consumption:

```json
{
  "query": "search term",
  "total": 5,
  "results": [
    {
      "id": 1,
      "title": "Document Title",
      "score": 1.02,
      "snippet": "matched content...",
      "content": "full content (with --full)",
      "tags": "tag1,tag2",
      "category_names": "Category",
      "explain": { "method": "FTS5 BM25", "query": "search term" },
      "related": {
        "same_category": [{ "id": 2, "title": "Related Doc" }]
      }
    }
  ]
}
```

## Strategy for Knowledge Retrieval

1. **Use `index` first** to understand the knowledge structure (categories, tags)
2. **Use `query` with specific terms** for targeted search
3. **Use `--full --json`** to get complete content for LLM processing
4. **Use `get <id> --related --json`** to explore connections from a known document
5. **Use `--explain`** to understand why results matched (score transparency)

## Examples

```bash
# Find all docs about a topic with full content
celuknow query "neural networks" -l 10 --full --json

# Explore related content around a specific document
celuknow query "knowledge graph" --related --json

# Quick knowledge structure overview
celuknow index --json
```
