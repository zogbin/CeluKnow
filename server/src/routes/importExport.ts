import { Router, Response } from 'express';
import { run, runInsert, runUpdate } from '../db';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import AdmZip from 'adm-zip';

const router = Router();

function parseFrontMatter(content: string): { data: Record<string, string>; content: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { data: {}, content };
  
  const yamlStr = match[1];
  const body = match[2];
  const data: Record<string, string> = {};
  
  for (const line of yamlStr.split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx > 0) {
      const key = line.slice(0, colonIdx).trim();
      let value = line.slice(colonIdx + 1).trim();
      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.slice(1, -1);
      }
      data[key] = value;
    }
  }
  
  return { data, content: body };
}

function isValidDate(str: string): boolean {
  const date = new Date(str);
  return !isNaN(date.getTime());
}

router.post('/import', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const files = req.body.files as { name: string; content: string; folder?: string }[];
    
    const results: { name: string; success: boolean; category?: string; error?: string; id?: number }[] = [];
    
    for (const file of files) {
      try {
        const { data: frontMatter, content: body } = parseFrontMatter(file.content);
        
        let title = frontMatter.title || file.name.replace(/\.md$/, '');
        const folder = file.folder || frontMatter.category || '未分类';
        const visibility = frontMatter.visibility || 'private';
        const tags = frontMatter.tags || '';
        
        let authorId = userId;
        if (frontMatter.author) {
          const authorUsers = run('SELECT id FROM users WHERE username = ?', [frontMatter.author]) as any[];
          if (authorUsers.length > 0) {
            authorId = authorUsers[0].id;
          }
        }
        
        const createdAt = isValidDate(frontMatter.created_at) ? frontMatter.created_at : undefined;
        const updatedAt = isValidDate(frontMatter.updated_at) ? frontMatter.updated_at : undefined;
        
        let categoryId: number | null = null;
        
        // 按用户查询分类，获取 id 最小的（最早创建的）
        const categories = run('SELECT MIN(id) as id FROM categories WHERE name = ? AND user_id = ? GROUP BY name', [folder, userId]) as any[];
        if (categories.length > 0 && categories[0].id) {
          categoryId = categories[0].id;
        } else {
          categoryId = runInsert('INSERT INTO categories (name, color, icon) VALUES (?, ?, ?)', 
            [folder, '#6366f1', 'folder']);
        }
        
        const docId = runInsert(
          `INSERT INTO documents (title, content, author_id, visibility, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
          [title, body, authorId, visibility, createdAt || null, updatedAt || null]
        );
        
        runUpdate('INSERT INTO document_categories (document_id, category_id) VALUES (?, ?)', [docId, categoryId]);
        
        if (tags) {
          const tagList = tags.split(',').map((t: string) => t.trim()).filter(Boolean);
          for (const tagName of tagList) {
            let tagId: number;
            const existingTags = run('SELECT id FROM tags WHERE name = ?', [tagName]) as any[];
            if (existingTags.length > 0) {
              tagId = existingTags[0].id;
            } else {
              tagId = runInsert('INSERT INTO tags (name) VALUES (?)', [tagName]);
            }
            runUpdate('INSERT INTO document_tags (document_id, tag_id) VALUES (?, ?)', [docId, tagId]);
          }
        }
        
        results.push({ name: file.name, success: true, category: folder, id: docId });
      } catch (err: any) {
        results.push({ name: file.name, success: false, error: err.message });
      }
    }
    
    res.json({ success: true, results });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/import/zip', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { zipBase64 } = req.body;
    
    if (!zipBase64) {
      return res.status(400).json({ error: '请提供 ZIP 文件' });
    }
    
    const buffer = Buffer.from(zipBase64, 'base64');
    const zip = new AdmZip(buffer);
    const entries = zip.getEntries();
    
    const results: { name: string; success: boolean; category?: string; error?: string }[] = [];
    const folderMap = new Map<string, number>();
    
    for (const entry of entries) {
      if (entry.isDirectory || entry.entryName.includes('__MACOSX') || entry.entryName.startsWith('.')) continue;
      
      const name = entry.name;
      if (!name.endsWith('.md')) continue;
      
      const pathParts = entry.entryName.split('/');
      const folder = pathParts.length > 1 ? pathParts[0] : '未分类';
      
      let categoryId = folderMap.get(folder);
      
      if (categoryId === undefined) {
        const categories = run('SELECT MIN(id) as id FROM categories WHERE name = ? AND user_id = ? GROUP BY name', [folder, userId]) as any[];
        if (categories.length > 0 && categories[0].id) {
          categoryId = categories[0].id;
        } else {
          categoryId = runInsert('INSERT INTO categories (name, color, icon) VALUES (?, ?, ?)', 
            [folder, '#6366f1', 'folder']);
        }
        folderMap.set(folder, categoryId);
      }
      
      try {
        const rawContent = entry.getData().toString('utf8');
        const { data: frontMatter, content: body } = parseFrontMatter(rawContent);
        
        let title = frontMatter.title || name.replace(/\.md$/, '');
        const visibility = frontMatter.visibility || 'private';
        const tags = frontMatter.tags || '';
        const categoryFromFm = frontMatter.category;
        
        let authorId = userId;
        if (frontMatter.author) {
          const authorUsers = run('SELECT id FROM users WHERE username = ?', [frontMatter.author]) as any[];
          if (authorUsers.length > 0) {
            authorId = authorUsers[0].id;
          }
        }
        
        const createdAt = isValidDate(frontMatter.created_at) ? frontMatter.created_at : undefined;
        const updatedAt = isValidDate(frontMatter.updated_at) ? frontMatter.updated_at : undefined;
        
        if (categoryFromFm) {
          const catId = folderMap.get(categoryFromFm);
          if (catId === undefined) {
            const cats = run('SELECT id FROM categories WHERE name = ?', [categoryFromFm]) as any[];
            if (cats.length > 0) {
              categoryId = cats[0].id;
            } else {
              categoryId = runInsert('INSERT INTO categories (name, color, icon) VALUES (?, ?, ?)', 
                [categoryFromFm, '#6366f1', 'folder']);
            }
folderMap.set(categoryFromFm, categoryId);
          }
        }
        
        const docId = runInsert(
          `INSERT INTO documents (title, content, author_id, visibility, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
          [title, body, authorId, visibility, createdAt || null, updatedAt || null]
        );
        
        runUpdate('INSERT INTO document_categories (document_id, category_id) VALUES (?, ?)', [docId, categoryId]);
        
        if (tags) {
          const tagList = tags.split(',').map((t: string) => t.trim()).filter(Boolean);
          for (const tagName of tagList) {
            let tagId: number;
            const existingTags = run('SELECT id FROM tags WHERE name = ?', [tagName]) as any[];
            if (existingTags.length > 0) {
              tagId = existingTags[0].id;
            } else {
              tagId = runInsert('INSERT INTO tags (name) VALUES (?)', [tagName]);
            }
            runUpdate('INSERT INTO document_tags (document_id, tag_id) VALUES (?, ?)', [docId, tagId]);
          }
        }
        
        results.push({ name, success: true, category: folder });
      } catch (err: any) {
        results.push({ name, success: false, error: err.message });
      }
    }
    
    res.json({ success: true, results, count: results.filter(r => r.success).length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/export', authMiddleware, (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    
    const docs = run(`
      SELECT d.*, u.username as author_name,
      GROUP_CONCAT(t.name) as tags,
      c.id as category_id, c.name as category_name
      FROM documents d
      LEFT JOIN users u ON d.author_id = u.id
      LEFT JOIN document_tags dt ON d.id = dt.document_id
      LEFT JOIN tags t ON dt.tag_id = t.id
      LEFT JOIN document_categories dc ON d.id = dc.document_id
      LEFT JOIN categories c ON dc.category_id = c.id
      WHERE d.visibility = 'public' OR d.author_id = ?
      GROUP BY d.id
    `, [userId]) as any[];
    
    const categoryMap = new Map<string, any[]>();
    const uncategorized: any[] = [];
    
    for (const doc of docs) {
      const catName = doc.category_name || '未分类';
      if (!categoryMap.has(catName)) {
        categoryMap.set(catName, []);
      }
      categoryMap.get(catName)!.push({
        title: doc.title,
        content: doc.content,
        tags: doc.tags,
        visibility: doc.visibility,
        created_at: doc.created_at,
        updated_at: doc.updated_at,
        author: doc.author_name
      });
    }
    
    const result: Record<string, Record<string, string>> = {};
    
    for (const [category, documents] of categoryMap) {
      result[category] = {};
      for (const doc of documents) {
        const frontMatter = `---
title: ${doc.title}
tags: ${doc.tags || ''}
visibility: ${doc.visibility}
created_at: ${doc.created_at}
updated_at: ${doc.updated_at}
author: ${doc.author}
---

`;
        result[category][`${doc.title}.md`] = frontMatter + doc.content;
      }
    }
    
    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;