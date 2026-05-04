import { Router, Response } from 'express';
import { run, runInsert, runUpdate } from '../db';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

router.get('/document/:docId', authMiddleware, (req: AuthRequest, res: Response) => {
  const versions = run(`
    SELECT v.id, v.message, v.created_at, u.username as author_name
    FROM document_versions v
    LEFT JOIN users u ON v.author_id = u.id
    WHERE v.document_id = ?
    ORDER BY v.created_at DESC
  `, [req.params.docId]);
  res.json(versions);
});

router.post('/document/:docId', authMiddleware, (req: AuthRequest, res: Response) => {
  const { content, message } = req.body;
  const docs = run('SELECT * FROM documents WHERE id = ?', [req.params.docId]);
  const doc = docs[0];
  if (!doc) {
    return res.status(404).json({ error: '文档不存在' });
  }
  const id = runInsert(
    'INSERT INTO document_versions (document_id, content, author_id, message) VALUES (?, ?, ?, ?)',
    [req.params.docId, content, req.user!.id, message || '更新']
  );
  runUpdate(
    'UPDATE documents SET content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [content, req.params.docId]
  );
  res.json({ id });
});

router.get('/:versionId', authMiddleware, (req: AuthRequest, res: Response) => {
  const versions = run(`
    SELECT v.*, u.username as author_name
    FROM document_versions v
    LEFT JOIN users u ON v.author_id = u.id
    WHERE v.id = ?
  `, [req.params.versionId]);
  const version = versions[0];
  if (!version) {
    return res.status(404).json({ error: '版本不存在' });
  }
  res.json(version);
});

router.post('/:versionId/restore', authMiddleware, (req: AuthRequest, res: Response) => {
  const versions = run('SELECT * FROM document_versions WHERE id = ?', [req.params.versionId]);
  const version = versions[0];
  if (!version) {
    return res.status(404).json({ error: '版本不存在' });
  }
  const docs = run('SELECT * FROM documents WHERE id = ?', [version.document_id]);
  const doc = docs[0];
  if (req.user!.role !== 'admin' && doc.author_id !== req.user!.id) {
    return res.status(403).json({ error: '权限不足' });
  }
  runUpdate(
    'UPDATE documents SET content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [version.content, version.document_id]
  );
  runInsert(
    'INSERT INTO document_versions (document_id, content, author_id, message) VALUES (?, ?, ?, ?)',
    [version.document_id, version.content, req.user!.id, `恢复到版本 ${version.id}`]
  );
  res.json({ success: true });
});

export default router;