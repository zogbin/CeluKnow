import { Router, Response } from 'express';
import { run, runInsert, runUpdate } from '../db';
import { authMiddleware, AuthRequest, roleMiddleware } from '../middleware/auth';
import { getSystemCategoryIds, rebuildUserIndex } from '../utils/indexHelper';

const router = Router();

router.get('/', authMiddleware, (req: AuthRequest, res: Response) => {
  const userCats = run('SELECT * FROM categories WHERE user_id = ? ORDER BY name', [req.user!.id]) as any[];
  const systemCats = run('SELECT * FROM categories WHERE is_system = 1 ORDER BY name') as any[];
  const catMap = new Map<string, any>();
  for (const cat of systemCats) catMap.set(cat.name, cat);
  for (const cat of userCats) catMap.set(cat.name, cat);
  res.json([...catMap.values()]);
});

router.post('/', authMiddleware, roleMiddleware(['admin', 'editor']), (req: AuthRequest, res: Response) => {
  const { name, color, icon } = req.body;
  if (!name) {
    return res.status(400).json({ error: '分类名称必填' });
  }
  const reservedNames = ['entities', 'concepts'];
  if (reservedNames.includes(name) && req.user!.role !== 'admin') {
    return res.status(403).json({ error: '只有管理员可创建系统分类' });
  }
  try {
    const id = runInsert('INSERT INTO categories (name, user_id, color, icon) VALUES (?, ?, ?, ?)', [
      name, req.user!.id, color || '#6366F1', icon || 'folder'
    ]);
    rebuildUserIndex(req.user!.id);
    res.json({ id, name, color: color || '#6366F1', icon: icon || 'folder' });
  } catch (err: any) {
    if (err.message?.includes('UNIQUE constraint failed')) {
      res.status(400).json({ error: '分类已存在' });
    } else {
      res.status(500).json({ error: err.message });
    }
  }
});

router.put('/:id', authMiddleware, roleMiddleware(['admin', 'editor']), (req: AuthRequest, res: Response) => {
  const { name, color, icon } = req.body;
  const cats = run('SELECT * FROM categories WHERE id = ?', [req.params.id]) as any[];
  if (cats.length === 0) {
    return res.status(404).json({ error: '分类不存在' });
  }
  const cat = cats[0];
  if (cat.is_system && req.user!.role !== 'admin') {
    return res.status(403).json({ error: '只有管理员可修改系统分类' });
  }
  if (!cat.is_system && cat.user_id !== req.user!.id) {
    return res.status(404).json({ error: '分类不存在' });
  }
  runUpdate('UPDATE categories SET name = ?, color = ?, icon = ? WHERE id = ?', [
    name, color, icon, req.params.id
  ]);
  res.json({ success: true });
});

router.delete('/:id', authMiddleware, (req: AuthRequest, res: Response) => {
  const userRole = req.user!.role;
  const cats = run('SELECT * FROM categories WHERE id = ?', [req.params.id]) as any[];
  if (cats.length === 0) {
    return res.status(404).json({ error: '分类不存在' });
  }
  const cat = cats[0];
  if (cat.is_system && userRole !== 'admin') {
    return res.status(403).json({ error: '只有管理员可删除系统分类' });
  }
  if (!cat.is_system && cat.user_id !== req.user!.id && userRole !== 'admin') {
    return res.status(403).json({ error: '权限不足' });
  }
  runUpdate('DELETE FROM categories WHERE id = ?', [req.params.id]);
  rebuildUserIndex(req.user!.id);
  res.json({ success: true });
});

router.get('/:id/documents', authMiddleware, (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const docs = run(`
    SELECT d.*, u.username as author_name, dc.sort_order
    FROM documents d
    LEFT JOIN users u ON d.author_id = u.id
    LEFT JOIN document_categories dc ON d.id = dc.document_id
    WHERE dc.category_id = ? AND (d.visibility = 'public' OR d.author_id = ?)
    ORDER BY dc.sort_order ASC, d.updated_at DESC
  `, [req.params.id, userId]);
  res.json(docs);
});

router.post('/:docId/categories', authMiddleware, (req: AuthRequest, res: Response) => {
  const { category_ids } = req.body;
  const docId = req.params.docId;
  const docs = run("SELECT * FROM documents WHERE id = ? AND (visibility = 'public' OR author_id = ?)", [docId, req.user!.id]) as any[];
  if (docs.length === 0) {
    return res.status(404).json({ error: '文档不存在' });
  }

  // Check if any target category is a system category - admin only
  const systemIds = getSystemCategoryIds();
  const hasSystem = category_ids.some((id: number) => systemIds.includes(id));
  if (hasSystem && req.user!.role !== 'admin') {
    return res.status(403).json({ error: '只有管理员可管理系统分类下的文档' });
  }

  for (const catId of category_ids) {
    try {
      const maxOrder = run('SELECT COALESCE(MAX(sort_order), 0) + 1 as next FROM document_categories WHERE category_id = ?', [catId]) as any[];
      const nextOrder = maxOrder[0]?.next || 1;
      runInsert('INSERT OR IGNORE INTO document_categories (document_id, category_id, sort_order) VALUES (?, ?, ?)', [docId, catId, nextOrder]);
    } catch {}
  }
  rebuildUserIndex(req.user!.id);
  res.json({ success: true });
});

router.delete('/:docId/categories/:categoryId', authMiddleware, (req: AuthRequest, res: Response) => {
  const docId = req.params.docId;
  const categoryId = req.params.categoryId;
  const docs = run("SELECT * FROM documents WHERE id = ? AND (visibility = 'public' OR author_id = ?)", [docId, req.user!.id]) as any[];
  if (docs.length === 0) {
    return res.status(404).json({ error: '文档不存在' });
  }

  // Check if removing from a system category - admin only
  const systemIds = getSystemCategoryIds();
  if (systemIds.includes(parseInt(categoryId)) && req.user!.role !== 'admin') {
    return res.status(403).json({ error: '只有管理员可管理系统分类下的文档' });
  }

  runUpdate('DELETE FROM document_categories WHERE document_id = ? AND category_id = ?', [docId, categoryId]);
  rebuildUserIndex(req.user!.id);
  res.json({ success: true });
});

router.put('/:id/reorder', authMiddleware, (req: AuthRequest, res: Response) => {
  const { doc_ids } = req.body;
  if (!Array.isArray(doc_ids)) {
    return res.status(400).json({ error: 'doc_ids 必填' });
  }
  const catId = parseInt(req.params.id);
  // Verify ownership
  const cats = run('SELECT * FROM categories WHERE id = ?', [catId]) as any[];
  if (cats.length === 0) return res.status(404).json({ error: '分类不存在' });
  if (!cats[0].is_system && cats[0].user_id !== req.user!.id) return res.status(403).json({ error: '权限不足' });
  if (cats[0].is_system && req.user!.role !== 'admin') return res.status(403).json({ error: '权限不足' });

  for (let i = 0; i < doc_ids.length; i++) {
    runUpdate('UPDATE document_categories SET sort_order = ? WHERE document_id = ? AND category_id = ?', [i + 1, doc_ids[i], catId]);
  }
  rebuildUserIndex(req.user!.id);
  res.json({ success: true });
});

router.post('/set-category', authMiddleware, (req: AuthRequest, res: Response) => {
  const { document_id, category_id } = req.body;
  const docs = run('SELECT * FROM documents WHERE id = ?', [document_id]) as any[];
  const doc = docs[0];
  if (!doc) {
    return res.status(404).json({ error: '文档不存在' });
  }
  if (doc.author_id !== req.user!.id) {
    return res.status(403).json({ error: '权限不足' });
  }
  if (category_id) {
    const cat = run('SELECT * FROM categories WHERE id = ?', [category_id]) as any[];
    if (!cat[0]) return res.status(404).json({ error: '分类不存在' });
    if (cat[0].is_system && req.user!.role !== 'admin') {
      return res.status(403).json({ error: '仅管理员可分配系统分类' });
    }
  }
  runUpdate('DELETE FROM document_categories WHERE document_id = ?', [document_id]);
  if (category_id) {
    const maxOrder = run('SELECT COALESCE(MAX(sort_order), 0) + 1 as next FROM document_categories WHERE category_id = ?', [category_id]) as any[];
    const nextOrder = maxOrder[0]?.next || 1;
    runInsert('INSERT INTO document_categories (document_id, category_id, sort_order) VALUES (?, ?, ?)', [document_id, category_id, nextOrder]);
  }
  rebuildUserIndex(req.user!.id);
  res.json({ success: true });
});

router.get('/document/:docId', authMiddleware, (req: AuthRequest, res: Response) => {
  const cats = run(`
    SELECT c.* FROM categories c
    LEFT JOIN document_categories dc ON c.id = dc.category_id
    WHERE dc.document_id = ? AND (c.user_id = ? OR c.is_system = 1)
  `, [req.params.docId, req.user!.id]);
  res.json(cats);
});

export default router;
