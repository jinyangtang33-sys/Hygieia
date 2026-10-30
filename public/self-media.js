'use strict';
const SelfMedia=(()=>{
  const statuses=['选题','创作中','待发布','已发布'],formats=['图文','短视频','长视频','文章','直播','其他'];
  const platforms=['X','小红书','抖音','B站','微信视频号','微信公众号','微博','其他'];
  let filters={search:'',platform:'',status:'',account:'',topic:''};
  // Keep this validator in parity with lib/media-format.mjs (covered by tests).
  function valid(v){
    const str=(s,n)=>typeof s==='string'&&s.length<=n;
    const date=s=>s===''||(typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&s>='2000-01-01'&&s<='9999-12-31'&&!Number.isNaN(Date.parse(s+'T12:00:00Z'))&&new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s);
    if(!v||typeof v!=='object'||Array.isArray(v)||!str(v.id,100)||!/^[a-zA-Z0-9_.:-]{1,100}$/.test(v.id)||!str(v.title,160)||!v.title.trim()||!str(v.platform,40)||!v.platform.trim()||!['图文','短视频','长视频','文章','直播','其他'].includes(v.format)||!['选题','创作中','待发布','已发布'].includes(v.status)||!date(v.plannedDate)||!date(v.publishedDate)||v.status==='已发布'&&!v.publishedDate||!str(v.url,1000)||!str(v.script,12000)||!str(v.notes,3000))return false;
    if(v.url){try{const u=new URL(v.url);if(!['https:','http:'].includes(u.protocol)||u.username||u.password)return false;}catch{return false;}}
    for(const k of ['views','likes','comments','saves'])if(v[k]!==null&&(!Number.isSafeInteger(v[k])||v[k]<0||v[k]>1e9))return false;
    for(const k of ['createdAt','updatedAt'])if(!str(v[k],40)||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v[k])||Number.isNaN(Date.parse(v[k]))||new Date(v[k]).toISOString()!==v[k])return false;
    if(v.accountId!==undefined){if(typeof v.accountId!=='string')return false;const p={'primary-x':'X','primary-xiaohongshu':'小红书','primary-douyin':'抖音'};if(v.accountId!==''&&(!Object.hasOwn(p,v.accountId)||p[v.accountId]!==v.platform))return false;}
    if(v.topicId!==undefined&&(typeof v.topicId!=='string'||v.topicId!==''&&!/^[a-zA-Z0-9_.:-]{1,100}$/.test(v.topicId)))return false;
    return !Object.keys(v).some(k=>!['id','title','platform','format','status','plannedDate','publishedDate','url','script','notes','views','likes','comments','saves','createdAt','updatedAt','accountId','topicId'].includes(k));
  }
  const items=()=>state.media||[];
  const currentItems=()=>typeof PersonalSync!=='undefined'?PersonalSync.compose().media||[]:items();
  const signature=v=>JSON.stringify(v?Object.keys(v).sort().map(k=>[k,v[k]]):null);
  function reusableDraft(source,platform,id=uid(),now=new Date().toISOString()){
    const account=MediaAccounts.definitions.find(v=>v.platform===platform);
    if(!valid(source)||!account||id===source.id)throw Error('请选择有效的来源内容和目标平台。');
    const next={id,title:source.title,platform,accountId:account.id,format:platform==='抖音'?'短视频':'图文',status:'选题',plannedDate:'',publishedDate:'',url:'',script:source.script,notes:source.notes,views:null,likes:null,comments:null,saves:null,createdAt:now,updatedAt:now};
    if(source.topicId!==undefined)next.topicId=source.topicId;
    if(!valid(next))throw Error('暂时无法创建这份草稿，请重试。');return next;
  }
  function chooseReuse(id){
    if(modal.open||recordDraftDirty)return;
    const source=currentItems().find(v=>v.id===id);if(!source){toast('来源内容已不存在，请更新后重试。',true);return;}
    const owner=PersonalSync.dataState().owner||'',target=MediaAccounts.definitions.find(v=>v.platform!==source.platform)?.platform||'X';
    modalShell('复用为新草稿','为另一个平台准备独立内容',`<form id="media-reuse-form" data-id="${esc(id)}" data-owner="${esc(owner)}" data-original="${esc(signature(source))}"><div class="media-reuse-source"><span>${esc(source.platform)} · ${esc(source.status)}</span><h3>${esc(source.title)}</h3></div>${selectField('目标平台','reusePlatform',MediaAccounts.definitions.map(v=>v.platform),target)}<p class="field-help">标题、正文和备注会原样带入，你可以继续调整。新草稿关联目标平台账号，创作状态从「选题」开始；排期、作品链接和统计数据留空，原内容保留。</p><p class="field-help">抖音默认使用短视频形式，X 和小红书默认使用图文，进入草稿后均可修改。</p><p id="media-reuse-error" class="backup-error" role="status"></p>${submitFooter('打开新草稿')}</form>`);
  }
  function startReuse(form){
    const fail=text=>{const el=$('#media-reuse-error');if(el)el.textContent=text;return false;};
    if(!modal.open||form!==document.getElementById('media-reuse-form')||recordDraftDirty)return false;
    if(form.dataset.owner!==(PersonalSync.dataState().owner||''))return fail('账号已变化，请关闭后重新打开。');
    const source=currentItems().find(v=>v.id===form.dataset.id);
    if(signature(source)!==form.dataset.original)return fail('来源内容已修改或删除，请关闭后重新选择，避免复用旧内容。');
    if(currentItems().length>=10000)return fail('内容库已达到上限，请先整理已有内容。');
    let seed;try{seed=reusableDraft(source,form.elements.namedItem('reusePlatform').value);}catch(e){return fail(e.message);}
    closeModal(true);open('',seed.accountId,seed);return true;
  }
  async function copyScript(){
    const form=document.getElementById('media-form');if(!modal.open||!form)return false;
    const text=form.elements.namedItem('mediaScript').value,note=document.getElementById('media-copy-status');
    if(!text.trim()){note.textContent='正文还是空的，写好后再复制。';return false;}
    try{await navigator.clipboard.writeText(text);if(document.getElementById('media-form')===form)note.textContent='正文已复制，可粘贴到对应平台。';return true;}
    catch{if(document.getElementById('media-form')===form)note.textContent='浏览器未允许复制，请在正文框中手动选择并复制。';return false;}
  }
  const expired=v=>v.status!=='已发布'&&v.plannedDate&&v.plannedDate<TODAY;
  function summary(list=items(),today=TODAY){
    const published=list.filter(v=>v.status==='已发布');
    return {counts:Object.fromEntries(statuses.map(s=>[s,list.filter(v=>v.status===s).length])),month:published.filter(v=>v.publishedDate.slice(0,7)===today.slice(0,7)).length,
      metrics:Object.fromEntries(['views','likes','comments','saves'].map(k=>{const recorded=published.filter(v=>v[k]!==null);return [k,{value:recorded.length?recorded.reduce((n,v)=>n+v[k],0):null,count:recorded.length}];})),published:published.length};
  }
  function filtered(list=items(),f=filters){return list.filter(v=>(!f.status||v.status===f.status)&&(!f.platform||v.platform===f.platform)&&(!f.account||v.accountId===f.account)&&(!f.topic||v.topicId===f.topic)&&(!f.search||[v.title,v.script,v.notes,v.platform].some(t=>t.toLocaleLowerCase().includes(f.search.toLocaleLowerCase())))).sort((a,b)=>{
    if(a.status==='已发布'&&b.status!=='已发布')return 1;if(b.status==='已发布'&&a.status!=='已发布')return -1;
    const da=a.status==='已发布'?a.publishedDate:a.plannedDate,db=b.status==='已发布'?b.publishedDate:b.plannedDate;
    return a.status==='已发布'?db.localeCompare(da)||b.updatedAt.localeCompare(a.updatedAt):(da||'9999').localeCompare(db||'9999')||b.updatedAt.localeCompare(a.updatedAt);
  });}
  function card(v){return `<article class="media-card"><div class="media-card-top"><span class="media-platform">${esc(v.platform)}</span>${v.accountId?`<span class="media-linked-account">${esc(MediaAccounts.label(v.accountId))}</span>`:''}${v.topicId?`<span class="media-linked-account">已关联选题资料</span>`:''}<span class="mini-label">${esc(v.format)}</span><span class="media-status media-status-${statuses.indexOf(v.status)}">${v.status}</span></div><h3><button data-media="edit" data-id="${esc(v.id)}">${esc(v.title)}</button></h3><p class="media-excerpt">${esc(v.script||v.notes||'还没有写下内容，随时回来继续创作。')}</p><div class="media-card-bottom"><span class="${expired(v)?'media-overdue':''}">${v.status==='已发布'?'发布于 '+esc(v.publishedDate):v.plannedDate?(expired(v)?'已过计划日 · ':'计划发布 · ')+esc(v.plannedDate):'尚未安排发布时间'}</span><button class="text-btn" data-media="edit" data-id="${esc(v.id)}">${v.status==='已发布'?'更新数据':'继续创作'} ${icon('arrow')}</button></div><div class="media-card-actions"><button class="text-btn" data-history="open" data-key="media/${esc(v.id)}" aria-label="修改历史：${esc(v.title)}">修改历史</button><button class="text-btn" data-media="reuse" data-id="${esc(v.id)}" aria-label="复用为新草稿：${esc(v.title)}">${icon('plus')}复用为新草稿</button></div>${v.status==='已发布'?`<div class="media-card-metrics">${[['views','浏览'],['likes','点赞'],['comments','评论'],['saves','收藏']].map(([k,label])=>`<span>${label} <strong>${v[k]===null?'—':num(v[k])}</strong></span>`).join('')}${v.url?`<a href="${esc(v.url)}" target="_blank" rel="noopener noreferrer">查看作品 ↗</a>`:''}</div>`:''}</article>`;}
  function results(){const list=filtered();return `<div class="media-result-head"><span>${list.length} 条内容${filters.status?' · '+esc(filters.status):''}${filters.account?' · '+esc(MediaAccounts.label(filters.account)):''}${filters.topic?' · 选题：'+esc((state.mediaTopics||[]).find(t=>t.id===filters.topic)?.title||'资料暂不可用'):''}</span>${filters.search||filters.platform||filters.status||filters.account||filters.topic?'<button class="text-btn" data-media="reset">清除筛选</button>':''}</div>${list.length?`<div class="media-card-list">${list.map(card).join('')}</div>`:`<div class="media-empty">${icon('media')}<h3>${items().length?'没有符合筛选的内容':'从一个想法开始'}</h3><p>${items().length?'换一个关键词，或清除筛选看看。':'把灵感记下来，慢慢打磨成属于你的作品。'}</p><button class="btn btn-primary" data-media="${items().length?'reset':'new'}">${items().length?'清除筛选':'记录第一个选题'}</button></div>`}`;}
  function schedule(){const list=items().filter(v=>v.status!=='已发布'&&v.plannedDate).sort((a,b)=>a.plannedDate.localeCompare(b.plannedDate)||a.title.localeCompare(b.title));return `<section class="panel media-schedule"><div class="panel-head"><h2>${icon('calendar')}发布排期</h2><span class="mini-label">北京时间</span></div>${list.length?list.slice(0,8).map(v=>`<button class="media-schedule-row" data-media="edit" data-id="${esc(v.id)}"><span class="media-schedule-date ${expired(v)?'media-overdue':''}"><strong>${Number(v.plannedDate.slice(8))}</strong><small>${v.plannedDate.slice(0,7)}</small></span><span><strong>${esc(v.title)}</strong><small>${esc(v.platform)} · ${v.status}${expired(v)?' · 已过计划日':v.plannedDate===TODAY?' · 今天':''}</small></span>${icon('chevron')}</button>`).join(''):'<p class="media-muted">给内容设置计划发布日期，这里就会出现接下来的安排。</p>'}${list.length>8?`<p class="media-muted">显示最近 8 条，全部内容可在左侧筛选查看。</p>`:''}</section>`;}
  function metricsPanel(s){return `<section class="panel media-performance"><div class="panel-head"><h2>${icon('chart')}作品数据</h2><span class="mini-label">全部已发布内容</span></div><div class="media-performance-grid">${[['views','累计浏览'],['likes','累计点赞'],['comments','累计评论'],['saves','累计收藏']].map(([k,label])=>`<div><span>${label}</span><strong>${s.metrics[k].value===null?'—':num(s.metrics[k].value)}</strong><small>${s.metrics[k].count} / ${s.published} 篇已填写</small></div>`).join('')}</div><p class="media-muted">数据手动填写，可持续更新。留空表示未记录，填写 0 表示实际为零；不同作品的统计截止时间可能不同。</p></section>`;}
  function pageView(){
    const s=summary(),allPlatforms=[...new Set([...platforms,...items().map(v=>v.platform)])];
    return `<div class="page-head media-page-head"><div><div class="eyebrow">CREATE AT YOUR OWN PACE</div><h1>自媒体</h1><p>收集灵感、安排发布，也看见每一篇作品的成长。</p></div><div class="media-head-actions"><button class="btn" data-history="open">修改历史 / 找回删除</button><button class="btn btn-primary" data-media="new">${icon('plus')}新建内容</button></div></div>${MediaAccounts.panel()}${MediaTopics.panel()}<div class="media-stats">${[['内容选题',s.counts['选题'],'等待打磨的灵感','选题'],['创作中',s.counts['创作中'],'正在推进的内容','创作中'],['待发布',s.counts['待发布'],'准备与大家见面','待发布'],['累计发布',s.published,'本月已发布 '+s.month+' 篇','已发布']].map(([label,value,note,status])=>`<button class="media-stat" data-media="status" data-status="${status}"><span>${label}</span><strong>${value}<small>篇</small></strong><small>${note}</small></button>`).join('')}</div><div class="media-workspace"><section id="media-library" class="panel media-library"><div class="panel-head"><h2>${icon('media')}内容工作台</h2><span class="mini-label">跨日期内容库</span></div><div class="media-stage-tabs" role="group" aria-label="按创作状态筛选">${[['','全部'],...statuses.map(v=>[v,v])].map(([v,label])=>`<button class="${filters.status===v?'active':''}" data-media="status" data-status="${v}" aria-pressed="${filters.status===v}">${label}<small>${v?s.counts[v]:items().length}</small></button>`).join('')}</div><div class="media-filters"><label><span class="sr-only">搜索标题、正文或备注</span><input type="search" id="media-search" placeholder="搜索标题、正文或备注…" maxlength="160" value="${esc(filters.search)}"></label><label><span class="sr-only">筛选发布平台</span><select id="media-platform-filter"><option value="">全部平台</option>${allPlatforms.map(v=>`<option value="${esc(v)}" ${filters.platform===v?'selected':''}>${esc(v)}</option>`).join('')}</select></label></div><div class="media-account-filter"><label for="media-account-filter">关联账号</label><select id="media-account-filter"><option value="">全部账号与未关联内容</option>${MediaAccounts.profiles().map(p=>`<option value="${p.id}" ${filters.account===p.id?'selected':''}>${esc(MediaAccounts.label(p.id))}</option>`).join('')}</select></div><div id="media-results" aria-live="polite">${results()}</div></section><aside class="media-side">${schedule()}${metricsPanel(s)}<div class="media-note">${icon('leaf')}<p>先记录，再打磨。<br>让每一个好想法，都有落笔的地方。</p></div></aside></div>`;
  }
  function open(id='',accountId='',seed=null,seedHeading='复用为新草稿'){
    accountId=accountId||filters.account||'';
    if(modal.open||recordDraftDirty)return;
    checkDayChange(false);const existing=items().find(v=>v.id===id);if(id&&!existing){toast('这条内容已不存在，请更新后重试。',true);return;}
    const v=existing||seed||{id:uid(),accountId:accountId||'',title:'',platform:MediaAccounts.definition(accountId)?.platform||'小红书',format:'图文',status:'选题',plannedDate:'',publishedDate:'',url:'',script:'',notes:'',views:null,likes:null,comments:null,saves:null},key='media/'+v.id;
    modalShell(existing?'编辑自媒体内容':seed?seedHeading:'记录一个新选题',seed?'请调整后保存，新内容与原作品分别管理':'保存后同步到你的私人空间',`<form id="media-form" data-id="${esc(v.id)}" data-created="${esc(existing?.createdAt||'')}" data-revisions="${esc(JSON.stringify(typeof PersonalSync!=='undefined'?PersonalSync.revisions([key]):{}))}">${field('标题 / 选题','mediaTitle',v.title,'required maxlength="160" placeholder="你想分享什么？"')}${MediaAccounts.selectFieldHTML(v.accountId||'')}${MediaTopics.fieldHTML(v.topicId||'')}<div class="form-row"><div class="form-field"><label for="f-mediaPlatform">发布平台</label><input id="f-mediaPlatform" name="mediaPlatform" list="media-platforms" value="${esc(v.platform)}" ${v.accountId?'readonly':''} required maxlength="40"><datalist id="media-platforms">${platforms.map(p=>`<option value="${p}"></option>`).join('')}</datalist></div>${selectField('内容形式','mediaFormat',formats,v.format)}</div><div class="form-row">${selectField('创作状态','mediaStatus',statuses,v.status)}${field('计划发布日期（选填）','mediaPlannedDate',v.plannedDate,'min="2000-01-01" max="9999-12-31"','date')}</div><div class="form-field"><label for="media-script">正文 / 脚本（选填）</label><textarea id="media-script" name="mediaScript" maxlength="12000" rows="7" placeholder="写下核心观点、脚本结构，或完整正文…">${esc(v.script)}</textarea></div><div class="form-field"><label for="media-notes">创作备注（选填）</label><textarea id="media-notes" name="mediaNotes" maxlength="3000" rows="3" placeholder="素材、拍摄准备，或发布后的复盘…">${esc(v.notes)}</textarea></div><fieldset class="media-publish-fields"><legend>发布与表现</legend><p class="field-help">标记为「已发布」时请填写实际发布日期。作品链接与各项数据均可留空。</p><div class="form-row">${field('实际发布日期','mediaPublishedDate',v.publishedDate,`min="2000-01-01" max="${TODAY}" ${v.status==='已发布'?'required':''}`,'date')}${field('作品链接（选填）','mediaUrl',v.url,'maxlength="1000" placeholder="https://…"','url')}</div><div class="form-row">${field('浏览 / 播放量','mediaViews',v.views??'','min="0" max="1000000000" step="1" placeholder="未记录"','number')}${field('点赞','mediaLikes',v.likes??'','min="0" max="1000000000" step="1" placeholder="未记录"','number')}</div><div class="form-row">${field('评论','mediaComments',v.comments??'','min="0" max="1000000000" step="1" placeholder="未记录"','number')}${field('收藏','mediaSaves',v.saves??'','min="0" max="1000000000" step="1" placeholder="未记录"','number')}</div></fieldset><p id="media-copy-status" class="field-help" role="status"></p><p id="media-form-error" class="backup-error" role="status"></p>${submitFooter('保存内容',`<button type="button" class="text-btn" data-media="copy-script">复制正文</button>`+(existing?`<button type="button" class="text-btn media-delete" data-media="delete" data-id="${esc(v.id)}">${icon('trash')}删除内容</button>`:''))}</form>`);
    if(seed){recordDraftDirty=true;if(typeof DraftCenter!=='undefined')DraftCenter.stage(document.getElementById('media-form'));}
  }
  function formValue(form){
    const f=new FormData(form),get=k=>String(f.get('media'+k)||''),count=k=>get(k)===''?null:Number(get(k)),now=new Date().toISOString();
    return {id:form.dataset.id,title:get('Title').trim(),platform:MediaAccounts.definition(get('Account'))?.platform||get('Platform').trim(),accountId:get('Account'),topicId:get('Topic'),format:get('Format'),status:get('Status'),plannedDate:get('PlannedDate'),publishedDate:get('PublishedDate'),url:get('Url').trim(),script:get('Script'),notes:get('Notes'),views:count('Views'),likes:count('Likes'),comments:count('Comments'),saves:count('Saves'),createdAt:form.dataset.created||now,updatedAt:now};
  }
  function save(form){
    if(!form.reportValidity())return false;checkDayChange(false);
    const v=formValue(form);if(!valid(v)||v.publishedDate>TODAY){$('#media-form-error').textContent='请检查标题、平台、日期和数据；已发布内容需要实际发布日期，不能填写未来日期。';return false;}
    const next=structuredClone(state);next.media||=[];const index=next.media.findIndex(x=>x.id===v.id);if(index<0)next.media.push(v);else next.media[index]=v;
    const baseRevisions=JSON.parse(form.dataset.revisions||'{}');
    if(!persist(next,'内容已保存，正在同步。',{baseRevisions}))return false;
    if(!form.dataset.created)filters={search:'',platform:'',status:'',account:v.accountId||'',topic:v.topicId||''};
    closeModal(true);render();return true;
  }
  function remove(id){
    if(recordDraftDirty){toast('请先保存修改，或放弃这次编辑后再删除。');return;}
    const v=items().find(x=>x.id===id);if(!v)return;
    const form=$('#media-form'),baseRevisions=JSON.parse(form?.dataset.revisions||'{}');
    confirmAction('删除这条自媒体内容',`将删除「${esc(v.title)}」及它的正文、排期和数据，并同步到其他设备。`,()=>{const next=structuredClone(state);next.media=(next.media||[]).filter(x=>x.id!==id);if(persist(next,'内容已删除，正在同步。',{baseRevisions})){closeModal(true);render();}},'确认删除');
  }
  document.addEventListener('click',e=>{const b=e.target.closest('[data-media]');if(!b)return;const a=b.dataset.media;if(a==='new')open();else if(a==='edit')open(b.dataset.id);else if(a==='reuse')chooseReuse(b.dataset.id);else if(a==='copy-script')void copyScript();else if(a==='delete')remove(b.dataset.id);else if(a==='status'){filters.status=b.dataset.status||'';render();}else if(a==='reset'){filters={search:'',platform:'',status:'',account:'',topic:''};render();}});
  document.addEventListener('input',e=>{if(e.target.closest?.('#media-form'))recordDraftDirty=true;if(e.target.id==='media-search'){filters.search=e.target.value;$('#media-results').innerHTML=results();}});
  document.addEventListener('change',e=>{if(e.target.closest?.('#media-form'))recordDraftDirty=true;if(e.target.id==='f-mediaAccount'){const d=MediaAccounts.definition(e.target.value);$('#f-mediaPlatform').readOnly=!!d;if(d)$('#f-mediaPlatform').value=d.platform;}if(e.target.id==='media-account-filter'){filters.account=e.target.value;$('#media-results').innerHTML=results();}if(e.target.id==='f-mediaStatus')$('#f-mediaPublishedDate').required=e.target.value==='已发布';if(e.target.id==='media-platform-filter'){filters.platform=e.target.value;$('#media-results').innerHTML=results();}});
  document.addEventListener('submit',e=>{if(e.target.id==='media-reuse-form'){e.preventDefault();startReuse(e.target);}if(e.target.id==='media-form'){e.preventDefault();save(e.target);}});
  function forAccount(id){if(!MediaAccounts.definition(id))return;filters={search:'',platform:'',status:'',account:id};render();$('#media-library')?.scrollIntoView?.({block:'start',behavior:'smooth'});}
  function forTopic(id){if(!(state.mediaTopics||[]).some(t=>t.id===id)){toast('选题暂不可用，请更新后重试。',true);return;}filters={search:'',platform:'',status:'',account:'',topic:id};render();$('#media-library')?.scrollIntoView?.({block:'start',behavior:'smooth'});}
  return {forTopic,reusableDraft,chooseReuse,startReuse,copyScript,forAccount,page:pageView,valid,summary,filtered,open,save,formValue};
})();
