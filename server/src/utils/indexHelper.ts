import { run } from '../db';

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function getSystemCategoryIds(): number[] {
  const cats = run('SELECT id FROM categories WHERE is_system = 1') as any[];
  return cats.map((c: any) => c.id);
}

export function getSystemDocTitles(userId: number): string[] {
  const catIds = getSystemCategoryIds();
  if (catIds.length === 0) return [];
  const placeholders = catIds.map(() => '?').join(',');
  const docs = run(`
    SELECT DISTINCT d.title FROM documents d
    JOIN document_categories dc ON d.id = dc.document_id
    WHERE dc.category_id IN (${placeholders})
      AND (d.visibility = 'public' OR d.author_id = ?)
  `, [...catIds, userId]) as any[];
  return docs.map((d: any) => d.title);
}

export function autoLinkContent(content: string, docId: number, userId: number): string {
  const titles = getSystemDocTitles(userId);

  const currentDoc = run('SELECT title FROM documents WHERE id = ?', [docId]) as any[];
  const selfTitle = currentDoc[0]?.title;

  let result = content;
  for (const title of titles) {
    if (title === selfTitle) continue;
    if (title.length < 2) continue;

    const encoded = encodeURIComponent(title);
    const placeholder = `__SYS_LINK_${encoded}__`;

    const linkPattern = new RegExp(escapeRegex(`[[${title}]]`), 'g');
    result = result.replace(linkPattern, placeholder);

    const barePattern = new RegExp(escapeRegex(title), 'g');
    result = result.replace(barePattern, `[[${title}]]`);

    const restorePattern = new RegExp(escapeRegex(placeholder), 'g');
    result = result.replace(restorePattern, `[[${title}]]`);
  }

  return result;
}

export interface IndexSection {
  name: string
  docTitles: string[]
}

export interface IndexData {
  systemCategories: IndexSection[]
  userCategories: IndexSection[]
  tags: IndexSection[]
}

export function getIndexData(userId: number): IndexData {
  const systemCategories: IndexSection[] = [];
  const userCategories: IndexSection[] = [];
  const tags: IndexSection[] = [];

  const systemCats = run('SELECT * FROM categories WHERE is_system = 1 ORDER BY name') as any[];
  for (const cat of systemCats) {
    const docs = run(`
      SELECT d.title FROM documents d
      JOIN document_categories dc ON d.id = dc.document_id
      WHERE dc.category_id = ? AND (d.visibility = 'public' OR d.author_id = ?)
      ORDER BY dc.sort_order ASC, d.title
    `, [cat.id, userId]) as any[];
    if (docs.length > 0) {
      const label = cat.name === 'entities' ? '实体 (Entities)' : cat.name === 'concepts' ? '概念 (Concepts)' : cat.name;
      systemCategories.push({ name: label, docTitles: docs.map((d: any) => d.title) });
    }
  }

  const userCats = run('SELECT * FROM categories WHERE user_id = ? AND is_system = 0 ORDER BY name', [userId]) as any[];
  for (const cat of userCats) {
    const docs = run(`
      SELECT d.title FROM documents d
      JOIN document_categories dc ON d.id = dc.document_id
      WHERE dc.category_id = ? AND (d.visibility = 'public' OR d.author_id = ?)
      ORDER BY dc.sort_order ASC, d.title
    `, [cat.id, userId]) as any[];
    if (docs.length > 0) {
      userCategories.push({ name: cat.name, docTitles: docs.map((d: any) => d.title) });
    }
  }

  const userTags = run('SELECT * FROM tags WHERE user_id = ? ORDER BY name', [userId]) as any[];
  for (const tag of userTags) {
    const docs = run(`
      SELECT d.title FROM documents d
      JOIN document_tags dt ON d.id = dt.document_id
      WHERE dt.tag_id = ? AND (d.visibility = 'public' OR d.author_id = ?)
      ORDER BY dt.sort_order ASC, d.title
    `, [tag.id, userId]) as any[];
    if (docs.length > 0) {
      tags.push({ name: tag.name, docTitles: docs.map((d: any) => d.title) });
    }
  }

  return { systemCategories, userCategories, tags };
}

export function rebuildUserIndex(userId: number): void {
  // Remove old index documents - the index is now served via API
  const existing = run('SELECT id FROM documents WHERE title = ? AND author_id = ?', ['📚 知识索引', userId]) as any[];
  for (const doc of existing) {
    run('DELETE FROM document_tags WHERE document_id = ?', [doc.id]);
    run('DELETE FROM document_categories WHERE document_id = ?', [doc.id]);
    run('DELETE FROM documents WHERE id = ?', [doc.id]);
  }
}
