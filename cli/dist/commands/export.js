import { Command } from 'commander';
import { CeluKnowAPI } from '../api.js';
import * as fs from 'fs';
import * as path from 'path';
import AdmZip from 'adm-zip';
export const exportCommand = new Command('export')
    .description('导出所有文档为 ZIP')
    .option('-o, --output <dir>', '输出目录', './export')
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
        const result = await api.exportDocuments();
        const zip = new AdmZip();
        for (const [category, docs] of Object.entries(result.data)) {
            for (const [filename, content] of Object.entries(docs)) {
                const entryPath = `${category}/${filename}`;
                zip.addFile(entryPath, Buffer.from(content));
            }
        }
        const outputPath = path.join(opts.output, 'celuknow-export.zip');
        fs.mkdirSync(opts.output, { recursive: true });
        zip.writeZip(outputPath);
        console.log(`导出完成: ${outputPath}`);
    }
    catch (err) {
        console.error('导出失败:', err.response?.data?.error || err.message);
        process.exit(1);
    }
});
