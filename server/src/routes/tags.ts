import { Router, Response } from 'express';
import { run, runInsert, runUpdate } from '../db';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

router.get('/', authMiddleware, (req: AuthRequest, res: Response) => {
  const tags = run('SELECT * FROM tags WHERE user_id = ? ORDER BY name', [req.user!.id]);
  res.json(tags);
});

router.post('/', authMiddleware, (req: AuthRequest, res: Response) => {
  const { name } = req.body;
  if (!name) {
    return res.status(400).json({ error: '标签名必填' });
  }
  try {
    const id = runInsert('INSERT INTO tags (name, user_id) VALUES (?, ?)', [name, req.user!.id]);
    res.json({ id, name });
  } catch (err: any) {
    if (err.message?.includes('UNIQUE constraint failed')) {
      res.status(400).json({ error: '标签已存在' });
    } else {
      res.status(500).json({ error: err.message });
    }
  }
});

router.get('/:tagId/documents', authMiddleware, (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const docs = run(`
    SELECT d.*, u.username as author_name
    FROM documents d
    LEFT JOIN users u ON d.author_id = u.id
    LEFT JOIN document_tags dt ON d.id = dt.document_id
    WHERE dt.tag_id = ? AND (d.visibility = 'public' OR d.author_id = ?)
    ORDER BY d.updated_at DESC
  `, [req.params.tagId, userId]);
  res.json(docs);
});

router.put('/:id', authMiddleware, (req: AuthRequest, res: Response) => {
  const { name } = req.body;
  if (!name) {
    return res.status(400).json({ error: '标签名必填' });
  }
  const tags = run('SELECT * FROM tags WHERE id = ? AND user_id = ?', [req.params.id, req.user!.id]);
  if (tags.length === 0) {
    return res.status(404).json({ error: '标签不存在' });
  }
  try {
    runUpdate('UPDATE tags SET name = ? WHERE id = ?', [name, req.params.id]);
    res.json({ success: true });
  } catch (err: any) {
    if (err.message?.includes('UNIQUE constraint failed')) {
      res.status(400).json({ error: '标签名已存在' });
    } else {
      res.status(500).json({ error: err.message });
    }
  }
});

router.delete('/:id', authMiddleware, (req: AuthRequest, res: Response) => {
  const tags = run('SELECT * FROM tags WHERE id = ? AND user_id = ?', [req.params.id, req.user!.id]);
  if (tags.length === 0) {
    return res.status(404).json({ error: '标签不存在' });
  }
  runUpdate('DELETE FROM tags WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

router.post('/:docId/tags', authMiddleware, (req: AuthRequest, res: Response) => {
  const { tag_ids } = req.body;
  const docId = req.params.docId;
  const docs = run('SELECT * FROM documents WHERE id = ? AND (visibility = "public" OR author_id = ?)', [docId, req.user!.id]);
  if (docs.length === 0) {
    return res.status(404).json({ error: '文档不存在' });
  }
  for (const tagId of tag_ids) {
    try {
      runInsert('INSERT OR IGNORE INTO document_tags (document_id, tag_id) VALUES (?, ?)', [docId, tagId]);
    } catch {}
  }
  res.json({ success: true });
});

router.delete('/:docId/tags/:tagId', authMiddleware, (req: AuthRequest, res: Response) => {
  const docId = req.params.docId;
  const docs = run('SELECT * FROM documents WHERE id = ? AND (visibility = "public" OR author_id = ?)', [docId, req.user!.id]);
  if (docs.length === 0) {
    return res.status(404).json({ error: '文档不存在' });
  }
  runUpdate(
    'DELETE FROM document_tags WHERE document_id = ? AND tag_id = ?',
    [req.params.docId, req.params.tagId]
  );
  res.json({ success: true });
});

export default router;