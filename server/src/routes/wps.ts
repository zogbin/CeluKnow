import { Router, Request, Response } from 'express';
import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { authMiddleware } from '../middleware/auth';

const router = Router();

const tempDir = path.join(os.tmpdir(), 'wps_bridge_downloads');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

function getOpenCommand(filePath: string): string {
  const platform = os.platform();
  const filePathEscaped = filePath.replace(/"/g, '\\"');
  
  if (platform === 'darwin') {
    return `open -a "wpsoffice.app" "${filePathEscaped}"`;
  } else if (platform === 'win32') {
    return `start "" "${filePathEscaped}"`;
  } else {
    return `xdg-open "${filePathEscaped}"`;
  }
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

    let targetPath = file;

    if (url) {
      const parsedUrl = new URL(url);
      const ext = path.extname(parsedUrl.pathname) || '.tmp';
      targetPath = path.join(tempDir, `wps_${Date.now()}${ext}`);

      const fileResponse = await fetch(url);
      if (!fileResponse.ok) {
        return res.status(500).json({ status: 'error', message: '下载文件失败' });
      }

      const buffer = await fileResponse.arrayBuffer();
      fs.writeFileSync(targetPath, Buffer.from(buffer));
    }

    if (!targetPath || !fs.existsSync(targetPath)) {
      return res.status(404).json({ status: 'error', message: '文件不存在' });
    }

    const cmd = getOpenCommand(targetPath);
    await execAsync(cmd);
    
    const platform = os.platform();
    const platformName = platform === 'darwin' ? 'WPS (macOS)' : platform === 'win32' ? 'WPS (Windows)' : '系统默认程序';
    
    res.json({ status: 'ok', message: `已通过 ${platformName} 打开文件` });
  } catch (e: any) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

export default router;