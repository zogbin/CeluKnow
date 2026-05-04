import { Router, Response } from 'express';
import { run, runInsert, runUpdate } from '../db';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

router.get('/document/:docId', (req, res: Response) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  let userId: number | undefined;
  
  if (token) {
    try {
      const jwt = require('jsonwebtoken');
      const { JWT_SECRET } = require('../routes/auth');
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      userId = decoded.id;
    } catch {}
  }
  
  const likes = run('SELECT user_id FROM likes WHERE document_id = ?', [req.params.docId]);
  const userIds = likes.map((l: any) => l.user_id);
  const count = likes.length;
  const liked = userId ? userIds.includes(userId) : false;
  res.json({ count, liked });
});

router.post('/document/:docId', authMiddleware, (req: AuthRequest, res: Response) => {
  try {
    runInsert('INSERT INTO likes (document_id, user_id) VALUES (?, ?)', [req.params.docId, req.user!.id]);
    const likes = run('SELECT COUNT(*) as count FROM likes WHERE document_id = ?', [req.params.docId]);
    res.json({ count: likes[0].count, liked: true });
  } catch (err: any) {
    if (err.message?.includes('UNIQUE constraint failed')) {
      runUpdate('DELETE FROM likes WHERE document_id = ? AND user_id = ?', [req.params.docId, req.user!.id]);
      const likes = run('SELECT COUNT(*) as count FROM likes WHERE document_id = ?', [req.params.docId]);
      res.json({ count: likes[0].count, liked: false });
    }
  }
});

router.delete('/document/:docId', authMiddleware, (req: AuthRequest, res: Response) => {
  runUpdate('DELETE FROM likes WHERE document_id = ? AND user_id = ?', [req.params.docId, req.user!.id]);
  const likes = run('SELECT COUNT(*) as count FROM likes WHERE document_id = ?', [req.params.docId]);
  res.json({ count: likes[0].count, liked: false });
});

export default router;