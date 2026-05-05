import { Command } from 'commander';
import { CeluKnowAPI } from '../api.js';
export const listCommand = new Command('list')
    .description('列出所有文档')
    .option('-l, --limit <n>', '分页大小', '20')
    .option('-o, --offset <n>', '起始位置', '0')
    .option('-c, --category <name>', '按分类筛选')
    .option('-s, --server <url>', '服务端地址')
    .option('-t, --token <token>', '认证 token')
    .action(async (opts) => {
    const server = opts.server || process.env.CELUKNOW_SERVER;
    const token = opts.token || process.env.CELUKNOW_TOKEN;
    if (!server || !token) {
        console.error('错误: 请通过 --server 和 --token 指定服务端和 token');
        process.exit(1);
    }
    const api = new CeluKnowAPI(server, token);
    try {
        const results = await api.getDocuments({
            limit: parseInt(opts.limit),
            offset: parseInt(opts.offset),
            category: opts.category
        });
        if (results.length === 0) {
            console.log('暂无文档');
            return;
        }
        console.log(`文档列表 (共 ${results.length} 条):\n`);
        results.forEach((doc) => {
            console.log(`[${doc.id}] ${doc.title}`);
            console.log(`  ${doc.visibility} | ${doc.author_name} | ${doc.updated_at}`);
            console.log();
        });
    }
    catch (err) {
        console.error('获取列表失败:', err.response?.data?.error || err.message);
        process.exit(1);
    }
});
