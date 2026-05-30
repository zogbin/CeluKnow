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
    
    if (!files || files.length === 0) {
      return res.status(400).json({ error: '未提供文件' })
    }
    
    const results: { name: string; success: boolean; category?: string; error?: string; id?: number }[] = [];
    
    for (const file of files) {
      try {
        const { data: frontMatter, content: body } = parseFrontMatter(file.content);
        
        let title = frontMatter.title || file.name.replace(/\.md$/, '');
        const folder = frontMatter.category || file.folder || '未分类';
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
        
        // 按用户或系统分类查询
        const categories = run('SELECT id FROM categories WHERE name = ? AND (user_id = ? OR is_system = 1) ORDER BY is_system ASC LIMIT 1', [folder, userId]) as any[];
        if (categories.length > 0) {
          categoryId = categories[0].id;
        } else {
          categoryId = runInsert('INSERT INTO categories (name, user_id, color, icon) VALUES (?, ?, ?, ?)', 
            [folder, userId, '#6366f1', 'folder']);
        }
        
        const version = parseInt(frontMatter.version) || 0;
        const existingDoc = run('SELECT id FROM documents WHERE title = ? AND version = ? AND author_id = ?', [title, version, authorId]);
        if (existingDoc.length > 0) {
          results.push({ name: file.name, success: false, error: `标题和版本已存在: ${title}${version > 0 ? `(v${version})` : ''}` });
          continue;
        }
        const getLocalNow = () => {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const h = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  const s = String(d.getSeconds()).padStart(2, '0')
  return `${y}-${m}-${day} ${h}:${min}:${s}`
}
const now = getLocalNow()
        const docId = runInsert(
          `INSERT INTO documents (title, version, content, author_id, visibility, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [title, version, body, authorId, visibility, createdAt || now, updatedAt || now]
        );
        
        runUpdate('INSERT INTO document_categories (document_id, category_id) VALUES (?, ?)', [docId, categoryId]);
        
        if (frontMatter.collection) {
          const cols = run('SELECT id FROM collections WHERE category_id = ? AND name = ?', [categoryId, frontMatter.collection]) as any[];
          let colId: number;
          if (cols.length > 0) {
            colId = cols[0].id;
          } else {
            colId = runInsert('INSERT INTO collections (category_id, name, user_id) VALUES (?, ?, ?)', [categoryId, frontMatter.collection, userId]);
          }
          runUpdate('UPDATE document_categories SET collection_id = ? WHERE document_id = ?', [colId, docId]);
        }
        
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
        const categories = run('SELECT id FROM categories WHERE name = ? AND (user_id = ? OR is_system = 1) ORDER BY is_system ASC LIMIT 1', [folder, userId]) as any[];
        if (categories.length > 0) {
          categoryId = categories[0].id;
        } else {
          categoryId = runInsert('INSERT INTO categories (name, user_id, color, icon) VALUES (?, ?, ?, ?)', 
            [folder, userId, '#6366f1', 'folder']);
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
            const cats = run('SELECT id FROM categories WHERE name = ? AND (user_id = ? OR is_system = 1)', [categoryFromFm, userId]) as any[];
            if (cats.length > 0) {
              categoryId = cats[0].id;
            } else {
              categoryId = runInsert('INSERT INTO categories (name, user_id, color, icon) VALUES (?, ?, ?, ?)', 
                [categoryFromFm, userId, '#6366f1', 'folder']);
            }
folderMap.set(categoryFromFm, categoryId);
          }
        }
        
        const version = parseInt(frontMatter.version) || 0;
        const existingDoc = run('SELECT id FROM documents WHERE title = ? AND version = ? AND author_id = ?', [title, version, authorId]);
        if (existingDoc.length > 0) {
          results.push({ name, success: false, error: `标题和版本已存在: ${title}${version > 0 ? `(v${version})` : ''}` });
          continue;
        }
        
        const docId = runInsert(
          `INSERT INTO documents (title, version, content, author_id, visibility, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [title, version, body, authorId, visibility, createdAt || null, updatedAt || null]
        );
        
        runUpdate('INSERT INTO document_categories (document_id, category_id) VALUES (?, ?)', [docId, categoryId]);
        
        if (frontMatter.collection) {
          const cols = run('SELECT id FROM collections WHERE category_id = ? AND name = ?', [categoryId, frontMatter.collection]) as any[];
          let colId: number;
          if (cols.length > 0) {
            colId = cols[0].id;
          } else {
            colId = runInsert('INSERT INTO collections (category_id, name, user_id) VALUES (?, ?, ?)', [categoryId, frontMatter.collection, userId]);
          }
          runUpdate('UPDATE document_categories SET collection_id = ? WHERE document_id = ?', [colId, docId]);
        }
        
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
    const { category_id, tag_id } = req.query;

    if (category_id) {
      const cat = run('SELECT id FROM categories WHERE id = ? AND (user_id = ? OR is_system = 1)', [category_id, userId]) as any[];
      if (cat.length === 0) {
        return res.status(403).json({ error: '无权导出此分类' });
      }
    }

    let whereClause = "WHERE (d.visibility = 'public' OR d.author_id = ?)";
    let params: any[] = [userId];

    if (category_id) {
      whereClause += ' AND dc.category_id = ?';
      params.push(category_id);
    }
    if (tag_id) {
      whereClause += ' AND dt.tag_id = ?';
      params.push(tag_id);
    }

    const docs = run(`
      SELECT DISTINCT d.*, u.username as author_name,
      GROUP_CONCAT(DISTINCT t.name) as tags,
      c.id as category_id, c.name as category_name
      FROM documents d
      LEFT JOIN users u ON d.author_id = u.id
      LEFT JOIN document_tags dt ON d.id = dt.document_id
      LEFT JOIN tags t ON dt.tag_id = t.id
      LEFT JOIN document_categories dc ON d.id = dc.document_id
      LEFT JOIN categories c ON dc.category_id = c.id
      ${whereClause}
      GROUP BY d.id
    `, params) as any[];

    // Populate collection_name for each doc
    for (const doc of docs) {
      const colRes = run(`
        SELECT col.name FROM collections col
        JOIN document_categories dc ON col.id = dc.collection_id
        WHERE dc.document_id = ? AND dc.category_id = ?
      `, [doc.id, doc.category_id]) as any[];
      doc.collection_name = colRes.length > 0 ? colRes[0].name : '';
    }

    const categoryMap = new Map<string, any[]>();
    const uncategorized: any[] = [];

    for (const doc of docs) {
      const catName = doc.category_name || '未分类';
      if (!categoryMap.has(catName)) {
        categoryMap.set(catName, []);
      }
      categoryMap.get(catName)!.push({
        title: doc.title,
        version: doc.version || 0,
        content: doc.content,
        tags: doc.tags,
        category: catName,
        collection: doc.collection_name || '',
        visibility: doc.visibility,
        created_at: doc.created_at,
        updated_at: doc.updated_at,
        author: doc.author_name
      });
    }

    // If specifying a category or tag, return as downloadable zip
    if (category_id || tag_id) {
      const zip = new AdmZip();
      const label = category_id ? `category-${category_id}` : `tag-${tag_id}`;
      for (const [catName, catDocs] of categoryMap) {
        for (const doc of catDocs) {
          const frontMatter = `---
title: ${doc.title}
version: ${doc.version || 0}
category: ${catName}
collection: ${doc.collection}
tags: ${doc.tags || ''}
visibility: ${doc.visibility}
created_at: ${doc.created_at}
updated_at: ${doc.updated_at}
author: ${doc.author}
---

`;
          const docLabel = doc.version > 0 ? `${doc.title}_v${doc.version}` : doc.title;
          const filePath = doc.collection ? `${catName}/${doc.collection}/${docLabel}.md` : `${catName}/${docLabel}.md`;
          zip.addFile(filePath, Buffer.from(frontMatter + doc.content));
        }
      }
      const labelName = category_id
        ? (docs[0]?.category_name || `category-${category_id}`)
        : `tag-${tag_id}`;
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(labelName)}.zip"`);
      return res.send(zip.toBuffer());
    }

    const result: Record<string, Record<string, string>> = {};
    for (const [category, documents] of categoryMap) {
      result[category] = {};
      for (const doc of documents) {
        const frontMatter = `---
title: ${doc.title}
version: ${doc.version || 0}
category: ${category}
collection: ${doc.collection}
tags: ${doc.tags || ''}
visibility: ${doc.visibility}
created_at: ${doc.created_at}
updated_at: ${doc.updated_at}
author: ${doc.author}
---

`;
        const docLabel = doc.version > 0 ? `${doc.title}_v${doc.version}` : doc.title;
        result[category][`${docLabel}.md`] = frontMatter + doc.content;
      }
    }

    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Export single document (all versions) as downloadable ZIP
router.get('/export/:id', authMiddleware, (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const docs = run(`
      SELECT d.*, u.username as author_name,
      GROUP_CONCAT(DISTINCT t.name) as tags,
      c.name as category
      FROM documents d
      LEFT JOIN users u ON d.author_id = u.id
      LEFT JOIN document_tags dt ON d.id = dt.document_id
      LEFT JOIN tags t ON dt.tag_id = t.id
      LEFT JOIN document_categories dc ON d.id = dc.document_id
      LEFT JOIN categories c ON dc.category_id = c.id
      WHERE d.id = ? AND (d.visibility = 'public' OR d.author_id = ?)
      GROUP BY d.id
    `, [req.params.id, userId]) as any[];
    const doc = docs[0];
    if (!doc) {
      return res.status(404).json({ error: '文档不存在' });
    }

    const colRes = run('SELECT col.name FROM collections col JOIN document_categories dc ON col.id = dc.collection_id WHERE dc.document_id = ?', [doc.id]) as any[];
    doc.collection_name = colRes.length > 0 ? colRes[0].name : '';

    // Find all versions of this document title
    const allVersions = run(`
      SELECT d.*, u.username as author_name,
      GROUP_CONCAT(DISTINCT t.name) as tags,
      c.name as category
      FROM documents d
      LEFT JOIN users u ON d.author_id = u.id
      LEFT JOIN document_tags dt ON d.id = dt.document_id
      LEFT JOIN tags t ON dt.tag_id = t.id
      LEFT JOIN document_categories dc ON d.id = dc.document_id
      LEFT JOIN categories c ON dc.category_id = c.id
      WHERE d.title = ? AND (d.visibility = 'public' OR d.author_id = ?)
      GROUP BY d.id
      ORDER BY d.version ASC
    `, [doc.title, userId]) as any[];

    for (const v of allVersions) {
      const colRes = run('SELECT col.name FROM collections col JOIN document_categories dc ON col.id = dc.collection_id WHERE dc.document_id = ?', [v.id]) as any[];
      v.collection_name = colRes.length > 0 ? colRes[0].name : '';
    }

    if (allVersions.length === 1) {
      // Single version - direct download
      const frontMatter = `---
title: ${doc.title}
version: ${doc.version || 0}
category: ${doc.category || ''}
collection: ${doc.collection_name || ''}
tags: ${doc.tags || ''}
visibility: ${doc.visibility}
created_at: ${doc.created_at}
updated_at: ${doc.updated_at}
author: ${doc.author_name}
---

`;
      const content = frontMatter + (doc.content || '');
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(doc.title)}.md"`);
      return res.send(content);
    }

    // Multiple versions - ZIP
    const AdmZip = require('adm-zip');
    const zip = new AdmZip();
    for (const v of allVersions) {
      const frontMatter = `---
title: ${v.title}
version: ${v.version || 0}
category: ${v.category || ''}
collection: ${v.collection_name || ''}
tags: ${v.tags || ''}
visibility: ${v.visibility}
created_at: ${v.created_at}
updated_at: ${v.updated_at}
author: ${v.author_name}
---

`;
      const label = v.version > 0 ? `${v.title}_v${v.version}` : v.title;
      zip.addFile(`${label}.md`, Buffer.from(frontMatter + (v.content || '')));
    }
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(doc.title)}.zip"`);
    return res.send(zip.toBuffer());
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;