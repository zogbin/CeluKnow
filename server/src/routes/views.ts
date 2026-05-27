import { Router, Response } from 'express';
import { run, runInsert } from '../db';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

router.post('/:docId', authMiddleware, (req: AuthRequest, res: Response) => {
  const docId = req.params.docId
  const userId = req.user!.id
  
  try {
    runInsert(
      "INSERT OR IGNORE INTO document_views (document_id, user_id, viewed_at) VALUES (?, ?, date('now'))",
      [docId, userId]
    )
    res.json({ success: true })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
});

router.get('/:docId/count', authMiddleware, (req: AuthRequest, res: Response) => {
  const docId = req.params.docId
  const result = run('SELECT COUNT(*) as count FROM document_views WHERE document_id = ?', [docId])
  const count = result[0]?.count || 0
  res.json({ count })
});

export default router;