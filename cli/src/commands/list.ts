import { Command } from 'commander';

export const listCommand = new Command('list')
  .description('列出文档')
  .action(() => {
    console.log('list 命令尚未实现');
  });