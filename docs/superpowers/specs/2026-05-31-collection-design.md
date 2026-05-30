# 合集（Collection）功能设计

## 概述

合集是分类下的系列文档集合，用于将同一分类下的文档按主题分组，并在侧边栏和文档列表中折叠展示。

## 约束

- 一个文档只能属于一个合集
- 一个合集中的所有文档都属于同一个分类
- 一个分类可以包含多个合集
- 合集在分类详情页内管理

## 数据模型

### collections 表

```sql
CREATE TABLE IF NOT EXISTS collections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id),
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(category_id, name)
);
```

### document_categories 新增列

```sql
ALTER TABLE document_categories ADD COLUMN collection_id INTEGER DEFAULT NULL REFERENCES collections(id) ON DELETE SET NULL;
ALTER TABLE document_categories ADD COLUMN collection_sort_order INTEGER DEFAULT 0;
```

通过 `document_categories.collection_id` 将文档关联到合集，`collection_sort_order` 控制合集内的排序。

## 后端 API

### 合集 CRUD

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/categories/:id/collections` | 获取分类下的合集列表（含文档） |
| POST | `/collections` | 创建合集 `{ category_id, name }` |
| PUT | `/collections/:id` | 重命名合集 `{ name }` |
| DELETE | `/collections/:id` | 删除合集（文档保留，collection_id 置 NULL） |
| PUT | `/collections/:id/reorder` | 合集内文档排序 `{ doc_ids: [...] }` |
| PUT | `/collections/reorder` | 分类内合集排序 `{ category_id, collection_ids: [...] }` |
| POST | `/documents/:id/collection` | 设置文档所属合集 `{ collection_id }` |
| DELETE | `/documents/:id/collection` | 移除文档所属合集 |

### 现有端点变更

- `GET /categories/:id/documents` — 返回结果增加 `collection_id`、`collection_sort_order`、`collection_name` 字段，按 `collection_sort_order` 排序
- `GET /sidebar-data` — 返回结构增加 collections 嵌套在 categories 下
- `GET /` (documents list) — 返回结果增加 `collection_id`、`collection_name` 字段

## 前端

### 分类详情页（TaxonomyPage）

展开分类后，文档列表按合集分组展示：

```
分类名
├── 📚 合集 A (可折叠)
│   ├── Doc 1  [↑][↓] [×]
│   ├── Doc 2  [↑][↓] [×]
│   └── Doc 3  [↑][↓] [×]
│   [+ 分配文档]  [重命名]  [删除合集]
├── Doc 4 (无合集) [×]
└── [+ 新建合集]  [+ 分配文档]
```

- 合集名显示 📚 图标标记
- 合集可折叠/展开
- 合集中的文档可上下移动排序（与现有分类排序 UI 一致）
- 支持拖拽分配文档到合集
- 新建合集弹窗：输入名称
- 重命名合集：点击合集名旁编辑按钮

### 侧边栏（Sidebar）

```
分类名
├── 📚 合集 A
│   ├── Doc 1
│   ├── Doc 2
│   └── Doc 3
├── 📚 合集 B
│   ├── Doc 4
│   └── Doc 5
├── Doc 6 (无合集)
└── Doc 7 (无合集)
```

- 合集名显示 📚 图标标记
- 合集可折叠/展开，默认折叠
- 展开后显示合集中的所有文档
- 点击合集名切换展开状态

### 首页文档列表（Home）

```
📚 合集 A — Doc 1  [展开按钮]
  ├── Doc 1
  ├── Doc 2
  └── Doc 3
```

- 合集折叠时显示合集名 + 第一篇文档标题
- 展开后显示所有文档
- 合集名旁显示 📚 图标标记

## 迁移

- `server/src/db.ts` 添加 collections 表创建 + document_categories 列迁移
- `server/src/routes/` 新增 `collections.ts` 路由文件
- routes/documents.ts、categories.ts、sidebar-data 端点做相应调整

## 实现顺序

1. 数据库迁移（collections 表 + document_categories 新列）
2. 后端 collections CRUD API
3. 修改现有端点（categories docs、sidebar-data、documents list）
4. TaxonomyPage 合集管理 UI
5. Sidebar 合集展示
6. Home 合集折叠展示
