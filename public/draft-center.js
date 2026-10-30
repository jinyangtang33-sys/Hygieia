'use strict';
const DraftCenter=(()=>{
  const F=DraftFormat,bindings=new WeakMap(),inline=new Map(),recovered=new Set();let restoring=false,lastError='';
  const owner=()=>{const s=typeof PersonalSync!=='undefined'?PersonalSync.dataState():null;return !state.demo&&s?.ready&&!s.blocked?s.owner:null;};
  const storage=()=>owner()?F.store(localStorage,owner()):null;
  const list=()=>{try{return storage()?.list()||[];}catch{return [];}};
  function meta(form){const d=form.dataset||{},date=d.recordDate||d.week||selectedDate;
    if(form.id==='record-form')return {type:'record',kind:d.kind,id:d.id||'',meal:d.meal||'breakfast',quick:d.quick==='true',date};
    if(form.id==='body-report-form')return {type:'report',id:d.original||'',date};
    if(form.id==='checklist-form')return {type:'todo',id:d.id||'',new:!d.created,date};
    if(form.id==='media-topic-form')return {type:'topic',id:d.id||'',new:!d.created,date};
    if(form.id==='media-form')return {type:'media',id:d.id||'',new:!d.created,date};
    if(form.id==='media-account-form')return {type:'profile',id:d.id||'',date};
    if(form.id==='weekly-review-form')return {type:'review',date};
    if(form.id==='settings-form')return {type:'settings',date};
    if(form.id==='journal-text')return {type:'journal',date:d.date||date};return null;
  }
  function baseline(m){const d=state.days[m.date]||{};
    if(m.type==='record'){if(m.kind==='health')return {manual:d.health||{},apple:cloudHealth[m.date]?.health||{}};if(m.kind==='meal')return d.meals||{};if(m.kind==='task')return (PersonalSync.compose().days[m.date]?.tasks||[]).find(t=>t.id===m.id)||null;if(m.kind==='account')return state.accounts.find(x=>x.id===m.id)||null;if(m.kind==='transaction')return state.transactions.find(x=>x.id===m.id)||null;return null;}
    if(m.type==='report')return state.bodyReports?.find(x=>x.id===m.id)||null;
    if(m.type==='todo')return PersonalSync.compose().todos?.find(x=>x.id===m.id)||null;
    if(m.type==='topic')return PersonalSync.compose().mediaTopics?.find(x=>x.id===m.id)||null;
    if(m.type==='media')return state.media?.find(x=>x.id===m.id)||null;
    if(m.type==='profile')return state.mediaProfiles?.find(x=>x.id===m.id)||null;
    if(m.type==='journal')return d.journal||'';
    if(m.type==='review')return state.reviews?.[m.date]||{};
    return state.settings;
  }
  function fields(form,m){if(m.type==='journal')return {text:form.value};const out={};for(const name of F.names(m)){const el=form.elements.namedItem(name);if(!el||el.disabled||el.readOnly)continue;if(['file','password','hidden'].includes(el.type))continue;out[name]=el.type==='checkbox'?el.checked:el.value;}return out;}
  function bind(form){if(!form||bindings.has(form))return bindings.get(form);const m=meta(form);if(!m||!F.names(m).length)return null;const b={id:crypto.randomUUID(),owner:owner(),meta:m,base:F.canonical(baseline(m)),initial:F.canonical(fields(form,m))};bindings.set(form,b);if(['journal','review','settings'].includes(m.type))inline.set(m.type+':'+m.date,b);return b;}
  function note(form,text){let el=form.querySelector?.('.draft-save-note');if(!el&&form.id!=='journal-text'){el=document.createElement('p');el.className='field-help draft-save-note';el.setAttribute('role','status');form.prepend(el);}if(el)el.textContent=text;}
  function capture(form){if(restoring||!form||form.closest?.('dialog')&&!form.closest('dialog').open)return;const b=bind(form);if(!b)return;const currentOwner=owner();if(!currentOwner||b.owner&&b.owner!==currentOwner){note(form,'草稿尚未保存：请等待当前账号连接完成。');return;}b.owner=currentOwner;if(['journal','review','settings'].includes(b.meta.type))inline.set(b.meta.type+':'+b.meta.date,b);
    const values=fields(form,b.meta);try{if(F.canonical(values)===b.initial){storage().remove(b.id);note(form,'草稿仅保存在本机，确认保存后才同步。');paint();return;}
      storage().write({version:1,id:b.id,owner:currentOwner,meta:b.meta,base:b.base,fields:values,revisions:form.dataset?.revisions||'{}',updatedAt:new Date().toISOString()});lastError='';note(form,'草稿已保存在本机 · 尚未提交到云端');paint();
    }catch(e){lastError=e.message||'浏览器空间不足，草稿未保存。';note(form,'草稿未保存：'+lastError);paint();}
  }
  function mount(){for(const id of ['record-form','body-report-form','media-form','media-account-form','media-topic-form','checklist-form','weekly-review-form','settings-form','journal-text']){const form=document.getElementById(id);if(form){bind(form);if(id!=='journal-text')note(form,'自动保存本机草稿；恢复后仍需确认保存。');}}paint();}
  function finishModal(){lastError='';const form=document.querySelector('#modal form'),b=form&&bindings.get(form);if(b&&b.owner===owner())try{storage()?.close(b.id);}catch{}paint();}
  function committed(){for(const [key,b] of inline){if(b.owner!==owner())continue;const d=list().find(x=>x.id===b.id);if(!d)continue;const current=baseline(b.meta),matches=b.meta.type==='journal'?current===(d.fields.text||''):Object.entries(d.fields).every(([k,v])=>b.meta.type==='settings'&&k!=='name'?Number(current[k])===Number(v):(current[k]||'')===v);if(matches){try{storage()?.close(b.id);}catch{}const el=document.getElementById({journal:'journal-text',review:'weekly-review-form',settings:'settings-form'}[b.meta.type]);if(el){b.initial=F.canonical(fields(el,b.meta));b.base=F.canonical(current);b.id=crypto.randomUUID();}inline.delete(key);recovered.delete(key);}}paint();}
  const label=m=>m.type==='record'?({health:'健康记录',meal:'三餐记录',task:'待办',account:'账户',transaction:'收支'}[m.kind]||'记录'):{todo:'任务清单',report:'体脂秤报告',media:'自媒体内容',topic:'选题资料',profile:'账号资料',journal:'生活手记',review:'每周复盘',settings:'偏好设置'}[m.type];
  function cards(){const items=list();return `<p class="field-help">草稿仅保存在当前浏览器、当前账号下，不跨设备同步，不包含截图、识别原文或确认勾选。关联记账仍使用原有待确认请求保护。</p>${items.length?items.map(d=>`<article class="draft-card"><div><strong>${esc(label(d.meta))}</strong><p>${esc(d.meta.date)} · ${esc(syncTime(d.updatedAt))} 保存</p></div><div class="settings-buttons"><button class="btn btn-primary" data-draft="resume" data-id="${esc(d.id)}">继续填写</button><button class="text-btn" data-draft="remove" data-id="${esc(d.id)}">移除草稿</button></div></article>`).join(''):'<div class="table-empty">没有未完成的本机草稿。</div>'}`;}
  function paint(){const banner=document.getElementById('draft-banner'),items=list();if(banner){banner.hidden=!items.length&&!lastError;banner.innerHTML=`<span>${lastError?esc('草稿保存遇到问题：'+lastError):`有 ${items.length} 份未完成的本机草稿`}</span><a class="text-btn" href="#quality">查看并继续填写 ${icon('arrow')}</a>`;}const count=document.getElementById('quality-draft-count');if(count)count.textContent=String(items.length);const el=document.getElementById('draft-list');if(el)el.innerHTML=cards();}
  function fieldLabel(name,m){const body=BodyReportModel.fields.find(f=>'body-'+f.key===name);if(body)return body.label;const labels={todoTitle:'任务名称',todoCategory:'分类',todoPriority:'优先级',todoStatus:'任务状态',todoDueAt:'截止时间',todoRemindAt:'计划提醒时间',todoNotes:'任务备注',sleep:'睡眠',weight:'体重',steps:'步数',water:'饮水',exercise:'运动时长',mealType:'餐次',name:m.kind==='meal'?'吃了些什么':'名称',time:'时间',calories:'热量',note:'小记',title:'待办标题',tag:'分类',balance:'余额',amount:'金额',date:'日期',description:'备注',type:'类型',category:'分类',accountId:'关联账户',bodyMeasuredAt:'测量时间',bodySource:'报告来源',bodyNotes:'报告备注',text:'手记内容',wins:'本周收获',challenge:'问题与调整',plan:'下周计划',waterGoal:'饮水目标',stepsGoal:'步数目标',sleepGoal:'睡眠目标',topicTitle:'选题名称',topicEventDate:'事件日期',topicFacts:'已确认事实',topicViewpoint:'个人观点',topicQuestions:'待核实问题',...Object.fromEntries(Array.from({length:5},(_,i)=>[['topicSourceTitle'+i,'来源名称 '+(i+1)],['topicSourceUrl'+i,'来源链接 '+(i+1)],['topicSourceDate'+i,'报道日期 '+(i+1)]]).flat()),mediaTopic:'关联选题',mediaTitle:'内容标题',mediaAccount:'发布账号',mediaPlatform:'平台',mediaFormat:'内容形式',mediaStatus:'创作状态',mediaPlannedDate:'计划发布日期',mediaScript:'正文 / 脚本',mediaNotes:'创作备注',mediaPublishedDate:'实际发布日期',mediaUrl:'作品链接',mediaViews:'浏览量',mediaLikes:'点赞',mediaComments:'评论',mediaSaves:'收藏',profileNickname:'账号昵称',profileStatus:'账号状态',profileHandle:'账号用户名',profileUrl:'账号主页',profilePositioning:'内容定位',profileAudience:'目标受众',profileBio:'账号简介',profileCadence:'更新计划',avatarReady:'头像已准备',bioReady:'简介已准备',firstPostReady:'首篇内容已准备',profileFollowers:'粉丝数',profileFollowersDate:'粉丝数据日期',profileNotes:'运营备注'};return labels[name]||'填写内容';}
  function preview(d){modalShell('草稿对应的记录已有变化','为避免覆盖新记录，请先对照草稿内容',`<p class="field-help">记录在草稿保存后被修改，或 Apple 数据已更新。草稿仍保留在本机，可复制需要的内容，再重新打开对应记录填写。</p>${Object.entries(d.fields).map(([k,v])=>`<details class="draft-preview"><summary>${esc(fieldLabel(k,d.meta))}</summary><pre>${esc(String(v))}</pre></details>`).join('')}<div class="modal-footer"><button class="btn" data-action="close">返回</button></div>`);}
  async function resume(id){if(modal.open||recordDraftDirty||journalDirty||reviewDirty||PersonalSync.dataState().settingsDirty){toast('请先保存或关闭正在填写的内容。');return;}const who=owner(),d=list().find(v=>v.id===id);if(!d||!who)return;await PersonalSync.sync();if(owner()!==who){toast('账号发生变化，草稿未恢复。',true);return;}if(d.base!==F.canonical(baseline(d.meta))){preview(d);return;}
    const m=d.meta;if(m.date>TODAY||m.date<'2000-01-01'){toast('草稿日期无效，请先核对。',true);return;}restoring=true;
    try{
      const route=m.type==='record'?({health:'health',meal:'meals',task:'work',account:'assets',transaction:'assets'}[m.kind]):({todo:'tasks',report:'health',media:'media',topic:'media',profile:'media',journal:'journal',review:'review',settings:'settings'}[m.type]);navigate(route,{date:m.date,pinned:true});if(typeof DateNavigation!=='undefined')DateNavigation.write(m.date,false,false,route);
      let form;if(m.type==='record'){showForm(m.kind,m.meal,m.id,m.quick);form=document.getElementById('record-form');}
      if(m.type==='report'){BodyReports.open(m.id);form=document.getElementById('body-report-form');}
      if(m.type==='todo'){Checklist.open(m.new?'':m.id);form=document.getElementById('checklist-form');if(form&&m.new){form.dataset.id=m.id;form.dataset.original='null';}}
      if(m.type==='topic'){MediaTopics.open(m.new?'':m.id);form=document.getElementById('media-topic-form');if(form&&m.new){form.dataset.id=m.id;form.dataset.original='null';}}
      if(m.type==='media'){SelfMedia.open(m.new?'':m.id);form=document.getElementById('media-form');if(form&&m.new)form.dataset.id=m.id;}
      if(m.type==='profile'){MediaAccounts.open(m.id);form=document.getElementById('media-account-form');}
      if(m.type==='review'){WeeklyReview.openWeek(m.date);form=document.getElementById('weekly-review-form');}
      if(m.type==='settings')form=document.getElementById('settings-form');if(m.type==='journal')form=document.getElementById('journal-text');
      if(!form)throw Error('对应记录暂时无法打开，草稿已保留。');
      if(m.type==='journal'){form.value=d.fields.text||'';journalDirty=true;}else{for(const [name,value]of Object.entries(d.fields)){const el=form.elements.namedItem(name);if(!el||el.disabled||el.readOnly||['file','password','hidden'].includes(el.type))continue;if(el.type==='checkbox')el.checked=!!value;else el.value=String(value);el.dispatchEvent(new Event('change',{bubbles:true}));}form.dataset.revisions=d.revisions;if(['review','settings'].includes(m.type)){if(m.type==='review')reviewDirty=true;}else recordDraftDirty=true;}
      bindings.set(form,{id:d.id,owner:who,meta:m,base:d.base,initial:'restored'});if(['journal','review','settings'].includes(m.type)){inline.set(m.type+':'+m.date,bindings.get(form));if(m.type!=='settings')recovered.add(m.type+':'+m.date);}note(form,'草稿已恢复 · 请核对后确认保存');toast('已恢复本机草稿，尚未提交。');
    }catch(e){toast(e.message||'草稿恢复未完成，内容仍保留。',true);}finally{restoring=false;}
  }
  function canSubmit(form){const b=form&&bindings.get(form);if(!b)return true;try{if(!owner()||b.owner&&b.owner!==owner()||storage()?.isClosed(b.id)){toast('这份填写已在其他页面完成、移除或切换了账号，请重新打开记录后核对。',true);return false;}return true;}catch{toast('暂时无法核对草稿状态，请检查浏览器存储后再保存。',true);return false;}}
  document.addEventListener('submit',e=>{if(!canSubmit(e.target)){e.preventDefault();e.stopImmediatePropagation();}},true);
  document.addEventListener('click',e=>{if(e.target.closest?.('[data-action="save-journal"]')&&!canSubmit(document.getElementById('journal-text'))){e.preventDefault();e.stopImmediatePropagation();}},true);
  function flush(){if(restoring)return;for(const id of ['record-form','body-report-form','media-form','media-account-form','media-topic-form','checklist-form','weekly-review-form','settings-form','journal-text']){const el=document.getElementById(id);if(el)capture(el);}}
  for(const event of ['input','change'])document.addEventListener(event,e=>{if(restoring)return;const el=e.target.id==='journal-text'?e.target:e.target.closest?.('form');if(el)capture(el);});
  document.addEventListener('click',e=>{const b=e.target.closest('[data-draft]');if(!b)return;if(b.dataset.draft==='resume')void resume(b.dataset.id);if(b.dataset.draft==='remove'){try{storage()?.close(b.dataset.id);paint();toast('已移除这份本机草稿，正式记录不受影响。');}catch{toast('草稿未移除，请检查浏览器存储。',true);}}});
  window.addEventListener('pagehide',flush);window.addEventListener('beforeunload',flush);document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')flush();});window.addEventListener('storage',()=>paint());
  return {canSubmit,stage:form=>{const b=bind(form);if(b){b.initial='prefilled draft';capture(form);}},refreshInitial:form=>{const b=bindings.get(form);if(b)b.initial=F.canonical(fields(form,b.meta));},requiresConfirm:(type,date)=>recovered.has(type+':'+date),mount,capture,finishModal,committed,paint,cards,list,resume,flush};
})();
