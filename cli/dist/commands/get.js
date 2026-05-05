import { Command } from 'commander';
import { CeluKnowAPI } from '../api.js';
import chalk from 'chalk';
export const getCommand = new Command('get')
    .description('获取文档详情')
    .argument('<id>', '文档 ID')
    .option('-s, --server <url>', '服务端地址')
    .option('-t, --token <token>', '认证 token')
    .action(async (id, opts) => {
    const server = opts.server || process.env.CELUKNOW_SERVER;
    const token = opts.token || process.env.CELUKNOW_TOKEN;
    if (!server || !token) {
        console.error(chalk.red('✖ 错误: 请通过 --server 和 --token 指定服务端和 token'));
        process.exit(1);
    }
    const api = new CeluKnowAPI(server, token);
    try {
        console.log(chalk.gray(`⋮ 获取文档 #${id}...`));
        const doc = await api.getDocument(parseInt(id));
        console.log(chalk.cyan(`\n📄 ${doc.title}\n`));
        console.log(chalk.gray('  ─────────────────────'));
        console.log(`  ${chalk.bold('作者:')} ${doc.author_name}`);
        console.log(`  ${chalk.bold('可见性:')} ${doc.visibility === 'public' ? chalk.green('🌐 公开') : chalk.gray('🔒 私有')}`);
        console.log(`  ${chalk.bold('创建:')} ${doc.created_at}`);
        console.log(`  ${chalk.bold('分类:')} ${doc.category_names || '未分类'}`);
        console.log(`  ${chalk.bold('标签:')} ${doc.tags || chalk.gray('无')}`);
        console.log(chalk.gray('  ─────────────────────'));
        console.log(`  👁 ${doc.view_count} · 👍 ${doc.likes_count || 0} · 💬 ${doc.comment_count || 0}`);
        console.log(chalk.gray('  ─────────────────────\n'));
        console.log(doc.content);
    }
    catch (err) {
        console.error(chalk.red('✖ 获取文档失败:'), err.response?.data?.error || err.message);
        process.exit(1);
    }
});
