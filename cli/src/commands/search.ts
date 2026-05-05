import { Command } from 'commander';
import { CeluKnowAPI } from '../api.js';
import chalk from 'chalk';

export const searchCommand = new Command('search')
  .description('搜索文档')
  .argument('<keyword>', '搜索关键词')
  .option('-l, --limit <n>', '返回结果数', '10')
  .option('-c, --category <name>', '按分类筛选')
  .option('-s, --server <url>', '服务端地址')
  .option('-t, --token <token>', '认证 token')
  .action(async (keyword: string, opts) => {
    const server = opts.server || process.env.CELUKNOW_SERVER;
    const token = opts.token || process.env.CELUKNOW_TOKEN;
    
    if (!server || !token) {
      console.error(chalk.red('✖ 错误: 请通过 --server 和 --token 指定服务端和 token'));
      process.exit(1);
    }

    const api = new CeluKnowAPI(server, token);
    
    try {
      console.log(chalk.gray(`⋮ 搜索 "${keyword}"...`));
      const results = await api.searchDocuments(keyword, {
        limit: parseInt(opts.limit),
        category: opts.category
      });
      
      if (results.length === 0) {
        console.log(chalk.yellow('◉ 未找到匹配文档'));
        return;
      }
      
      console.log(chalk.cyan(`\n🔍 找到 ${results.length} 个结果:\n`));
      results.forEach((doc: any) => {
        console.log(`  ${chalk.bold(`[${doc.id}]`)} ${chalk.bold(doc.title)}`);
        console.log(`    👤 ${doc.author_name} · 👁 ${doc.view_count} · 📁 ${doc.category_ids || '未分类'}`);
        console.log(`    ${chalk.gray(doc.content?.slice(0, 80).replace(/\n/g, ' ') + '...')}`);
        console.log();
      });
    } catch (err: any) {
      console.error(chalk.red('✖ 搜索失败:'), err.response?.data?.error || err.message);
      process.exit(1);
    }
  });