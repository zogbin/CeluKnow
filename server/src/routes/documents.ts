import { Router, Response } from 'express';
import { run, runInsert, runUpdate } from '../db';
import { authMiddleware, AuthRequest, roleMiddleware } from '../middleware/auth';
import { storage } from '../utils/storage';
import { autoLinkContent, rebuildUserIndex, getIndexData } from '../utils/indexHelper';
import fs from 'fs';
import path from 'path';

const router = Router();
const IMAGES_DIR = path.join(__dirname, '../../uploads/images');

storage.ensureDir();
if (!fs.existsSync(IMAGES_DIR)) {
  fs.mkdirSync(IMAGES_DIR, { recursive: true });
}

function isExternalUrl(url: string): boolean {
  return (url.startsWith('http://') || url.startsWith('https://'))
    && !url.startsWith('http://localhost')
    && !url.startsWith('http://127.0.0.1')
    && !url.startsWith('/uploads/');
}

function escapeSqlLike(s: string): string {
  return s.replace(/%/g, '\\%').replace(/_/g, '\\_');
}

async function downloadImage(docId: string, url: string): Promise<string> {
  let ext = '';
  try {
    const urlPath = new URL(url).pathname;
    const parsedExt = path.extname(urlPath);
    if (parsedExt && parsedExt.length <= 6) ext = parsedExt;
  } catch {}
  if (!ext) ext = '.jpg';

  const docDir = path.join(IMAGES_DIR, docId);
  if (!fs.existsSync(docDir)) {
    fs.mkdirSync(docDir, { recursive: true });
  }

  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
  const filepath = path.join(docDir, filename);

  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(filepath, buffer);

  return `/uploads/images/${docId}/${filename}`;
}

async function processContentImages(docId: string, content: string): Promise<string> {
  const externalUrls = new Set<string>();

  const mdRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  let match;
  while ((match = mdRegex.exec(content)) !== null) {
    const url = match[2];
    if (isExternalUrl(url)) externalUrls.add(url);
  }

  const htmlRegex = /<img[^>]+src="([^"]+)"[^>]*>/g;
  while ((match = htmlRegex.exec(content)) !== null) {
    const url = match[1];
    if (isExternalUrl(url)) externalUrls.add(url);
  }

  const results = await Promise.allSettled(
    [...externalUrls].map(url =>
      downloadImage(docId, url).then(localPath => ({ url, localPath }))
    )
  );

  const urlMap = new Map<string, string>();
  for (const r of results) {
    if (r.status === 'fulfilled') {
      urlMap.set(r.value.url, r.value.localPath);
    } else {
      console.error(`[image-dl] 下载失败:`, (r.reason as Error).message?.substring(0, 120));
    }
  }

  let result = content;
  urlMap.forEach((localPath, originalUrl) => {
    result = result.split(originalUrl).join(localPath);
  });

  return result;
}

router.get('/help', authMiddleware, (req: AuthRequest, res: Response) => {
  const fs = require('fs');
  const path = require('path');
  const helpPath = path.join(__dirname, '../../../docs/HELP.md');
  try {
    const content = fs.readFileSync(helpPath, 'utf8');
    res.json({ title: 'CeluKnow 使用指南', content });
  } catch (e) {
    res.json({ title: '使用指南', content: '# 使用指南\n文件未找到' });
  }
});

router.put('/help', authMiddleware, (req: AuthRequest, res: Response) => {
  const { content } = req.body;
  const docs = run('SELECT id FROM documents WHERE title = ? AND author_id = ?', ['使用帮助', req.user!.id]);
  if (docs.length > 0) {
    runUpdate("UPDATE documents SET content = ?, updated_at = datetime('now') WHERE id = ?", [content, docs[0].id]);
    res.json({ success: true });
  } else {
    res.status(404).json({ error: '文档不存在' });
  }
});

router.get('/sidebar-data', authMiddleware, (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const userCats = run('SELECT * FROM categories WHERE user_id = ? ORDER BY name', [userId]) as any[];
  const systemCats = run('SELECT * FROM categories WHERE is_system = 1 ORDER BY name') as any[];
  const catMap = new Map<string, any>();
  for (const cat of systemCats) catMap.set(cat.name, cat);
  for (const cat of userCats) catMap.set(cat.name, cat);
  const categories = [...catMap.values()];

  const categoryDocs: Record<number, any[]> = {};
  const allDocIds = new Set<number>();
  const assignedDocIds = new Set<number>();

  for (const cat of categories) {
    const docs = run(`
      SELECT d.id, d.title, d.version, d.author_id, d.visibility, dc.sort_order
      FROM documents d
      JOIN document_categories dc ON d.id = dc.document_id
      WHERE dc.category_id = ? AND (d.visibility = 'public' OR d.author_id = ?)
      ORDER BY dc.sort_order ASC, d.updated_at DESC
    `, [cat.id, userId]) as any[];
    // Keep only latest version per title+author
    const latestMap = new Map<string, any>();
    for (const d of docs) {
      const key = `${d.title}|${d.author_id}`;
      const prev = latestMap.get(key);
      if (!prev || d.version > prev.version) latestMap.set(key, d);
    }
    categoryDocs[cat.id] = [...latestMap.values()];
    for (const d of categoryDocs[cat.id]) {
      allDocIds.add(d.id);
      assignedDocIds.add(d.id);
    }
  }

  // Uncategorized: latest version per title for non-public docs
  const allDocs = run('SELECT id, title, version, visibility FROM documents WHERE author_id = ? AND visibility != \'public\'', [userId]) as any[];
  const unassigned = allDocs.filter((d: any) => !assignedDocIds.has(d.id));
  const latestUncat = new Map<string, any>();
  for (const d of unassigned) {
    const key = `${d.title}|${d.author_id}`;
    const prev = latestUncat.get(key);
    if (!prev || d.version > prev.version) latestUncat.set(key, d);
  }
  const uncategorized = [...latestUncat.values()];

  const categoryCollections: Record<number, any[]> = {};
  for (const cat of categories) {
    const cols = run('SELECT * FROM collections WHERE category_id = ? ORDER BY sort_order ASC, name ASC', [cat.id]) as any[];
    for (const col of cols) {
      const colDocs = run(`
        SELECT d.id, d.title, d.version, d.author_id, d.visibility, dc.collection_sort_order
        FROM documents d
        JOIN document_categories dc ON d.id = dc.document_id
        WHERE dc.collection_id = ? AND (d.visibility = 'public' OR d.author_id = ?)
        ORDER BY dc.collection_sort_order ASC, d.updated_at DESC
      `, [col.id, userId]) as any[];
      // Keep only latest version per title
      const latestMap = new Map<string, any>();
      for (const d of colDocs) {
        const key = `${d.title}|${d.author_id}`;
        const prev = latestMap.get(key);
        if (!prev || d.version > prev.version) latestMap.set(key, d);
      }
      (col as any).documents = [...latestMap.values()].sort((a: any, b: any) => a.collection_sort_order - b.collection_sort_order);
    }
    categoryCollections[cat.id] = cols;
  }
  res.json({ categories, categoryDocs, uncategorized, categoryCollections });
});

// List all versions of a document by title
router.get('/versions/:title', authMiddleware, (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const versions = run(`
    SELECT d.id, d.title, d.version, d.visibility, d.created_at, d.updated_at,
      u.username as author_name
    FROM documents d
    LEFT JOIN users u ON d.author_id = u.id
    WHERE d.title = ? AND (d.visibility = 'public' OR d.author_id = ?)
    ORDER BY d.version DESC
  `, [req.params.title, userId]);
  res.json(versions);
});

// Diff between two versions of a document
router.get('/:id/diff', authMiddleware, (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { other } = req.query;
  if (!other) return res.status(400).json({ error: '需要 other 参数' });

  const current = run('SELECT id, title, version, content FROM documents WHERE id = ? AND (visibility = \'public\' OR author_id = ?)', [req.params.id, userId]) as any[];
  const otherDoc = run('SELECT id, title, version, content FROM documents WHERE id = ? AND (visibility = \'public\' OR author_id = ?)', [other, userId]) as any[];

  if (current.length === 0 || otherDoc.length === 0) {
    return res.status(404).json({ error: '文档不存在' });
  }

  res.json({
    current: { id: current[0].id, title: current[0].title, version: current[0].version },
    other: { id: otherDoc[0].id, title: otherDoc[0].title, version: otherDoc[0].version },
    currentContent: current[0].content || '',
    otherContent: otherDoc[0].content || '',
  });
});

router.get('/knowledge-index', authMiddleware, (req: AuthRequest, res: Response) => {
  const data = getIndexData(req.user!.id);
  res.json(data);
});

router.get('/search', authMiddleware, (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { q, tag } = req.query;
  const excludeSystem = req.query.excludeSystemCategories === 'true';
  let sql = `
    SELECT d.*, u.username as author_name, 
    GROUP_CONCAT(t.name) as tags,
    GROUP_CONCAT(DISTINCT c.id) as category_ids,
    COALESCE((SELECT COUNT(*) FROM document_views WHERE document_id = d.id), 0) as view_count,
    COALESCE((SELECT COUNT(*) FROM comments WHERE document_id = d.id), 0) as comment_count
    FROM documents d
    LEFT JOIN users u ON d.author_id = u.id
    LEFT JOIN document_tags dt ON d.id = dt.document_id
    LEFT JOIN tags t ON dt.tag_id = t.id AND t.user_id = ?
    LEFT JOIN document_categories dc ON d.id = dc.document_id
    LEFT JOIN categories c ON dc.category_id = c.id AND (c.user_id = ? OR c.is_system = 1)
    WHERE (d.visibility = 'public' OR d.author_id = ?)
  `;
  const params: any[] = [userId, userId, userId];
  if (excludeSystem) {
    sql += ' AND (NOT EXISTS (SELECT 1 FROM document_categories dc3 WHERE dc3.document_id = d.id) OR EXISTS (SELECT 1 FROM document_categories dc3 JOIN categories c3 ON dc3.category_id = c3.id WHERE dc3.document_id = d.id AND c3.is_system = 0))';
  }
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

router.get('/query', authMiddleware, (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { q, limit: limitParam, offset: offsetParam, min_score, full, related, explain: explainParam } = req.query;
  if (!q) {
    return res.status(400).json({ error: '请提供搜索关键词 q' });
  }

  const limit = Math.min(parseInt(limitParam as string) || 10, 100);
  const offset = parseInt(offsetParam as string) || 0;
  const minScore = parseFloat(min_score as string) || 0;
  const includeFull = full === 'true';
  const includeRelated = related === 'true';
  const includeExplain = explainParam === 'true';

  try {
    const ftsQuery = (q as string).replace(/[^\w\u4e00-\u9fff\s\-*"']/g, ' ').trim();
    if (!ftsQuery) {
      return res.json({ query: q, total: 0, results: [] });
    }

    const countResult = run(`
      SELECT COUNT(*) as total FROM (
        SELECT 1 FROM documents_fts, documents d
        WHERE documents_fts MATCH ? AND documents_fts.rowid = d.id AND (d.visibility = 'public' OR d.author_id = ?)
      )
    `, [ftsQuery, userId]);
    const total = countResult[0]?.total || 0;

    type ScoreRow = { rowid: number; score: number };
    const scored = run(`
      SELECT rowid, -rank as score FROM documents_fts
      WHERE documents_fts MATCH ?
      ORDER BY score DESC
      LIMIT ? OFFSET ?
    `, [ftsQuery, limit, offset]) as ScoreRow[];

    if (scored.length === 0) {
      return res.json({ query: q, total: 0, results: [] });
    }

    const ids = scored.map(r => r.rowid);
    const idParams = ids.map(() => '?').join(',');

    const rows = run(`
      SELECT d.id, d.title, d.version${includeFull ? ', d.content' : ''}, d.author_id,
        d.visibility, d.created_at, d.updated_at,
        u.username as author_name,
        GROUP_CONCAT(t.name) as tags,
        GROUP_CONCAT(DISTINCT c.id) as category_ids,
        GROUP_CONCAT(DISTINCT c.name) as category_names,
        COALESCE((SELECT COUNT(*) FROM document_views WHERE document_id = d.id), 0) as view_count,
        COALESCE((SELECT COUNT(*) FROM comments WHERE document_id = d.id), 0) as comment_count
      FROM documents d
      LEFT JOIN users u ON d.author_id = u.id
      LEFT JOIN document_tags dt ON d.id = dt.document_id
      LEFT JOIN tags t ON dt.tag_id = t.id AND t.user_id = ?
      LEFT JOIN document_categories dc ON d.id = dc.document_id
      LEFT JOIN categories c ON dc.category_id = c.id AND (c.user_id = ? OR c.is_system = 1)
      WHERE d.id IN (${idParams}) AND (d.visibility = 'public' OR d.author_id = ?)
      GROUP BY d.id
    `, [userId, userId, ...ids, userId]) as any[];

    const scoreMap = new Map(scored.map(r => [r.rowid, r.score]));
    const output: any[] = [];

    for (const row of rows) {
      const entry: any = {
        id: row.id,
        title: row.title,
        version: row.version || 0,
        score: scoreMap.get(row.id) || 0,
        author_name: row.author_name,
        tags: row.tags || null,
        category_ids: row.category_ids || null,
        category_names: row.category_names || null,
        view_count: row.view_count,
        comment_count: row.comment_count,
      };

      if (!row.content) {
        const contentRow = run('SELECT content FROM documents WHERE id = ?', [row.id]) as any[];
        const content = (contentRow[0]?.content || '');
        if (!includeFull) {
          entry.snippet = content.length > 300 ? content.substring(0, 300) + '...' : content;
        } else {
          entry.content = content;
        }
      } else {
        if (!includeFull) {
          entry.snippet = row.content.length > 300 ? row.content.substring(0, 300) + '...' : row.content;
        } else {
          entry.content = row.content;
        }
      }

      if (includeExplain) {
        entry.explain = {
          method: 'FTS5 BM25',
          query: ftsQuery,
          raw_rank: -entry.score,
        };
      }

      if (includeRelated && entry.category_ids) {
        const catIds = (entry.category_ids as string).split(',').map(Number);
        const catNames = entry.category_names ? (entry.category_names as string).split(',') : [];
        const sameCat: { id: number; title: string; category: string }[] = [];

        for (let i = 0; i < catIds.length; i++) {
          const catDocs = run(`
            SELECT DISTINCT d.id, d.title FROM documents d
            JOIN document_categories dc ON d.id = dc.document_id
            WHERE dc.category_id = ? AND d.id != ? AND (d.visibility = 'public' OR d.author_id = ?)
            LIMIT 5
          `, [catIds[i], row.id, userId]) as any[];
          for (const cd of catDocs) {
            sameCat.push({ id: cd.id, title: cd.title, category: catNames[i] || '' });
          }
        }

        entry.related = { same_category: sameCat, wiki_links: [] };
      }

      output.push(entry);
    }

    output.sort((a, b) => (b.score || 0) - (a.score || 0));

    res.json({ query: q, total, results: output });
  } catch (e: any) {
    res.status(500).json({ error: '搜索失败', detail: e.message });
  }
});

router.get('/', authMiddleware, (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const sort = req.query.sort || 'updated_at';
  const pageParam = req.query.page;
  const pageSizeParam = req.query.pageSize;
  const usePagination = pageParam !== undefined || pageSizeParam !== undefined;
  const page = usePagination ? Math.max(1, parseInt(pageParam as string) || 1) : 1;
  const pageSize = usePagination ? Math.max(1, Math.min(100, parseInt(pageSizeParam as string) || 5)) : null;
  const offset = pageSize ? (page - 1) * pageSize : 0;
  const classified = req.query.classified === 'true';
  const excludeSystem = req.query.excludeSystemCategories === 'true';
  
  const orderBy = sort === 'popular' 
    ? 'ORDER BY view_count DESC, comment_count DESC, d.updated_at DESC'
    : 'ORDER BY d.updated_at DESC';
  
  const totalSql = `
    SELECT COUNT(*) as count FROM documents d
    WHERE (visibility = 'public' OR author_id = ?)
    ${classified ? `AND (EXISTS (SELECT 1 FROM document_categories dc2 JOIN categories c2 ON dc2.category_id = c2.id WHERE dc2.document_id = d.id AND (c2.user_id = ? OR c2.is_system = 1)) OR EXISTS (SELECT 1 FROM document_tags dt2 JOIN tags t2 ON dt2.tag_id = t2.id WHERE dt2.document_id = d.id AND t2.user_id = ?))` : ''}
    ${excludeSystem ? `AND (NOT EXISTS (SELECT 1 FROM document_categories dc3 WHERE dc3.document_id = d.id) OR EXISTS (SELECT 1 FROM document_categories dc3 JOIN categories c3 ON dc3.category_id = c3.id WHERE dc3.document_id = d.id AND c3.is_system = 0))` : ''}
  `
  const totalParams = classified ? [userId, userId, userId] : [userId]
  const total = usePagination ? run(totalSql, totalParams)[0].count : null;
  
  const docs = run(`
    SELECT d.*, u.username as author_name,
    GROUP_CONCAT(DISTINCT t.name) as tags,
    GROUP_CONCAT(DISTINCT c.id) as category_ids,
    COALESCE((SELECT COUNT(*) FROM document_views WHERE document_id = d.id), 0) as view_count,
    COALESCE((SELECT COUNT(*) FROM comments WHERE document_id = d.id), 0) as comment_count,
    COALESCE((SELECT 1 FROM likes WHERE document_id = d.id AND user_id = ?), 0) as liked,
    (SELECT dc2.collection_id FROM document_categories dc2 WHERE dc2.document_id = d.id AND dc2.collection_id IS NOT NULL LIMIT 1) as collection_id,
    (SELECT col2.name FROM document_categories dc2 LEFT JOIN collections col2 ON dc2.collection_id = col2.id WHERE dc2.document_id = d.id AND dc2.collection_id IS NOT NULL LIMIT 1) as collection_name
    FROM documents d
    LEFT JOIN users u ON d.author_id = u.id
    LEFT JOIN document_tags dt ON d.id = dt.document_id
    LEFT JOIN tags t ON dt.tag_id = t.id AND t.user_id = ?
    LEFT JOIN document_categories dc ON d.id = dc.document_id
    LEFT JOIN categories c ON dc.category_id = c.id AND (c.user_id = ? OR c.is_system = 1)
    WHERE (d.visibility = 'public' OR d.author_id = ?)
    ${classified ? `AND (EXISTS (SELECT 1 FROM document_categories dc2 JOIN categories c2 ON dc2.category_id = c2.id WHERE dc2.document_id = d.id AND (c2.user_id = ? OR c2.is_system = 1)) OR EXISTS (SELECT 1 FROM document_tags dt2 JOIN tags t2 ON dt2.tag_id = t2.id WHERE dt2.document_id = d.id AND t2.user_id = ?))` : ''}
    ${excludeSystem ? `AND (NOT EXISTS (SELECT 1 FROM document_categories dc3 WHERE dc3.document_id = d.id) OR EXISTS (SELECT 1 FROM document_categories dc3 JOIN categories c3 ON dc3.category_id = c3.id WHERE dc3.document_id = d.id AND c3.is_system = 0))` : ''}
    GROUP BY d.id
    ORDER BY liked DESC, ${orderBy.replace('ORDER BY ', '')}
    ${pageSize ? 'LIMIT ? OFFSET ?' : ''}
  `, (() => {
    const params: any[] = [userId, userId, userId, userId]
    if (classified) params.push(userId, userId)
    if (pageSize) params.push(pageSize, offset)
    return params
  })());
  
  const result = docs.map((d: any) => {
    const category_ids = d.category_ids ? d.category_ids.split(',').map((id: string) => parseInt(id)).filter((id: number) => !isNaN(id)) : []
    return { 
      ...d, 
      category_ids,
      view_count: d.view_count || 0,
      comment_count: d.comment_count || 0
    }
  })
  if (usePagination) {
    res.json({ docs: result, total, page, pageSize });
  } else {
    res.json(result);
  }
});

router.get('/graph', authMiddleware, (req: AuthRequest, res: Response) => {
  const userId = req.user!.id
  // Latest version per title
  const docs = run(`
    SELECT d.id, d.title, d.version FROM documents d
    INNER JOIN (
      SELECT title, author_id, MAX(version) as maxv FROM documents
      WHERE visibility = 'public' OR author_id = ?
      GROUP BY title, author_id
    ) l ON d.title = l.title AND d.author_id = l.author_id AND d.version = l.maxv
  `, [userId]) as any[];
  const allDocs = run(`
    SELECT d.id, d.content FROM documents d
    INNER JOIN (
      SELECT title, author_id, MAX(version) as maxv FROM documents
      WHERE visibility = 'public' OR author_id = ?
      GROUP BY title, author_id
    ) l ON d.title = l.title AND d.author_id = l.author_id AND d.version = l.maxv
  `, [userId]) as any[];
  // Only keep [[wiki link]] edges — tag/category edges create too much noise
  const links: any[] = [];
  const linkSet = new Set<string>();
  for (const doc of allDocs) {
    const matches = (doc.content || '').match(/\[\[([^\]]+)\]\]/g) || [];
    for (const match of matches) {
      const inner = match.replace('[[', '').replace(']]', '');
      // Support [[Title(v2)]] syntax
      const verMatch = inner.match(/^(.+)\(v(\d+)\)$/);
      const title = verMatch ? verMatch[1] : inner;
      const version = verMatch ? parseInt(verMatch[2]) : undefined;
      const target = version
        ? docs.find(d => d.title === title && d.version === version)
        : docs.find(d => d.title === title);
      if (target) {
        const key = `${Math.min(doc.id, target.id)}-${Math.max(doc.id, target.id)}`
        if (!linkSet.has(key)) {
          linkSet.add(key)
          links.push({ source: doc.id, target: target.id, type: 'link', label: '[[引用]]' });
        }
      }
    }
  }
  
  // Per-node categories (for coloring)
  const docCats = run(`
    SELECT dc.document_id, c.name, c.color
    FROM document_categories dc
    JOIN categories c ON dc.category_id = c.id
    WHERE dc.document_id IN (SELECT id FROM documents WHERE visibility = 'public' OR author_id = ?)
  `, [userId]) as any[];
  const nodeCategories: Record<number, { name: string; color: string }[]> = {};
  for (const row of docCats) {
    if (!nodeCategories[row.document_id]) nodeCategories[row.document_id] = [];
    nodeCategories[row.document_id].push({ name: row.name, color: row.color });
  }
  
  // Per-node tags (for secondary coloring)
  const docTagsForMeta = run(`
    SELECT dt.document_id, t.name as tag_name
    FROM document_tags dt
    JOIN tags t ON dt.tag_id = t.id
    WHERE dt.document_id IN (SELECT id FROM documents WHERE visibility = 'public' OR author_id = ?)
  `, [userId]) as any[];
  const nodeTagsMap: Record<number, string[]> = {};
  for (const dt of docTagsForMeta) {
    if (!nodeTagsMap[dt.document_id]) nodeTagsMap[dt.document_id] = [];
    nodeTagsMap[dt.document_id].push(dt.tag_name);
  }
  
  // Total degree count (for node size)
  const degreeCount: Record<number, number> = {};
  for (const link of links) {
    degreeCount[link.source] = (degreeCount[link.source] || 0) + 1;
    degreeCount[link.target] = (degreeCount[link.target] || 0) + 1;
  }

  // Count documents not exclusively in system categories
  const systemOnlyCount = run(`
    SELECT COUNT(*) as cnt FROM (
      SELECT d.id FROM documents d
      WHERE (d.visibility = 'public' OR d.author_id = ?)
      AND d.id IN (
        SELECT dc.document_id FROM document_categories dc
        JOIN categories c ON dc.category_id = c.id
        WHERE c.is_system = 1
      )
      AND d.id NOT IN (
        SELECT dc2.document_id FROM document_categories dc2
        JOIN categories c2 ON dc2.category_id = c2.id
        WHERE c2.is_system = 0
      )
    )
  `, [userId]) as any[];
  const totalCount = docs.length - (systemOnlyCount[0]?.cnt || 0);

  res.json({
    nodes: docs.map(d => ({
      id: d.id,
      name: d.title,
      val: Math.max(1, degreeCount[d.id] || 0),
      categories: nodeCategories[d.id] || [],
      tags: nodeTagsMap[d.id] || []
    })),
    links,
    totalCount
  });
});

router.get('/tree', authMiddleware, (req: AuthRequest, res: Response) => {
  const rootFolders = storage.listFolders('/');
  const result: any[] = [];
  for (const folder of rootFolders) {
    const docs = storage.listDocuments(`/${folder}`);
    const subFolders = storage.listFolders(`/${folder}`);
    result.push({ 
      name: folder, 
      type: 'folder', 
      children: [
        ...subFolders.map(f => ({ name: f, type: 'folder' })),
        ...docs.map(d => ({ name: d, type: 'file' }))
      ] 
    });
  }
  const rootDocs = storage.listDocuments('/');
  result.push(...rootDocs.map(d => ({ name: d, type: 'file' })));
  res.json(result);
});

router.get('/:id', authMiddleware, (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const docs = run(`
    SELECT d.*, u.username as author_name,
    GROUP_CONCAT(t.name) as tags,
    GROUP_CONCAT(DISTINCT c.id) as category_ids,
    GROUP_CONCAT(DISTINCT c.name) as category_names
    FROM documents d
    LEFT JOIN users u ON d.author_id = u.id
    LEFT JOIN document_tags dt ON d.id = dt.document_id
    LEFT JOIN tags t ON dt.tag_id = t.id AND t.user_id = ?
    LEFT JOIN document_categories dc ON d.id = dc.document_id
    LEFT JOIN categories c ON dc.category_id = c.id AND c.user_id = ?
    WHERE d.id = ? AND (d.visibility = 'public' OR d.author_id = ?)
    GROUP BY d.id
  `, [userId, userId, req.params.id, userId]);
  const doc = docs[0];
  if (!doc) {
    return res.status(404).json({ error: '文档不存在' });
  }
  res.json(doc);
});

router.post('/', authMiddleware, roleMiddleware(['admin', 'editor']), (req: AuthRequest, res: Response) => {
  const { title, version = 0, folder_path, content, visibility = 'private' } = req.body;
  if (!title) {
    return res.status(400).json({ error: '标题必填' });
  }
  const existing = run('SELECT id FROM documents WHERE title = ? AND version = ? AND author_id = ?', [title, version, req.user!.id]);
  if (existing.length > 0) {
    return res.status(409).json({ error: '标题和版本号已存在' });
  }
  const id = runInsert(
    'INSERT INTO documents (title, version, folder_path, content, author_id, visibility) VALUES (?, ?, ?, ?, ?, ?)',
    [title, version, folder_path || '/', content || '', req.user!.id, visibility]
  );
  storage.writeDocument(folder_path || '/', `${title}${version > 0 ? `_v${version}` : ''}`, content || '');
  rebuildUserIndex(req.user!.id);
  res.json({ id, title, version, folder_path: folder_path || '/', visibility });
});

// Create new version of an existing document
router.post('/:id/versions', authMiddleware, roleMiddleware(['admin', 'editor']), (req: AuthRequest, res: Response) => {
  const docs = run('SELECT * FROM documents WHERE id = ?', [req.params.id]);
  const doc = docs[0];
  if (!doc) return res.status(404).json({ error: '文档不存在' });
  if (req.user!.role !== 'admin' && doc.author_id !== req.user!.id) return res.status(403).json({ error: '权限不足' });

  // Find max version for this title+author
  const maxVer = run('SELECT MAX(version) as mv FROM documents WHERE title = ? AND author_id = ?', [doc.title, req.user!.id]);
  const newVersion = (maxVer[0]?.mv || 0) + 1;

  const id = runInsert(
    'INSERT INTO documents (title, version, folder_path, content, author_id, visibility) VALUES (?, ?, ?, ?, ?, ?)',
    [doc.title, newVersion, doc.folder_path, doc.content, req.user!.id, doc.visibility]
  );
  runUpdate('INSERT INTO document_categories (document_id, category_id) SELECT ?, category_id FROM document_categories WHERE document_id = ?', [id, doc.id]);
  const tags = run('SELECT tag_id FROM document_tags WHERE document_id = ?', [doc.id]) as any[];
  for (const t of tags) {
    runInsert('INSERT OR IGNORE INTO document_tags (document_id, tag_id) VALUES (?, ?)', [id, t.tag_id]);
  }
  rebuildUserIndex(req.user!.id);
  res.json({ id, title: doc.title, version: newVersion });
});

router.put('/:id', authMiddleware, roleMiddleware(['admin', 'editor']), async (req: AuthRequest, res: Response) => {
  const { title, content, folder_path, visibility } = req.body;
  const docs = run('SELECT * FROM documents WHERE id = ?', [req.params.id]);
  const doc = docs[0];
  if (!doc) {
    return res.status(404).json({ error: '文档不存在' });
  }
  if (req.user!.role !== 'admin' && doc.author_id !== req.user!.id) {
    return res.status(403).json({ error: '权限不足' });
  }

  const newTitle = title || doc.title;

  if (newTitle !== doc.title) {
    // Check duplicate title+version (excluding self)
    const dup = run('SELECT id FROM documents WHERE title = ? AND version = ? AND author_id = ? AND id != ?', [newTitle, doc.version, req.user!.id, req.params.id]);
    if (dup.length > 0) {
      return res.status(409).json({ error: '标题和版本号已存在' });
    }
    // Update wiki links in all other documents
    const oldTitle = doc.title;
    const allDocs = run('SELECT id, content FROM documents WHERE id != ? AND content LIKE ?', [req.params.id, `%[[${escapeSqlLike(oldTitle)}]]%`]);
    for (const other of allDocs) {
      if (!other.content) continue;
      const updatedContent = other.content.replaceAll(`[[${oldTitle}]]`, `[[${newTitle}]]`);
      if (updatedContent !== other.content) {
        runUpdate('UPDATE documents SET content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [updatedContent, other.id]);
      }
    }
  }

  let finalContent = content;
  if (content !== undefined) {
    try {
      finalContent = await processContentImages(String(req.params.id), content);
    } catch (e) {
      console.error('[image-dl] 处理图片失败:', e);
      finalContent = content;
    }
    // Auto-link matching system category document titles
    const docId = parseInt(req.params.id);
    finalContent = autoLinkContent(finalContent, docId, req.user!.id);
  }

  if (finalContent !== doc.content) {
    runInsert(
      'INSERT INTO document_versions (document_id, content, author_id, message) VALUES (?, ?, ?, ?)',
      [req.params.id, doc.content, req.user!.id, '自动保存版本']
    );
    // Cap auto-save history at 2 entries per document
    runUpdate('DELETE FROM document_versions WHERE id NOT IN (SELECT id FROM document_versions WHERE document_id = ? ORDER BY created_at DESC LIMIT 2) AND document_id = ?', [req.params.id, req.params.id]);
  }
  runUpdate(
    'UPDATE documents SET title = ?, content = ?, folder_path = ?, visibility = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [newTitle, finalContent ?? doc.content, folder_path ?? doc.folder_path, visibility ?? doc.visibility, req.params.id]
  );
  if (finalContent !== undefined) {
    storage.writeDocument(folder_path ?? doc.folder_path, newTitle, finalContent);
  }
  rebuildUserIndex(req.user!.id);
  res.json({ success: true });
});

router.delete('/:id', authMiddleware, (req: AuthRequest, res: Response) => {
  const docs = run('SELECT * FROM documents WHERE id = ?', [req.params.id]);
  const doc = docs[0];
  if (!doc) {
    return res.status(404).json({ error: '文档不存在' });
  }
  if (req.user!.role !== 'admin' && doc.author_id !== req.user!.id) {
    return res.status(403).json({ error: '权限不足' });
  }
  const docTitle = doc.title;

  // Only clean up wiki references if no other documents with this title exist
  const othersWithTitle = run('SELECT id FROM documents WHERE title = ? AND id != ?', [docTitle, req.params.id]);
  if (othersWithTitle.length === 0) {
    const refDocs = run('SELECT id, content FROM documents WHERE id != ? AND content LIKE ?', [req.params.id, `%[[${escapeSqlLike(docTitle)}]]%`]);
    for (const ref of refDocs) {
      if (!ref.content) continue;
      const updatedContent = ref.content.replaceAll(`[[${docTitle}]]`, docTitle);
      if (updatedContent !== ref.content) {
        runUpdate('UPDATE documents SET content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [updatedContent, ref.id]);
      }
    }
  }

  runUpdate('DELETE FROM document_versions WHERE document_id = ?', [req.params.id]);
  runUpdate('DELETE FROM documents WHERE id = ?', [req.params.id]);
  try { storage.deleteDocument(doc.folder_path, doc.title); } catch {}
  rebuildUserIndex(req.user!.id);
  res.json({ success: true });
});

// Set document's collection (also updates all versions with same title+author)
router.post('/:id/collection', authMiddleware, (req: AuthRequest, res: Response) => {
  const { collection_id } = req.body;
  const docs = run('SELECT * FROM documents WHERE id = ?', [req.params.id]) as any[];
  if (docs.length === 0) return res.status(404).json({ error: '文档不存在' });
  const doc = docs[0];
  if (req.user!.role !== 'admin' && doc.author_id !== req.user!.id) return res.status(403).json({ error: '权限不足' });
  const col = run('SELECT c.*, cat.is_system FROM collections c JOIN categories cat ON c.category_id = cat.id WHERE c.id = ?', [collection_id]) as any[];
  if (col.length === 0) return res.status(404).json({ error: '合集不存在' });
  if (col[0].is_system && req.user!.role !== 'admin') return res.status(403).json({ error: '权限不足' });
  // Find all versions of this document
  const allVersions = run('SELECT id FROM documents WHERE title = ? AND author_id = ?', [doc.title, doc.author_id]) as any[];
  for (const v of allVersions) {
    const dc = run('SELECT * FROM document_categories WHERE document_id = ?', [v.id]) as any[];
    if (dc.length > 0 && dc[0].category_id !== col[0].category_id) return res.status(400).json({ error: '文档的分类与合集不匹配' });
    if (dc.length > 0) {
      runUpdate('UPDATE document_categories SET collection_id = ? WHERE document_id = ?', [collection_id, v.id]);
    } else {
      runInsert('INSERT INTO document_categories (document_id, collection_id, category_id) VALUES (?, ?, ?)', [v.id, collection_id, col[0].category_id]);
    }
  }
  res.json({ success: true });
});

// Remove document from collection (also removes all versions with same title+author)
router.delete('/:id/collection', authMiddleware, (req: AuthRequest, res: Response) => {
  const docs = run('SELECT * FROM documents WHERE id = ?', [req.params.id]) as any[];
  if (docs.length === 0) return res.status(404).json({ error: '文档不存在' });
  const doc = docs[0];
  // Check if document's collection belongs to a system category
  const cols = run(`SELECT cat.is_system FROM document_categories dc JOIN categories cat ON dc.category_id = cat.id WHERE dc.document_id = ? AND dc.collection_id IS NOT NULL`, [req.params.id]) as any[];
  if (cols.length > 0 && cols[0].is_system && req.user!.role !== 'admin') return res.status(403).json({ error: '权限不足' });
  // Remove collection from all versions
  const allVersions = run('SELECT id FROM documents WHERE title = ? AND author_id = ?', [doc.title, doc.author_id]) as any[];
  for (const v of allVersions) {
    runUpdate('UPDATE document_categories SET collection_id = NULL, collection_sort_order = 0 WHERE document_id = ?', [v.id]);
  }
  res.json({ success: true });
});

export default router;