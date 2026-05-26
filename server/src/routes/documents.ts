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
  const urlMap = new Map<string, string>();

  const mdRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  let match;
  while ((match = mdRegex.exec(content)) !== null) {
    const url = match[2];
    if (isExternalUrl(url) && !urlMap.has(url)) {
      try {
        const localPath = await downloadImage(docId, url);
        urlMap.set(url, localPath);
      } catch (e) {
        console.error(`[image-dl] ${url.substring(0, 60)}:`, (e as Error).message);
      }
    }
  }

  const htmlRegex = /<img[^>]+src="([^"]+)"[^>]*>/g;
  while ((match = htmlRegex.exec(content)) !== null) {
    const url = match[1];
    if (isExternalUrl(url) && !urlMap.has(url)) {
      try {
        const localPath = await downloadImage(docId, url);
        urlMap.set(url, localPath);
      } catch (e) {
        console.error(`[image-dl] ${url.substring(0, 60)}:`, (e as Error).message);
      }
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
    runUpdate('UPDATE documents SET content = ?, updated_at = datetime("now") WHERE id = ?', [content, docs[0].id]);
    res.json({ success: true });
  } else {
    res.status(404).json({ error: '文档不存在' });
  }
});

router.get('/sidebar-data', authMiddleware, (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const userCats = run('SELECT * FROM categories WHERE user_id = ? ORDER BY name', [userId]) as any[];
  const systemCats = run('SELECT * FROM categories WHERE is_system = 1 ORDER BY name') as any[];
  const categories = [...userCats, ...systemCats];

  const categoryDocs: Record<number, any[]> = {};
  const allDocIds = new Set<number>();
  const assignedDocIds = new Set<number>();

  for (const cat of categories) {
    const docs = run(`
      SELECT d.id, d.title, d.visibility, dc.sort_order
      FROM documents d
      JOIN document_categories dc ON d.id = dc.document_id
      WHERE dc.category_id = ? AND (d.visibility = 'public' OR d.author_id = ?)
      ORDER BY dc.sort_order ASC, d.updated_at DESC
    `, [cat.id, userId]) as any[];
    categoryDocs[cat.id] = docs;
    for (const d of docs) {
      allDocIds.add(d.id);
      assignedDocIds.add(d.id);
    }
  }

  // Uncategorized: all non-public docs not in any category
  const allDocs = run('SELECT id, title, visibility FROM documents WHERE author_id = ? AND visibility != \'public\'', [userId]) as any[];
  const uncategorized = allDocs.filter((d: any) => !assignedDocIds.has(d.id));

  res.json({ categories, categoryDocs, uncategorized });
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
    COALESCE((SELECT 1 FROM likes WHERE document_id = d.id AND user_id = ?), 0) as liked
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
  const docs = run('SELECT id, title FROM documents WHERE visibility = "public" OR author_id = ?', [userId]) as any[];
  const allDocs = run('SELECT id, content FROM documents WHERE visibility = "public" OR author_id = ?', [userId]) as any[];
  const links: any[] = [];
  const linkSet = new Set<string>();
  
  // Link by [[document title]] syntax
  for (const doc of allDocs) {
    const matches = (doc.content || '').match(/\[\[([^\]]+)\]\]/g) || [];
    for (const match of matches) {
      const title = match.replace('[[', '').replace(']]', '');
      const target = docs.find(d => d.title === title);
      if (target) {
        const key = `${Math.min(doc.id, target.id)}-${Math.max(doc.id, target.id)}`
        if (!linkSet.has(key)) {
          linkSet.add(key)
          links.push({ source: doc.id, target: target.id, type: 'link' });
        }
      }
    }
  }
  
  // Link by shared tags
  const docTags = run(`
    SELECT dt.document_id, t.name as tag_name
    FROM document_tags dt
    JOIN tags t ON dt.tag_id = t.id
    WHERE dt.document_id IN (SELECT id FROM documents WHERE visibility = 'public' OR author_id = ?)
  `, [userId]) as any[];
  
  const tagDocs: Record<string, number[]> = {}
  for (const dt of docTags) {
    if (!tagDocs[dt.tag_name]) tagDocs[dt.tag_name] = []
    tagDocs[dt.tag_name].push(dt.document_id)
  }
  
  for (const tagName in tagDocs) {
    const docIds = tagDocs[tagName]
    for (let i = 0; i < docIds.length; i++) {
      for (let j = i + 1; j < docIds.length; j++) {
        const key = `${Math.min(docIds[i], docIds[j])}-${Math.max(docIds[i], docIds[j])}`
        if (!linkSet.has(key)) {
          linkSet.add(key)
          links.push({ source: docIds[i], target: docIds[j], type: 'tag', label: tagName })
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
  const nodeTagsMap: Record<number, string[]> = {};
  for (const dt of docTags) {
    if (!nodeTagsMap[dt.document_id]) nodeTagsMap[dt.document_id] = [];
    nodeTagsMap[dt.document_id].push(dt.tag_name);
  }
  
  // Incoming link count (for node size)
  const incomingCount: Record<number, number> = {};
  for (const link of links) {
    incomingCount[link.target] = (incomingCount[link.target] || 0) + 1;
  }
  
  const linkedIds = new Set<number>();
  for (const link of links) {
    linkedIds.add(link.source);
    linkedIds.add(link.target);
  }
  const linkedDocs = docs.filter(d => linkedIds.has(d.id));
  res.json({
    nodes: linkedDocs.map(d => ({
      id: d.id,
      name: d.title,
      val: (incomingCount[d.id] || 0) + 1,
      categories: nodeCategories[d.id] || [],
      tags: nodeTagsMap[d.id] || []
    })),
    links
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
  const { title, folder_path, content, visibility = 'private' } = req.body;
  if (!title) {
    return res.status(400).json({ error: '标题必填' });
  }
  const id = runInsert(
    'INSERT INTO documents (title, folder_path, content, author_id, visibility) VALUES (?, ?, ?, ?, ?)',
    [title, folder_path || '/', content || '', req.user!.id, visibility]
  );
  storage.writeDocument(folder_path || '/', title, content || '');
  rebuildUserIndex(req.user!.id);
  res.json({ id, title, folder_path: folder_path || '/', visibility });
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
  }
  runUpdate(
    'UPDATE documents SET title = ?, content = ?, folder_path = ?, visibility = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [title || doc.title, finalContent ?? doc.content, folder_path ?? doc.folder_path, visibility ?? doc.visibility, req.params.id]
  );
  if (finalContent !== undefined) {
    storage.writeDocument(folder_path ?? doc.folder_path, title ?? doc.title, finalContent);
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
  runUpdate('DELETE FROM documents WHERE id = ?', [req.params.id]);
  storage.deleteDocument(doc.folder_path, doc.title);
  rebuildUserIndex(req.user!.id);
  res.json({ success: true });
});

export default router;