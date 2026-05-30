import { Router, Response } from 'express';
import { run, runInsert, runUpdate } from '../db';
import { authMiddleware, AuthRequest, roleMiddleware } from '../middleware/auth';

const router = Router();

// List collections under a category (with docs)
router.get('/categories/:id/collections', authMiddleware, (req: AuthRequest, res: Response) => {
  const collections = run(`
    SELECT c.* FROM collections c
    WHERE c.category_id = ? AND (EXISTS (SELECT 1 FROM categories cat WHERE cat.id = c.category_id AND (cat.user_id = ? OR cat.is_system = 1)))
    ORDER BY c.sort_order ASC, c.name ASC
  `, [req.params.id, req.user!.id]) as any[];
  for (const col of collections) {
    const docs = run(`
      SELECT d.id, d.title, d.version, dc.collection_sort_order
      FROM documents d
      JOIN document_categories dc ON d.id = dc.document_id
      WHERE dc.collection_id = ? AND (d.visibility = 'public' OR d.author_id = ?)
        AND d.id = (SELECT d2.id FROM documents d2 WHERE d2.title = d.title AND d2.author_id = d.author_id ORDER BY d2.version DESC LIMIT 1)
      ORDER BY dc.collection_sort_order ASC, d.updated_at DESC
    `, [col.id, req.user!.id]);
    (col as any).documents = docs;
  }
  res.json(collections);
});

function checkSystemCategory(req: AuthRequest, res: Response, categoryId: number): boolean {
  const cat = run('SELECT is_system FROM categories WHERE id = ?', [categoryId]) as any[];
  if (cat.length > 0 && cat[0].is_system && req.user!.role !== 'admin') {
    res.status(403).json({ error: '权限不足' });
    return false;
  }
  return true;
}

function checkSystemCategoryByCollection(req: AuthRequest, res: Response, collectionId: number): boolean {
  const cols = run('SELECT c.category_id, cat.is_system FROM collections c JOIN categories cat ON c.category_id = cat.id WHERE c.id = ?', [collectionId]) as any[];
  if (cols.length > 0 && cols[0].is_system && req.user!.role !== 'admin') {
    res.status(403).json({ error: '权限不足' });
    return false;
  }
  return true;
}

// Create collection
router.post('/collections', authMiddleware, roleMiddleware(['admin', 'editor']), (req: AuthRequest, res: Response) => {
  const { category_id, name } = req.body;
  if (!category_id || !name) return res.status(400).json({ error: '分类ID和合集名称必填' });
  if (!checkSystemCategory(req, res, category_id)) return;
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
  if (!checkSystemCategoryByCollection(req, res, parseInt(req.params.id))) return;
  runUpdate('UPDATE collections SET name = ? WHERE id = ?', [name, req.params.id]);
  res.json({ success: true });
});

// Delete collection (docs remain, collection_id set to NULL)
router.delete('/collections/:id', authMiddleware, (req: AuthRequest, res: Response) => {
  const cols = run('SELECT * FROM collections WHERE id = ?', [req.params.id]) as any[];
  if (cols.length === 0) return res.status(404).json({ error: '合集不存在' });
  if (!checkSystemCategoryByCollection(req, res, parseInt(req.params.id))) return;
  runUpdate('UPDATE document_categories SET collection_id = NULL, collection_sort_order = 0 WHERE collection_id = ?', [req.params.id]);
  runUpdate('DELETE FROM collections WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

// Reorder docs within a collection
router.put('/collections/:id/reorder', authMiddleware, (req: AuthRequest, res: Response) => {
  const { doc_ids } = req.body;
  if (!Array.isArray(doc_ids)) return res.status(400).json({ error: 'doc_ids 必填' });
  if (!checkSystemCategoryByCollection(req, res, parseInt(req.params.id))) return;
  for (let i = 0; i < doc_ids.length; i++) {
    runUpdate('UPDATE document_categories SET collection_sort_order = ? WHERE document_id = ? AND collection_id = ?', [i + 1, doc_ids[i], req.params.id]);
  }
  res.json({ success: true });
});

// Reorder collections within a category
router.put('/collections/reorder', authMiddleware, (req: AuthRequest, res: Response) => {
  const { category_id, collection_ids } = req.body;
  if (!category_id || !Array.isArray(collection_ids)) return res.status(400).json({ error: 'category_id 和 collection_ids 必填' });
  if (!checkSystemCategory(req, res, category_id)) return;
  for (let i = 0; i < collection_ids.length; i++) {
    runUpdate('UPDATE collections SET sort_order = ? WHERE id = ? AND category_id = ?', [i + 1, collection_ids[i], category_id]);
  }
  res.json({ success: true });
});

// Get documents in a collection
router.get('/collections/:id/documents', authMiddleware, (req: AuthRequest, res: Response) => {
  const docs = run(`
    SELECT d.id, d.title, d.version, u.username as author_name, d.updated_at
    FROM documents d
    JOIN document_categories dc ON d.id = dc.document_id
    LEFT JOIN users u ON d.author_id = u.id
    WHERE dc.collection_id = ? AND (d.visibility = 'public' OR d.author_id = ?)
    ORDER BY dc.collection_sort_order ASC, d.updated_at DESC
  `, [req.params.id, req.user!.id]);
  res.json(docs);
});

export default router;
