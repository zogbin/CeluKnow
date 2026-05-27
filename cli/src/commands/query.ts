import { Command } from 'commander';
import { CeluKnowAPI } from '../api.js';
import chalk from 'chalk';

export const queryCommand = new Command('query')
  .description('深度查询 (FTS5 BM25) - 搜索文档并返回完整上下文和关联内容')
  .argument('<text>', '搜索关键词')
  .option('-l, --limit <n>', '最大结果数', '10')
  .option('--full', '返回完整文档内容')
  .option('--related', '返回关联文档（同分类）')
  .option('--explain', '显示评分明细')
  .option('--min-score <n>', '最低 BM25 分数阈值', '0')
  .option('--json', '以 JSON 格式输出（供 AI 消费）')
  .option('--md', '以 Markdown 格式输出')
  .option('-s, --server <url>', '服务端地址')
  .option('-t, --token <token>', '认证 token')
  .action(async (text: string, opts) => {
    const server = opts.server || process.env.CELUKNOW_SERVER;
    const token = opts.token || process.env.CELUKNOW_TOKEN;

    if (!server || !token) {
      console.error(chalk.red('✖ 错误: 请通过 --server 和 --token 指定服务端和 token'));
      process.exit(1);
    }

    const api = new CeluKnowAPI(server, token);
    const limit = parseInt(opts.limit);
    const minScore = parseFloat(opts.minScore);

    try {
      const result = await api.queryDocuments({
        q: text,
        limit,
        min_score: minScore,
        full: opts.full || false,
        related: opts.related || false,
        explain: opts.explain || false,
      });

      if (result.results.length === 0) {
        if (opts.json) {
          console.log(JSON.stringify({ query: text, total: 0, results: [] }));
        } else {
          console.log(chalk.yellow('◉ 未找到匹配文档'));
        }
        return;
      }

      if (opts.json) {
        console.log(JSON.stringify({
          query: text,
          timestamp: new Date().toISOString(),
          total: result.total,
          results: result.results,
        }, null, 2));
        return;
      }

      if (opts.md) {
        console.log(`# 查询: "${text}"\n`);
        console.log(`共 ${result.total} 个结果\n`);

        for (const doc of result.results) {
          const cats = doc.category_names || '未分类';
          const tags = doc.tags || '';
          const scoreBar = getScoreBar(doc.score);

          console.log(`## [${doc.id}] ${doc.title}\n`);
          console.log(`- **分数**: ${doc.score.toFixed(4)} ${scoreBar}`);
          console.log(`- **作者**: ${doc.author_name}`);
          console.log(`- **分类**: ${cats}`);
          if (tags) console.log(`- **标签**: ${tags}`);
          console.log(`- **浏览**: ${doc.view_count}  |  **评论**: ${doc.comment_count}`);
          if (doc.explain) {
            console.log(`- **评分**: ${doc.explain.method} | 查询: \`${doc.explain.query}\``);
          }
          console.log();

          const content = doc.content || doc.snippet || '';
          if (content) {
            const lines = content.split('\n').filter((l: string) => l.trim());
            for (const line of lines.slice(0, 20)) {
              console.log(line);
            }
            if (lines.length > 20) console.log(`\n... (${content.length} 字符)`);
          }

          if (doc.related?.same_category?.length > 0) {
            console.log(`\n**同分类文档**:`);
            for (const r of doc.related.same_category) {
              console.log(`- [${r.id}] ${r.title} (${r.category})`);
            }
          }
          console.log(`\n---\n`);
        }
        return;
      }

      console.log(chalk.cyan(`\n🔍 查询: "${text}"  ·  FTS5 BM25  ·  共 ${result.total} 个结果\n`));

      for (const doc of result.results) {
        const cats = doc.category_names || '未分类';
        const tags = doc.tags || '';
        const scoreStr = scoreColor(doc.score, `${doc.score.toFixed(2)}`);

        console.log(`  ${chalk.bold(`[${doc.id}]`)} ${chalk.bold(doc.title)}`);
        console.log(`    ${chalk.gray('分数:')} ${scoreStr}  ${chalk.gray('作者:')} ${doc.author_name}`);

        if (cats) console.log(`    ${chalk.gray('分类:')} ${cats}`);
        if (tags) console.log(`    ${chalk.gray('标签:')} ${tags}`);

        if (doc.explain) {
          console.log(`    ${chalk.gray('评分:')} ${doc.explain.method} 查询: "${doc.explain.query}"`);
        }

        const snippet = doc.snippet || doc.content || '';
        if (snippet) {
          console.log(`    ${chalk.gray('─'.repeat(60))}`);
          const lines = snippet.split('\n').slice(0, 8).map((l: string) => `    ${l}`);
          for (const line of lines) {
            if (line.trim()) console.log(line);
          }
          if (snippet.length > 300) console.log(chalk.gray(`    ... (${snippet.length} 字符)`));
        }

        if (doc.related?.same_category?.length > 0) {
          console.log(chalk.gray(`    ── 关联 ──`));
          for (const r of doc.related.same_category.slice(0, 5)) {
            console.log(chalk.gray(`    📁 [${r.id}] ${r.title}`));
          }
        }
        console.log();
      }
    } catch (err: any) {
      console.error(chalk.red('✖ 查询失败:'), err.response?.data?.error || err.response?.data?.detail || err.message);
      process.exit(1);
    }
  });

function scoreColor(score: number, text: string): string {
  if (score > 1.0) return chalk.green(text);
  if (score > 0.5) return chalk.yellow(text);
  return chalk.gray(text);
}

function getScoreBar(score: number): string {
  const bars = Math.min(Math.round(score * 10), 10);
  return '█'.repeat(bars) + '░'.repeat(10 - bars);
}
