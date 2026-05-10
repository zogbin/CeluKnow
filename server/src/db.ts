import initSqlJs, { Database } from 'sql.js';
import path from 'path';
import fs from 'fs';

const dataDir = path.join(__dirname, '../../data');
const dbPath = path.join(dataDir, 'knowledge.db');

let db: Database;

export async function initDb(): Promise<Database> {
  const SQL = await initSqlJs();
  
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  
  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  try {
    db.run("ALTER TABLE comments ADD COLUMN parent_id INTEGER REFERENCES comments(id) ON DELETE CASCADE");
  } catch (e) {}

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'viewer' CHECK(role IN ('admin', 'editor', 'viewer')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      folder_path TEXT DEFAULT '/',
      content TEXT,
      author_id INTEGER NOT NULL,
      visibility TEXT DEFAULT 'private' CHECK(visibility IN ('public', 'private')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (author_id) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS document_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      author_id INTEGER NOT NULL,
      message TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (document_id) REFERENCES documents(id),
      FOREIGN KEY (author_id) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      UNIQUE(name, user_id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS document_tags (
      document_id INTEGER NOT NULL,
      tag_id INTEGER NOT NULL,
      PRIMARY KEY (document_id, tag_id),
      FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
      FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      color TEXT DEFAULT '#6366F1',
      icon TEXT DEFAULT 'folder',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(name, user_id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS document_categories (
      document_id INTEGER NOT NULL,
      category_id INTEGER NOT NULL,
      PRIMARY KEY (document_id, category_id),
      FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      parent_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (parent_id) REFERENCES comments(id) ON DELETE CASCADE
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS likes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(document_id, user_id),
      FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS document_views (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      viewed_at DATE DEFAULT (date('now')),
      UNIQUE(document_id, user_id, viewed_at),
      FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  try { db.run("ALTER TABLE documents ADD COLUMN visibility TEXT DEFAULT 'private'") } catch {}
  
  // Migrate categories - add user_id column
  try {
    const catCols = db.exec("PRAGMA table_info(categories)")
    const hasUserId = catCols[0]?.values?.some((row: any) => row[1] === 'user_id')
    if (!hasUserId) {
      db.run("ALTER TABLE categories ADD COLUMN user_id INTEGER")
      const userResult = db.exec("SELECT id FROM users LIMIT 1")
      if (userResult[0]?.values?.length > 0) {
        const firstUserId = userResult[0].values[0][0]
        db.run("UPDATE categories SET user_id = ? WHERE user_id IS NULL", [firstUserId])
      }
    }
  } catch (e) { console.log('categories migration:', e) }
  
  // Migrate tags - add user_id column
  try {
    const tagCols = db.exec("PRAGMA table_info(tags)")
    const tagHasUserId = tagCols[0]?.values?.some((row: any) => row[1] === 'user_id')
    if (!tagHasUserId) {
      db.run("ALTER TABLE tags ADD COLUMN user_id INTEGER")
      const userResult = db.exec("SELECT id FROM users LIMIT 1")
      if (userResult[0]?.values?.length > 0) {
        const firstUserId = userResult[0].values[0][0]
        db.run("UPDATE tags SET user_id = ? WHERE user_id IS NULL", [firstUserId])
      }
    }
  } catch (e) { console.log('tags migration:', e) }

  // Meetings table
  db.run(`
    CREATE TABLE IF NOT EXISTS meetings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      agenda TEXT,
      meeting_date DATETIME NOT NULL,
      meeting_end DATETIME NOT NULL,
      location TEXT,
      organizer_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (organizer_id) REFERENCES users(id)
    )
  `)

  try {
    const mtCols = db.exec("PRAGMA table_info(meetings)")
    const hasEnd = mtCols[0]?.values?.some((row: any) => row[1] === 'meeting_end')
    if (!hasEnd) {
      db.run("ALTER TABLE meetings ADD COLUMN meeting_end DATETIME")
    }
  } catch (e) { console.log('meetings migration:', e) }

  // Agendas table
  db.run(`
    CREATE TABLE IF NOT EXISTS meeting_agendas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      meeting_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE
    )
  `)

  // Meeting materials table
  db.run(`
    CREATE TABLE IF NOT EXISTS meeting_materials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      meeting_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      file_path TEXT,
      file_type TEXT,
      description TEXT,
      content TEXT,
      uploader_id INTEGER NOT NULL,
      sort_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE,
      FOREIGN KEY (uploader_id) REFERENCES users(id)
    )
  `)

  try {
    const mmCols = db.exec("PRAGMA table_info(meeting_materials)")
    const hasContent = mmCols[0]?.values?.some((row: any) => row[1] === 'content')
    if (!hasContent) {
      db.run("ALTER TABLE meeting_materials ADD COLUMN content TEXT")
    }
    const hasParentId = mmCols[0]?.values?.some((row: any) => row[1] === 'parent_id')
    if (!hasParentId) {
      db.run("ALTER TABLE meeting_materials ADD COLUMN parent_id INTEGER REFERENCES meeting_materials(id) ON DELETE CASCADE")
    }
    const hasIsFolder = mmCols[0]?.values?.some((row: any) => row[1] === 'is_folder')
    if (!hasIsFolder) {
      db.run("ALTER TABLE meeting_materials ADD COLUMN is_folder INTEGER DEFAULT 0")
    }
    const hasAgendaId = mmCols[0]?.values?.some((row: any) => row[1] === 'agenda_id')
    if (!hasAgendaId) {
      db.run("ALTER TABLE meeting_materials ADD COLUMN agenda_id INTEGER REFERENCES meeting_agendas(id) ON DELETE SET NULL")
    }
  } catch (e) { console.log('meeting_materials migration:', e) }

  try {
    const mmCols = db.exec("PRAGMA table_info(meeting_materials)")
    const hasOrder = mmCols[0]?.values?.some((row: any) => row[1] === 'sort_order')
    if (!hasOrder) {
      db.run("ALTER TABLE meeting_materials ADD COLUMN sort_order INTEGER DEFAULT 0")
    }
  } catch (e) { console.log('meeting_materials migration:', e) }

  // Meeting attendees table
  db.run(`
    CREATE TABLE IF NOT EXISTS meeting_attendees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      meeting_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(meeting_id, user_id),
      FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `)

  return db;
}

export function saveDb() {
  if (db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);
  }
}

export function getDb(): Database {
  if (!db) {
    throw new Error('Database not initialized');
  }
  return db;
}

export function run(sql: string, params: any[] = []): any {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const result: any[] = [];
  while (stmt.step()) {
    result.push(stmt.getAsObject());
  }
  stmt.free();
  return result;
}

export function runInsert(sql: string, params: any[] = []): number {
  db.run(sql, params);
  const result = db.exec('SELECT last_insert_rowid() as id');
  saveDb();
  return result[0]?.values[0]?.[0] as number || 0;
}

export function runUpdate(sql: string, params: any[] = []): void {
  db.run(sql, params);
  saveDb();
}