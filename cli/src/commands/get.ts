import { Command } from 'commander';

export const getCommand = new Command('get')
  .description('获取单个文档')
  .action(() => {
    console.log('get 命令尚未实现');
  });