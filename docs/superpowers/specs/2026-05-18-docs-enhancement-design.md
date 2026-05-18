# 文档管理增强设计

## 概述

对 CeluKnow 知识管理系统的文档首页、个人组织方式和知识图谱进行功能增强，支持分页浏览、公开文档的个人分类/标签、以及知识图谱的分类连线。

## 1. 文档首页分页

### 后端

`GET /api/documents` 增加分页参数：

- `page` (number, default=1) — 页码
- `pageSize` (number, default=5) — 每页条数

SQL 添加 `LIMIT ? OFFSET ?`，同时返回总条数。

**响应格式：**

```json
{
  "docs": [...],
  "total": 42,
  "page": 1,
  "pageSize": 5
}
```

### 前端

Home.tsx 卡片列表下方增加页码导航：

- 显示页码数字（1, 2, 3, ...）
- 当前页码高亮
- 第一页和最后一页时前一页/后一页按钮 disabled
- 请求时传递 `page` 参数，翻页时请求新数据
- 搜索同样需要分页支持

## 2. 公开文档的个人分类/标签

### 背景

`categories` 和 `tags` 表已有 `user_id` 字段，属于用户私有。`document_categories` 和 `document_tags` 通过 category/tag 的 owner 来区分分类/标签归属。

### 改动

**文档详情页面（DocumentPage.tsx）：**
- 底部分类/标签面板显示**当前用户的分类和标签**（已分配给该文档的选中，未分配的取消）
- 允许为任何可见的公开文档分配/取消当前用户的分类和标签
- 查询分类/标签时加入 `c.user_id = currentUser` 过滤

**首页文档卡片（Home.tsx）：**
- 卡片上显示的分类和标签限制为当前用户自己的
- GET /api/documents 返回的 category_ids/tags 按当前用户过滤

**后端 API：**
- `GET /api/documents` 返回的 category_ids 和 tags 按 `c.user_id = ?` 过滤
- 新增 `GET /api/documents/:id/categories?user_id=` 按用户过滤
- `POST /api/categories/:docId/categories` 无需修改（已有权限校验）

## 3. 知识图谱加入分类边

### 数据源

`GET /api/documents/graph` 返回的边增加分类数据：

### 边的优先级（去重）

同一对文档之间只保留一条边，优先级：
1. `type: 'link'` — `[[wiki链接]]` 最高优先级
2. `type: 'tag'` — 共享标签次之
3. `type: 'category'` — 共享分类最低优先级

### 后端改动

在 `server/src/routes/documents.ts` 的 graph 端点中：

1. 保留现有 wiki 链接边的生成逻辑
2. 保留现有共享标签边的生成逻辑
3. **新增共享分类边**：查询 `document_categories dc JOIN categories c ON dc.category_id = c.id`，找出共享同一分类的文档对
4. **去重**：用 Set<string> 记录已有的文档对 `(minId, maxId)`，新边只添加尚未连线的文档对

### 前端渲染

边样式：
- `type: 'link'` — 实线灰色（不变）
- `type: 'tag'` — 虚线琥珀色（不变）
- `type: 'category'` — 虚线绿色（新增）
