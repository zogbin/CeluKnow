import { Command } from 'commander';
import { CeluKnowAPI } from '../api.js';
export const searchCommand = new Command('search')
    .description('搜索文档')
    .argument('<keyword>', '搜索关键词')
    .option('-l, --limit <n>', '返回结果数', '10')
    .option('-c, --category <name>', '按分类筛选')
    .option('-s, --server <url>', '服务端地址')
    .option('-t, --token <token>', '认证 token')
    .action(async (keyword, opts) => {
    const server = opts.server || process.env.CELUKNOW_SERVER;
    const token = opts.token || process.env.CELUKNOW_TOKEN;
    if (!server || !token) {
        console.error('错误: 请通过 --server 和 --token 指定服务端和 token');
        process.exit(1);
    }
    const api = new CeluKnowAPI(server, token);
    try {
        const results = await api.searchDocuments(keyword, {
            limit: parseInt(opts.limit),
            category: opts.category
        });
        if (results.length === 0) {
            console.log('未找到匹配文档');
            return;
        }
        console.log(`找到 ${results.length} 个结果:\n`);
        results.forEach((doc) => {
            console.log(`[${doc.id}] ${doc.title}`);
            console.log(`  作者: ${doc.author_name} | 浏览: ${doc.view_count} | 分类: ${doc.category_ids}`);
            console.log(`  内容预览: ${doc.content?.slice(0, 100)}...`);
            console.log();
        });
    }
    catch (err) {
        console.error('搜索失败:', err.response?.data?.error || err.message);
        process.exit(1);
    }
});
