'use strict';
const MediaHistory=(()=>{
  const M=MediaHistoryModel;let ctx=null,epoch=0,controller=null;
  const connection=()=>PersonalSync.dataState();
  const available=()=>ctx&&modal.open&&connection().ready&&!connection().blocked&&connection().owner===ctx.owner;
  const validValue=(key,v)=>!!v&&v.id===key.split('/')[1]&&(key.startsWith('media-topic/')?MediaTopicModel.valid(v):SelfMedia.valid(v));
  const time=v=>{const d=new Date(v);return Number.isFinite(+d)?new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(d):'时间未记录';};
  const note=()=>'<p class="field-help">这里只显示已经同步到云端的可用版本，不含本机未提交草稿。部分导入、清空或完整备份恢复可能没有逐条版本；仍可在设置中使用完整备份。</p>';
  function valueText(key,value){if(key==='accountId'&&value)return MediaAccounts.label(value)||'关联账号暂不可用';if(key==='topicId'&&value)return (state.mediaTopics||[]).find(t=>t.id===value)?.title||'关联选题暂不可用';return M.display(key,value);}
  function rootHTML(){return `<form id="history-filter-form"><div class="history-filters"><label>记录类型<select name="kind"><option value="media" ${ctx.filters.kind==='media'?'selected':''}>自媒体内容</option><option value="media-topic" ${ctx.filters.kind==='media-topic'?'selected':''}>选题资料</option></select></label><label>按标题查找<input name="q" type="search" maxlength="160" value="${esc(ctx.filters.q)}" placeholder="输入标题中的文字…"></label></div><div class="history-filter-actions"><label><input type="checkbox" name="deleted" ${ctx.filters.deleted?'checked':''}>只看已删除记录</label><button class="btn" type="submit">查找记录</button></div></form>${note()}${ctx.records.length?`<div class="history-record-list">${ctx.records.map((r,i)=>`<button class="history-record" data-history="record" data-index="${i}"><span><strong>${esc(r.title)}</strong><small>${r.deleted?'已删除':'现有记录'} · ${esc(time(r.updatedAt))}</small></span><span>查看版本 ${icon('arrow')}</span></button>`).join('')}</div>`:'<div class="history-empty">没有找到匹配的云端记录。</div>'}<div class="history-pagination"><button class="btn" data-history="root-prev" ${ctx.filters.page<=1?'disabled':''}>上一页</button><span>第 ${ctx.filters.page} 页</span><button class="btn" data-history="root-next" ${!ctx.hasMore?'disabled':''}>下一页</button></div>`;}
  function versionsHTML(){const c=ctx.current;return `<button class="text-btn" data-history="root">${icon('chevron')}返回记录列表</button><div class="history-current"><h3>${esc(c.value?.title||ctx.versions.find(v=>v.value)?.value.title||'已删除的记录')}</h3><p>当前${c.value?'仍保留':'已删除'} · 云端版本 ${c.revision} · ${esc(time(c.updatedAt))}</p></div>${note()}${ctx.versions.length?`<div class="history-version-list">${ctx.versions.map((v,i)=>{const isCurrent=v.revision===c.revision&&M.canonical(v.value)===M.canonical(c.value);return `<article class="history-version"><div><strong>版本 ${v.revision} · ${v.value?'保存记录':'删除记录'}${isCurrent?' · 当前版本':''}</strong><small>${esc(time(v.updatedAt))} · 北京时间</small></div>${v.value?`<button class="btn" data-history="preview" data-index="${i}" ${isCurrent?'disabled':''}>对比 / 恢复</button>`:'<span class="field-help">选择更早的保存版本可找回内容</span>'}</article>`;}).join('')}</div>`:'<div class="history-empty">暂无逐条修改版本，可在设置中查看完整备份。</div>'}<div class="history-pagination"><button class="btn" data-history="versions-prev" ${!ctx.cursors.length?'disabled':''}>较新版本</button><button class="btn" data-history="versions-next" ${!ctx.nextBefore?'disabled':''}>更早版本</button></div>`;}
  function previewHTML(){const v=ctx.selected,changes=M.changes(ctx.current.key,ctx.current.value,v.value);return `<button class="text-btn" data-history="versions">返回版本列表</button><div class="history-current"><h3>恢复版本 ${v.revision} 前核对</h3><p>${esc(v.value.title)} · ${esc(time(v.updatedAt))}</p></div><p class="field-help">将所选版本的全部字段恢复为一条新的修改记录，包括发布状态、链接、统计或来源资料。其他内容不受影响，现有历史保留。</p>${ctx.current.value===null?'<p class="history-deleted-note">当前记录已删除，确认后会找回这条记录。</p>':''}<div class="history-compare-heading"><span>当前云端内容</span><span>准备恢复的内容</span></div>${changes.map(d=>`<section class="history-change"><h4>${d.label}</h4><div class="history-compare"><div><span>当前</span><pre>${esc(ctx.current.value===null?'当前已删除':valueText(d.key,d.current))}</pre></div><div><span>恢复后</span><pre>${esc(valueText(d.key,d.previous))}</pre></div></div></section>`).join('')||'<p class="history-empty">这些内容字段没有变化，无需恢复。</p>'}<p id="history-restore-error" class="backup-error" role="status"></p><div class="modal-footer"><button class="btn" data-history="versions">取消恢复</button><button class="btn btn-primary" data-history="restore" ${!changes.length?'disabled':''}>确认恢复这个版本</button></div>`;}
  function paint(){const el=document.getElementById('history-content');if(!ctx||!el)return;el.innerHTML=ctx.view==='records'?rootHTML():ctx.view==='preview'?previewHTML():versionsHTML();}
  async function request(params){
    controller?.abort();controller=new AbortController();const localController=controller,token=++epoch,who=ctx?.owner;
    const el=document.getElementById('history-content');if(el)el.innerHTML='<p class="history-empty" role="status">正在读取私人云端修改历史…</p>';
    const timeout=setTimeout(()=>localController.abort(),15000);
    try{const r=await fetch('/api/personal/history?'+new URLSearchParams(params),{cache:'no-store',signal:localController.signal}),data=await r.json();if(token!==epoch||!available()||ctx.owner!==who)return null;if(!r.ok)throw Error(data.error||'修改历史未能读取。');if(data.owner!==who)throw Error('登录账号已变化，请关闭后重新打开。');return data;}
    catch(e){if(token===epoch&&ctx&&modal.open){const target=document.getElementById('history-content');if(target)target.innerHTML=`<p class="backup-error" role="status">${esc(e.name==='AbortError'?'读取超时，请重试。':e.message||'修改历史未能读取。')}</p><button class="btn" data-history="root">返回记录列表</button>`;}return null;}
    finally{clearTimeout(timeout);}
  }
  async function loadRecords(){if(!available())return;ctx.view='records';ctx.selected=null;const f=ctx.filters,data=await request({kind:f.kind,q:f.q,deleted:f.deleted?'1':'0',page:String(f.page)});if(!data)return;ctx.records=data.records;ctx.hasMore=data.hasMore;paint();}
  async function loadVersions(key,before=null){
    if(!available()||!M.keyOK(key))return;ctx.view='versions';ctx.selected=null;const data=await request({key,...(before?{before:String(before)}:{})});if(!data)return;
    ctx.current=data.current;ctx.versions=data.versions;ctx.nextBefore=data.nextBefore;ctx.before=before;ctx.localBase=M.canonical(PersonalSync.recordState(key).value);paint();
  }
  async function open(key=''){
    if(modal.open||recordDraftDirty||journalDirty||reviewDirty||connection().settingsDirty){toast('请先保存或关闭正在填写的内容，再查看修改历史。');return;}
    const s=connection();if(!s.ready||s.blocked||!s.owner){toast('请等待当前账号连接完成后查看修改历史。',true);return;}if(key&&!M.keyOK(key))return;
    ctx={owner:s.owner,view:'records',filters:{kind:key.startsWith('media-topic/')?'media-topic':'media',q:'',deleted:false,page:1},records:[],hasMore:false,versions:[],current:null,selected:null,cursors:[],before:null,nextBefore:null,localBase:null};
    modalShell('修改历史与找回内容','私人云端版本 · 时间按北京时间显示','<div id="history-content"></div>');modal.classList.add('history-dialog');if(key)await loadVersions(key);else await loadRecords();
  }
  function preview(index){if(!available())return;const v=ctx.versions[index];if(!v||!validValue(ctx.current.key,v.value)){toast('这个历史版本暂不支持恢复，可查看完整备份。',true);return;}ctx.selected=v;ctx.view='preview';paint();document.getElementById('history-content')?.scrollIntoView?.({block:'start'});}
  function restore(){
    const fail=text=>{const el=document.getElementById('history-restore-error');if(el)el.textContent=text;else toast(text,true);return false;};
    if(!available()||ctx.view!=='preview'||!ctx.selected)return fail('账号或页面已变化，请重新打开历史版本。');
    const {key,revision}=ctx.current,v=ctx.selected.value;if(!validValue(key,v)||!M.changes(key,ctx.current.value,v).length)return false;
    const latest=PersonalSync.recordState(key);
    if(latest.pending||latest.conflict)return fail('这条记录还有本机待同步修改或冲突，请先到设置中完成同步或核对，再重新预览。');
    if(latest.revision>revision||M.canonical(latest.value)!==ctx.localBase)return fail('这条记录在预览后已有变化，请返回版本列表重新读取后再核对。');
    const value=M.restored(key,v,new Date().toISOString()),next=structuredClone(state),collection=key.startsWith('media-topic/')?'mediaTopics':'media';next[collection]||=[];const i=next[collection].findIndex(r=>r.id===value.id);
    if(i<0&&next[collection].length>=(collection==='media'?10000:5000))return fail('记录数量已达上限，请先整理已有内容。');
    if(i<0)next[collection].push(value);else next[collection][i]=value;
    if(!persist(next,'恢复操作已保存，正在同步；遇到并发修改会保留冲突供你核对。',{baseRevisions:{[key]:revision}}))return false;
    closeModal(true);render();return true;
  }
  function cleanup(){controller?.abort();controller=null;epoch++;ctx=null;modal.classList.remove('history-dialog');}
  document.addEventListener('click',e=>{const b=e.target.closest?.('[data-history]');if(!b)return;const a=b.dataset.history;if(a==='open'){void open(b.dataset.key||'');return;}if(!available())return;
    if(a==='root'){ctx.filters.page=1;void loadRecords();}if(a==='record'){const r=ctx.records[Number(b.dataset.index)];if(r){ctx.cursors=[];void loadVersions(r.key);}}if(a==='preview')preview(Number(b.dataset.index));if(a==='restore')restore();if(a==='versions')void loadVersions(ctx.current.key,ctx.before);
    if(a==='root-prev'||a==='root-next'){ctx.filters.page=Math.max(1,Math.min(500,ctx.filters.page+(a==='root-next'?1:-1)));void loadRecords();}
    if(a==='versions-next'&&ctx.nextBefore){ctx.cursors.push(ctx.before);void loadVersions(ctx.current.key,ctx.nextBefore);}if(a==='versions-prev'&&ctx.cursors.length)void loadVersions(ctx.current.key,ctx.cursors.pop());
  });
  document.addEventListener('submit',e=>{if(e.target.id!=='history-filter-form')return;e.preventDefault();if(!available())return;const f=new FormData(e.target);ctx.filters={kind:String(f.get('kind')||'media'),q:String(f.get('q')||'').trim().slice(0,160),deleted:f.has('deleted'),page:1};void loadRecords();});
  document.addEventListener('DOMContentLoaded',()=>modal.addEventListener('close',cleanup));
  return {open,preview,restore,cleanup};
})();
