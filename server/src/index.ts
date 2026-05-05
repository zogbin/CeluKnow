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
    const interfaces = require('os').networkInterfaces()
    let localIP = 'localhost'
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        if (iface.family === 'IPv4' && !iface.internal) {
          localIP = iface.address
          break
        }
      }
      if (localIP !== 'localhost') break
    }
    console.log(`Server running on http://localhost:${PORT} or http://${localIP}:${PORT}`);
  });
}

main().catch(console.error);

export default app;