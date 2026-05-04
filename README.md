# CeluKnow 仓颉智库 - 轻量化知识分享系统

<div align="center">

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D16.0.0-green.svg)](https://nodejs.org)

</div>

## 简介

CeluKnow 是一个轻量化的本地知识分享系统，支持 Markdown 文档管理、多用户协作、知识图谱可视化等功能。

## 功能特性

- **多用户支持** - 基于角色的权限管理（admin/editor/viewer）
- **Markdown 文档** - 支持实时预览编辑
- **版本控制** - 完整的历史记录与回滚
- **知识关联** - `[[文档标题]]` 语法建立文档链接
- **知识图谱** - 可视化展示文档引用关系
- **批量导入导出** - 支持 ZIP 压缩包批量导入，自动按文件夹创建分类
- **Front Matter** - 支持 YAML 头部元数据（title、category、tags、visibility、author、created_at、updated_at）
- **拖拽归类** - 拖拽文档到分类文件夹
- **评论系统** - 支持发表评论、回复评论、添加表情
- **全文搜索** - 快速检索文档标题和内容
- **批量操作** - 批量删除文档、点赞、评论
- **个人中心** - 统一管理我的文档、点赞、评论，支持修改密码

## 环境要求

- Node.js >= 16.0.0
- npm >= 8.0.0

## 快速开始

### 安装依赖

```bash
# 方式一：使用安装脚本（推荐）
chmod +x install.sh && ./install.sh

# 方式二：手动安装
cd server && npm install
cd ../client && npm install
```

### 启动服务

```bash
# 终端1：启动后端
cd server && npm run dev

# 终端2：启动前端
cd client && npm run dev
```

访问 http://localhost:5173

### 默认账号

首次启动后，访问 http://localhost:5173 注册第一个账号（默认角色为 editor）

## 生产构建

```bash
# 构建前端
cd client && npm run build

# 启动生产服务器
cd ../server && npm run build && npm start
```

## 项目结构

```
celuknow/
├── client/               # React 前端
│   ├── src/
│   │   ├── api/          # API 客户端
│   │   ├── components/   # UI 组件
│   │   └── pages/        # 页面组件
│   └── package.json
├── server/               # Node.js 后端
│   ├── src/
│   │   ├── routes/       # API 路由
│   │   ├── middleware/   # 中间件
│   │   ├── db.ts         # 数据库
│   │   └── utils/        # 工具函数
│   └── package.json
├── docs/                 # 文档目录
│   └── HELP.md           # 使用帮助
├── data/                 # 数据目录
│   ├── knowledge.db      # SQLite 数据库
│   └── documents/        # Markdown 文件
├── install.sh            # 安装脚本
└── README.md
```

## 技术栈

- **前端**: React 18 + TypeScript + TailwindCSS + Vite
- **后端**: Node.js + Express + sql.js (SQLite)
- **认证**: JWT + bcrypt

## API 端点

### 认证

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/auth/register | 用户注册 |
| POST | /api/auth/login | 用户登录 |
| GET | /api/auth/me | 获取当前用户 |

### 文档

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/documents | 获取文档列表 |
| POST | /api/documents | 创建文档 |
| GET | /api/documents/:id | 获取文档详情 |
| PUT | /api/documents/:id | 更新文档 |
| DELETE | /api/documents/:id | 删除文档 |
| GET | /api/documents/graph | 获取知识图谱 |

### 版本

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/versions/document/:id | 获取版本历史 |
| POST | /api/versions/:id/restore | 恢复版本 |

### 分类与标签

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/categories | 获取分类列表 |
| POST | /api/categories | 创建分类 |
| GET | /api/tags | 获取标签列表 |
| POST | /api/tags | 创建标签 |

### 导入导出

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/import-export/import | 批量导入 |
| GET | /api/import-export/export | 导出为 ZIP |

## 许可证

MIT License - 查看 [LICENSE](LICENSE) 了解详情