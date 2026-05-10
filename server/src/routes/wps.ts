import { Router, Request, Response } from 'express';
import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { authMiddleware } from '../middleware/auth';

const router = Router();

const WPS_APP_NAME = 'wpsoffice.app';

const tempDir = path.join(os.tmpdir(), 'wps_bridge_downloads');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

function execAsync(cmd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    exec(cmd, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

router.get('/open', authMiddleware, async (req: any, res: Response) => {
  try {
    const url = req.query.url as string;
    const file = req.query.file as string;

    if (!url && !file) {
      return res.status(400).json({ status: 'error', message: '缺少 url 或 file 参数' });
    }

    if (url) {
      const parsedUrl = new URL(url);
      const ext = path.extname(parsedUrl.pathname) || '.tmp';
      const tmpPath = path.join(tempDir, `wps_${Date.now()}${ext}`);

      const fileResponse = await fetch(url);
      if (!fileResponse.ok) {
        return res.status(500).json({ status: 'error', message: '下载文件失败' });
      }

      const buffer = await fileResponse.arrayBuffer();
      fs.writeFileSync(tmpPath, Buffer.from(buffer));

      await execAsync(`open -a "${WPS_APP_NAME}" "${tmpPath}"`);
      
      return res.json({ status: 'ok', message: `已打开远程文件 ${url}` });
    }

    if (file) {
      if (!fs.existsSync(file)) {
        return res.status(404).json({ status: 'error', message: '文件不存在' });
      }
      await execAsync(`open -a "${WPS_APP_NAME}" "${file}"`);
      return res.json({ status: 'ok', message: `已打开本地文件 ${file}` });
    }
  } catch (e: any) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

export default router;