import { Command } from 'commander';

export const searchCommand = new Command('search')
  .description('搜索文档')
  .action(() => {
    console.log('search 命令尚未实现');
  });