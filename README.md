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
- **Front Matter** - 支持 YAML 头部元数据（title、category、tags、visibility、author、created、updated）
- **拖拽归类** - 拖拽文档到分类文件夹
- **评论系统** - 支持发表评论、回复评论、添加表情
- **全文搜索** - 快速检索文档标题和内容
- **批量操作** - 批量删除文档、点赞、评论
- **个人中心** - 统一管理我的文档、点赞、评论，支持修改密码
- **CLI工具集** - 支持通过AI工具调用的login, import, export, search, list, get, delete

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

## CLI 工具

CeluKnow 提供命令行工具供自动化脚本使用。

### 安装

```bash
cd cli
npm install
npm run link
```

### 使用方法

```bash
# 设置环境变量（添加到 ~/.bashrc 或 ~/.zshrc 持久化）
export CELUKNOW_SERVER=http://localhost:3001
export CELUKNOW_TOKEN=your_token

# 查看帮助
celuknow --help

# 登录获取 token（有效期 7 天）
celuknow login -u username -p password

# 文档操作
celuknow list                     # 列出文档
celuknow search "关键词"           # 搜索文档
celuknow get 1                    # 查看文档详情
celuknow import file.md            # 导入 Markdown 文件
celuknow import ./docs            # 导入整个目录
celuknow export -o ./backup       # 导出为 ZIP
celuknow delete 1 --force         # 删除文档
```

### 命令选项

| 命令 | 说明 |
|------|------|
| `login` | 用户登录获取 token |
| `list` | 列出所有文档 |
| `search <keyword>` | 搜索文档 |
| `get <id>` | 获取文档详情 |
| `import <file>` | 导入 Markdown 文件或目录 |
| `export` | 导出所有文档为 ZIP |
| `delete <id>` | 删除文档 |

所有命令支持以下全局选项：
- `-s, --server <url>` - 服务端地址
- `-t, --token <token>` - 认证 token

也可以通过环境变量 `CELUKNOW_SERVER` 和 `CELUKNOW_TOKEN` 设置。

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