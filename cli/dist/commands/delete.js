import { Command } from 'commander';
import { CeluKnowAPI } from '../api.js';
export const deleteCommand = new Command('delete')
    .description('删除文档')
    .argument('<id>', '文档 ID')
    .option('-s, --server <url>', '服务端地址')
    .option('-t, --token <token>', '认证 token')
    .option('-f, --force', '直接删除，不确认')
    .action(async (id, opts) => {
    const server = opts.server || process.env.CELUKNOW_SERVER;
    const token = opts.token || process.env.CELUKNOW_TOKEN;
    if (!server || !token) {
        console.error('错误: 请通过 --server 和 --token 指定服务端和 token');
        process.exit(1);
    }
    if (!opts.force) {
        const readline = await import('readline');
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        const answer = await new Promise(resolve => rl.question(`确定要删除文档 ${id} 吗? (y/n): `, resolve));
        rl.close();
        if (answer.toLowerCase() !== 'y') {
            console.log('已取消');
            process.exit(0);
        }
    }
    const api = new CeluKnowAPI(server, token);
    try {
        await api.deleteDocument(parseInt(id));
        console.log('删除成功');
    }
    catch (err) {
        console.error('删除失败:', err.response?.data?.error || err.message);
        process.exit(1);
    }
});
