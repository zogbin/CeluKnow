# 文档管理增强 - 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现文档首页分页、公开文档个人分类/标签、知识图谱分类连线

**Architecture:** 后端增加分页参数和分类边逻辑，前端增加分页UI和分类/标签按当前用户过滤。现有数据模型（categories/tags 有 user_id）已支持个人分类/标签，无需改表结构。

**Tech Stack:** Node.js + Express + SQLite (前端 React + TailwindCSS)

---

### 任务 1：后端分页支持

**修改文件：** `server/src/routes/documents.ts:64-100`

- [ ] **步骤 1: 修改 GET / 路由，添加 page/pageSize 参数**

修改 `GET /` 路由：

```typescript
router.get('/', authMiddleware, (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const sort = req.query.sort || 'updated_at';
  const page = parseInt(req.query.page as string) || 1;
  const pageSize = parseInt(req.query.pageSize as string) || 5;
  const offset = (page - 1) * pageSize;
  
  const orderBy = sort === 'popular' 
    ? 'ORDER BY view_count DESC, comment_count DESC, d.updated_at DESC'
    : 'ORDER BY d.updated_at DESC';
  
  const total = run(`
    SELECT COUNT(*) as count FROM documents
    WHERE visibility = 'public' OR author_id = ?
  `, [userId])[0].count;
  
  const docs = run(`
    SELECT d.*, u.username as author_name,
    GROUP_CONCAT(DISTINCT t.name) as tags,
    GROUP_CONCAT(DISTINCT c.id) as category_ids,
    COALESCE((SELECT COUNT(*) FROM document_views WHERE document_id = d.id), 0) as view_count,
    COALESCE((SELECT COUNT(*) FROM comments WHERE document_id = d.id), 0) as comment_count
    FROM documents d
    LEFT JOIN users u ON d.author_id = u.id
    LEFT JOIN document_tags dt ON d.id = dt.document_id
    LEFT JOIN tags t ON dt.tag_id = t.id AND t.user_id = ?
    LEFT JOIN document_categories dc ON d.id = dc.document_id
    LEFT JOIN categories c ON dc.category_id = c.id AND c.user_id = ?
    WHERE d.visibility = 'public' OR d.author_id = ?
    GROUP BY d.id
    ${orderBy}
    LIMIT ? OFFSET ?
  `, [userId, userId, userId, pageSize, offset]);
  
  const result = docs.map((d: any) => {
    const category_ids = d.category_ids ? d.category_ids.split(',').map((id: string) => parseInt(id)).filter((id: number) => !isNaN(id)) : []
    return { 
      ...d, 
      category_ids,
      view_count: d.view_count || 0,
      comment_count: d.comment_count || 0
    }
  })
  res.json({ docs: result, total, page, pageSize });
});
```

关键变化：
1. 增加 `page`, `pageSize`, `offset` 参数
2. 增加 `total` 查询返回总条数
3. tags 和 categories 的 JOIN 增加 `AND t.user_id = ?` 和 `AND c.user_id = ?` 过滤
4. 返回格式改为 `{ docs, total, page, pageSize }`

- [ ] **步骤 2: 提交**

```bash
git add server/src/routes/documents.ts
git commit -m "feat: add pagination and user-specific category/tag filter to documents API"
```

---

### 任务 2：后端搜索接口也支持用户过滤 tags/categories

**修改文件：** `server/src/routes/documents.ts:33-62`

- [ ] **步骤 1: 修改搜索路由，tags/categories 加上 user_id 过滤**

```typescript
router.get('/search', authMiddleware, (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { q, tag } = req.query;
  let sql = `
    SELECT d.*, u.username as author_name, 
    GROUP_CONCAT(DISTINCT t.name) as tags,
    GROUP_CONCAT(DISTINCT c.id) as category_ids,
    COALESCE((SELECT COUNT(*) FROM document_views WHERE document_id = d.id), 0) as view_count,
    COALESCE((SELECT COUNT(*) FROM comments WHERE document_id = d.id), 0) as comment_count
    FROM documents d
    LEFT JOIN users u ON d.author_id = u.id
    LEFT JOIN document_tags dt ON d.id = dt.document_id
    LEFT JOIN tags t ON dt.tag_id = t.id AND t.user_id = ?
    LEFT JOIN document_categories dc ON d.id = dc.document_id
    LEFT JOIN categories c ON dc.category_id = c.id AND c.user_id = ?
    WHERE (d.visibility = 'public' OR d.author_id = ?)
  `;
  const params: any[] = [userId, userId, userId];
  if (q) {
    sql += ' AND (d.title LIKE ? OR d.content LIKE ?)';
    params.push(`%${q}%`, `%${q}%`);
  }
  sql += ' GROUP BY d.id';
  if (tag) {
    sql = `SELECT * FROM (${sql}) WHERE tags LIKE ?`;
    params.push(`%${tag}%`);
  }
  const results = run(sql, params);
  res.json(results);
});
```

- [ ] **步骤 2: 提交**

```bash
git add server/src/routes/documents.ts
git commit -m "fix: filter tags and categories by user in search API"
```

---

### 任务 3：首页分页UI

**修改文件：** `client/src/pages/Home.tsx`

- [ ] **步骤 1: 修改文档数据加载，适配分页响应格式**

```typescript
const [docs, setDocs] = useState<Doc[]>([])
const [total, setTotal] = useState(0)
const [page, setPage] = useState(1)
const [hasMore, setHasMore] = useState(false)
const pageSize = 5

useEffect(() => {
  if (search.trim()) {
    api.get(`/documents/search?q=${encodeURIComponent(search)}`).then(res => {
      const data = Array.isArray(res.data) ? res.data : (res.data.docs || [])
      setDocs(data)
      setTotal(data.length)
    }).catch(() => {})
  } else {
    api.get(`/documents?sort=${sort}&page=${page}&pageSize=${pageSize}`).then(res => {
      setDocs(res.data.docs || [])
      setTotal(res.data.total || 0)
    }).catch(() => {})
  }
}, [search, sort, page])
```

- [ ] **步骤 2: 添加总文档数文案**

```typescript
<p className="text-gray-500 mt-1">共 {total} 篇文档</p>
```

- [ ] **步骤 3: 在文档列表下方添加分页控件**

在 `</div>` 闭合标签之上（docs map 之后），添加：

```typescriptx
{total > pageSize && (
  <div className="flex items-center justify-center gap-1 mt-6">
    <button
      onClick={() => setPage(Math.max(1, page - 1))}
      disabled={page === 1}
      className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
    >
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
      </svg>
    </button>
    {Array.from({ length: Math.ceil(total / pageSize) }, (_, i) => i + 1).map(p => (
      <button
        key={p}
        onClick={() => setPage(p)}
        className={`px-3 py-1.5 text-sm rounded-lg transition-all ${
          p === page
            ? 'bg-blue-500 text-white'
            : 'border border-gray-200 text-gray-600 hover:bg-gray-50'
        }`}
      >
        {p}
      </button>
    ))}
    <button
      onClick={() => setPage(Math.min(Math.ceil(total / pageSize), page + 1))}
      disabled={page >= Math.ceil(total / pageSize)}
      className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
    >
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
    </button>
  </div>
)}
```

- [ ] **步骤 4: 提交**

```bash
git add client/src/pages/Home.tsx
git commit -m "feat: add pagination to documents home page"
```

---

### 任务 4：文档详情页面分类/标签按当前用户过滤

**修改文件：** `client/src/pages/DocumentPage.tsx`

- [ ] **步骤 1: 确认 DocumentPage.tsx 的 categories/tags 加载**

现有代码中（第76-93行），`/categories` 和 `/tags` API 已经自动按当前用户过滤（后端 middleware 取 req.user.id）。因此分类/标签面板已经显示当前用户的分类和标签，无需修改。

但需要确认分类切换逻辑允许自由分配/取消（不需要单分类限制）。当前代码（第786-797行）强制单分类（赋值前先删除旧的）。改为允许选择/取消任一分类：

```typescript
onClick={async () => {
  try {
    if (isSelected) {
      await api.delete(`/categories/${id}/categories/${cat.id}`)
      setDocCategories(prev => prev.filter(c => c !== cat.id))
    } else {
      await api.post(`/categories/${id}/categories`, { category_ids: [cat.id] })
      setDocCategories(prev => [...prev, cat.id])
    }
  } catch (err: any) {
    alert(err.response?.data?.error || '更新失败')
  }
}}
```

- [ ] **步骤 2: 提交**

```bash
git add client/src/pages/DocumentPage.tsx
git commit -m "feat: allow multiple category assignment for documents"
```

---

### 任务 5：知识图谱添加分类边

**修改文件：** `server/src/routes/documents.ts:102-153`

- [ ] **步骤 1: 在 graph 端点新增共享分类边的生成**

在共享标签边生成之后、`res.json` 之前添加：

```typescript
// Link by shared categories
const docCategoriesForGraph = run(`
  SELECT dc.document_id, c.name as category_name
  FROM document_categories dc
  JOIN categories c ON dc.category_id = c.id
  WHERE dc.document_id IN (SELECT id FROM documents WHERE visibility = 'public' OR author_id = ?)
`, [userId]) as any[];

const categoryDocs: Record<string, number[]> = {}
for (const dc of docCategoriesForGraph) {
  if (!categoryDocs[dc.category_name]) categoryDocs[dc.category_name] = []
  categoryDocs[dc.category_name].push(dc.document_id)
}

for (const catName in categoryDocs) {
  const docIds = categoryDocs[catName]
  for (let i = 0; i < docIds.length; i++) {
    for (let j = i + 1; j < docIds.length; j++) {
      const key = `${Math.min(docIds[i], docIds[j])}-${Math.max(docIds[i], docIds[j])}`
      if (!linkSet.has(key)) {
        linkSet.add(key)
        links.push({ source: docIds[i], target: docIds[j], type: 'category', label: catName })
      }
    }
  }
}
```

- [ ] **步骤 2: 提交**

```bash
git add server/src/routes/documents.ts
git commit -m "feat: add category-based edges to knowledge graph"
```

---

### 任务 6：知识图谱渲染分类边

**修改文件：** `client/src/pages/GraphPage.tsx`

- [ ] **步骤 1: 在图例中添加分类边的说明**

在第370-377行的图例中，添加分类边的说明：

```typescriptx
<div className="flex gap-4 mt-2 text-xs text-gray-500">
  <span className="flex items-center gap-1">
    <span className="w-4 h-0.5 bg-gray-200"></span> 文档引用
  </span>
  <span className="flex items-center gap-1">
    <span className="w-4 h-0.5 bg-amber-400" style={{ borderStyle: 'dashed' }}></span> 相同标签
  </span>
  <span className="flex items-center gap-1">
    <span className="w-4 h-0.5 bg-green-400" style={{ borderStyle: 'dashed' }}></span> 相同分类
  </span>
</div>
```

- [ ] **步骤 2: 在渲染逻辑中添加分类边样式**

在第208-216行，添加分类边的渲染：

```typescript
if (link.type === 'category') {
  ctx.strokeStyle = '#4ADE80'
  ctx.lineWidth = 1.5
  ctx.setLineDash([4, 2])
} else if (link.type === 'tag') {
  ctx.strokeStyle = '#F59E0B'
  ctx.lineWidth = 1.5
  ctx.setLineDash([4, 2])
} else {
  ctx.strokeStyle = '#E5E7EB'
  ctx.lineWidth = 1.5
  ctx.setLineDash([])
}
```

- [ ] **步骤 3: 提交**

```bash
git add client/src/pages/GraphPage.tsx
git commit -m "feat: render category edges in knowledge graph"
```
