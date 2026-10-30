'use strict';
// Durable, immutable per-action journals keep separate tabs from overwriting each
// other's pending work. The server is authoritative; localStorage is a cache and
// an offline outbox, never the only copy of an acknowledged record.
const PersonalSync=(()=>{
  const CACHE='selfspace-personal-v1',J='selfspace-change-v1:',ACK='selfspace-ack-v1:',CONFLICT='selfspace-conflict-v1:',BACKUP='selfspace-v1-pre-cloud',RECOVERY='selfspace-personal-unreadable-original';
  let cache={version:1,owner:null,records:{},generation:null,migrated:false,lastSynced:null},running=false,ready=false,blocked=false,error='',timer=null,settingsDirty=false;
  const random=()=>globalThis.crypto.randomUUID();
  const parse=(key,fallback)=>{const raw=localStorage.getItem(key);return raw===null?fallback:JSON.parse(raw);};
  const keys=prefix=>Array.from({length:localStorage.length},(_,i)=>localStorage.key(i)).filter(k=>k&&k.startsWith(prefix)).sort();
  const eq=(a,b)=>JSON.stringify(canonical(a??null))===JSON.stringify(canonical(b??null));
  const canonical=v=>v&&typeof v==='object'?Array.isArray(v)?v.map(canonical):Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
  const clone=v=>structuredClone(v);
  function flatten(s,migration=false){
    const out={},defaults=defaultSettings();
    for(const [key,v]of Object.entries(s.settings).filter(([k])=>Object.hasOwn(defaults,k)))if(!migration||v!==defaults[key])out['settings/'+key]=v;
    for(const [date,d]of Object.entries(s.days)){
      const prefix='day/'+date+'/',apple=new Set(d.apple?.metrics||[]),group={coreSleep:'sleep',deepSleep:'sleep',remSleep:'sleep',sleepStart:'sleep',sleepEnd:'sleep',heartRateMin:'heartRate',heartRateMax:'heartRate'};
      for(const [key,v]of Object.entries(d.health||{}))if(!apple.has(group[key]||key))out[prefix+'health/'+key]=v;
      for(const [key,v]of Object.entries(d.meals||{}))out[prefix+'meal/'+key]=v;
      for(const task of d.tasks||[])out[prefix+'task/'+task.id]=task;
      for(const key of ['journal','mood','focus'])if(d[key]!==undefined)out[prefix+key]=d[key];
    }
    for(const [week,n]of Object.entries(s.reviews||{}))for(const key of ['wins','challenge','plan'])if(n[key]!==undefined)out['review/'+week+'/'+key]=n[key];
    for(const t of s.todos||[])out['todo/'+t.id]=t;
    for(const report of s.bodyReports||[])out['body-report/'+report.id]=report;
    for(const profile of s.mediaProfiles||[])out['media-profile/'+profile.id]=profile;
    for(const topic of s.mediaTopics||[])out['media-topic/'+topic.id]=topic;
    for(const item of s.media||[])out['media/'+item.id]=item;
    for(const e of s.ledger||[])out['ledger/'+e.id]=e;
    for(const a of s.accounts)out['account/'+a.id]=a;
    for(const t of s.transactions)out['transaction/'+t.id]=t;
    return out;
  }
  function hydrate(flat){
    const s=blank();
    for(const [key,v]of Object.entries(flat)){
      if(v===null||v===undefined)continue;const p=key.split('/');
      if(p[0]==='settings')s.settings[p[1]]=clone(v);
      else if(p[0]==='todo')(s.todos||=[]).push(clone(v));
      else if(p[0]==='body-report')(s.bodyReports||=[]).push(clone(v));
      else if(p[0]==='media-topic')(s.mediaTopics||=[]).push(clone(v));
      else if(p[0]==='media-profile')(s.mediaProfiles||=[]).push(clone(v));
      else if(p[0]==='media')(s.media||=[]).push(clone(v));
      else if(p[0]==='account')s.accounts.push(clone(v));
      else if(p[0]==='ledger')(s.ledger||=[]).push(clone(v));
      else if(p[0]==='transaction')s.transactions.push(clone(v));
      else if(p[0]==='review')((s.reviews||={})[p[1]]||={})[p[2]]=clone(v);
      else if(p[0]==='day'){
        const d=(s.days[p[1]]||={});
        if(p[2]==='health')(d.health||={})[p[3]]=clone(v);
        else if(p[2]==='meal')(d.meals||={})[p[3]]=clone(v);
        else if(p[2]==='task')(d.tasks||=[]).push(clone(v));
        else d[p[2]]=clone(v);
      }
    }
    return validate(s);
  }
  const focusDoneKey=(owner,id)=>'selfspace-focus-commit-v1:'+encodeURIComponent(owner)+':'+id;
  function focusDone(owner,op){if(!owner||!op.id.startsWith('focus:'))return false;const done=parse(focusDoneKey(owner,op.id),null);return !!done&&done.owner===owner&&done.id===op.id&&done.key===op.key;}
  function pending(){
    const ops=[];
    for(const key of keys(J)){const batch=parse(key,null);if(!batch||!Array.isArray(batch.operations))throw new Error('本机待同步记录格式异常，请先导出备份。');if(batch.owner&&cache.owner&&batch.owner!==cache.owner)continue;for(const op of batch.operations)if(!localStorage.getItem(ACK+op.id)&&!focusDone(batch.owner,op))ops.push({...op,batchKey:key});}
    const byId=new Map(ops.map(o=>[o.id,o])),done=new Set(),visiting=new Set(),ordered=[];
    function visit(op){if(done.has(op.id))return;if(visiting.has(op.id))throw new Error('本机待同步记录依赖异常，请先导出备份。');visiting.add(op.id);if(op.after&&byId.has(op.after))visit(byId.get(op.after));visiting.delete(op.id);done.add(op.id);ordered.push(op);}
    for(const op of ops)visit(op);return ordered;
  }
  const conflicts=()=>keys(CONFLICT).map(k=>({storageKey:k,...parse(k,{})})).filter(c=>!c.owner||!cache.owner||c.owner===cache.owner);
  function compose(){
    const flat={};for(const r of Object.values(cache.records))flat[r.key]=clone(r.value);
    for(const op of pending()){if(op.delta)flat[op.key]=Math.min(op.key.endsWith('/focus')?1440:10000,Number(flat[op.key]||0)+op.delta);else flat[op.key]=clone(op.value);}
    return hydrate(flat);
  }
  function editing(){return modal.open||journalDirty||reviewDirty||(page==='settings'&&settingsDirty);}
  function storeCache(){
    const other=parse(CACHE,null);
    if(other?.owner&&cache.owner&&other.owner!==cache.owner)throw new Error('当前账号与本机记录所属账号不同，请切回原账号。');
    if(other?.records)for(const [k,r]of Object.entries(other.records))if(!cache.records[k]||r.revision>cache.records[k].revision){cache.records[k]=r;cache.generation=null;}
    localStorage.setItem(CACHE,JSON.stringify(cache));
  }
  function putRecord(r){if(!cache.records[r.key]||r.revision>=cache.records[r.key].revision)cache.records[r.key]=clone(r);}
  function writeJournal(operations){
    if(!operations.length)return;
    const id=random();localStorage.setItem(J+id,JSON.stringify({owner:cache.owner,createdAt:Date.now(),operations}));
  }
  function bootstrap(){
    try{
      if(storageIssue){const original=localStorage.getItem(KEY);if(original){const originals=parse(RECOVERY,[]);if(!originals.includes(original)){originals.push(original);localStorage.setItem(RECOVERY,JSON.stringify(originals));}}}
      const saved=parse(CACHE,null);if(saved){if(saved.version!==1||!saved.records||typeof saved.records!=='object')throw new Error('本机同步缓存需要检查，请先导出备份。');cache=saved;}
      if(!cache.migrated){
        const flat=flatten(state,true),operations=Object.entries(flat).map(([key,value])=>({id:random(),key,value,baseRevision:0,after:null,delta:null}));
        if(operations.length&&!localStorage.getItem(BACKUP))localStorage.setItem(BACKUP,JSON.stringify(state));
        writeJournal(operations);cache.migrated=true;storeCache();
      }
      state=compose();ready=true;
      try{localStorage.setItem(KEY,JSON.stringify({...state,_personalCache:1}));}catch{} // The journal is durable even if a cache write fails.
    }catch(e){error=e.message;blocked=true;}
  }
  function record(before,next,options={}){
    if(blocked||!ready)throw new Error(error||'同步缓存尚未就绪，请稍后重试。');
    const a=flatten(before),b=flatten(next),queue=pending(),operations=[];
    for(const key of new Set([...Object.keys(a),...Object.keys(b)])){
      if(eq(a[key],b[key]))continue;
      const last=queue.filter(o=>o.key===key).at(-1),parent=last&&eq(a[key],last.value)?last:null,delta=options.counter&&(key.endsWith('/focus')||key.endsWith('/health/water'))&&Number(b[key])>Number(a[key]||0)?Number(b[key])-Number(a[key]||0):null;
      operations.push({id:random(),key,value:b[key]===undefined?null:clone(b[key]),baseRevision:options.baseRevisions?.[key]??cache.records[key]?.revision??0,after:parent?.id||null,delta});
    }
    writeJournal(operations);
    try{localStorage.setItem(KEY,JSON.stringify({...next,_personalCache:1}));}catch(e){if(!operations.length)throw e;}
    schedule(500);return true;
  }
  function completeFocus(session){
    if(!ready||blocked||!cache.owner||session.owner!==cache.owner)throw Error('当前账号尚未就绪，完成的专注会保留在本机等待重试。');
    if(typeof FocusModel==='undefined'||!FocusModel.valid(session,cache.owner)||session.phase!=='complete')throw Error('本轮计时记录需要核对，尚未写入专注时间。');
    const op=FocusModel.operation(session),queue=pending(),existing=queue.find(o=>o.id===op.id);
    if(existing&&!eq(op,(({batchKey,...v})=>v)(existing)))throw Error('本轮专注的待同步请求不一致，请保留存档并检查。');
    if(!existing&&!focusDone(cache.owner,op)){
      const current=compose().days[session.date]?.focus||0;
      if(current+25>1440)throw Error('该日期加上本轮后会超过 1,440 分钟，完成记录已保留，请先核对该日专注时间。');
      // Fixed ID and payload survive a lost response, reload and another tab.
      localStorage.setItem(J+'focus-'+session.id,JSON.stringify({owner:cache.owner,createdAt:session.startedAt,operations:[op]}));
    }
    const current=compose().days[session.date]?.focus;
    if(current!==undefined)(state.days[session.date]||={}).focus=current;
    try{localStorage.setItem(KEY,JSON.stringify({...state,_personalCache:1}));}catch{} // The outbox is already durable.
    schedule(500);paint();return true;
  }
  function refreshView(){
    if(!ready||blocked||editing()){paint();return;}
    state=compose();try{localStorage.setItem(KEY,JSON.stringify({...state,_personalCache:1}));}catch{}
    render();
  }
  async function request(path,options={}){
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),20000);
    try{
      const r=await fetch(path,{...options,credentials:'same-origin',cache:'no-store',signal:controller.signal,headers:{Accept:'application/json',...options.headers}});
      if(!(r.headers.get('content-type')||'').includes('application/json'))throw new Error('请重新登录后继续云端同步，本机记录仍会保留。');
      const data=await r.json();if(!r.ok){const e=new Error(data.error||'云端暂时无法连接，本机记录已保留。');e.restart=data.restart;e.accountMismatch=data.accountMismatch;throw e;}return data;
    }catch(e){if(e.name==='AbortError')throw new Error('云端响应超时，本机记录已保留，稍后重试。');throw e;}finally{clearTimeout(timeout);}
  }
  function bindOwner(owner){
    if(cache.owner&&cache.owner!==owner){blocked=true;throw new Error('当前登录账号与本机记录所属账号不同，请切回原账号。');}
    cache.owner=owner;
  }
  async function pull(){
    if(editing())return false;
    for(let attempt=0;attempt<3;attempt++){
      let cursor='',generation=null,records={};
      try{
        do{
          const query=cursor?'?cursor='+encodeURIComponent(cursor)+'&at='+generation:cache.generation!==null?'?since='+cache.generation:'';
          const data=await request('/api/personal'+query);bindOwner(data.owner);
          if(data.unchanged){if(editing())return false;cache.lastSynced=new Date().toISOString();storeCache();return true;}
          generation=data.generation;for(const r of data.records)records[r.key]=r;cursor=data.nextCursor;
        }while(cursor);
        if(editing())return false;
        cache.records=records;cache.generation=generation;cache.lastSynced=new Date().toISOString();storeCache();for(const c of conflicts()){const r=cache.records[c.key];if(r&&r.revision>c.remote.revision)localStorage.setItem(c.storageKey,JSON.stringify({...c,remote:r}));}refreshView();return true;
      }catch(e){if(e.restart)continue;throw e;}
    }
    throw new Error('其他设备正在更新记录，稍后会自动重新读取。');
  }
  function cleanAcknowledged(){
    for(const key of keys(J)){
      const batch=parse(key,null);if(!batch||batch.owner&&cache.owner&&batch.owner!==cache.owner)continue;
      if(batch.operations.every(op=>localStorage.getItem(ACK+op.id)||focusDone(batch.owner,op))){for(const op of batch.operations)if(op.id.startsWith('focus:'))localStorage.setItem(focusDoneKey(batch.owner,op.id),JSON.stringify({owner:batch.owner,id:op.id,key:op.key}));localStorage.removeItem(key);for(const op of batch.operations)localStorage.removeItem(ACK+op.id);}
    }
  }
  async function push(){
    for(let pageNo=0;pageNo<10;pageNo++){
      const blockedKeys=new Set(conflicts().map(c=>c.key)),ops=pending().filter(o=>!blockedKeys.has(o.key)).slice(0,6);if(!ops.length)return;
      const data=await request('/api/personal',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({owner:cache.owner,operations:ops.map(({batchKey,...op})=>op)})});
      bindOwner(data.owner);let progress=false;
      for(const result of data.results){
        const op=ops.find(o=>o.id===result.id);if(!op)throw new Error('云端确认结果不完整，本机待同步记录会保留。');
        if(result.status==='ok'){
          putRecord(result.record);cache.generation=null;storeCache();localStorage.setItem(ACK+op.id,JSON.stringify({owner:cache.owner}));progress=true;
        }else if(result.status==='conflict'){
          putRecord(result.record);cache.generation=null;
          localStorage.setItem(CONFLICT+encodeURIComponent(op.key),JSON.stringify({owner:cache.owner,key:op.key,remote:result.record,createdAt:new Date().toISOString()}));storeCache();progress=true;
        }else if(result.status==='rejected')throw new Error(result.error);
      }
      cleanAcknowledged();refreshView();if(!progress)return;
    }
  }
  async function round(){
    if(running||blocked||!ready)return;
    if(typeof navigator!=='undefined'&&navigator.onLine===false){error='当前离线，记录已保存在本机，联网后自动补传。';paint();schedule(30000);return;}
    running=true;paint();
    try{if(!editing()){if(cache.owner){await push();await pull();error='';}else if(await pull()){await push();await pull();error='';}}}catch(e){error=e.message;if(e.accountMismatch)blocked=true;}
    finally{running=false;paint();if(!error&&typeof BackupCenter!=='undefined')BackupCenter.onSynced();schedule(pendingSafe().some(o=>!conflicts().some(c=>c.key===o.key))&&!error?2000:30000);}
  }
  async function sync(){
    if(typeof navigator!=='undefined'&&navigator.locks?.request){await navigator.locks.request('selfspace-personal-sync',{ifAvailable:true},async lock=>{if(lock)await round();else schedule(3000);});}
    else await round();
  }
  function schedule(ms=500){clearTimeout(timer);timer=setTimeout(()=>void sync(),ms);}
  function pendingSafe(){try{return pending();}catch{return [];}}
  const status=()=>blocked?'需要检查账号':conflicts().length?'有修改冲突':running?'正在同步':error?(typeof navigator!=='undefined'&&navigator.onLine===false?'离线 · 本机已保存':'等待重试'):pendingSafe().length?'本机已保存 · 待同步':cache.owner?'云端已同步':'正在连接云端';
  function paint(){
    if(typeof DraftCenter!=='undefined')DraftCenter.paint();
    const text=document.querySelector('#personal-status-text');if(text)text.textContent=status();
    const note=document.querySelector('#storage-note');if(note)note.textContent='个人记录：'+status()+' · Apple 健康独立同步';
    const summary=document.querySelector('#personal-live-status');if(summary)summary.textContent=status()+' · '+pendingSafe().length+' 条待同步';
    const e=document.querySelector('#personal-live-error');if(e)e.textContent=error;
  }
  function label(key){const p=key.split('/'),names={todo:'任务清单',journal:'生活手记',mood:'心情',focus:'专注时间',meal:'三餐记录',task:'待办',health:'手动健康记录',account:'资产账户',transaction:'收支流水',settings:'偏好设置',review:'每周复盘',media:'自媒体内容','media-topic':'自媒体选题资料','media-profile':'自媒体账号','body-report':'体脂秤报告'};return (p[0]==='day'?p[1]+' · '+names[p[2]]:names[p[0]]||'个人记录');}
  function conflictLocal(key){const flat=flatten(compose());return Object.hasOwn(flat,key)?flat[key]:null;}
  function panel(){
    const items=conflicts();return `<section class="settings-section personal-sync-panel"><h3>跨设备云端同步</h3><p id="personal-live-status">${esc(status())} · ${pendingSafe().length} 条待同步</p><p id="personal-live-error" class="field-help">${esc(error)}</p><p>三餐、待办、专注、自媒体、资产、手记、手动健康记录与偏好设置，会同步到同一账号的私人空间。断网时先在本机保存，重新联网后补传。</p><div class="settings-buttons"><button class="btn" data-personal-action="retry">立即同步</button><a class="btn" href="/signin-with-chatgpt?return_to=%2F%23settings" target="_top">重新登录</a>${localStorage.getItem(BACKUP)?'<button class="btn" data-personal-action="backup">下载迁移前存档</button>':''}${localStorage.getItem(RECOVERY)?'<button class="btn" data-personal-action="recovery">下载本机原始存档</button>':''}${keys('selfspace-conflict-archive:').length?'<button class="btn" data-personal-action="conflict-backup">下载冲突处理存档</button>':''}</div>${items.map(c=>`<div class="personal-conflict"><h4>${esc(label(c.key))} · 两台设备有不同修改</h4><div class="conflict-versions"><div><strong>本机待同步版本</strong><pre>${esc(JSON.stringify(conflictLocal(c.key),null,2)?.slice(0,1500)||'已删除')}</pre></div><div><strong>云端版本</strong><pre>${esc(JSON.stringify(c.remote.value,null,2)?.slice(0,1500)||'已删除')}</pre></div></div><button class="btn" data-personal-action="local" data-record-key="${esc(c.key)}">使用本机版本</button> <button class="btn" data-personal-action="remote" data-record-key="${esc(c.key)}">使用云端版本</button></div>`).join('')}</section>`;
  }
  function resolve(key,useLocal){
    const c=conflicts().find(v=>v.key===key);if(!c)return;
    const operations=pending().filter(o=>o.key===key),value=conflictLocal(key);
    localStorage.setItem('selfspace-conflict-archive:'+random(),JSON.stringify({key,local:value,localVersions:operations.map(o=>({value:o.value,delta:o.delta})),remote:c.remote,chosen:useLocal?'local':'remote',at:new Date().toISOString()}));
    if(useLocal)writeJournal([{id:random(),key,value,baseRevision:c.remote.revision,after:null,delta:null}]);
    for(const op of operations)localStorage.setItem(ACK+op.id,JSON.stringify({owner:cache.owner,discarded:true}));
    putRecord(c.remote);storeCache();localStorage.removeItem(c.storageKey);cleanAcknowledged();refreshView();schedule();
  }
  document.addEventListener('click',e=>{
    const b=e.target.closest('[data-personal-action]');if(!b)return;
    try{
      const action=b.dataset.personalAction;
      if(action==='retry')void sync();
      else if(action==='backup'){const raw=localStorage.getItem(BACKUP);if(!raw)return;const url=URL.createObjectURL(new Blob([raw],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='观己-云端迁移前存档.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
      else if(action==='recovery'){const raw=parse(RECOVERY,[]).at(-1);if(!raw)return;const url=URL.createObjectURL(new Blob([raw],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='观己-本机原始存档.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
      else if(action==='conflict-backup'){const raw=JSON.stringify(keys('selfspace-conflict-archive:').map(k=>parse(k,null)),null,2);const url=URL.createObjectURL(new Blob([raw],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='观己-冲突处理存档.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
      else if(action==='local'||action==='remote')resolve(b.dataset.recordKey,action==='local');
    }catch(e){error=e.message;paint();toast('操作尚未完成，本机记录已保留。',true);}
  });
  document.addEventListener('input',e=>{if(e.target.closest?.('#settings-form'))settingsDirty=true;});
  document.addEventListener('DOMContentLoaded',()=>{schedule(0);});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')schedule(0);});
  window.addEventListener('online',()=>schedule(0));
  window.addEventListener('storage',e=>{
    if(e.key==='selfspace-v1'&&e.newValue){
      try{const older=JSON.parse(e.newValue);if(!older._personalCache){
        const incoming=flatten(cleanDemoRecords(validate(older)),true),current=flatten(compose());
        const ops=Object.entries(incoming).filter(([key,value])=>!eq(current[key],value)).map(([key,value])=>({id:random(),key,value,baseRevision:0,after:null,delta:null}));
        writeJournal(ops);error='已保留旧页面的新增及修改，请刷新其他已打开页面后继续使用。';refreshView();schedule(500);
      }}catch{error='检测到旧页面保存，请刷新其他页面并检查本机备份。';paint();}return;
    }
    if(e.key===CACHE||e.key?.startsWith(J)||e.key?.startsWith(ACK)||e.key?.startsWith(CONFLICT)){
      try{
        const saved=parse(CACHE,null);if(saved?.owner&&cache.owner&&saved.owner!==cache.owner)return;
        if(saved){const newer=Object.values(cache.records).some(r=>r.revision>(saved.records[r.key]?.revision||0));for(const r of Object.values(saved.records))putRecord(r);cache.generation=newer?null:saved.generation;cache.lastSynced=saved.lastSynced;}
        refreshView();
        // A cache/ack notification already carries the other tab's result. Only
        // new work needs a network wakeup; otherwise tabs could ping-pong polls.
        if(e.key?.startsWith(J)&&e.newValue)schedule(500);
      }catch{error='本机同步缓存需要检查，请先导出备份。';paint();}
    }});
  return {recordState:key=>({revision:cache.records[key]?.revision||0,value:clone(flatten(compose())[key]??null),pending:pendingSafe().some(o=>o.key===key),conflict:conflicts().some(c=>c.key===key)}),revisions:keys=>Object.fromEntries(keys.map(k=>[k,cache.records[k]?.revision||0])),dataState:()=>({owner:cache.owner,ready,blocked,running,error,pending:pendingSafe().length,conflicts:conflicts().length,settingsDirty}),recoveryData:()=>({manual:compose(),pending:pendingSafe().map(({batchKey,...op})=>op),conflicts:conflicts().map(({storageKey,...c})=>c)}),completeFocus,reload:async()=>{cache.generation=null;await sync();},bootstrap,record,panel,paint,sync,flatten,hydrate,compose,pending,resolve,settingsSaved:()=>{settingsDirty=false;},isEditing:editing,status};
})();
