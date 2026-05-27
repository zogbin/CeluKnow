import { Command } from 'commander';
import { CeluKnowAPI, GraphData } from '../api.js';
import chalk from 'chalk';

export const getCommand = new Command('get')
  .description('获取文档详情')
  .argument('<id>', '文档 ID')
  .option('-r, --related', '同时显示关联文档（同分类、同标签、Wiki链接）')
  .option('--json', '以 JSON 格式输出')
  .option('-s, --server <url>', '服务端地址')
  .option('-t, --token <token>', '认证 token')
  .action(async (id: string, opts) => {
    const server = opts.server || process.env.CELUKNOW_SERVER;
    const token = opts.token || process.env.CELUKNOW_TOKEN;
    
    if (!server || !token) {
      console.error(chalk.red('✖ 错误: 请通过 --server 和 --token 指定服务端和 token'));
      process.exit(1);
    }

    const api = new CeluKnowAPI(server, token);
    
    try {
      const doc = await api.getDocument(parseInt(id)) as any;

      if (opts.json) {
        const output: any = { document: doc };
        if (opts.related) {
          const graph = await api.getGraph() as GraphData;
          const links = graph.links.filter(l => l.source === doc.id || l.target === doc.id);
          output.graph_links = links.map(l => ({
            source: l.source,
            target: l.target,
            type: l.type,
            label: l.label,
            source_name: graph.nodes.find(n => n.id === l.source)?.name,
            target_name: graph.nodes.find(n => n.id === l.target)?.name
          }));
          if (doc.category_ids) {
            const catIds = doc.category_ids.split(',').map(Number);
            output.same_category = [];
            for (const catId of catIds) {
              const catDocs = await api.getCategoryDocuments(catId) as any[];
              output.same_category.push(...catDocs.filter((d: any) => d.id !== doc.id));
            }
          }
        }
        console.log(JSON.stringify(output, null, 2));
        return;
      }

      console.log(chalk.cyan(`\n📄 ${doc.title}\n`));
      console.log(chalk.gray('  ─────────────────────'));
      console.log(`  ${chalk.bold('作者:')} ${doc.author_name}`);
      console.log(`  ${chalk.bold('可见性:')} ${doc.visibility === 'public' ? chalk.green('🌐 公开') : chalk.gray('🔒 私有')}`);
      console.log(`  ${chalk.bold('创建:')} ${doc.created_at}`);
      console.log(`  ${chalk.bold('分类:')} ${doc.category_names || '未分类'}`);
      console.log(`  ${chalk.bold('标签:')} ${doc.tags || chalk.gray('无')}`);
      console.log(chalk.gray('  ─────────────────────'));
      console.log(`  👁 ${doc.view_count} · 👍 ${doc.likes_count || 0} · 💬 ${doc.comment_count || 0}`);
      console.log(chalk.gray('  ─────────────────────\n'));
      console.log(doc.content);

      if (opts.related) {
        console.log(chalk.cyan('\n🔗 关联文档\n'));

        const graph = await api.getGraph() as GraphData;
        const docLinks = graph.links.filter(l => l.source === doc.id || l.target === doc.id);
        if (docLinks.length > 0) {
          console.log(chalk.bold('  Wiki链接:'));
          for (const link of docLinks) {
            const linkedId = link.source === doc.id ? link.target : link.source;
            const name = graph.nodes.find(n => n.id === linkedId)?.name || `#${linkedId}`;
            const arrow = link.source === doc.id ? '→' : '←';
            console.log(chalk.gray(`    ${arrow} [${linkedId}] ${name}`));
          }
          console.log();
        }

        if (doc.category_ids) {
          const catIds = doc.category_ids.split(',').map(Number);
          for (const catId of catIds) {
            const catDocs = await api.getCategoryDocuments(catId) as any[];
            const others = catDocs.filter((d: any) => d.id !== doc.id);
            if (others.length > 0) {
              const catName = (doc.category_names || '').split(',')[0] || `分类#${catId}`;
              console.log(chalk.bold(`  同分类 (${catName}):`));
              for (const d of others.slice(0, 10)) {
                console.log(chalk.gray(`    · [${d.id}] ${d.title}`));
              }
              if (others.length > 10) console.log(chalk.gray(`    ... 共 ${others.length} 篇`));
              console.log();
            }
          }
        }
      }
    } catch (err: any) {
      console.error(chalk.red('✖ 获取文档失败:'), err.response?.data?.error || err.message);
      process.exit(1);
    }
  });