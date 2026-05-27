# AI Agent Integration Guide

本指南帮助 AI 智能体（Claude、OpenClaw、Hermes 等）通过 `celuknow` CLI 工具接入 CeluKnow 知识库。

## 一键安装

```bash
# 1. 进入 CLI 目录，安装依赖并编译
cd cli && npm install && npm run build

# 2. 设置服务端地址（持久化到 shell 配置）
export CELUKNOW_SERVER=http://localhost:3001

# 3. 首次登录获取 Token（7 天有效）
npx ts-node src/index.ts login -u <用户名> -p <密码>
# 或使用编译版本：
node dist/index.js login -u <用户名> -p <密码>

# 4. 设置 Token 环境变量
export CELUKNOW_TOKEN=<上一步获取的token>

# 5. 验证安装
celuknow query "test" -l 1
```

### 使用 npm link（可选）

```bash
cd cli && npm link
# 之后可直接使用 celuknow 命令
```

### 使用 npx（可选，无需 link）

```bash
# 每次用 npx 调用
npx ts-node cli/src/index.ts query "关键词"
# 或编译后
node cli/dist/index.js query "关键词"
```

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `CELUKNOW_SERVER` | 服务端地址 | `http://localhost:3001` |
| `CELUKNOW_TOKEN` | 认证 Token（7 天有效） | 无 |
| `CELUKNOW_EDITOR_URI` | 编辑器 URI（默认 VS Code） | `vscode://file/{path}:{line}:{col}` |

## 命令参考

### query — 深度查询（FTS5 BM25 推荐）

```bash
celuknow query <搜索词> [选项]
```

核心命令。使用 SQLite FTS5 BM25 全文索引，毫秒级返回带分数的结果。

| 选项 | 说明 | 默认 |
|------|------|------|
| `-l, --limit <n>` | 最大结果数 | 10 |
| `--full` | 返回完整文档内容 | false |
| `--related` | 返回关联文档（同分类） | false |
| `--explain` | 显示 FTS5 BM25 评分明细 | false |
| `--min-score <n>` | 最低分数阈值（0~10+） | 0 |
| `--json` | JSON 格式输出（AI 消费用） | false |
| `--md` | Markdown 格式输出 | false |

**使用示例：**

```bash
# AI 取用：搜索 + 完整内容 + JSON
celuknow query "机器学习" -l 5 --full --json

# 探索式：搜索 + 关联内容
celuknow query "项目规划" --related

# 精确式：高阈值过滤
celuknow query "错误处理" --min-score 1.0 --json

# 诊断式：看为什么匹配
celuknow query "API设计" --explain --json

# 展示式：Markdown 输出
celuknow query "架构设计" -l 3 --md
```

### get — 获取文档详情

```bash
celuknow get <ID> [选项]
```

| 选项 | 说明 |
|------|------|
| `-r, --related` | 同时显示关联文档 |
| `--json` | JSON 格式输出 |

### index — 知识索引概览

```bash
celuknow index [选项]
```

显示系统分类、用户分类、标签及其文档列表。

| 选项 | 说明 |
|------|------|
| `--json` | JSON 格式输出 |

### search — 搜索（旧版，无排序）

```bash
celuknow search <关键词> [选项]
```

基于 SQL LIKE 的简单搜索，无相关性排序。优先使用 `query`。

### list — 文档列表

```bash
celuknow list [选项]
```

### 通用选项

所有命令支持：
- `-s, --server <url>` 服务端地址（覆盖环境变量）
- `-t, --token <token>` 认证 Token（覆盖环境变量）

## JSON 输出格式

### query 输出

```json
{
  "query": "搜索词",
  "total": 5,
  "results": [
    {
      "id": 1,
      "title": "文档标题",
      "score": 1.02,
      "snippet": "匹配内容摘要（无 --full 时）...",
      "content": "完整文档内容（有 --full 时）",
      "author_name": "用户名",
      "tags": "标签1,标签2",
      "category_names": "分类1,分类2",
      "view_count": 10,
      "comment_count": 2,
      "explain": {
        "method": "FTS5 BM25",
        "query": "搜索词",
        "raw_rank": -1.02
      },
      "related": {
        "same_category": [
          { "id": 2, "title": "相关文档", "category": "分类1" }
        ]
      }
    }
  ]
}
```

### index 输出

```json
{
  "systemCategories": [
    { "name": "实体 (Entities)", "docTitles": ["文档A", "文档B"] },
    { "name": "概念 (Concepts)", "docTitles": ["文档C"] }
  ],
  "userCategories": [
    { "name": "我的分类", "docTitles": ["文档D"] }
  ],
  "tags": [
    { "name": "重要", "docTitles": ["文档A", "文档D"] }
  ]
}
```

## Agent 工作流

### 场景 1：知识问答

```markdown
1. celuknow index --json          # 了解知识库结构
2. celuknow query "问题" --json   # 搜索相关文档
3. 解析 JSON，提取相关结果
4. celuknow get <ID> --json       # 获取具体文档全文
5. 整合结果回答问题
```

### 场景 2：深度研究

```markdown
1. celuknow query "主题" -l 10 --full --json   # 搜索并获取全文
2. celuknow query "主题" --related --json       # 获取关联内容
3. 整合所有文档，生成研究报告
```

### 场景 3：知识库维护

```markdown
1. celuknow index --json             # 查看当前结构
2. celuknow query "旧概念" --json    # 查找需要更新的内容
3. 使用 API 创建或更新文档
```

## 分数说明

FTS5 BM25 分数范围及含义：

| 分数 | 含义 |
|------|------|
| 2.0+ | 极高相关（标题精确匹配） |
| 1.0~2.0 | 高度相关 |
| 0.5~1.0 | 中度相关 |
| 0.0~0.5 | 低度相关 |

## 注意事项

- Token 有效期 7 天，过期需重新 `celuknow login`
- `query` 使用 FTS5 `unicode61` 分词器，支持中文
- 搜索语法支持：`"短语匹配"` `前缀*` `+必须 -排除`
- 关联文档仅返回同分类文档（--related），不包含所有图链接
