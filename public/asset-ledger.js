'use strict';
const AssetLedger=(()=>{
 const KEY='selfspace-ledger-request-v1:';let busy=false;
 const entries=()=>state.ledger||[],reversed=()=>new Set(entries().filter(e=>e.type==='撤销').map(e=>e.originalId));
 const linked=id=>entries().some(e=>e.effects.some(a=>a.id===id));
 const flows=()=>{const voided=reversed();return entries().filter(e=>['收入','支出'].includes(e.type)&&!voided.has(e.id)).map(e=>({...e,category:e.category||(e.type==='收入'?'关联收入':'关联支出'),linked:true}));};
 function pending(){try{const keys=Array.from({length:localStorage.length},(_,i)=>localStorage.key(i)).filter(k=>k?.startsWith(KEY)).sort();return keys.length?JSON.parse(localStorage.getItem(keys[0])):null;}catch{return {invalid:true};}}
 function panel(){const list=entries().filter(e=>e.date<=selectedDate).sort((a,b)=>b.date.localeCompare(a.date)||(b.createdAt||b.id).localeCompare(a.createdAt||a.id)),voided=reversed();return `<section class="panel spaced-bottom"><div class="panel-head"><h2>${icon('wallet')}账户记账</h2><div class="settings-buttons"><button class="btn" data-ledger="open" data-type="转账">账户间转账</button><button class="btn" data-ledger="open" data-type="核对">余额核对</button></div></div><p class="health-note">新收支选择账户后自动增减余额；转账与核对不计入收入支出。旧流水保持独立，避免重复扣款。负债通过余额核对更新。补记会影响当前余额，请勿重复录入。</p>${pending()?'<div class="personal-conflict"><p>有一笔记账尚未确认。请先重试原请求，避免重复记账。</p><button class="btn" data-ledger="retry">确认 / 重试原请求</button></div>':''}<div class="table-scroll"><table class="detail-list"><thead><tr><th>日期 / 操作</th><th>账户变动</th><th>备注</th><th>状态</th></tr></thead><tbody>${list.slice(0,50).map(e=>`<tr><td>${shortDate(e.date)}<div class="mini-label">${e.type}${['收入','支出','转账'].includes(e.type)?` · ${assetHidden?'••••':'¥'+money(e.amount)}`:''}</div></td><td>${e.effects.map(a=>`<div>${esc(a.name)}：${assetHidden?'••••':`¥${money(a.before)} → ¥${money(a.after)}`}</div>`).join('')}</td><td>${esc(e.description)||'—'}</td><td>${e.type==='撤销'?'撤销留痕':voided.has(e.id)?'已撤销':`<button class="text-btn" data-ledger="void" data-id="${esc(e.id)}">撤销</button>`}</td></tr>`).join('')}</tbody></table>${list.length?'':'<div class="table-empty">选择账户记一笔，余额与明细会一起保存。</div>'}</div><p class="health-note">记录保留原始变动，撤销按相反差额调整当前余额。当前余额包含所有记账日期的变动，历史日期用于查看明细。</p></section>`;}
 function accountField(){return selectField('关联账户','accountId',[['','独立收支 · 不修改余额'],...state.accounts.filter(a=>a.type!=='负债').map(a=>[a.id,a.name])],'')+'<p class="field-help">选择账户后将同时更新余额，关联记账需要联网。未选择时仅记录收支。</p>';}
 async function ready(){if(pending())throw Error('请先在资产页确认上一笔记账结果。');await PersonalSync.sync();const s=PersonalSync.dataState();if(!s.owner||s.error||s.blocked||s.pending||s.conflicts||s.running||navigator.onLine===false)throw Error('请先联网并在偏好设置完成个人记录同步，再关联记账。');return s.owner;}
 function capture(form){form.dataset.revisions=JSON.stringify(PersonalSync.revisions(state.accounts.map(a=>'account/'+a.id)));}
 async function open(type,originalId=''){
  if(busy)return;try{const owner=await ready();if(!state.accounts.length)throw Error('请先添加账户并完成云端同步。');if(type==='转账'&&state.accounts.filter(a=>a.type!=='负债').length<2)throw Error('请先添加至少两个资产账户，再记录账户间转账。');
   const original=entries().find(e=>e.id===originalId);let body='';
   if(type==='撤销'){if(!original||original.type==='撤销'||reversed().has(originalId))throw Error('此记录已撤销或不可撤销。');body=`<p>将按相反差额调整当前余额，并保留原记录。不会删除历史。</p><p>${esc(original.type)} · ${esc(original.description)} · ${assetHidden?'••••':'¥'+money(original.amount)}</p>`;}
   else {body=selectField(type==='转账'?'转出账户':'核对账户','accountId',state.accounts.filter(a=>type==='核对'||a.type!=='负债').map(a=>[a.id,a.name]),'');if(type==='转账')body+=selectField('转入账户','toAccountId',state.accounts.filter(a=>a.type!=='负债').map(a=>[a.id,a.name]),state.accounts.filter(a=>a.type!=='负债')[1]?.id||'');body+=field(type==='核对'?'核对后的实际余额 / 元':'金额 / 元','amount','',`required min="${type==='核对'?0:.01}" max="1000000000000" step="0.01"`,'number');}
   body+=field('记录日期','date',type==='核对'||type==='撤销'?TODAY:selectedDate,`required max="${TODAY}" min="2000-01-01"`,'date')+field('备注（选填）','description','','maxlength="160"');
   modalShell(type+'账户记录','确认保存后同步到私人云端',`<form id="ledger-form" data-type="${type}" data-original="${esc(originalId)}" data-owner="${esc(owner)}">${body}<p id="ledger-error" class="field-help" role="status"></p>${submitFooter('确认'+type)}</form>`);capture($('#ledger-form'));
  }catch(e){toast(e.message,true);}}
 async function send(body){
  if(busy)return;busy=true;
  try{const ds=PersonalSync.dataState();if(body.invalid||body.owner!==ds.owner)throw Error('请求所属账号不同，请切回原账号。');
   const c=new AbortController(),t=setTimeout(()=>c.abort(),20000);let r;try{r=await fetch('/api/ledger',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:c.signal});}finally{clearTimeout(t);}
   if(!(r.headers.get('content-type')||'').includes('application/json'))throw Error('请重新登录后重试原请求。');const d=await r.json();
   if(!r.ok){if([409,422,403].includes(r.status))localStorage.removeItem(KEY+body.id);throw Error(d.error||'暂时无法确认，请重试原请求。');}
   localStorage.removeItem(KEY+body.id);closeModal(true);await PersonalSync.reload();render();toast('账户余额和记账明细已一起保存。');
  }catch(e){const label=$('#ledger-error');if(label)label.textContent=(e.name==='AbortError'?'尚未确认结果，请重试原请求。':e.message);toast(e.name==='AbortError'?'尚未确认结果，请在资产页重试原请求。':e.message,true);if(!modal.open)render();}
  finally{busy=false;}
 }
 async function submit(form,transaction=false){
  if(busy||!form.reportValidity())return;
  try{if(pending())return void await send(pending());const ds=PersonalSync.dataState();if(!ds.owner||ds.pending||ds.conflicts||ds.error||navigator.onLine===false)throw Error('请先关闭表单并完成云端同步，再关联记账。');
   const f=new FormData(form),body={id:crypto.randomUUID(),owner:ds.owner,type:transaction?f.get('type'):form.dataset.type,date:f.get('date'),amount:Number(f.get('amount')||0),description:String(f.get('description')||'').trim(),category:String(f.get('category')||''),accountId:f.get('accountId'),toAccountId:f.get('toAccountId'),revisions:JSON.parse(form.dataset.revisions||'{}')};if(form.dataset.original)body.originalId=form.dataset.original;
   localStorage.setItem(KEY+body.id,JSON.stringify(body));await send(body);
  }catch(e){toast(e.message,true);}
 }
 document.addEventListener('click',e=>{const b=e.target.closest('[data-ledger]');if(!b)return;if(b.dataset.ledger==='open')void open(b.dataset.type);if(b.dataset.ledger==='void')void open('撤销',b.dataset.id);if(b.dataset.ledger==='retry'&&pending())void send(pending());});
 document.addEventListener('submit',e=>{if(e.target.id==='ledger-form'){e.preventDefault();void submit(e.target);}});
 document.addEventListener('input',e=>{if(e.target.closest?.('#ledger-form'))recordDraftDirty=true;});
 return {panel,flows,linked,accountField,capture,submit,pending};
})();
