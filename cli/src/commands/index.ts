import { Command } from 'commander';
import { CeluKnowAPI } from '../api.js';
import chalk from 'chalk';

export const indexCommand = new Command('index')
  .description('查看知识索引 - 系统分类、用户分类、标签及其文档')
  .option('--json', '以 JSON 格式输出')
  .option('-s, --server <url>', '服务端地址')
  .option('-t, --token <token>', '认证 token')
  .action(async (opts) => {
    const server = opts.server || process.env.CELUKNOW_SERVER;
    const token = opts.token || process.env.CELUKNOW_TOKEN;

    if (!server || !token) {
      console.error(chalk.red('✖ 错误: 请通过 --server 和 --token 指定服务端和 token'));
      process.exit(1);
    }

    const api = new CeluKnowAPI(server, token);

    try {
      const index = await api.getKnowledgeIndex();

      if (opts.json) {
        console.log(JSON.stringify(index, null, 2));
        return;
      }

      let totalDocs = 0;

      console.log(chalk.cyan('\n📚 知识索引\n'));

      if (index.systemCategories.length > 0) {
        console.log(chalk.bold('系统分类:'));
        for (const cat of index.systemCategories) {
          console.log(`  ${chalk.green(cat.name)} (${cat.docTitles.length} 篇)`);
          for (const title of cat.docTitles) {
            console.log(chalk.gray(`    · ${title}`));
          }
          totalDocs += cat.docTitles.length;
        }
        console.log();
      }

      if (index.userCategories.length > 0) {
        console.log(chalk.bold('用户分类:'));
        for (const cat of index.userCategories) {
          console.log(`  ${chalk.yellow(cat.name)} (${cat.docTitles.length} 篇)`);
          for (const title of cat.docTitles) {
            console.log(chalk.gray(`    · ${title}`));
          }
          totalDocs += cat.docTitles.length;
        }
        console.log();
      }

      if (index.tags.length > 0) {
        console.log(chalk.bold('标签:'));
        for (const tag of index.tags) {
          console.log(`  ${chalk.magenta(tag.name)} (${tag.docTitles.length} 篇)`);
          for (const title of tag.docTitles) {
            console.log(chalk.gray(`    · ${title}`));
          }
          totalDocs += tag.docTitles.length;
        }
        console.log();
      }

      console.log(chalk.gray(`共计 ${index.systemCategories.length} 系统分类, ${index.userCategories.length} 用户分类, ${index.tags.length} 标签`));
    } catch (err: any) {
      console.error(chalk.red('✖ 获取知识索引失败:'), err.response?.data?.error || err.message);
      process.exit(1);
    }
  });
