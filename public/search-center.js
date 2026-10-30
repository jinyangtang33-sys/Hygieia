'use strict';
const SearchCenter=(()=>{
  let filters={},resultKeys=[],openedOwner=null,active=false;
  const connection=()=>typeof PersonalSync==='undefined'?{}:PersonalSync.dataState();
  const available=()=>{const c=connection();return c.ready&&!c.blocked&&c.owner&&c.owner===openedOwner;};
  const rows=()=>SearchModel.build(state,typeof BodyReportModel==='undefined'?[]:BodyReportModel.fields).filter(r=>r.kind==='media'||r.date<=shanghaiDate());
  const key=r=>JSON.stringify([r.kind,r.date,r.id]);
  function results(){
    if(!available()){resultKeys=[];return '<div class="search-empty" role="status">当前账号尚未就绪或已经变化。请关闭搜索，等待个人记录连接完成后重新打开。</div>';}
    const result=SearchModel.search(rows(),filters);filters.page=result.page;resultKeys=result.items.map(key);
    if(result.error)return `<p class="backup-error" role="status">${esc(result.error)}</p>`;
    return `<div class="search-result-heading"><strong>${result.total} 条记录</strong><span>${filters.query?'多个关键词需同时匹配':'按记录日期由近到远'}</span></div>${result.items.length?`<div class="search-results-list">${result.items.map((r,i)=>`<button type="button" class="search-result" data-search="result" data-index="${i}"><span class="search-result-meta"><span>${SearchModel.types[r.kind]}</span><time datetime="${esc(r.date)}">${esc(r.date)}</time><span>${esc(r.meta)}</span></span><strong>${esc(r.title)}</strong><span class="search-result-excerpt">${esc(SearchModel.excerpt(r,filters.query)||'点击查看这条记录。')}</span><span class="search-result-open">打开记录 ${icon('arrow')}</span></button>`).join('')}</div>`:'<div class="search-empty">没有符合条件的记录。可以减少关键词，或清除日期与类型筛选。</div>'}${result.pages>1?`<div class="search-pagination"><button type="button" class="btn" data-search="previous" ${result.page===1?'disabled':''}>上一页</button><span>第 ${result.page} / ${result.pages} 页</span><button type="button" class="btn" data-search="next" ${result.page===result.pages?'disabled':''}>下一页</button></div>`:''}`;
  }
  function paint(){const el=document.getElementById?.('global-search-results');if(el)el.innerHTML=results();}
  function open(){
    if(modal.open||recordDraftDirty||journalDirty||reviewDirty||connection().settingsDirty){toast('请先保存或关闭正在填写的内容，再打开搜索。');return;}
    openedOwner=connection().owner;active=true;filters={query:'',kind:'',from:'',to:'',page:1};
    modalShell('搜索我的记录','按关键词、类型和日期找到过去留下的内容。',`<div class="search-center"><form id="global-search-form"><div class="form-field"><label for="global-search-query">关键词</label><input id="global-search-query" type="search" name="query" maxlength="160" autocomplete="off" placeholder="例如：鸡胸、项目方案、AI 新闻…"></div><div class="search-filters"><div class="form-field"><label for="global-search-kind">记录类型</label><select id="global-search-kind" name="kind"><option value="">全部类型</option>${Object.entries(SearchModel.types).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></div><div class="form-field"><label for="global-search-from">开始日期</label><input id="global-search-from" type="date" name="from" min="2000-01-01" max="9999-12-31"></div><div class="form-field"><label for="global-search-to">结束日期</label><input id="global-search-to" type="date" name="to" min="2000-01-01" max="9999-12-31"></div></div><div class="search-submit-row"><button type="submit" class="btn btn-primary">${icon('search')}搜索记录</button><button type="button" class="text-btn" data-search="reset">清除筛选</button></div></form><p class="field-help">覆盖当前浏览器已载入的正式记录，独立于页面所选日期。自媒体按实际发布 / 计划发布 / 更新日期，任务清单和选题资料按更新日期、复盘按周一日期检索。草稿、财务记录和 Apple 原始样本不在搜索范围。关键词不保存、不写入网址。</p><div id="global-search-results" aria-live="polite">${results()}</div></div>`);
    modal.classList.add('search-dialog');document.getElementById?.('global-search-query')?.focus();
  }
  function apply(){if(!active||!modal.open)return;const form=document.getElementById?.('global-search-form');if(!form)return;const data=new FormData(form);filters={query:String(data.get('query')||'').slice(0,160),kind:String(data.get('kind')||''),from:String(data.get('from')||''),to:String(data.get('to')||''),page:1};paint();}
  function choose(index){
    if(!active||!available()){paint();return;}const selectedKey=resultKeys[index],r=rows().find(r=>key(r)===selectedKey);if(!r){paint();toast('这条记录已变化或不存在，搜索结果已更新。');return;}
    // Resolve the current record again; the search snapshot never writes data.
    closeModal(true);const route={checklist:'tasks',meal:'meals',task:'work',journal:'journal',report:'health',media:'media',topic:'media',review:'review'}[r.kind],date=['media','topic','checklist'].includes(r.kind)?selectedDate:r.date,follow=['media','topic','checklist'].includes(r.kind)?followToday:false;
    if(typeof DateNavigation!=='undefined')DateNavigation.write(date,follow,true,route);navigate(route,{date,pinned:!follow});
    if(r.kind==='checklist')Checklist.open(r.id);else if(r.kind==='meal')showForm('meal',r.id);else if(r.kind==='report')BodyReports.open(r.id);else if(r.kind==='media')SelfMedia.open(r.id);else if(r.kind==='topic')MediaTopics.open(r.id);else if(r.kind==='review')WeeklyReview.openWeek(r.date);else if(r.kind==='journal')document.getElementById?.('journal-text')?.focus();else if(r.kind==='task'){const button=Array.from(document.querySelectorAll('[data-action="toggle-task"]')).find(b=>b.dataset.id===r.id);button?.scrollIntoView?.({block:'center'});button?.focus?.({preventScroll:true});}
  }
  function cleanup(){if(!active)return;active=false;filters={};resultKeys=[];openedOwner=null;modal.classList.remove('search-dialog');const el=document.getElementById?.('global-search-results');if(el)el.innerHTML='';const form=document.getElementById?.('global-search-form');form?.reset?.();}
  document.addEventListener('click',e=>{const b=e.target.closest?.('[data-search]');if(!b)return;const action=b.dataset.search;if(action==='open')open();else if(active&&action==='result')choose(Number(b.dataset.index));else if(active&&action==='reset'){document.getElementById?.('global-search-form')?.reset();apply();}else if(active&&['previous','next'].includes(action)){filters.page+=action==='next'?1:-1;paint();document.getElementById?.('global-search-results')?.scrollIntoView?.({block:'start'});}});
  document.addEventListener('submit',e=>{if(e.target.id==='global-search-form'){e.preventDefault();apply();}});
  document.addEventListener('change',e=>{if(e.target.closest?.('#global-search-form')&&e.target.id!=='global-search-query')apply();});
  document.addEventListener('DOMContentLoaded',()=>modal.addEventListener('close',cleanup));
  return {open,choose,results,cleanup};
})();
