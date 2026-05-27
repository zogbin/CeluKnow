#!/usr/bin/env node
import { Command } from 'commander';
import { loginCommand } from './commands/login.js';
import { importCommand } from './commands/import.js';
import { exportCommand } from './commands/export.js';
import { searchCommand } from './commands/search.js';
import { listCommand } from './commands/list.js';
import { getCommand } from './commands/get.js';
import { deleteCommand } from './commands/delete.js';
import { queryCommand } from './commands/query.js';
import { indexCommand } from './commands/index.js';
const program = new Command();
program
    .name('celuknow')
    .description('CeluKnow CLI - 自动化脚本工具')
    .version('1.0.0')
    .option('-s, --server <url>', '服务端地址', process.env.CELUKNOW_SERVER)
    .option('-t, --token <token>', '认证 token', process.env.CELUKNOW_TOKEN);
program.addCommand(loginCommand);
program.addCommand(importCommand);
program.addCommand(exportCommand);
program.addCommand(searchCommand);
program.addCommand(listCommand);
program.addCommand(getCommand);
program.addCommand(deleteCommand);
program.addCommand(queryCommand);
program.addCommand(indexCommand);
program.parse();
