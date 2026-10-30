'use strict';
const MediaTopics=(()=>{
  const M=MediaTopicModel;let query='',topicPage=1;
  const items=()=>state.mediaTopics||[];
  const current=()=>PersonalSync.compose().mediaTopics||[];
  const owner=()=>PersonalSync.dataState().owner||'';
  function contextHTML(id){
    if(!id)return '';const t=current().find(v=>v.id===id);if(!t)return '<p class="field-help">关联的选题资料暂不可用，关联标识会保留。可重新选择选题或取消关联。</p>';
    return `<details class="topic-context"><summary>查看选题资料 · ${esc(t.title)}</summary>${t.eventDate?`<p>事件日期：${esc(t.eventDate)}</p>`:''}${t.sources.length?`<ul>${t.sources.map(s=>`<li><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title||s.url)} ↗</a>${s.publishedDate?`<small>报道日期 ${esc(s.publishedDate)}</small>`:''}</li>`).join('')}</ul>`:'<p>尚未补充来源。</p>'}${[['facts','已确认事实（由你核对）'],['viewpoint','个人观点'],['questions','待核实 / 后续追踪']].map(([k,label])=>`<h4>${label}</h4><p class="topic-text">${esc(t[k]||'尚未填写')}</p>`).join('')}</details>`;
  }
  function fieldHTML(id=''){
    const list=current(),missing=id&&!list.some(t=>t.id===id);
    return `<div class="form-field"><label for="f-mediaTopic">关联选题资料</label><select id="f-mediaTopic" name="mediaTopic"><option value="">独立内容（不关联选题）</option>${missing?`<option value="${esc(id)}" selected>原选题暂不可用 · 保留关联</option>`:''}${list.slice().sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).map(t=>`<option value="${esc(t.id)}" ${t.id===id?'selected':''}>${esc(t.title)}</option>`).join('')}</select><span class="field-help">同一选题的不同平台内容会汇总到三平台进度。旧内容可在这里手动关联。</span></div><div id="media-topic-context">${contextHTML(id)}</div>`;
  }
  function card(t){
    const progress=M.progress(t.id,state.media||[]);
    return `<article class="topic-card"><div class="topic-card-heading"><div><span>${t.eventDate?'事件 '+esc(t.eventDate)+' · ':''}${t.sources.length} 条来源</span><h3><button data-topic="edit" data-id="${esc(t.id)}">${esc(t.title)}</button></h3></div><button class="text-btn" data-topic="edit" data-id="${esc(t.id)}">编辑资料</button></div><div class="topic-checks">${[['facts','事实'],['viewpoint','观点'],['questions','待核实']].map(([k,l])=>`<span>${l} · ${t[k].trim()?'已填写':'未填写'}</span>`).join('')}</div><div class="topic-platforms">${progress.map(p=>`<section aria-label="${esc(p.platform)}选题进度"><div class="topic-platform-title"><strong>${esc(p.platform)}</strong><span>${p.posts.length} 条内容</span></div>${p.posts.length?`<p class="topic-progress-summary">${Object.entries(p.counts).filter(([,n])=>n).map(([s,n])=>`${s} ${n}`).join(' · ')}</p>${p.posts.slice(0,3).map(v=>`<button class="topic-post-link" data-media="edit" data-id="${esc(v.id)}"><span>${esc(v.title)}</span><small>${v.status}</small></button>`).join('')}${p.posts.length>3?'<small>更多版本可在关联内容中查看</small>':''}`:'<p class="topic-no-post">尚未建稿</p>'}<button class="text-btn topic-create-post" data-topic="new-post" data-id="${esc(t.id)}" data-platform="${esc(p.platform)}">${icon('plus')}${p.posts.length?'新建另一版本':'创建平台稿'}</button></section>`).join('')}</div><button class="text-btn" data-topic="content" data-id="${esc(t.id)}">查看全部关联内容 ${icon('arrow')}</button><button class="text-btn topic-history-link" data-history="open" data-key="media-topic/${esc(t.id)}">资料修改历史</button></article>`;
  }
  function results(){const r=M.select(items(),query,topicPage);topicPage=r.page;return `<div class="topic-result-count">${r.total} 个选题 · 第 ${r.page} / ${r.pages} 页</div>${r.rows.length?r.rows.map(card).join(''):`<div class="topic-empty"><p>${items().length?'没有找到匹配的选题，试试其他关键词。':'把新闻出处、事件时间和自己的判断放在一起，再为各平台准备内容。'}</p>${items().length?'':'<button class="btn" data-topic="new">建立第一个选题</button>'}</div>`}${r.pages>1?`<div class="topic-pagination"><button class="btn" data-topic="previous" ${r.page<=1?'disabled':''}>上一页</button><button class="btn" data-topic="next" ${r.page>=r.pages?'disabled':''}>下一页</button></div>`:''}`;}
  function panel(){return `<section class="panel topic-panel" id="media-topics"><div class="panel-head"><div><h2>${icon('media')}选题资料与三平台进度</h2><p class="field-help">资料集中保存，平台内容分别推进。进度根据已保存记录显示。</p></div><button class="btn btn-primary" data-topic="new">${icon('plus')}建立选题资料</button></div><label class="topic-search"><span class="sr-only">搜索选题资料</span><input id="topic-search" type="search" maxlength="160" value="${esc(query)}" placeholder="搜索选题、事实、观点或来源…"></label><div id="topic-results" aria-live="polite">${results()}</div></section>`;}
  function open(id=''){
    if(modal.open||recordDraftDirty)return;checkDayChange(false);const existing=current().find(t=>t.id===id);if(id&&!existing){toast('选题已不存在，请更新后重试。',true);return;}
    const t=existing||{id:uid(),title:'',eventDate:'',sources:[],facts:'',viewpoint:'',questions:''},key='media-topic/'+t.id;
    modalShell(existing?'编辑选题资料':'建立选题资料','先记录出处和事实，再整理自己的判断',`<form id="media-topic-form" data-id="${esc(t.id)}" data-created="${esc(existing?.createdAt||'')}" data-owner="${esc(owner())}" data-original="${esc(M.canonical(existing||null))}" data-revisions="${esc(JSON.stringify(PersonalSync.revisions([key])))}">${field('选题名称','topicTitle',t.title,'required maxlength="160" placeholder="这条新闻要讨论什么？"')}${field('事件日期（选填）','topicEventDate',t.eventDate,'min="2000-01-01" max="9999-12-31"','date')}<div class="topic-source-header"><h3>信息来源</h3><p class="field-help">最多 5 条，优先保留原始出处。事件日期与报道日期分别填写；仅保存你填写的资料。</p></div>${Array.from({length:5},(_,i)=>{const s=t.sources[i]||{title:'',url:'',publishedDate:''};return `<details class="topic-source-row" ${i===0||t.sources[i]?'open':''}><summary>来源 ${i+1}${s.title?' · '+esc(s.title):''}</summary>${field('来源名称 '+(i+1),'topicSourceTitle'+i,s.title,'maxlength="160" placeholder="例如：官方公告、原始研究"')}${field('来源链接 '+(i+1),'topicSourceUrl'+i,s.url,'maxlength="1000" placeholder="https://…"','url')}${field('报道日期 '+(i+1),'topicSourceDate'+i,s.publishedDate,'min="2000-01-01" max="9999-12-31"','date')}</details>`;}).join('')}${[['facts','topicFacts','已确认事实（由你核对）','发生了什么？保留重要数字、原话和相应出处。'],['viewpoint','topicViewpoint','个人观点','你的判断是什么？理由是什么？有哪些不确定性？'],['questions','topicQuestions','待核实 / 后续追踪','哪些信息还不能确认？之后需要观察什么变化？']].map(([k,name,label,placeholder])=>`<div class="form-field"><label for="f-${name}">${label}</label><textarea id="f-${name}" name="${name}" rows="4" maxlength="6000" placeholder="${placeholder}">${esc(t[k])}</textarea></div>`).join('')}<p id="media-topic-error" class="backup-error" role="status"></p>${submitFooter('保存选题资料')}</form>`);
  }
  function formValue(form){
    const f=new FormData(form),get=k=>String(f.get(k)||''),sources=[];for(let i=0;i<5;i++){const s={title:get('topicSourceTitle'+i).trim(),url:get('topicSourceUrl'+i).trim(),publishedDate:get('topicSourceDate'+i)};if(s.title||s.url||s.publishedDate)sources.push(s);}
    const now=new Date().toISOString();return {id:form.dataset.id,title:get('topicTitle').trim(),eventDate:get('topicEventDate'),sources,facts:get('topicFacts'),viewpoint:get('topicViewpoint'),questions:get('topicQuestions'),createdAt:form.dataset.created||now,updatedAt:now};
  }
  function save(form){
    const fail=text=>{$('#media-topic-error').textContent=text;return false;};
    if(!modal.open||document.getElementById('media-topic-form')!==form||!form.reportValidity()||typeof DraftCenter!=='undefined'&&!DraftCenter.canSubmit(form))return false;
    if(form.dataset.owner!==owner())return fail('账号已变化，请关闭后重新打开。');
    const latest=current(),original=latest.find(t=>t.id===form.dataset.id)||null;
    if(M.canonical(original)!==form.dataset.original)return fail('这份选题已在其他页面修改，请保留草稿并重新打开后核对。');
    const t=formValue(form);if(!M.valid(t))return fail('请检查选题、日期与来源链接；填写了来源名称或报道日期的条目，也需要有效的 http/https 链接。');
    if(!original&&latest.length>=5000)return fail('选题资料已达到 5,000 条，请先导出备份并整理。');
    const next=structuredClone(state);next.mediaTopics||=[];const i=next.mediaTopics.findIndex(v=>v.id===t.id);if(i<0)next.mediaTopics.push(t);else next.mediaTopics[i]=t;
    if(!persist(next,'选题资料已保存，正在同步。',{baseRevisions:JSON.parse(form.dataset.revisions||'{}')}))return false;query='';topicPage=1;closeModal(true);render();document.getElementById('media-topics')?.scrollIntoView?.({block:'start'});return true;
  }
  function newContent(id,platform){
    if(modal.open||recordDraftDirty)return;const topic=current().find(t=>t.id===id),account=MediaAccounts.definitions.find(v=>v.platform===platform);if(!topic||!account){toast('选题或目标平台已变化，请更新后重试。',true);return;}
    const now=new Date().toISOString(),seed={id:uid(),topicId:topic.id,title:topic.title,platform,accountId:account.id,format:platform==='抖音'?'短视频':'图文',status:'选题',plannedDate:'',publishedDate:'',url:'',script:'',notes:'',views:null,likes:null,comments:null,saves:null,createdAt:now,updatedAt:now};
    SelfMedia.open('',account.id,seed,'为选题创建内容');
  }
  function paint(){const el=document.getElementById('topic-results');if(el)el.innerHTML=results();}
  document.addEventListener('click',e=>{const b=e.target.closest?.('[data-topic]');if(!b)return;const a=b.dataset.topic;if(a==='new')open();if(a==='edit')open(b.dataset.id);if(a==='new-post')newContent(b.dataset.id,b.dataset.platform);if(a==='content')SelfMedia.forTopic(b.dataset.id);if(a==='previous'||a==='next'){topicPage+=a==='next'?1:-1;paint();document.getElementById('media-topics')?.scrollIntoView?.({block:'start'});}});
  document.addEventListener('input',e=>{if(e.target.closest?.('#media-topic-form'))recordDraftDirty=true;if(e.target.id==='topic-search'){query=e.target.value;topicPage=1;paint();}});
  document.addEventListener('change',e=>{if(e.target.closest?.('#media-topic-form'))recordDraftDirty=true;if(e.target.id==='f-mediaTopic'){const el=document.getElementById('media-topic-context');if(el)el.innerHTML=contextHTML(e.target.value);}});
  document.addEventListener('submit',e=>{if(e.target.id==='media-topic-form'){e.preventDefault();save(e.target);}});
  return {panel,open,save,formValue,newContent,fieldHTML,contextHTML};
})();
