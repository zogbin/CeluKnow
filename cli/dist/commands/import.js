import { Command } from 'commander';
import { CeluKnowAPI } from '../api.js';
import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
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
        console.error(chalk.red('✖ 错误: 请通过 --server 和 --token 指定服务端和 token'));
        console.error(chalk.gray('  或设置环境变量 CELUKNOW_SERVER 和 CELUKNOW_TOKEN'));
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
        console.error(chalk.red('✖ 错误: 未找到任何 Markdown 文件'));
        process.exit(1);
    }
    try {
        console.log(chalk.gray(`⋮ 正在导入 ${files.length} 个文件...`));
        const result = await api.importFiles(files);
        console.log(chalk.cyan('\n📥 导入完成:\n'));
        const successCount = result.results.filter((r) => r.success).length;
        const failCount = result.results.length - successCount;
        result.results.forEach((r) => {
            if (r.success) {
                console.log(`  ${chalk.green('✓')} ${r.name} ${chalk.gray('→ ' + (r.category || '成功'))}`);
            }
            else {
                console.log(`  ${chalk.red('✗')} ${r.name} ${chalk.red(r.error)}`);
            }
        });
        console.log(chalk.gray(`\n  共 ${chalk.green(successCount)} 成功, ${failCount > 0 ? chalk.red(failCount) : chalk.gray(failCount)} 失败`));
    }
    catch (err) {
        console.error(chalk.red('✖ 导入失败:'), err.response?.data || err.message);
        process.exit(1);
    }
});
