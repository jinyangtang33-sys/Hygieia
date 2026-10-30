'use strict';
const DateNavigation=(()=>{
  let seen='';
  const current=()=>new URL(location.href||'http://localhost/'+(location.hash||''));
  function valid(date,today){return typeof date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(date)&&date>='2000-01-01'&&date<=today&&!Number.isNaN(Date.parse(date+'T12:00:00Z'))&&new Date(date+'T12:00:00Z').toISOString().slice(0,10)===date;}
  function read(today){const u=current(),values=u.searchParams.getAll('date'),date=values.length===1&&valid(values[0],today)?values[0]:null;return {date:date||today,pinned:!!date};}
  function write(date,follow,push=false,route=null){
    const u=current();if(follow)u.searchParams.delete('date');else u.searchParams.set('date',date);if(route)u.hash=route;
    if(u.href!==current().href&&window.history){window.history[push?'pushState':'replaceState'](null,'',u.pathname+u.search+u.hash);}
    seen=current().href;
  }
  function changed(){const href=current().href;if(href===seen)return false;seen=href;return true;}
  async function copy(){
    const u=current();u.search='';u.hash=page;u.searchParams.set('date',selectedDate);
    try{await navigator.clipboard.writeText(u.href);toast('这一天的私人链接已复制，访问仍需登录同一账号。');}
    catch{modalShell('复制这一天的链接','访问仍需登录同一账号',`<p class="field-help">复制下方完整链接，即可在其他设备打开 ${esc(selectedDate)} 的记录。</p><div class="form-field"><label for="date-share-link">私人日期链接</label><input id="date-share-link" value="${esc(u.href)}" readonly></div>`);}
  }
  document.addEventListener('click',e=>{if(e.target.closest('[data-date-copy]'))void copy();});
  return {read,write,changed,valid,copy};
})();
