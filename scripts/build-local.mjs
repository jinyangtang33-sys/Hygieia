import {stripTypeScriptTypes} from 'node:module';
import {readFile, writeFile, mkdir, cp, rm, stat, readdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Script} from 'node:vm';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'dist', 'local');
await rm(output, {recursive: true, force: true});
await mkdir(output, {recursive: true});
const copied = new Set();
async function compile(relative) {
  if (copied.has(relative)) return;
  copied.add(relative);
  let source = await readFile(path.join(root, relative), 'utf8');
  if (relative.endsWith('.ts')) source = stripTypeScriptTypes(source);
  const destination = relative.replace(/\.ts$/, '.mjs');
  const dependencies = [];
  source = source.replace(/(\bfrom\s*|\bimport\s*)(['"])([^'"\n]+)\2/g, (match, prefix, quote, specifier) => {
    if (specifier === 'cloudflare:workers') {
      let target = path.posix.relative(path.posix.dirname(destination), 'local-env.mjs');
      if (!target.startsWith('.')) target = './' + target;
      return prefix + quote + target + quote;
    }
    if (!specifier.startsWith('.')) throw Error(`本地运行不允许外部依赖：${relative}: ${specifier}`);
    const dependency = path.posix.normalize(path.posix.join(path.posix.dirname(relative), specifier));
    if (dependency.startsWith('../')) throw Error('依赖超出项目目录');
    const resolved = path.posix.extname(dependency) ? dependency : dependency + '.ts';
    dependencies.push(resolved);
    const rewritten = specifier.replace(/\.ts$/, '.mjs') + (path.posix.extname(specifier) ? '' : '.mjs');
    return prefix + quote + rewritten + quote;
  });
  await mkdir(path.dirname(path.join(output, destination)), {recursive: true});
  await writeFile(path.join(output, destination), source);
  for (const dependency of dependencies) await compile(dependency);
}
const routes = ['personal', 'personal/history', 'ledger', 'backups', 'health', 'health/connection'];
for (const route of routes) await compile(`app/api/${route}/route.ts`);
await compile('lib/backup-store.ts');
for (const name of ['server.mjs', 'sqlite.mjs', 'local-env.mjs']) await cp(path.join(root, 'desktop', name), path.join(output, name));
await cp(path.join(root, 'public'), path.join(output, 'public'), {recursive: true});
const cssFile = path.join(output, 'public', 'styles.css');
await writeFile(cssFile, (await readFile(cssFile, 'utf8')).replace(/^@import url\('https:\/\/fonts\.googleapis\.com\/[^']+'\);\s*/, ''));
const localWording = text => text.replaceAll('云端', '本地数据库').replaceAll('私人云', '本地数据库').replaceAll('跨设备', '本机').replaceAll('私人空间', '本机空间')
  .replaceAll('每日首次在线打开并完成同步后', '每日首次打开并完成保存后')
  .replaceAll('关闭网站后由已开启的本地数据库定时备份接续', '关闭网页后，仅在本地服务仍运行且启用备份时接续')
  .replaceAll('网站关闭后，也留一份恢复点', '程序运行时，自动留一份恢复点')
  .replaceAll('本地数据库每天北京时间 03:00 保存一次', '本地程序启动或运行中，每日保存一次')
  .replaceAll('恢复点存放在当前私人站点，不能代替站点之外的独立副本', '恢复点存放在同一个本地数据库，不能代替其他位置的独立副本')
  .replaceAll('清空手动记录会影响其他设备', '清空手动记录会影响这台电脑的所有观己页面')
  .replaceAll('两类操作均需联网并先生成本地数据库保护副本', '两类操作均需本地服务运行，并先生成数据库保护副本')
  .replaceAll(' · Apple 健康独立同步', ' · 数据保存在这台电脑')
  .replaceAll('私人本地数据库', '本地数据库')
  .replaceAll('本机本地数据库同步', '本地保存状态');
for (const file of await readdir(path.join(output, 'public'))) {
  if (file.endsWith('.js')) {
    const target = path.join(output, 'public', file);
    let text = localWording(await readFile(target, 'utf8')).replaceAll('localStorage', 'HygieiaLocalStorage');
    if (file === 'personal-sync.js') {
      const gate = "if(typeof navigator!=='undefined'&&navigator.onLine===false){";
      if (!text.includes(gate)) throw Error('请检查本地离线写入适配');
      text = text.replace(gate, 'if(false){ /* Loopback storage also works without internet. */');
    }
    new Script(text, {filename: file});
    await writeFile(target, text);
  }
}
await cp(path.join(root, 'desktop', 'local-ui.js'), path.join(output, 'public', 'local-ui.js'));
new Script(await readFile(path.join(output, 'public', 'local-ui.js'), 'utf8'), {filename:'local-ui.js'});
await mkdir(path.join(output, 'ui'));
let shell = localWording(await readFile(path.join(root, 'ui', 'shell.html'), 'utf8'));
shell = shell.replace('<head>', '<head>\n  <script src="/local-ui.js" defer></script>');
await writeFile(path.join(output, 'ui', 'shell.html'), shell);
await cp(path.join(root, 'drizzle'), path.join(output, 'drizzle'), {recursive: true, filter: s => !s.includes(`${path.sep}meta`)});
const pkg = JSON.parse(await readFile(path.join(root, 'desktop/release.json'), 'utf8'));
await writeFile(path.join(output, 'version.json'), JSON.stringify({name: 'Hygieia 本地版', version: pkg.version, routes, storage: 'local-sqlite'}, null, 2));
await writeFile(path.join(output, 'package.json'), '{"type":"module","private":true}\n');
for (const name of ['LICENSE', 'THIRD_PARTY_NOTICES.md']) await cp(path.join(root, name), path.join(output, name));
if (!(await stat(path.join(output, 'public/vendor/body-ocr/lang/chi_sim.traineddata.gz'))).size) throw Error('OCR 模型缺失');
console.log('本地版已构建：dist/local（运行时无 npm 依赖、无云端登录）');
