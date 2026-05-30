import path from 'path';
import fs from 'fs';

const { DatabaseSync } = require('node:sqlite') as { DatabaseSync: any };

const dataDir = path.join(__dirname, '../../data');
const dbPath = path.join(dataDir, 'knowledge.db');

let db: any;

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    nickname TEXT DEFAULT '',
    password_hash TEXT NOT NULL,
    role TEXT DEFAULT 'viewer' CHECK(role IN ('admin', 'editor', 'viewer')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    folder_path TEXT DEFAULT '/',
    content TEXT,
    author_id INTEGER NOT NULL,
    visibility TEXT DEFAULT 'private' CHECK(visibility IN ('public', 'private')),
    version INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (author_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS document_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    author_id INTEGER NOT NULL,
    message TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (document_id) REFERENCES documents(id),
    FOREIGN KEY (author_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    UNIQUE(name, user_id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS document_tags (
    document_id INTEGER NOT NULL,
    tag_id INTEGER NOT NULL,
    sort_order INTEGER DEFAULT 0,
    PRIMARY KEY (document_id, tag_id),
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    color TEXT DEFAULT '#6366F1',
    icon TEXT DEFAULT 'folder',
    is_system INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(name, user_id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS document_categories (
    document_id INTEGER NOT NULL,
    category_id INTEGER NOT NULL,
    sort_order INTEGER DEFAULT 0,
    PRIMARY KEY (document_id, category_id),
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
  );

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
  );

  CREATE TABLE IF NOT EXISTS likes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(document_id, user_id),
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS document_views (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    viewed_at DATE DEFAULT (date('now')),
    UNIQUE(document_id, user_id, viewed_at),
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

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
  );

  CREATE TABLE IF NOT EXISTS meeting_agendas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    meeting_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE
  );

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
    parent_id INTEGER REFERENCES meeting_materials(id) ON DELETE CASCADE,
    is_folder INTEGER DEFAULT 0,
    agenda_id INTEGER REFERENCES meeting_agendas(id) ON DELETE SET NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE,
    FOREIGN KEY (uploader_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS meeting_attendees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    meeting_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(meeting_id, user_id),
    FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`;

export function initDb(): void {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const { DatabaseSync } = require('node:sqlite') as { DatabaseSync: any };
  db = new DatabaseSync(dbPath);

  db.exec('PRAGMA journal_mode=WAL');
  db.exec('PRAGMA synchronous=NORMAL');
  db.exec('PRAGMA foreign_keys=ON');

  db.exec(SCHEMA_SQL);

  runMigrations();
  ensureFTS5();
}

function hasColumn(table: string, column: string): boolean {
  try {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all() as any[];
    return cols.some((c: any) => c.name === column);
  } catch { return false; }
}

function runMigrations(): void {
  const migs: [string, string, string?][] = [
    ['comments', 'parent_id', 'INTEGER REFERENCES comments(id) ON DELETE CASCADE'],
    ['users', 'nickname', "TEXT DEFAULT ''"],
    ['documents', 'visibility', "TEXT DEFAULT 'private'"],
  ];
  for (const [table, col, colType] of migs) {
    if (!hasColumn(table, col)) {
      try { db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${colType}`); } catch {}
    }
  }

  if (!hasColumn('categories', 'user_id')) {
    try {
      db.exec("ALTER TABLE categories ADD COLUMN user_id INTEGER");
      const userResult = db.prepare("SELECT id FROM users LIMIT 1").all() as any[];
      if (userResult.length > 0) {
        db.prepare("UPDATE categories SET user_id = ? WHERE user_id IS NULL").run(userResult[0].id);
      }
    } catch (e) { console.log('categories user_id migration:', e); }
  }

  if (!hasColumn('categories', 'is_system')) {
    try { db.exec("ALTER TABLE categories ADD COLUMN is_system INTEGER DEFAULT 0"); } catch (e) { console.log('categories is_system migration:', e); }
  }

  try {
    const existingSystem = db.prepare("SELECT id, name FROM categories WHERE is_system = 1").all() as any[];
    const existingSystemNames = existingSystem.map((r: any) => r.name);
    for (const catName of ['entities', 'concepts']) {
      if (!existingSystemNames.includes(catName)) {
        const adminUser = db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").all() as any[];
        const adminId = adminUser[0]?.id || 1;
        db.prepare("INSERT INTO categories (name, user_id, color, icon, is_system) VALUES (?, ?, ?, ?, 1)").run(catName, adminId, '#8B5CF6', 'globe');
      }
    }
  } catch (e) { console.log('categories seed:', e); }

  if (!hasColumn('tags', 'user_id')) {
    try {
      db.exec("ALTER TABLE tags ADD COLUMN user_id INTEGER");
      const userResult = db.prepare("SELECT id FROM users LIMIT 1").all() as any[];
      if (userResult.length > 0) {
        db.prepare("UPDATE tags SET user_id = ? WHERE user_id IS NULL").run(userResult[0].id);
      }
    } catch (e) { console.log('tags migration:', e); }
  }

  for (const [table, col] of [['document_categories', 'sort_order'], ['document_tags', 'sort_order']]) {
    if (!hasColumn(table, col)) {
      try { db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} INTEGER DEFAULT 0`); } catch (e) { console.log(`${table} migration:`, e); }
    }
  }

  if (!hasColumn('meetings', 'meeting_end')) {
    try { db.exec('ALTER TABLE meetings ADD COLUMN meeting_end DATETIME'); } catch (e) { console.log('meetings migration:', e); }
  }

  if (!hasColumn('documents', 'version')) {
    try { db.exec('ALTER TABLE documents ADD COLUMN version INTEGER DEFAULT 0'); } catch (e) { console.log('documents version migration:', e); }
  }
}

function ensureFTS5(): void {
  try {
    const existing = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='documents_fts'").all() as any[];
    const hasFTS = existing.length > 0;

    if (!hasFTS) {
      db.exec(`CREATE VIRTUAL TABLE documents_fts USING fts5(
        title, content,
        content=documents,
        content_rowid=id,
        tokenize='unicode61'
      )`);
      db.exec("INSERT INTO documents_fts(rowid, title, content) SELECT id, title, content FROM documents");
      db.exec(`CREATE TRIGGER IF NOT EXISTS documents_fts_ai AFTER INSERT ON documents BEGIN
        INSERT INTO documents_fts(rowid, title, content) VALUES (new.id, new.title, new.content);
      END`);
      db.exec(`CREATE TRIGGER IF NOT EXISTS documents_fts_ad AFTER DELETE ON documents BEGIN
        INSERT INTO documents_fts(documents_fts, rowid, title, content) VALUES('delete', old.id, old.title, old.content);
      END`);
      db.exec(`CREATE TRIGGER IF NOT EXISTS documents_fts_au AFTER UPDATE ON documents BEGIN
        INSERT INTO documents_fts(documents_fts, rowid, title, content) VALUES('delete', old.id, old.title, old.content);
        INSERT INTO documents_fts(rowid, title, content) VALUES (new.id, new.title, new.content);
      END`);
    }
    console.log('FTS5: ready');
  } catch (e) {
    console.error('FTS5 setup failed (will fall back to LIKE search):', e);
  }
}

export function run(sql: string, params: any[] = []): any[] {
  const stmt = db.prepare(sql);
  return stmt.all(...params);
}

export function runInsert(sql: string, params: any[] = []): number {
  const stmt = db.prepare(sql);
  const result = stmt.run(...params);
  return Number(result.lastInsertRowid);
}

export function runUpdate(sql: string, params: any[] = []): void {
  const stmt = db.prepare(sql);
  stmt.run(...params);
}

export function getDb(): any {
  return db;
}
