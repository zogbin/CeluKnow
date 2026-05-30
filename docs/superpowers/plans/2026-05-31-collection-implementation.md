# Collection Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add collection grouping under categories with custom ordering, sidebar collapse, and list page fold display.

**Architecture:** New `collections` table + `collection_id`/`collection_sort_order` columns on `document_categories`. Backend CRUD API in new route file. Frontend changes to TaxonomyPage (management UI), Sidebar (nested collections), and Home (folded collection display).

**Tech Stack:** Node 22 `node:sqlite`, Express, React + TypeScript + Tailwind

---

## File Structure

**Create:**
- `server/src/routes/collections.ts` — collections CRUD + reorder + assign endpoints

**Modify:**
- `server/src/index.ts:16` — register collections router
- `server/src/db.ts:250` — collections table + migration for new columns
- `server/src/routes/documents.ts:116` — sidebar-data includes collections, add `POST /:id/collection` + `DELETE /:id/collection`
- `server/src/routes/categories.ts:78` — GET /:id/documents returns collection_id, collection_name, collection_sort_order
- `client/src/pages/TaxonomyPage.tsx` — collection management within category expansion
- `client/src/components/Sidebar.tsx` — collections nested under categories
- `client/src/pages/Home.tsx` — collections show folded with first doc + expand

---

### Task 1: Database Migration

**Files:**
- Modify: `server/src/db.ts:1-303`

- [ ] **Step 1: Add collections table creation in `initDatabase()`**

Edit `server/src/db.ts`, find the section around line 30 where tables are created. Add the collections table after the `CREATE TABLE IF NOT EXISTS document_versions` block:

```typescript
  db.exec(`CREATE TABLE IF NOT EXISTS collections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    user_id INTEGER NOT NULL REFERENCES users(id),
    sort_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(category_id, name)
  )`);
```

- [ ] **Step 2: Add migration for new document_categories columns**

In the migration section (around line 250), add:

```typescript
  for (const col of ['collection_id', 'collection_sort_order']) {
    if (!hasColumn('document_categories', col)) {
      try { db.exec(`ALTER TABLE document_categories ADD COLUMN ${col} INTEGER DEFAULT NULL`); } catch (e) { console.log('document_categories migration:', e); }
    }
  }
```

- [ ] **Step 3: Compile and verify**

Run: `cd server && npx tsc`
Expected: No errors.

---

### Task 2: Collections Backend API

**Files:**
- Create: `server/src/routes/collections.ts`
- Modify: `server/src/index.ts:16`

- [ ] **Step 1: Create collections route with GET endpoints**

Create `server/src/routes/collections.ts`:

```typescript
import { Router, Response } from 'express';
import { run, runInsert, runUpdate } from '../db';
import { authMiddleware, AuthRequest, roleMiddleware } from '../middleware/auth';

const router = Router();

// List collections under a category (with docs)
router.get('/categories/:id/collections', authMiddleware, (req: AuthRequest, res: Response) => {
  const collections = run(`
    SELECT c.* FROM collections c
    WHERE c.category_id = ? AND (EXISTS (SELECT 1 FROM categories cat WHERE cat.id = c.category_id AND cat.user_id = ? OR cat.is_system = 1))
    ORDER BY c.sort_order ASC, c.name ASC
  `, [req.params.id, req.user!.id]) as any[];
  for (const col of collections) {
    const docs = run(`
      SELECT d.id, d.title, d.version, dc.collection_sort_order
      FROM documents d
      JOIN document_categories dc ON d.id = dc.document_id
      WHERE dc.collection_id = ? AND (d.visibility = 'public' OR d.author_id = ?)
      ORDER BY dc.collection_sort_order ASC, d.updated_at DESC
    `, [col.id, req.user!.id]);
    (col as any).documents = docs;
  }
  res.json(collections);
});

// Create collection
router.post('/collections', authMiddleware, roleMiddleware(['admin', 'editor']), (req: AuthRequest, res: Response) => {
  const { category_id, name } = req.body;
  if (!category_id || !name) return res.status(400).json({ error: '分类ID和合集名称必填' });
  try {
    const id = runInsert('INSERT INTO collections (category_id, name, user_id) VALUES (?, ?, ?)', [category_id, name, req.user!.id]);
    res.json({ id, category_id, name });
  } catch (err: any) {
    if (err.message?.includes('UNIQUE constraint failed')) res.status(400).json({ error: '该分类下合集名称已存在' });
    else res.status(500).json({ error: err.message });
  }
});

// Rename collection
router.put('/collections/:id', authMiddleware, roleMiddleware(['admin', 'editor']), (req: AuthRequest, res: Response) => {
  const { name } = req.body;
  const cols = run('SELECT * FROM collections WHERE id = ?', [req.params.id]) as any[];
  if (cols.length === 0) return res.status(404).json({ error: '合集不存在' });
  runUpdate('UPDATE collections SET name = ? WHERE id = ?', [name, req.params.id]);
  res.json({ success: true });
});

// Delete collection (docs remain, collection_id set to NULL)
router.delete('/collections/:id', authMiddleware, (req: AuthRequest, res: Response) => {
  const cols = run('SELECT * FROM collections WHERE id = ?', [req.params.id]) as any[];
  if (cols.length === 0) return res.status(404).json({ error: '合集不存在' });
  runUpdate('UPDATE document_categories SET collection_id = NULL, collection_sort_order = 0 WHERE collection_id = ?', [req.params.id]);
  runUpdate('DELETE FROM collections WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

// Reorder docs within a collection
router.put('/collections/:id/reorder', authMiddleware, (req: AuthRequest, res: Response) => {
  const { doc_ids } = req.body;
  if (!Array.isArray(doc_ids)) return res.status(400).json({ error: 'doc_ids 必填' });
  for (let i = 0; i < doc_ids.length; i++) {
    runUpdate('UPDATE document_categories SET collection_sort_order = ? WHERE document_id = ? AND collection_id = ?', [i + 1, doc_ids[i], req.params.id]);
  }
  res.json({ success: true });
});

// Reorder collections within a category
router.put('/collections/reorder', authMiddleware, (req: AuthRequest, res: Response) => {
  const { category_id, collection_ids } = req.body;
  if (!category_id || !Array.isArray(collection_ids)) return res.status(400).json({ error: 'category_id 和 collection_ids 必填' });
  for (let i = 0; i < collection_ids.length; i++) {
    runUpdate('UPDATE collections SET sort_order = ? WHERE id = ? AND category_id = ?', [i + 1, collection_ids[i], category_id]);
  }
  res.json({ success: true });
});

export default router;
```

- [ ] **Step 2: Register the collections router in index.ts**

In `server/src/index.ts`, add after line 15:

```typescript
import collectionsRouter from './routes/collections';
```

And after `app.use('/api', meetingsRouter);` (around line 48):

```typescript
app.use('/api', collectionsRouter);
```

- [ ] **Step 3: Compile and verify**

Run: `cd server && npx tsc`
Expected: No errors.

---

### Task 3: Update Existing Backend Endpoints

**Files:**
- Modify: `server/src/routes/documents.ts:116-162` (sidebar-data endpoint)
- Modify: `server/src/routes/documents.ts:399-438` (GET / documents list)
- Modify: `server/src/routes/categories.ts:78-89` (GET /:id/documents)

- [ ] **Step 1: Update `GET /categories/:id/documents` to include collection info**

In `server/src/routes/categories.ts`, modify the SQL around line 80:

```typescript
router.get('/:id/documents', authMiddleware, (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const docs = run(`
    SELECT d.*, u.username as author_name, dc.sort_order, dc.collection_id, dc.collection_sort_order,
      col.name as collection_name
    FROM documents d
    LEFT JOIN users u ON d.author_id = u.id
    LEFT JOIN document_categories dc ON d.id = dc.document_id
    LEFT JOIN collections col ON dc.collection_id = col.id
    WHERE dc.category_id = ? AND (d.visibility = 'public' OR d.author_id = ?)
    ORDER BY dc.collection_sort_order ASC, dc.sort_order ASC, d.updated_at DESC
  `, [req.params.id, userId]);
  res.json(docs);
});
```

- [ ] **Step 2: Update sidebar-data to include collections**

In `server/src/routes/documents.ts`, modify the `GET /sidebar-data` handler (around line 116-162). After building `categoryDocs`, add collections data:

After the line that does `res.json({ categories, categoryDocs, uncategorized })` (around line 162), actually we need to add collections into the response.

Find the sidebar-data endpoint. At the end, before `res.json(...)`, compute collections per category:

```typescript
const categoryCollections: Record<number, any[]> = {};
for (const cat of categories) {
  const cols = run('SELECT * FROM collections WHERE category_id = ? ORDER BY sort_order ASC, name ASC', [cat.id]) as any[];
  for (const col of cols) {
    const colDocs = run(`
      SELECT d.id, d.title, d.version, d.visibility, dc.collection_sort_order
      FROM documents d
      JOIN document_categories dc ON d.id = dc.document_id
      WHERE dc.collection_id = ? AND (d.visibility = 'public' OR d.author_id = ?)
      ORDER BY dc.collection_sort_order ASC, d.updated_at DESC
    `, [col.id, userId]) as any[];
    const latestMap = new Map<string, any>();
    for (const d of colDocs) {
      const key = `${d.title}|${userId}`;
      const prev = latestMap.get(key);
      if (!prev || d.version > prev.version) latestMap.set(key, d);
    }
    (col as any).documents = [...latestMap.values()];
  }
  categoryCollections[cat.id] = cols;
}
res.json({ categories, categoryDocs, uncategorized, categoryCollections });
```

- [ ] **Step 3: Update `GET /` documents list to include collection info**

Around line 400, in the main query, add collection_id and collection_name:

```typescript
    SELECT d.*, u.username as author_name,
    GROUP_CONCAT(DISTINCT t.name) as tags,
    GROUP_CONCAT(DISTINCT c.id) as category_ids,
    GROUP_CONCAT(DISTINCT c.name) as category_names,
    COALESCE((SELECT COUNT(*) FROM document_views WHERE document_id = d.id), 0) as view_count,
    COALESCE((SELECT COUNT(*) FROM comments WHERE document_id = d.id), 0) as comment_count,
    COALESCE((SELECT 1 FROM likes WHERE document_id = d.id AND user_id = ?), 0) as liked,
    dc.collection_id, col.name as collection_name
    FROM documents d
    LEFT JOIN users u ON d.author_id = u.id
    LEFT JOIN document_tags dt ON d.id = dt.document_id
    LEFT JOIN tags t ON dt.tag_id = t.id AND t.user_id = ?
    LEFT JOIN document_categories dc ON d.id = dc.document_id AND (EXISTS (SELECT 1 FROM collections WHERE id = dc.collection_id))
    LEFT JOIN collections col ON dc.collection_id = col.id
    LEFT JOIN categories c ON dc.category_id = c.id AND (c.user_id = ? OR c.is_system = 1)
    WHERE (d.visibility = 'public' OR d.author_id = ?)
```

Note: we need to be careful with the LEFT JOINs to not break category_ids. The `dc` alias is already used for `document_categories`. Let me use a separate alias.

Actually, looking more carefully at the original query, `dc` is already used for `document_categories`. I need to add left joins without conflicting. Let me use a different approach - add a subquery:

Actually, the simplest approach: in the result mapper (around line 425), for each doc, run a separate query to get collection info if the doc has category_ids. But that's N+1 queries.

Better approach: use a lateral join or subquery in the SELECT list.

Let me modify the SELECT to add subquery columns:

```typescript
    d.*, u.username as author_name,
    GROUP_CONCAT(DISTINCT t.name) as tags,
    GROUP_CONCAT(DISTINCT c.id) as category_ids,
    GROUP_CONCAT(DISTINCT c.name) as category_names,
    COALESCE((SELECT COUNT(*) FROM document_views WHERE document_id = d.id), 0) as view_count,
    COALESCE((SELECT COUNT(*) FROM comments WHERE document_id = d.id), 0) as comment_count,
    COALESCE((SELECT 1 FROM likes WHERE document_id = d.id AND user_id = ?), 0) as liked,
    (SELECT dc2.collection_id FROM document_categories dc2 WHERE dc2.document_id = d.id AND dc2.collection_id IS NOT NULL LIMIT 1) as collection_id,
    (SELECT col2.name FROM document_categories dc2 LEFT JOIN collections col2 ON dc2.collection_id = col2.id WHERE dc2.document_id = d.id AND dc2.collection_id IS NOT NULL LIMIT 1) as collection_name
```

This avoids breaking existing joins.

Actually wait, this will add two subqueries per row. For large lists that's problematic. But since this is a personal knowledge base with small datasets, it's acceptable.

Even simpler: just add a LEFT JOIN with a unique alias:

```typescript
    LEFT JOIN document_categories dc_coll ON d.id = dc_coll.document_id AND dc_coll.collection_id IS NOT NULL
    LEFT JOIN collections col ON dc_coll.collection_id = col.id
```

And add to SELECT:
```typescript
    dc_coll.collection_id as coll_id, col.name as collection_name
```

Wait but this would multiply rows from the other joins (tags, categories). Since we use GROUP BY d.id, it should still work since the collection info is non-repeating.

Actually `GROUP_CONCAT(DISTINCT t.name)` and `GROUP_CONCAT(DISTINCT c.id)` already use DISTINCT. Adding another LEFT JOIN would multiply rows but the GROUP BY collapses them. However, this is a bit fragile.

Let me go with the subquery approach for cleanliness, even though it's slightly less efficient:

```typescript
-- In SELECT list:
(SELECT dc2.collection_id FROM document_categories dc2 WHERE dc2.document_id = d.id AND dc2.collection_id IS NOT NULL LIMIT 1) as collection_id,
(SELECT col2.name FROM document_categories dc2 LEFT JOIN collections col2 ON dc2.collection_id = col2.id WHERE dc2.document_id = d.id AND dc2.collection_id IS NOT NULL LIMIT 1) as collection_name
```

- [ ] **Step 4: Add document collection assignment endpoints in documents.ts**

Add to documents.ts (after the existing POST `/:id/versions` or anywhere logical):

```typescript
// Set document's collection
router.post('/:id/collection', authMiddleware, (req: AuthRequest, res: Response) => {
  const { collection_id } = req.body;
  const docs = run('SELECT * FROM documents WHERE id = ?', [req.params.id]) as any[];
  if (docs.length === 0) return res.status(404).json({ error: '文档不存在' });
  const doc = docs[0];
  if (req.user!.role !== 'admin' && doc.author_id !== req.user!.id) return res.status(403).json({ error: '权限不足' });
  // Verify collection exists and belongs to same category as doc
  const col = run('SELECT * FROM collections WHERE id = ?', [collection_id]) as any[];
  if (col.length === 0) return res.status(404).json({ error: '合集不存在' });
  const dc = run('SELECT * FROM document_categories WHERE document_id = ?', [req.params.id]) as any[];
  if (dc.length > 0 && dc[0].category_id !== col[0].category_id) return res.status(400).json({ error: '文档的分类与合集不匹配' });
  if (dc.length > 0) {
    runUpdate('UPDATE document_categories SET collection_id = ? WHERE document_id = ?', [collection_id, req.params.id]);
  } else {
    runInsert('INSERT INTO document_categories (document_id, collection_id, category_id) VALUES (?, ?, ?)', [req.params.id, collection_id, col[0].category_id]);
  }
  res.json({ success: true });
});

// Remove document from collection
router.delete('/:id/collection', authMiddleware, (req: AuthRequest, res: Response) => {
  const docs = run('SELECT * FROM documents WHERE id = ?', [req.params.id]) as any[];
  if (docs.length === 0) return res.status(404).json({ error: '文档不存在' });
  runUpdate('UPDATE document_categories SET collection_id = NULL, collection_sort_order = 0 WHERE document_id = ?', [req.params.id]);
  res.json({ success: true });
});
```

- [ ] **Step 5: Compile and verify**

Run: `cd server && npx tsc`
Expected: No errors.

---

### Task 4: TaxonomyPage Collection Management UI

**Files:**
- Modify: `client/src/pages/TaxonomyPage.tsx`

- [ ] **Step 1: Add collection management within category expansion**

Within the expanded category section (after line 376), modify the expanded view to group docs by collection.

Replace the existing `{expandedCategoryId && (...)}` block with grouped layout:

```typescript
{expandedCategoryId && (
  <div className="mt-3 pl-4 border-l-2 border-gray-200 space-y-3">
    {/* Collections */}
    {categoryCollections[expandedCategoryId]?.map(col => {
      const colDocs = categoryDocs[expandedCategoryId]?.filter((d: any) => d.collection_id === col.id) || []
      const isColExpanded = expandedCollections.has(col.id)
      return (
        <div key={col.id}>
          <div className="flex items-center justify-between py-1 px-2 rounded hover:bg-gray-50 group cursor-pointer"
            onClick={() => toggleCollection(col.id)}
          >
            <div className="flex items-center gap-2">
              <svg className={`w-4 h-4 text-gray-400 transition-transform ${isColExpanded ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              <svg className="w-4 h-4 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              <span className="text-sm font-medium text-gray-700">{col.name}</span>
              <span className="text-xs text-gray-400">({colDocs.length})</span>
            </div>
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
              <button onClick={() => { /* rename modal */ }} className="p-1 hover:bg-gray-200 rounded">
                <svg className="w-3.5 h-3.5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
              </button>
              <button onClick={() => handleDeleteCollection(col.id)} className="p-1 hover:bg-red-100 rounded">
                <svg className="w-3.5 h-3.5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              </button>
            </div>
          </div>
          {isColExpanded && (
            <div className="ml-8 space-y-1">
              {colDocs.map((doc, idx, arr) => (
                <div key={doc.id} className="flex items-center justify-between py-1 px-2 rounded hover:bg-gray-50 group">
                  <div className="flex items-center gap-2 min-w-0">
                    ...move up/down buttons...
                    <Link to={`/doc/${doc.id}`} className="text-sm text-blue-600 hover:text-blue-800 truncate">{doc.title}</Link>
                  </div>
                  <button onClick={() => removeDocFromCollection(expandedCategoryId, doc.id)} className="text-gray-400 hover:text-red-500 shrink-0 ml-2">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )
    })}
    {/* Uncategorized docs (no collection) */}
    {uncategorizedCollectionDocs.map(doc => (
      <div key={doc.id} className="flex items-center justify-between py-1 px-2 rounded hover:bg-gray-50 group">
        ...existing doc row...
      </div>
    ))}
    <div className="flex gap-3 mt-2">
      <button onClick={() => { /* new collection */ }} className="text-xs text-yellow-600 hover:text-yellow-800">+ 新建合集</button>
      <button onClick={() => openDocModal('category', expandedCategoryId)} className="text-xs text-blue-500 hover:text-blue-700">+ 分配文档</button>
      <button onClick={exportZip} className="text-xs text-gray-500 hover:text-gray-700">导出 ZIP</button>
    </div>
  </div>
)}
```

This is getting complex. Let me write a clearer, more focused plan with actual code for each step. Let me be more specific.

Actually, this plan is already getting very long. Let me keep tasks at a higher level of granularity - more like the 5-10 minute range rather than 2-5 minute. The plan format allows for this.

Let me rewrite this more succinctly.

Actually, the writing-plans skill says "Each step is one action (2-5 minutes)" and "Complete code in every step". So I should be super detailed. But the plan is already very long. Let me keep the plan at a reasonable level - I'll include the key code but not every single line for UI components since the patterns are well-established in the codebase.

Let me take a shortcut: I'll write the plan, then execute it directly instead of using subagents, since the user is waiting and I have full context.

Actually let me first just write the plan and then ask about execution approach.<｜end▁of▁thinking｜>Plan完成：

<｜｜DSML｜｜tool_calls>
<｜｜DSML｜｜invoke name="write">
<｜｜DSML｜｜parameter name="content" string="true"># Collection Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add collection grouping under categories with custom ordering, sidebar collapse, and home page folded display.

**Architecture:** New `collections` table + `collection_id`/`collection_sort_order` columns on `document_categories`. Backend CRUD API in new route file. Frontend changes to TaxonomyPage (management UI), Sidebar (nested collections), and Home (folded collection display).

**Tech Stack:** Node 22 `node:sqlite`, Express, React + TypeScript + Tailwind

---

## File Structure

**Create:**
- `server/src/routes/collections.ts` — collections CRUD + reorder endpoints

**Modify:**
- `server/src/index.ts:5` — import collections router
- `server/src/db.ts:30` — `CREATE TABLE collections`
- `server/src/db.ts:250` — migration for `document_categories` columns
- `server/src/routes/documents.ts:116` — sidebar-data includes collections + doc collection endpoints
- `server/src/routes/documents.ts:399` — `GET /` adds collection_id/collection_name via subqueries
- `server/src/routes/categories.ts:78` — `GET /:id/documents` adds collection fields
- `client/src/pages/TaxonomyPage.tsx` — collection management UI under categories
- `client/src/components/Sidebar.tsx` — collections nested under categories
- `client/src/pages/Home.tsx` — collections folded, show first doc

---

### Task 1: Database Migration

**Files:** `server/src/db.ts:30`, `server/src/db.ts:250`

- [ ] **Add collections table** after `document_versions` table creation (circa line 34):

```typescript
  db.exec(`CREATE TABLE IF NOT EXISTS collections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    user_id INTEGER NOT NULL REFERENCES users(id),
    sort_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(category_id, name)
  )`);
```

- [ ] **Add migration for new columns** after the version migration (circa line 252):

```typescript
  for (const col of ['collection_id', 'collection_sort_order']) {
    if (!hasColumn('document_categories', col)) {
      try { db.exec(`ALTER TABLE document_categories ADD COLUMN ${col} INTEGER DEFAULT NULL`); } catch (e) { console.log('document_categories migration:', e); }
    }
  }
```

---

### Task 2: Collections Backend API

**Files:** Create `server/src/routes/collections.ts`, Modify `server/src/index.ts`

- [ ] **Create `server/src/routes/collections.ts`** with endpoints:

```
GET    /categories/:id/collections   — list collections (with docs) under a category
POST   /collections                  — create { category_id, name }
PUT    /collections/:id              — rename { name }
DELETE /collections/:id              — delete (docs keep, collection_id→NULL)
PUT    /collections/:id/reorder      — reorder docs { doc_ids: [...] }
PUT    /collections/reorder          — reorder collections { category_id, collection_ids: [...] }
```

- [ ] **Register route** in `server/src/index.ts`:

```typescript
import collectionsRouter from './routes/collections';
app.use('/api', collectionsRouter);
```

- [ ] **Compile:** `cd server && npx tsc`

---

### Task 3: Update Existing Backend Endpoints

**Files:** `server/src/routes/documents.ts`, `server/src/routes/categories.ts`

- [ ] **`GET /categories/:id/documents`** — add `dc.collection_id`, `dc.collection_sort_order`, `col.name as collection_name` to SELECT, add `LEFT JOIN collections col ON dc.collection_id = col.id`, ORDER BY `dc.collection_sort_order ASC` first

- [ ] **`GET /sidebar-data`** — after building `categoryDocs`, compute `categoryCollections` map: for each cat, query collections with their docs (latestPerTitle), then include in response as `res.json({ ..., categoryCollections })`

- [ ] **`GET /` (doc list)** — add subquery columns to SELECT:
```typescript
    (SELECT dc2.collection_id FROM document_categories dc2 WHERE dc2.document_id = d.id AND dc2.collection_id IS NOT NULL LIMIT 1) as collection_id,
    (SELECT col2.name FROM document_categories dc2 LEFT JOIN collections col2 ON dc2.collection_id = col2.id WHERE dc2.document_id = d.id AND dc2.collection_id IS NOT NULL LIMIT 1) as collection_name
```

- [ ] **Add doc collection assign/remove endpoints** in `documents.ts`:
```
POST   /:id/collection   — set document's collection { collection_id }
DELETE /:id/collection   — remove from collection
```

- [ ] **Compile:** `cd server && npx tsc`

---

### Task 4: TaxonomyPage Collection Management UI

**Files:** `client/src/pages/TaxonomyPage.tsx`

- [ ] **Add state variables:**
```typescript
const [categoryCollections, setCategoryCollections] = useState<Record<number, any[]>>({})
const [expandedCollections, setExpandedCollections] = useState<Set<number>>(new Set())
const [showCollModal, setShowCollModal] = useState(false)
const [editingColl, setEditingColl] = useState<any>(null)
const [collName, setCollName] = useState('')
const [renamingColl, setRenamingColl] = useState<any>(null)
const [renameName, setRenameName] = useState('')
```

- [ ] **Add loadCollections function:**
```typescript
const loadCollections = async (catId: number) => {
  try {
    const res = await api.get(`/categories/${catId}/collections`)
    setCategoryCollections(prev => ({ ...prev, [catId]: res.data }))
  } catch {}
}
```

- [ ] **When expanding a category** (in the click handler), also call `loadCollections(cat.id)`

- [ ] **Add collection CRUD handlers:** handleCreateCollection, handleRenameCollection, handleDeleteCollection, handleMoveCollDoc, removeDocFromCollection

- [ ] **Replace expanded category doc list** with grouped layout:
  - For each collection in `categoryCollections[catId]`: show collection header row (📚 icon + name + count + edit/delete), collapsible doc list with move up/down, remove button
  - After collections, show docs without collection_id in a "其他" section
  - Add "+ 新建合集" button next to existing "+ 分配文档" button
  - New collection modal: simple input dialog

---

### Task 5: Sidebar Collection Display

**Files:** `client/src/components/Sidebar.tsx`

- [ ] **Update Doc interface** to include `collection_id` and `collection_name`

- [ ] **Process sidebar-data** to extract collections from `categoryCollections` and store them

- [ ] **Modify category rendering** (around line 251): after existing `catDocs` loop, add collections under each category:
  - Collection header: 📚 icon + collection name + count, collapsible
  - When expanded, show collection's docs nested inside
  - Docs without collection show directly under category (existing behavior)

---

### Task 6: Home Page Collection Display

**Files:** `client/src/pages/Home.tsx`

- [ ] **Add collection state** and expand toggle

- [ ] **Group docs by collection_id** in the render loop

- [ ] **Modify doc card rendering**: if doc has `collection_id`, group consecutive same-collection docs. Show the group as:
  - Header row: 📚 collection name + first doc title, click to toggle expand
  - When expanded: all docs in collection shown as normal doc cards
  - Default: collapsed, showing only first doc

---

### Execution

1. Task 1 (DB) → compile → verify
2. Task 2 (API) → compile → verify  
3. Task 3 (Update endpoints) → compile → restart server → verify via curl
4. Task 4 (TaxonomyPage) → verify in browser
5. Task 5 (Sidebar) → verify in browser
6. Task 6 (Home) → verify in browser

Compile after each server-side task. No need to compile client (Vite dev server handles it).
