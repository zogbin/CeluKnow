import { Router, Response } from 'express';
import { run, runUpdate } from '../db';
import { authMiddleware, roleMiddleware, AuthRequest } from '../middleware/auth';
import bcrypt from 'bcryptjs';

const router = Router();

router.get('/me', authMiddleware, (req: AuthRequest, res: Response) => {
  const users = run('SELECT id, username, role, created_at FROM users WHERE id = ?', [req.user!.id]);
  res.json(users[0]);
});

router.put('/me/password', authMiddleware, (req: AuthRequest, res: Response) => {
  const { password } = req.body;
  if (!password || password.length < 6) {
    return res.status(400).json({ error: '密码长度至少6位' });
  }
  const hashed = bcrypt.hashSync(password, 10);
  runUpdate('UPDATE users SET password_hash = ? WHERE id = ?', [hashed, req.user!.id]);
  res.json({ success: true });
});

router.get('/me/documents', authMiddleware, (req: AuthRequest, res: Response) => {
  const docs = run(`
    SELECT d.*, GROUP_CONCAT(t.name) as tags
    FROM documents d
    LEFT JOIN document_tags dt ON d.id = dt.document_id
    LEFT JOIN tags t ON dt.tag_id = t.id
    WHERE d.author_id = ?
    GROUP BY d.id
    ORDER BY d.updated_at DESC
  `, [req.user!.id]);
  
  const result = docs.map((d: any) => {
    const views = run('SELECT COUNT(*) as cnt FROM document_views WHERE document_id = ?', [d.id]);
    const comments = run('SELECT COUNT(*) as cnt FROM comments WHERE document_id = ?', [d.id]);
    return { 
      ...d, 
      view_count: views[0]?.cnt || 0,
      comment_count: comments[0]?.cnt || 0
    };
  });
  res.json(result);
});

router.get('/me/likes', authMiddleware, (req: AuthRequest, res: Response) => {
  const docs = run(`
    SELECT d.*, u.username as author_name, GROUP_CONCAT(t.name) as tags
    FROM documents d
    LEFT JOIN users u ON d.author_id = u.id
    LEFT JOIN document_tags dt ON d.id = dt.document_id
    LEFT JOIN tags t ON dt.tag_id = t.id
    INNER JOIN likes l ON d.id = l.document_id
    WHERE l.user_id = ?
    GROUP BY d.id
    ORDER BY l.created_at DESC
  `, [req.user!.id]);
  
  const result = docs.map((d: any) => {
    const views = run('SELECT COUNT(*) as cnt FROM document_views WHERE document_id = ?', [d.id]);
    const comments = run('SELECT COUNT(*) as cnt FROM comments WHERE document_id = ?', [d.id]);
    const viewCount = views[0]?.cnt || 0;
    const commentCount = comments[0]?.cnt || 0;
    return { 
      ...d, 
      view_count: viewCount,
      comment_count: commentCount 
    };
  });
  res.json(result);
});

router.get('/me/comments', authMiddleware, (req: AuthRequest, res: Response) => {
  const comments = run(`
    SELECT c.*, d.title as doc_title
    FROM comments c
    LEFT JOIN documents d ON c.document_id = d.id
    WHERE c.user_id = ?
    ORDER BY c.created_at DESC
  `, [req.user!.id]);
  res.json(comments);
});

router.get('/', authMiddleware, roleMiddleware(['admin']), (req: AuthRequest, res: Response) => {
  const users = run('SELECT id, username, role, created_at FROM users ORDER BY created_at DESC');
  res.json(users);
});

router.put('/:id/role', authMiddleware, roleMiddleware(['admin']), (req: AuthRequest, res: Response) => {
  const { role } = req.body;
  if (!['admin', 'editor', 'viewer'].includes(role)) {
    return res.status(400).json({ error: '无效的角色' });
  }
  runUpdate('UPDATE users SET role = ? WHERE id = ?', [role, req.params.id]);
  res.json({ success: true });
});

router.delete('/:id', authMiddleware, roleMiddleware(['admin']), (req: AuthRequest, res: Response) => {
  runUpdate('DELETE FROM users WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

router.delete('/me/documents/batch', authMiddleware, (req: AuthRequest, res: Response) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: '请选择要删除的文档' });
  }
  const placeholders = ids.map(() => '?').join(',');
  runUpdate(`DELETE FROM documents WHERE id IN (${placeholders}) AND author_id = ?`, [...ids, req.user!.id]);
  res.json({ success: true, count: ids.length });
});

router.delete('/me/likes/batch', authMiddleware, (req: AuthRequest, res: Response) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: '请选择要取消点赞的文档' });
  }
  const placeholders = ids.map(() => '?').join(',');
  runUpdate(`DELETE FROM likes WHERE document_id IN (${placeholders}) AND user_id = ?`, [...ids, req.user!.id]);
  res.json({ success: true, count: ids.length });
});

router.delete('/me/comments/batch', authMiddleware, (req: AuthRequest, res: Response) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: '请选择要删除的评论' });
  }
  const placeholders = ids.map(() => '?').join(',');
  runUpdate(`DELETE FROM comments WHERE id IN (${placeholders}) AND user_id = ?`, [...ids, req.user!.id]);
  res.json({ success: true, count: ids.length });
});

export default router;