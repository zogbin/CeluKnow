import express, { Request, Response } from 'express';
import cors from 'cors';
import { initDb } from './db';
import authRouter from './routes/auth';
import documentsRouter from './routes/documents';
import versionsRouter from './routes/versions';
import tagsRouter from './routes/tags';
import usersRouter from './routes/users';
import categoriesRouter from './routes/categories';
import commentsRouter from './routes/comments';
import likesRouter from './routes/likes';
import viewsRouter from './routes/views';
import importExportRouter from './routes/importExport';

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

async function main() {
  await initDb();
  console.log('Database initialized');

  app.use('/api/auth', authRouter);
  app.use('/api/documents', documentsRouter);
  app.use('/api/versions', versionsRouter);
  app.use('/api/tags', tagsRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/categories', categoriesRouter);
  app.use('/api/comments', commentsRouter);
  app.use('/api/likes', likesRouter);
  app.use('/api/views', viewsRouter);
  app.use('/api/import-export', importExportRouter);

  app.get('/api/health', (req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.listen(PORT, '0.0.0.0', () => {
    const localIP = require('os').networkInterfaces()['en0']?.[1]?.address || 'localhost'
    console.log(`Server running on http://localhost:${PORT} or http://${localIP}:${PORT}`);
  });
}

main().catch(console.error);

export default app;