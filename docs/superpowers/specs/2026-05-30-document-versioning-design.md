# Document Versioning Design

## Goal
Support multiple user-created versions for documents sharing the same title.

## Data Model
- `documents` table: add `version INTEGER NOT NULL DEFAULT 0`
- UNIQUE constraint: `(title, version, author_id)` — allows same title with different versions
- Existing documents → `version = 0`
- `document_versions` (existing): auto-save history, cap at 2 per document_id

## Version Lifecycle
- **Explicit creation**: user clicks "Save as new version" → POST /documents/:id/versions
  - Finds max version for this title+author, increments by 1
  - Copies current content as the new version's content
  - New version is immediately editable independently
- **Editing**: modifies the currently viewed version, auto-save history stored in `document_versions`
- **Auto-save cap**: when inserting into `document_versions`, delete older entries keeping only the 2 most recent

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | /documents/:id/versions | Create new version (copies content, bumps version) |
| GET | /documents?title=X | Returns all versions of documents with that title |
| GET | /documents/:id/diff?other=Y | Diff content between version id Y and current id |
| PUT | /documents/:id | Edit current version; auto-save old content |
| POST | /documents | Create doc (version=0). Duplicate check on (title,version) |

## Client UI
- **Sidebar**: only latest version per title (max version DESC per title+author)
- **Document page toolbar**: version selector dropdown + "Save as new version" button
- **Version diff**: reuse existing `document_versions` diff UI, adapt for cross-version diff
- **Wiki links**: `[[Title]]` → latest version; `[[Title(v2)]]` → specific version
- **Reference display**: links to a document show other versions as `Title (v2)` in parentheses

## Graph / Stats
- Graph: nodes by title (latest version only), edges by unresolved title
- Doc counts: count all rows (including versions) — actual record count

## Import / Export
- Front matter includes `version` field
- Import: match on `(title, version)` for dedup
- Export: each version exported as separate file with version in front matter

## Migration
- `ALTER TABLE documents ADD COLUMN version INTEGER NOT NULL DEFAULT 0`
- Drop any existing application-level unique check on title alone
- `documents` already has no UNIQUE constraint at SQL level, so no SQL migration needed
