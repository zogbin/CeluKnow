# Bug 排查记录

## 问题描述

用户个人资料页面（Profile）的"我的点赞"和"我的评论" tab 栏显示数量为 0，但实际有数据。

## 排查过程

1. **初步分析**：检查前端代码，发现 likes 和 comments 初始值都是空数组
2. **API 检查**：验证 `/users/me/likes` 和 `/users/me/comments` 后端 API 逻辑正确
3. **数据库检查**：确认 likes 和 comments 表结构正常，有数据
4. **关键发现**：在浏览器控制台发现数据是延迟加载的 - 只有点击 tab 时才请求数据

## 根本原因

Profile.tsx 中 `useEffect` 只在 `activeTab` 变化时触发，初始只加载 docs 数据，likes 和 comments 没有预加载。导致 tab 栏显示 `likes.length` 和 `comments.length` 时始终为 0。

## 修复方案

在 Profile.tsx 中添加独立的 `useEffect` 在页面加载时预加载 likes 和 comments：

```tsx
useEffect(() => {
  api.get('/users/me/likes').then(res => setLikes(res.data)).catch(() => {})
  api.get('/users/me/comments').then(res => setComments(res.data)).catch(() => {})
}, [])

useEffect(() => {
  if (activeTab === 'docs') {
    api.get('/users/me/documents').then(res => setDocs(res.data)).catch(() => {})
  }
}, [activeTab])
```

## 修复日期

2026-05-02

---

## 新功能：评论回复 + 引用

### 设计方案
- UI 形式：二级嵌套显示
- 引用方式：自动引用块（用 > 开头）

### 实现步骤

#### 1. 数据库修改
- comments 表增加 parent_id 字段

#### 2. 后端 API
- GET /comments/document/:docId - 返回嵌套结构
- POST /comments/document/:docId - 支持 parent_id 参数

#### 3. 前端
- 每个评论显示"回复"按钮
- 点击回复：输入框显示 > 引用内容
- 回复以嵌套形式展示

### 完成日期

2026-05-02