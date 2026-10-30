import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import {startLocal} from '../dist/local/server.mjs';
import {openDatabase} from './sqlite.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
async function freePort() {
  const probe = http.createServer();
  await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  return port;
}
async function rawRequest(origin, route, headers) {
  return new Promise((resolve,reject) => {
    const request=http.request(origin+route,{headers},response=>{response.resume();response.once('end',()=>resolve(response.statusCode));});
    request.once('error',reject); request.end();
  });
}
test('本地版的真实 API、持久化、恢复点和访问边界', async t => {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'hygieia-test-'));
  const port = await freePort();
  let app = await startLocal({dataDir, port, open:false});
  let cookie;
  const login = async () => {
    const response = await fetch(app.origin + '/_local/open?token=' + app.token, {redirect:'manual'});
    assert.equal(response.status, 303);
    cookie = response.headers.get('set-cookie').split(';')[0];
  };
  const call = (route, body, extra = {}) => fetch(app.origin + route, {method:body ? 'POST':'GET', headers:{Cookie:cookie, Origin:app.origin, 'Content-Type':'application/json', ...extra}, ...(body ? {body:JSON.stringify(body)} : {})});
  const now = new Date().toISOString();
  const task = {id:'local-synthetic',title:'本地合成任务',notes:'重启后应保留',category:'工作',priority:'高',status:'未开始',dueAt:'2030-10-28T18:00',remindAt:'',completedAt:'',createdAt:now,updatedAt:now,schemaVersion:1};
  const operation = (value, baseRevision=0) => ({id:randomUUID(),key:'todo/local-synthetic',baseRevision,value});
  try {
    await t.test('首次启动空白、自动建库，未授权不能伪造网站身份读取数据', async () => {
      const response = await fetch(app.origin + '/api/personal', {headers:{'oai-authenticated-user-id':'forged'}});
      assert.equal(response.status, 401);
      await login();
      const fresh = await (await call('/api/personal')).json();
      assert.equal(fresh.owner, app.owner); assert.deepEqual(fresh.records, []);
      const html = await (await fetch(app.origin, {headers:{Cookie:cookie}})).text();
      assert.match(html, /local-ui.js/);
      assert.doesNotMatch(html, /正在连接云端/);
    });
    await t.test('真实任务写入、重试幂等、过期修改不能覆盖新值', async () => {
      const op = operation(task);
      const save = await call('/api/personal', {owner:app.owner, operations:[op]});
      assert.equal(save.status, 200, await save.clone().text());
      const saved = await save.json(); assert.equal(saved.results[0].status, 'ok');
      const retry = await (await call('/api/personal', {owner:app.owner,operations:[op]})).json();
      assert.equal(retry.results[0].record.revision, saved.results[0].record.revision);
      const update = await (await call('/api/personal', {owner:app.owner,operations:[operation({...task,title:'已更新'},1)]})).json();
      assert.equal(update.results[0].status,'ok');
      const conflict = await (await call('/api/personal', {owner:app.owner,operations:[operation({...task,title:'过期修改'},1)]})).json();
      assert.equal(conflict.results[0].status,'conflict');
    });
    await t.test('跨站、无 Origin、错误 owner 和 Host 都不能绕过授权', async () => {
      assert.equal((await call('/api/personal',{owner:app.owner,operations:[operation(task)]},{Origin:'https://untrusted.example'})).status,403);
      assert.equal((await call('/api/personal',{owner:'forged',operations:[operation(task)]})).status,403);
      assert.equal((await fetch(app.origin+'/api/personal',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:'{}'})).status,403);
      assert.equal(await rawRequest(app.origin,'/api/personal',{Cookie:cookie,Host:'untrusted.example:'+port}),403);
      assert.equal((await call('/api/personal',null,{'Sec-Fetch-Site':'cross-site'})).status,403);
      const own = await (await call('/api/personal',null,{'oai-authenticated-user-id':'forged'})).json();
      assert.equal(own.owner,app.owner);
      assert.equal((await call('/api/backups/daily')).status,404);
      assert.equal((await call('/api/health/connection',{})).status,501);
      assert.equal((await fetch(app.origin+'/sqlite.mjs',{headers:{Cookie:cookie}})).status,404);
      const oversized=await fetch(app.origin+'/api/personal',{method:'POST',headers:{Cookie:cookie,Origin:app.origin,'Content-Type':'application/json'},body:JSON.stringify({value:'x'.repeat(3*1024*1024)})});
      assert.equal(oversized.status,413);
    });
    await t.test('完整备份、后台恢复点使用同一套验证和数据库', async () => {
      const save = await call('/api/backups',{action:'create',owner:app.owner});
      assert.equal(save.status,200,await save.clone().text());
      const receipt = await save.json();
      const backup = await (await call('/api/backups?id='+encodeURIComponent(receipt.id))).json();
      assert.ok(backup.personal.some(r=>r.key==='todo/local-synthetic'&&r.value.title==='已更新'));
      assert.equal((await call('/api/backups',{action:'schedule-enable',owner:app.owner})).status,200);
      assert.equal((await app.backup()),undefined);
      const info=await (await call('/api/backups')).json();
      assert.equal(info.scheduled.lastStatus,'success');
    });
    await t.test('重复启动复用实例，退出后重启保留数据并使旧会话失效', async () => {
      const reused=await startLocal({dataDir,port,open:false}); assert.equal(reused.reused,true);
      const owner=app.owner,oldCookie=cookie;
      await app.close();
      app=await startLocal({dataDir,port,open:false});
      assert.equal(app.owner,owner);
      assert.equal((await fetch(app.origin+'/api/personal',{headers:{Cookie:oldCookie}})).status,401);
      await login();
      const persisted=await (await call('/api/personal')).json();
      assert.equal(persisted.records.find(r=>r.key==='todo/local-synthetic').value.title,'已更新');
      assert.equal((await readFile(path.join(dataDir,'profile.json'),'utf8')).includes(owner),true);
    });
  } finally { await app.close(); await rm(dataDir,{recursive:true,force:true}); }
});

test('SQLite 批量事务失败时回滚，迁移重开不重复应用', async () => {
  const dir=await mkdtemp(path.join(tmpdir(),'hygieia-sqlite-'));
  const filename=path.join(dir,'test.sqlite'),migrations=path.join(root,'drizzle');
  let db=openDatabase(filename,migrations);
  try {
    await assert.rejects(db.batch([
      db.prepare('INSERT INTO personal_records VALUES (?,?,?,?,?)').bind('synthetic','todo/a','{}',1,'2030-01-01'),
      db.prepare('INSERT INTO table_that_does_not_exist VALUES (1)'),
    ]));
    assert.equal(await db.prepare('SELECT * FROM personal_records').first(),null);
    db.close(); db=openDatabase(filename,migrations);
    assert.equal(await db.prepare('SELECT count(*) AS n FROM _local_migrations').first('n'),5);
  } finally { db.close(); await rm(dir,{recursive:true,force:true}); }
});

test('本地浏览器缓存按个人空间隔离，保留原有网站记录并转发同空间变更', async () => {
  const values=new Map([['selfspace-v1','legacy-records-untouched']]);
  const storage={get length(){return values.size;},key:i=>Array.from(values.keys())[i]??null,getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)};
  const source=await readFile(path.join(root,'desktop/local-ui.js'),'utf8');
  const context=profile=>{
    const listeners=[],events=[];
    const window={HYGIEIA_LOCAL_PROFILE:profile,localStorage:storage,addEventListener:(type,fn)=>listeners.push(fn),dispatchEvent:e=>events.push(e)};
    vm.runInNewContext(source,{window,document:{addEventListener(){}},StorageEvent:class{constructor(type,data){Object.assign(this,{type,...data});}}});
    return {storage:window.HygieiaLocalStorage,listener:listeners[0],events};
  };
  const a=context('synthetic-a'),b=context('synthetic-b');
  assert.equal(a.storage.getItem('selfspace-v1'),null);
  a.storage.setItem('selfspace-v1','profile-a');b.storage.setItem('selfspace-v1','profile-b');
  assert.equal(a.storage.getItem('selfspace-v1'),'profile-a');assert.equal(b.storage.getItem('selfspace-v1'),'profile-b');
  assert.equal(values.get('selfspace-v1'),'legacy-records-untouched');
  assert.equal(a.storage.length,1);assert.equal(a.storage.key(0),'selfspace-v1');
  a.listener({key:'hygieia-local-v1:synthetic-a:selfspace-v1',newValue:'changed'});
  assert.equal(a.events[0].key,'selfspace-v1');
  b.listener({key:'hygieia-local-v1:synthetic-a:selfspace-v1',newValue:'changed'});
  assert.equal(b.events.length,0);
});
