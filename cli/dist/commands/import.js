import { Command } from 'commander';
import { CeluKnowAPI } from '../api.js';
import * as fs from 'fs';
import * as path from 'path';
export const importCommand = new Command('import')
    .description('导入 Markdown 文件')
    .argument('<file>', '要导入的文件或目录')
    .option('-c, --category <name>', '指定分类')
    .option('-v, --visibility <public|private>', '可见性', 'private')
    .option('-s, --server <url>', '服务端地址 (支持全局配置)')
    .option('-t, --token <token>', '认证 token (支持全局配置)')
    .action(async (file, opts) => {
    const server = opts.server || process.env.CELUKNOW_SERVER;
    const token = opts.token || process.env.CELUKNOW_TOKEN;
    if (!server || !token) {
        console.error('错误: 请通过 --server 和 --token 指定服务端和 token');
        console.error('或设置环境变量 CELUKNOW_SERVER 和 CELUKNOW_TOKEN');
        process.exit(1);
    }
    const api = new CeluKnowAPI(server, token);
    const stat = fs.statSync(file);
    const files = [];
    if (stat.isDirectory()) {
        const entries = fs.readdirSync(file);
        for (const entry of entries) {
            if (entry.endsWith('.md')) {
                const fullPath = path.join(file, entry);
                const content = fs.readFileSync(fullPath, 'utf8');
                const folder = opts.category || path.basename(file);
                files.push({ name: entry, content, folder });
            }
        }
    }
    else {
        const content = fs.readFileSync(file, 'utf8');
        const folder = opts.category || path.basename(path.dirname(file));
        files.push({ name: path.basename(file), content, folder });
    }
    if (files.length === 0) {
        console.error('错误: 未找到任何 Markdown 文件');
        process.exit(1);
    }
    try {
        const result = await api.importFiles(files);
        console.log('导入完成:');
        result.results.forEach((r) => {
            console.log(`  ${r.success ? '✓' : '✗'} ${r.name} - ${r.success ? (r.category || '成功') : r.error}`);
        });
    }
    catch (err) {
        console.error('导入失败:', err.response?.data?.error || err.message);
        process.exit(1);
    }
});
