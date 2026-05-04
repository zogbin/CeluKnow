import { Router, Response } from 'express';
import { run, runInsert, runUpdate } from '../db';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

router.get('/document/:docId', (req, res: Response) => {
  const comments = run(`
    SELECT c.*, u.username as user_name, u.id as user_id
    FROM comments c
    LEFT JOIN users u ON c.user_id = u.id
    WHERE c.document_id = ?
    ORDER BY c.created_at ASC
  `, [req.params.docId]);
  
  const buildTree = (list: any[], parentId: number | null): any[] => {
    return list
      .filter(c => c.parent_id === parentId)
      .map(c => ({
        ...c,
        replies: buildTree(list, c.id)
      }));
  };
  
  const tree = buildTree(comments, null);
  res.json(tree);
});

router.post('/document/:docId', authMiddleware, (req: AuthRequest, res: Response) => {
  const { content, parent_id } = req.body;
  if (!content) {
    return res.status(400).json({ error: '评论内容必填' });
  }
  const id = runInsert(
    'INSERT INTO comments (document_id, user_id, content, parent_id) VALUES (?, ?, ?, ?)',
    [req.params.docId, req.user!.id, content, parent_id || null]
  );
  const comments = run(`
    SELECT c.*, u.username as user_name, u.id as user_id 
    FROM comments c 
    LEFT JOIN users u ON c.user_id = u.id 
    WHERE c.id = ?
  `, [id]);
  res.json(comments[0]);
});

router.delete('/:id', authMiddleware, (req: AuthRequest, res: Response) => {
  const comments = run('SELECT * FROM comments WHERE id = ?', [req.params.id]);
  const comment = comments[0];
  if (!comment) {
    return res.status(404).json({ error: '评论不存在' });
  }
  if (req.user!.role !== 'admin' && comment.user_id !== req.user!.id) {
    return res.status(403).json({ error: '权限不足' });
  }
  runUpdate('DELETE FROM comments WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

export default router;