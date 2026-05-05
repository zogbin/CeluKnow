import { Command } from 'commander';

export const deleteCommand = new Command('delete')
  .description('删除文档')
  .action(() => {
    console.log('delete 命令尚未实现');
  });