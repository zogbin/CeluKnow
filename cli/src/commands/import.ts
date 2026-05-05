import { Command } from 'commander';

export const importCommand = new Command('import')
  .description('导入文档')
  .action(() => {
    console.log('import 命令尚未实现');
  });