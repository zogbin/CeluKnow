import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { run, runInsert } from '../db';

const router = Router();
const JWT_SECRET = 'knowledge-hub-secret-key-2024';

router.post('/register', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: '用户名和密码必填' });
    }
    const existingUser = run('SELECT id FROM users WHERE username = ?', [username]);
    if (existingUser.length > 0) {
      return res.status(400).json({ error: '用户名已存在' });
    }
    const password_hash = await bcrypt.hash(password, 10);
    const id = runInsert(
      'INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)',
      [username, password_hash, 'editor']
    );
    res.json({ id, username });
  } catch (err: any) {
    if (err.message?.includes('UNIQUE constraint failed')) {
      res.status(400).json({ error: '用户名已存在' });
    } else {
      res.status(500).json({ error: err.message });
    }
  }
});

router.post('/login', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;
    const users = run('SELECT * FROM users WHERE username = ?', [username]);
    const user = users[0];
    if (!user) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }
    const token = jwt.sign(
      { id: user.id, username: user.username, nickname: user.nickname, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.json({ token, user: { id: user.id, username: user.username, nickname: user.nickname, role: user.role } });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/me', (req: Request, res: Response) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ error: '未登录' });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    res.json({ id: decoded.id, username: decoded.username, nickname: decoded.nickname, role: decoded.role });
  } catch {
    res.status(401).json({ error: 'token 无效' });
  }
});

export default router;
export { JWT_SECRET };