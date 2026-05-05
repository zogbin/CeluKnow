import { Command } from 'commander';
import { CeluKnowAPI } from '../api.js';

export const loginCommand = new Command('login')
  .description('用户登录获取 token')
  .requiredOption('-s, --server <url>', '服务端地址')
  .requiredOption('-u, --username <username>', '用户名')
  .requiredOption('-p, --password <password>', '密码')
  .action(async (opts) => {
    const api = new CeluKnowAPI(opts.server);
    try {
      const result = await api.login(opts.username, opts.password);
      console.log('登录成功!');
      console.log('Token:', result.token);
      console.log('用户:', result.user.username);
    } catch (err: any) {
      console.error('登录失败:', err.response?.data?.error || err.message);
      process.exit(1);
    }
  });