import { Command } from 'commander';

export const exportCommand = new Command('export')
  .description('导出文档')
  .action(() => {
    console.log('export 命令尚未实现');
  });