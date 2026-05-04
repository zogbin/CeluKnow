import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(__dirname, '../../../../data/documents');

export const storage = {
  ensureDir() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  },

  getFilePath(folderPath: string, title: string): string {
    const safeTitle = title.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_');
    const safeFolder = folderPath === '/' ? '' : folderPath.replace(/^\//, '');
    const fullPath = path.join(DATA_DIR, safeFolder, `${safeTitle}.md`);
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return fullPath;
  },

  readDocument(folderPath: string, title: string): string | null {
    const filePath = this.getFilePath(folderPath, title);
    return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8') : null;
  },

  writeDocument(folderPath: string, title: string, content: string): void {
    const filePath = this.getFilePath(folderPath, title);
    fs.writeFileSync(filePath, content, 'utf-8');
  },

  deleteDocument(folderPath: string, title: string): boolean {
    const filePath = this.getFilePath(folderPath, title);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
    return false;
  },

  listDocuments(folderPath: string): string[] {
    const fullPath = folderPath === '/' ? DATA_DIR : path.join(DATA_DIR, folderPath.replace(/^\//, ''));
    if (!fs.existsSync(fullPath)) {
      return [];
    }
    return fs.readdirSync(fullPath).filter(f => f.endsWith('.md')).map(f => f.replace('.md', ''));
  },

  listFolders(folderPath: string): string[] {
    const fullPath = folderPath === '/' ? DATA_DIR : path.join(DATA_DIR, folderPath.replace(/^\//, ''));
    if (!fs.existsSync(fullPath)) {
      return [];
    }
    return fs.readdirSync(fullPath).filter(f => fs.statSync(path.join(fullPath, f)).isDirectory());
  }
};