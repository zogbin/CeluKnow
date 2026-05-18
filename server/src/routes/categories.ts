import { Router, Response } from 'express';
import { run, runInsert, runUpdate } from '../db';
import { authMiddleware, AuthRequest, roleMiddleware } from '../middleware/auth';

const router = Router();

router.get('/', authMiddleware, (req: AuthRequest, res: Response) => {
  const categories = run('SELECT * FROM categories WHERE user_id = ? ORDER BY name', [req.user!.id]);
  res.json(categories);
});

router.post('/', authMiddleware, roleMiddleware(['admin', 'editor']), (req: AuthRequest, res: Response) => {
  const { name, color, icon } = req.body;
  if (!name) {
    return res.status(400).json({ error: '分类名称必填' });
  }
  try {
    const id = runInsert('INSERT INTO categories (name, user_id, color, icon) VALUES (?, ?, ?, ?)', [
      name, req.user!.id, color || '#6366F1', icon || 'folder'
    ]);
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
  const cats = run('SELECT * FROM categories WHERE id = ? AND user_id = ?', [req.params.id, req.user!.id]);
  if (cats.length === 0) {
    return res.status(404).json({ error: '分类不存在' });
  }
  runUpdate('UPDATE categories SET name = ?, color = ?, icon = ? WHERE id = ?', [
    name, color, icon, req.params.id
  ]);
  res.json({ success: true });
});

router.delete('/:id', authMiddleware, (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const userRole = req.user!.role;
  const cats = run('SELECT * FROM categories WHERE id = ?', [req.params.id]);
  if (cats.length === 0) {
    return res.status(404).json({ error: '分类不存在' });
  }
  const cat = cats[0];
  if (cat.user_id !== userId && userRole !== 'admin') {
    return res.status(403).json({ error: '权限不足' });
  }
  runUpdate('DELETE FROM categories WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

router.get('/:id/documents', authMiddleware, (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const docs = run(`
    SELECT d.*, u.username as author_name
    FROM documents d
    LEFT JOIN users u ON d.author_id = u.id
    LEFT JOIN document_categories dc ON d.id = dc.document_id
    WHERE dc.category_id = ? AND (d.visibility = 'public' OR d.author_id = ?)
    ORDER BY d.updated_at DESC
  `, [req.params.id, userId]);
  res.json(docs);
});

router.post('/:docId/categories', authMiddleware, (req: AuthRequest, res: Response) => {
  const { category_ids } = req.body;
  const docId = req.params.docId;
  const docs = run('SELECT * FROM documents WHERE id = ? AND (visibility = "public" OR author_id = ?)', [docId, req.user!.id]);
  if (docs.length === 0) {
    return res.status(404).json({ error: '文档不存在' });
  }
  for (const catId of category_ids) {
    try {
      runInsert('INSERT OR IGNORE INTO document_categories (document_id, category_id) VALUES (?, ?)', [docId, catId]);
    } catch {}
  }
  res.json({ success: true });
});

router.delete('/:docId/categories/:categoryId', authMiddleware, (req: AuthRequest, res: Response) => {
  const docId = req.params.docId;
  const categoryId = req.params.categoryId;
  const docs = run('SELECT * FROM documents WHERE id = ? AND (visibility = "public" OR author_id = ?)', [docId, req.user!.id]);
  if (docs.length === 0) {
    return res.status(404).json({ error: '文档不存在' });
  }
  runUpdate('DELETE FROM document_categories WHERE document_id = ? AND category_id = ?', [docId, categoryId]);
  res.json({ success: true });
});

router.post('/set-category', authMiddleware, (req: AuthRequest, res: Response) => {
  const { document_id, category_id } = req.body;
  const docs = run('SELECT * FROM documents WHERE id = ?', [document_id]);
  const doc = docs[0];
  if (!doc) {
    return res.status(404).json({ error: '文档不存在' });
  }
  if (doc.author_id !== req.user!.id) {
    return res.status(403).json({ error: '权限不足' });
  }
  runUpdate('DELETE FROM document_categories WHERE document_id = ?', [document_id]);
  if (category_id) {
    runInsert('INSERT INTO document_categories (document_id, category_id) VALUES (?, ?)', [document_id, category_id]);
  }
  res.json({ success: true });
});

router.get('/document/:docId', authMiddleware, (req: AuthRequest, res: Response) => {
  const cats = run(`
    SELECT c.* FROM categories c
    LEFT JOIN document_categories dc ON c.id = dc.category_id
    WHERE dc.document_id = ? AND c.user_id = ?
  `, [req.params.docId, req.user!.id]);
  res.json(cats);
});

export default router;