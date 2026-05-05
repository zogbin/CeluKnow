import { Command } from 'commander';
import { CeluKnowAPI } from '../api.js';
export const getCommand = new Command('get')
    .description('获取文档详情')
    .argument('<id>', '文档 ID')
    .option('-s, --server <url>', '服务端地址')
    .option('-t, --token <token>', '认证 token')
    .action(async (id, opts) => {
    const server = opts.server || process.env.CELUKNOW_SERVER;
    const token = opts.token || process.env.CELUKNOW_TOKEN;
    if (!server || !token) {
        console.error('错误: 请通过 --server 和 --token 指定服务端和 token');
        process.exit(1);
    }
    const api = new CeluKnowAPI(server, token);
    try {
        const doc = await api.getDocument(parseInt(id));
        console.log(`标题: ${doc.title}`);
        console.log(`作者: ${doc.author_name} | 可见性: ${doc.visibility} | 创建: ${doc.created_at}`);
        console.log(`分类: ${doc.category_ids} | 标签: ${doc.tags || '无'}`);
        console.log(`浏览: ${doc.view_count} | 点赞: ${doc.likes_count} | 评论: ${doc.comment_count}`);
        console.log('\n--- 内容 ---\n');
        console.log(doc.content);
    }
    catch (err) {
        console.error('获取文档失败:', err.response?.data?.error || err.message);
        process.exit(1);
    }
});
