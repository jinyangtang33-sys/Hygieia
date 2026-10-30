import http from 'node:http';
import {readFileSync, writeFileSync, mkdirSync, unlinkSync, chmodSync, existsSync, realpathSync} from 'node:fs';
import {readFile, stat} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {randomBytes, randomUUID, timingSafeEqual} from 'node:crypto';
import {spawn} from 'node:child_process';
import {openDatabase} from './sqlite.mjs';
import {configureLocalDatabase} from './local-env.mjs';
import {onboardingModel} from './onboarding-format.mjs';

const bundle = path.dirname(fileURLToPath(import.meta.url));
export function defaultDataDirectory() {
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support', 'Hygieia');
  if (process.platform === 'win32') return path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Hygieia');
  return path.join(process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share'), 'Hygieia');
}
function openTarget(target) {
  const [command, args] = process.platform === 'darwin' ? ['open', [target]]
    : process.platform === 'win32' ? ['explorer.exe', [target]] : ['xdg-open', [target]];
  const child = spawn(command, args, {stdio: 'ignore', detached: true, windowsHide: true});
  child.on('error', () => console.error('未能自动打开，请从启动窗口查看本地地址或数据目录。'));
  child.unref();
}
const equal = (a, b) => typeof a === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const json = (data, status = 200) => Response.json(data, {status});
const mime = {'.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.html':'text/html; charset=utf-8','.json':'application/json','.gz':'application/gzip','.wasm':'application/wasm','.txt':'text/plain; charset=utf-8'};
const cookieName = 'hygieia_local';

export async function startLocal({dataDir = defaultDataDirectory(), port = 8797, open = true} = {}) {
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error('端口必须在 1024 到 65535 之间。');
  dataDir = path.resolve(dataDir);
  mkdirSync(dataDir, {recursive: true, mode: 0o700});
  const runningFile = path.join(dataDir, 'running.json');
  // Reuse a live instance for this profile. Never kill an unrelated process or
  // silently choose another port and strand the browser's pending journal.
  try {
    const previous = JSON.parse(readFileSync(runningFile, 'utf8'));
    if (Number.isInteger(previous.port) && previous.port >= 1024 && previous.port <= 65535 && /^[a-f0-9]{64}$/.test(previous.token)) {
      const response = await fetch(`http://127.0.0.1:${previous.port}/_local/ping`, {headers: {Authorization: `Bearer ${previous.token}`}, signal: AbortSignal.timeout(1200)});
      if (response.ok) {
        const ping = await response.json();
        if (ping.instance === previous.instance) {
          if (open) openTarget(`http://127.0.0.1:${previous.port}/_local/open?token=${previous.token}`);
          return {reused: true, origin: `http://127.0.0.1:${previous.port}`};
        }
      }
    }
  } catch { /* A stale status file cannot grant access to a new instance. */ }

  // Reserve the loopback port before opening SQLite or running migrations.
  // A concurrent launch therefore cannot modify the database or session file.
  let dispatch = async () => json({error: '正在启动，请稍后重试。'}, 503);
  const server = http.createServer(async (request, response) => {
    try {
      const result = await dispatch(request);
      const headers = Object.fromEntries(result.headers);
      response.writeHead(result.status, {
        ...headers,
        'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer', 'Cross-Origin-Resource-Policy': 'same-origin',
        'X-Frame-Options': 'DENY',
      });
      response.end(Buffer.from(await result.arrayBuffer()));
    } catch {
      if (!response.headersSent) response.writeHead(500, {'Content-Type':'application/json','Cache-Control':'no-store'});
      response.end(JSON.stringify({error: '本地服务未完成请求，请重试；已有记录保留。'}));
    }
  });
  server.requestTimeout = 20_000;
  server.headersTimeout = 10_000;
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  const origin = `http://127.0.0.1:${port}`;
  let db, backupTimer, closing = false;
  const token = randomBytes(32).toString('hex'), instance = randomUUID();
  let owner;
  async function close() {
    if (closing) return;
    closing = true;
    clearInterval(backupTimer);
    await new Promise(resolve => { server.close(resolve); server.closeIdleConnections(); });
    db?.close();
    try { if (JSON.parse(readFileSync(runningFile, 'utf8')).instance === instance) unlinkSync(runningFile); } catch {}
  }
  try {
    const profileFile = path.join(dataDir, 'profile.json');
    try {
      owner = JSON.parse(readFileSync(profileFile, 'utf8')).owner;
      if (typeof owner !== 'string' || !/^local-[a-f0-9-]{36}$/.test(owner)) throw Error('invalid');
    } catch (error) {
      if (existsSync(profileFile) || existsSync(path.join(dataDir, 'hygieia.sqlite'))) throw Error('个人空间标识无法读取，请保留数据目录并恢复 profile.json。');
      owner = 'local-' + randomUUID();
      writeFileSync(profileFile, JSON.stringify({owner}), {mode: 0o600, flag: 'wx'});
    }
    const dbFile = path.join(dataDir, 'hygieia.sqlite');
    db = openDatabase(dbFile, path.join(bundle, 'drizzle'));
    chmodSync(dbFile, 0o600);
    configureLocalDatabase(db);
    const onboarding = async () => {
      const row = await db.prepare('SELECT value,revision FROM _local_preferences WHERE key=?').bind('onboarding').first();
      if (!row) return {version:1,status:'pending',focus:[],revision:0};
      try {
        const value = onboardingModel.normalize({...JSON.parse(row.value), expectedRevision:row.revision});
        return {version:1,status:value.status,focus:value.focus,revision:row.revision};
      } catch { return {version:1,status:'pending',focus:[],revision:row.revision}; }
    };
    const version = JSON.parse(await readFile(path.join(bundle, 'version.json'), 'utf8'));
    const handlers = new Map();
    for (const route of version.routes) handlers.set('/api/' + route, await import(pathToFileURL(path.join(bundle, 'app/api', route, 'route.mjs')).href));
    const {runDailyBackups} = await import('./lib/backup-store.mjs');
    let backingUp = false;
    const backup = async () => {
      if (backingUp || closing) return;
      backingUp = true;
      try { await runDailyBackups(db); } catch { console.error('本地定时恢复点暂未保存，可在设置中导出备份。'); }
      finally { backingUp = false; }
    };
    // No network scheduler: enabled jobs run while this local program is open.
    await backup();
    backupTimer = setInterval(backup, 60_000);
    backupTimer.unref();
    const authorized = request => {
      const cookies = String(request.headers.cookie || '').split(';').map(s => s.trim());
      return cookies.some(s => s.startsWith(cookieName + '=') && equal(s.slice(cookieName.length + 1), token));
    };
    dispatch = async request => {
      // Exact Host + Origin checks prevent DNS rebinding and cross-site writes.
      if (request.headers.host !== `127.0.0.1:${port}`) return json({error: '仅允许本机访问。'}, 403);
      const url = new URL(request.url, origin);
      if (url.pathname === '/_local/ping') return equal(request.headers.authorization, 'Bearer ' + token) ? json({instance}) : json({error:'未授权'}, 401);
      if (url.pathname === '/_local/open' && request.method === 'GET') {
        if (!equal(url.searchParams.get('token'), token)) return json({error: '启动凭据已失效，请重新双击启动。'}, 401);
        return new Response(null, {status: 303, headers: {Location: '/', 'Set-Cookie': `${cookieName}=${token}; HttpOnly; SameSite=Strict; Path=/`}});
      }
      if (!authorized(request)) {
        if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/_local/')) return json({error: '请双击启动本地版以重新打开授权窗口。'}, 401);
        return new Response('<!doctype html><meta charset="utf-8"><title>打开观己本地版</title><main style="max-width:36rem;margin:15vh auto;font:18px system-ui;padding:24px"><h1>请从启动程序打开观己</h1><p>双击解压目录中的启动文件，即可进入你的本地个人空间。</p><p>本地服务没有云端登录，不要把这个地址转发给其他设备。</p></main>', {headers:{'Content-Type':mime['.html']}});
      }
      if (request.headers['sec-fetch-site'] === 'cross-site') return json({error: '请从观己页面操作。'}, 403);
      if (request.headers.origin && request.headers.origin !== origin) return json({error: '请求来源无效。'}, 403);
      const safe = ['GET', 'HEAD'].includes(request.method);
      if (!safe && request.headers.origin !== origin) return json({error: '写入需要当前页面授权。'}, 403);
      if (url.pathname === '/_local/info' && request.method === 'GET') {
        const counts = await db.prepare("SELECT (SELECT count(*) FROM personal_records WHERE value IS NOT NULL AND record_key NOT LIKE 'settings/%') + (SELECT count(*) FROM health_daily) AS records").first();
        return json({...version, dataDir, owner, local:true, platform:process.platform, onboarding:await onboarding(), hasRecords:counts.records > 0});
      }
      if (url.pathname === '/_local/onboarding' && request.method === 'POST') {
        if (!request.headers['content-type']?.toLowerCase().startsWith('application/json')) return json({error:'请使用 JSON 格式保存。'},415);
        if (Number(request.headers['content-length']) > 4096) return json({error:'引导设置内容过大。'},413);
        const chunks=[]; let length=0;
        for await (const chunk of request) {
          length+=chunk.length;
          if (length>4096) return json({error:'引导设置内容过大。'},413);
          chunks.push(chunk);
        }
        let value;
        try { value=onboardingModel.normalize(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
        catch (error) { return json({error:error instanceof SyntaxError?'设置格式无效。':error.message},422); }
        const stored=JSON.stringify({version:1,status:value.status,focus:value.focus});
        const result=await db.prepare('INSERT INTO _local_preferences(key,value,revision) SELECT ?,?,1 WHERE ?=0 OR EXISTS(SELECT 1 FROM _local_preferences WHERE key=?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,revision=_local_preferences.revision+1 WHERE _local_preferences.revision=?')
          .bind('onboarding',stored,value.expectedRevision,'onboarding',value.expectedRevision).run();
        if (!result.meta.changes) return json({error:'使用偏好已在其他窗口更新，请重新打开引导后再保存。',onboarding:await onboarding()},409);
        return json({ok:true,onboarding:await onboarding()});
      }
      if (url.pathname === '/_local/folder' && request.method === 'POST') { openTarget(dataDir); return json({ok:true}); }
      if (url.pathname === '/_local/stop' && request.method === 'POST') {
        setTimeout(() => void close(), 100);
        return json({ok:true});
      }
      if (url.pathname.startsWith('/api/')) {
        // The cloud bridge requires HTTPS/Sites service credentials. Its setup
        // is intentionally unavailable until a separate local adapter exists.
        if (url.pathname === '/api/health/connection' && request.method === 'POST') return json({error: '本地版暂不支持生成 Apple 健康自动连接，请先使用手动记录或报告导入。'}, 501);
        const handler = handlers.get(url.pathname);
        if (!handler) return json({error: '接口不存在。'}, 404);
        if (!handler[request.method]) return json({error: '不支持此操作。'}, 405);
        const chunks = []; let size = 0;
        if (!safe) {
          if (Number(request.headers['content-length']) > 2 * 1024 * 1024) return json({error:'上传内容超过 2 MB。'}, 413);
          for await (const chunk of request) {
            size += chunk.length;
            if (size > 2 * 1024 * 1024) return json({error:'上传内容超过 2 MB。'}, 413);
            chunks.push(chunk);
          }
        }
        const headers = new Headers();
        if (request.headers['content-type']) headers.set('Content-Type', request.headers['content-type']);
        if (request.headers.origin) headers.set('Origin', request.headers.origin);
        // Browser-provided identity headers are discarded unconditionally.
        headers.set('oai-authenticated-user-id', owner);
        const input = new Request(url, {method: request.method, headers, ...(!safe ? {body:Buffer.concat(chunks)} : {})});
        return handler[request.method](input);
      }
      if (!safe) return json({error:'不支持此操作。'}, 405);
      if (url.pathname === '/signin-with-chatgpt' || url.pathname === '/signout-with-chatgpt') return new Response(null, {status:303, headers:{Location:'/'}});
      let filename;
      if (url.pathname === '/' || url.pathname === '/index.html') filename = path.join(bundle, 'ui', 'shell.html');
      else {
        let decoded; try { decoded = decodeURIComponent(url.pathname); } catch { return json({error:'路径无效。'}, 400); }
        const publicRoot = path.join(bundle, 'public');
        filename = path.resolve(publicRoot, '.' + decoded);
        if (!filename.startsWith(publicRoot + path.sep) || decoded.includes('\\')) return json({error:'路径无效。'}, 403);
      }
      try {
        if (!(await stat(filename)).isFile()) return json({error:'文件不存在。'}, 404);
        let content = await readFile(filename);
        if (filename === path.join(bundle, 'ui', 'shell.html')) content = Buffer.from(content.toString('utf8').replace('<head>', '<head><script>window.HYGIEIA_LOCAL_PROFILE=' + JSON.stringify(owner) + ';</script>'));
        return new Response(request.method === 'HEAD' ? null : content, {headers:{'Content-Type': mime[path.extname(filename)] || 'application/octet-stream'}});
      } catch { return json({error:'文件不存在。'}, 404); }
    };
    writeFileSync(runningFile, JSON.stringify({port, token, instance}), {mode:0o600});
    chmodSync(runningFile, 0o600);
    if (open) openTarget(`${origin}/_local/open?token=${token}`);
    console.log(`观己本地版已启动：${origin}\n数据目录：${dataDir}\n请保留此窗口。关闭程序前，请等待页面显示“本地数据库已同步”。`);
    return {origin, token, owner, close, server, db, backup};
  } catch (error) { await close(); throw error; }
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const value = name => { const index = args.indexOf(name); return index < 0 ? undefined : args[index + 1]; };
  try {
    const app = await startLocal({dataDir:value('--data-dir'), port:Number(value('--port') || 8797), open:!args.includes('--no-open')});
    if (app.reused) console.log('已经打开正在运行的观己本地版。');
    else for (const signal of ['SIGINT','SIGTERM']) process.once(signal, () => void app.close());
  } catch (error) {
    console.error(error.code === 'EADDRINUSE' ? '端口 8797 已被占用。若观己已经启动，请使用原窗口；否则关闭占用程序后重试。' : '启动失败：' + error.message);
    process.exitCode = 1;
  }
}
