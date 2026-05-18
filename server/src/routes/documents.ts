import { Router, Response } from 'express';
import { run, runInsert, runUpdate } from '../db';
import { authMiddleware, AuthRequest, roleMiddleware } from '../middleware/auth';
import { storage } from '../utils/storage';

const router = Router();

storage.ensureDir();

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

router.get('/search', authMiddleware, (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { q, tag } = req.query;
  let sql = `
    SELECT d.*, u.username as author_name, 
    GROUP_CONCAT(t.name) as tags,
    GROUP_CONCAT(DISTINCT c.id) as category_ids,
    COALESCE((SELECT COUNT(*) FROM document_views WHERE document_id = d.id), 0) as view_count,
    COALESCE((SELECT COUNT(*) FROM comments WHERE document_id = d.id), 0) as comment_count
    FROM documents d
    LEFT JOIN users u ON d.author_id = u.id
    LEFT JOIN document_tags dt ON d.id = dt.document_id
    LEFT JOIN tags t ON dt.tag_id = t.id
    LEFT JOIN document_categories dc ON d.id = dc.document_id
    LEFT JOIN categories c ON dc.category_id = c.id
    WHERE (d.visibility = 'public' OR d.author_id = ?)
  `;
  const params: any[] = [userId];
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
  
  res.json({ nodes: docs.map(d => ({ id: d.id, name: d.title })), links });
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
    LEFT JOIN tags t ON dt.tag_id = t.id
    LEFT JOIN document_categories dc ON d.id = dc.document_id
    LEFT JOIN categories c ON dc.category_id = c.id
    WHERE d.id = ? AND (d.visibility = 'public' OR d.author_id = ?)
    GROUP BY d.id
  `, [req.params.id, userId]);
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
  res.json({ id, title, folder_path: folder_path || '/', visibility });
});

router.put('/:id', authMiddleware, roleMiddleware(['admin', 'editor']), (req: AuthRequest, res: Response) => {
  const { title, content, folder_path, visibility } = req.body;
  const docs = run('SELECT * FROM documents WHERE id = ?', [req.params.id]);
  const doc = docs[0];
  if (!doc) {
    return res.status(404).json({ error: '文档不存在' });
  }
  if (req.user!.role !== 'admin' && doc.author_id !== req.user!.id) {
    return res.status(403).json({ error: '权限不足' });
  }
  if (content !== undefined && content !== doc.content) {
    runInsert(
      'INSERT INTO document_versions (document_id, content, author_id, message) VALUES (?, ?, ?, ?)',
      [req.params.id, doc.content, req.user!.id, '自动保存版本']
    );
  }
  runUpdate(
    'UPDATE documents SET title = ?, content = ?, folder_path = ?, visibility = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [title || doc.title, content ?? doc.content, folder_path ?? doc.folder_path, visibility ?? doc.visibility, req.params.id]
  );
  if (content !== undefined) {
    storage.writeDocument(folder_path ?? doc.folder_path, title ?? doc.title, content);
  }
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
  res.json({ success: true });
});

export default router;