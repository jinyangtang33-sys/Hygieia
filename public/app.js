'use strict';

const $ = (q, root = document) => root.querySelector(q);
const icon = (name, cls = '') => `<svg class="${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const shanghaiDate = (value=new Date()) => new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Shanghai', year:'numeric', month:'2-digit', day:'2-digit'}).format(value);
let TODAY = shanghaiDate();
const KEY = 'selfspace-v1';
const uid = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const money = n => Number(n).toLocaleString('zh-CN', {minimumFractionDigits:2, maximumFractionDigits:2});
const num = n => Number(n).toLocaleString('zh-CN');
const shiftDate = (date, days) => {const d = new Date(`${date}T12:00:00`); d.setDate(d.getDate()+days); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
const shortDate = date => `${Number(date.slice(5,7))}月${Number(date.slice(8))}日`;
const dateLabel = date => `${date.replaceAll('-','.')} · ${['周日','周一','周二','周三','周四','周五','周六'][new Date(`${date}T12:00:00`).getDay()]}`;
const pages = {overview:'生活总览',health:'健康管理',meals:'饮食记录',work:'工作与成长',tasks:'任务清单',media:'自媒体',assets:'我的资产',trends:'数据趋势',calendar:'生活日历',review:'每周复盘',journal:'生活手记',settings:'偏好设置',sync:'Apple 健康同步',quality:'数据核对'};
const defaultSettings = () => ({name:'我的空间',waterGoal:2000,stepsGoal:8000,sleepGoal:8});
const blank = () => ({version:1,demo:false,settings:defaultSettings(),days:{},reviews:{},mediaTopics:[],media:[],mediaProfiles:[],bodyReports:[],ledger:[],accounts:[],transactions:[]});
function legacyDemoTemplate(anchor=TODAY) {
  const s = blank(); s.demo = true;
  for(let i=13;i>=0;i--){
    const date=shiftDate(anchor,-i);
    s.days[date]={health:{sleep:[7.2,6.8,7.6,7.1,8.2,7.8,7.5][i%7],weight: Number((58.5+i*.03).toFixed(1)),steps:[6800,7900,6500,9200,8100,5600,8600][i%7],water: i===0?1250:1750,exercise:30},meals:{breakfast:{name:'牛油果吐司 · 鸡蛋 · 牛奶',calories:420,time:'08:15',note:'慢慢吃早餐，开启新的一天。'},lunch:{name:'香煎鸡胸 · 糙米饭 · 时蔬',calories:580,time:'12:30',note:'清爽又满足的一餐。'},...(i>0?{dinner:{name:'清蒸鱼 · 杂粮饭 · 西兰花',calories:510,time:'18:45',note:''}}:{})},tasks:[{id:uid(),title:'完成本周项目方案',tag:'工作',done:true},{id:uid(),title:'阅读 20 分钟',tag:'学习',done:true},{id:uid(),title:'整理明日工作计划',tag:'工作',done:false}],journal:i===0?'今天把事情一件件做好，也留了一点时间给自己。\n希望明天继续保持这份从容。':'今天也有认真生活。',mood:4,focus: i===0?90:60};
  }
  s.accounts=[{id:uid(),name:'日常储蓄',type:'现金与存款',balance:48650},{id:uid(),name:'长期投资',type:'投资理财',balance:60000},{id:uid(),name:'应急储备',type:'现金与存款',balance:20000}];
  s.transactions=[{id:uid(),date:anchor,type:'支出',category:'餐饮',amount:32,description:'工作日午餐'},{id:uid(),date:anchor,type:'支出',category:'交通',amount:6,description:'地铁出行'},{id:uid(),date:shiftDate(anchor,-3),type:'收入',category:'工资',amount:15000,description:'本月工资'},{id:uid(),date:shiftDate(anchor,-2),type:'支出',category:'生活',amount:218,description:'日常用品'}];
  return s;
}
// Remove only identifiable legacy fixtures. Changed and additional user records
// survive; the original browser payload is archived before writing the migration.
function cleanDemoRecords(saved){
  if(!saved.demo)return saved;
  const votes=new Map(),vote=date=>votes.set(date,(votes.get(date)||0)+1);
  const transactionFields=['date','type','category','amount','description'];
  const same=(a,b,fields)=>fields.every(k=>JSON.stringify(a[k])===JSON.stringify(b[k]));
  const patterns=[['工作日午餐','餐饮','支出',32,0],['地铁出行','交通','支出',6,0],['本月工资','工资','收入',15000,3],['日常用品','生活','支出',218,2]];
  for(const t of saved.transactions)for(const [description,category,type,amount,offset] of patterns)if(same(t,{description,category,type,amount},['description','category','type','amount']))vote(shiftDate(t.date,offset));
  for(const [date,d] of Object.entries(saved.days)){
    const i=Math.round(((d.health?.weight??-1)-58.5)/.03);
    if(i>=0&&i<=13&&d.health?.weight===Number((58.5+i*.03).toFixed(1))&&d.meals?.breakfast?.name==='牛油果吐司 · 鸡蛋 · 牛奶')vote(shiftDate(date,i));
  }
  const anchor=[...votes].sort((a,b)=>b[1]-a[1])[0]?.[0]||TODAY;
  const template=legacyDemoTemplate(anchor),next=structuredClone(saved);next.demo=false;
  for(const [date,d] of Object.entries(next.days)){
    const original=template.days[date];if(!original)continue;
    if(d.health&&!d.apple){for(const [k,v]of Object.entries(original.health))if(d.health[k]===v)delete d.health[k];if(!Object.keys(d.health).length)delete d.health;}
    if(d.meals){for(const [k,v]of Object.entries(original.meals))if(d.meals[k]&&same(d.meals[k],v,['name','calories','time','note']))delete d.meals[k];if(!Object.keys(d.meals).length)delete d.meals;}
    if(d.tasks){const remaining=[...original.tasks];d.tasks=d.tasks.filter(t=>{const i=remaining.findIndex(v=>same(t,v,['title','tag','done']));if(i<0)return true;remaining.splice(i,1);return false;});if(!d.tasks.length)delete d.tasks;}
    for(const k of ['journal','mood','focus'])if(d[k]===original[k])delete d[k];
    if(!Object.keys(d).length)delete next.days[date];
  }
  const removeMatches=(records,fixtures,fields)=>{const remaining=[...fixtures];return records.filter(r=>{const i=remaining.findIndex(v=>same(r,v,fields));if(i<0)return true;remaining.splice(i,1);return false;});};
  next.accounts=removeMatches(next.accounts,template.accounts,['name','type','balance']);
  next.transactions=removeMatches(next.transactions,template.transactions,transactionFields);
  return next;
}
const DEMO_ARCHIVE_KEY=KEY+'-before-demo-cleanup';
let demoArchiveAvailable=false;
let state;
let storageIssue=false;
try{
  const saved=localStorage.getItem(KEY),loaded=saved?validate(JSON.parse(saved)):blank();
  state=cleanDemoRecords(loaded);
  demoArchiveAvailable=!!localStorage.getItem(DEMO_ARCHIVE_KEY);
  if(loaded.demo){
    try{
      if(!demoArchiveAvailable)localStorage.setItem(DEMO_ARCHIVE_KEY,saved);
      demoArchiveAvailable=true;
      localStorage.setItem(KEY,JSON.stringify(state));
    }catch{storageIssue=true;} // Keep the original storage when migration cannot be saved.
  }
}catch{state=blank();storageIssue=true;}
const initialDateView=typeof DateNavigation!=='undefined'?DateNavigation.read(TODAY):{date:TODAY,pinned:false};
let selectedDate=initialDateView.date;
let followToday=!initialDateView.pinned,dayChangePending=false,recordDraftDirty=false;
let page=Object.hasOwn(pages,location.hash.slice(1))?location.hash.slice(1):'overview';
let chartMetric='steps';
let chartPeriod=7;
let assetHidden=false;
let toastTimer;
let journalDirty=false;
let reviewDirty=false;
const modal=$('#modal');
let cloudHealth = {};
let cloudConnection = null;
let cloudLoading = false;
let cloudError = null;
let syncSetup = null;
const day = date => {const key=date||selectedDate,local=state.days[key]||{},synced=cloudHealth[key],report=typeof BodyReports!=='undefined'?BodyReports.latest(key):null,reportWeight=report?.metrics.weight;const useReport=reportWeight!==undefined&&local.health?.weight===undefined&&synced?.health?.weight===undefined;const base=useReport?{...local,health:{weight:reportWeight,...local.health},bodyReportWeight:true}:local;return synced?{...base,health:{...(base.health||{}),...synced.health},apple:synced.apple}:base;};
const allDays = () => Object.fromEntries([...new Set([...Object.keys(state.days),...Object.keys(cloudHealth),...(typeof BodyReports!=='undefined'?BodyReports.dates():[])])].map(d=>[d,day(d)]));
const ensureDay = () => (state.days[selectedDate] ||= {});
const health = () => day().health || {};
const meals = () => day().meals || {};
const tasks = () => day().tasks || [];
const totalAssets = () => state.accounts.reduce((sum,a)=>sum+(a.type==='负债'?-a.balance:a.balance),0);
const completion = date => {const d=day(date);return [d.health&&Object.keys(d.health).length, Object.keys(d.meals||{}).length, (d.tasks||[]).length,d.journal?.trim()].filter(Boolean).length;};
function validate(s){
  const fail=()=>{throw new Error('备份格式不正确');};
  const finite=(n,max=1e12)=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=max;
  const str=(v,max=5000)=>typeof v==='string'&&v.length<=max;
  const validDate=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&!Number.isNaN(Date.parse(d))&&new Date(d+'T12:00:00Z').toISOString().slice(0,10)===d;
  if(!s||s.version!==1||typeof s.demo!=='boolean'||!s.settings||!str(s.settings.name,30)||!s.settings.name.trim()||!finite(s.settings.waterGoal,10000)||s.settings.waterGoal<250||!finite(s.settings.stepsGoal,100000)||s.settings.stepsGoal<100||!finite(s.settings.sleepGoal,24)||s.settings.sleepGoal<1||!s.days||typeof s.days!=='object'||Array.isArray(s.days)||!Array.isArray(s.accounts)||!Array.isArray(s.transactions))fail();
  if(Object.keys(s.days).length>20000||s.accounts.length>1000||s.transactions.length>100000)fail();
  for(const [date,d] of Object.entries(s.days)){
    if(!validDate(date)||!d||typeof d!=='object'||Array.isArray(d))fail();
    if(d.health){if(typeof d.health!=='object'||Array.isArray(d.health)||Object.entries(d.health).some(([k,v])=>['sleepStart','sleepEnd'].includes(k)?!str(v,64):!Object.hasOwn({sleep:24,weight:500,steps:100000,water:10000,exercise:1440,activeEnergy:20000,restingHeartRate:300,heartRate:300,heartRateMin:300,heartRateMax:300,hrv:2000,respiratoryRate:100,coreSleep:24,deepSleep:24,remSleep:24},k)||!finite(v,{sleep:24,weight:500,steps:100000,water:10000,exercise:1440,activeEnergy:20000,restingHeartRate:300,heartRate:300,heartRateMin:300,heartRateMax:300,hrv:2000,respiratoryRate:100,coreSleep:24,deepSleep:24,remSleep:24}[k])))fail();}
    if(d.meals){if(typeof d.meals!=='object'||Array.isArray(d.meals))fail();for(const [k,m] of Object.entries(d.meals)){if(!['breakfast','lunch','dinner'].includes(k)||!m||!str(m.name,160)||!m.name.trim()||!str(m.note,1000)||!str(m.time,5)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(m.time)||(m.calories!==null&&!finite(m.calories,10000)))fail();}}
    if(d.tasks&&(!Array.isArray(d.tasks)||d.tasks.length>1000||d.tasks.some(t=>!t||!str(t.id,100)||!str(t.title,160)||!t.title.trim()||!['工作','学习','生活'].includes(t.tag)||typeof t.done!=='boolean')))fail();
    if(d.journal!==undefined&&!str(d.journal,10000))fail();
    if(d.mood!==undefined&&(!Number.isInteger(d.mood)||d.mood<1||d.mood>5))fail();
    if(d.focus!==undefined&&!finite(d.focus,1440))fail();
  }
  if(s.todos!==undefined&&(!Array.isArray(s.todos)||s.todos.length>10000||(s.todos.length>0&&(typeof ChecklistModel==='undefined'||s.todos.some(v=>!ChecklistModel.valid(v))))||new Set(s.todos.map(v=>v.id)).size!==s.todos.length))fail();
  if(s.media!==undefined&&(!Array.isArray(s.media)||s.media.length>10000||(s.media.length>0&&(typeof SelfMedia==='undefined'||s.media.some(v=>!SelfMedia.valid(v))))||new Set(s.media.map(v=>v.id)).size!==s.media.length))fail();
  if(s.mediaTopics!==undefined&&(!Array.isArray(s.mediaTopics)||s.mediaTopics.length>5000||(s.mediaTopics.length>0&&(typeof MediaTopicModel==='undefined'||s.mediaTopics.some(v=>!MediaTopicModel.valid(v))))||new Set(s.mediaTopics.map(v=>v.id)).size!==s.mediaTopics.length))fail();
  if(s.mediaProfiles!==undefined&&(!Array.isArray(s.mediaProfiles)||s.mediaProfiles.length>3||(s.mediaProfiles.length>0&&(typeof MediaAccounts==='undefined'||s.mediaProfiles.some(v=>!MediaAccounts.valid(v))))||new Set(s.mediaProfiles.map(v=>v.id)).size!==s.mediaProfiles.length))fail();
  if(s.reviews!==undefined){if(!s.reviews||typeof s.reviews!=='object'||Array.isArray(s.reviews)||Object.keys(s.reviews).length>3000)fail();for(const [week,n]of Object.entries(s.reviews)){if(!validDate(week)||week<'2000-01-03'||new Date(week+'T12:00:00Z').getUTCDay()!==1||!n||typeof n!=='object'||Array.isArray(n)||Object.entries(n).some(([k,v])=>!['wins','challenge','plan'].includes(k)||!str(v,5000)))fail();}}
  if(s.ledger!==undefined&&(!Array.isArray(s.ledger)||s.ledger.length>100000||s.ledger.some(e=>!e||!str(e.id,100)||!validDate(e.date)||!['收入','支出','转账','核对','撤销'].includes(e.type)||!str(e.description,160)||!finite(e.amount)||!Array.isArray(e.effects)||e.effects.length<1||e.effects.length>2||e.effects.some(a=>!a||!str(a.id,100)||!str(a.name,60)||!finite(a.before)||!finite(a.after)))||new Set(s.ledger.map(e=>e.id)).size!==s.ledger.length))fail();
  if(s.accounts.some(a=>!a||!str(a.id,100)||!str(a.name,60)||!a.name.trim()||!['现金与存款','投资理财','其他资产','负债'].includes(a.type)||!finite(a.balance)))fail();
  if(s.transactions.some(t=>!t||!str(t.id,100)||!validDate(t.date)||!['收入','支出'].includes(t.type)||!str(t.category,60)||!str(t.description,160)||!finite(t.amount)||t.amount<=0))fail();
  if(new Set(s.accounts.map(a=>a.id)).size!==s.accounts.length||new Set(s.transactions.map(t=>t.id)).size!==s.transactions.length)fail();
  for(const d of Object.values(s.days)){if(d.tasks&&new Set(d.tasks.map(t=>t.id)).size!==d.tasks.length)fail();}
  return s;
}
function toast(message,error=false){const t=$('#toast');clearTimeout(toastTimer);t.textContent=message;t.className=`toast show${error?' error':''}`;toastTimer=setTimeout(()=>t.classList.remove('show'),3500);}
function persist(next, message,options={}){
  try{if(typeof PersonalSync!=='undefined')PersonalSync.record(state,next,options);else localStorage.setItem(KEY,JSON.stringify(next));state=next;if(typeof DraftCenter!=='undefined'){try{DraftCenter.committed();}catch{}}storageIssue=false;if(message)toast(message);return true;}
  catch(error){toast(error.message||'保存失败：浏览器存储不可用或已满，请先导出备份。',true);return false;}
}
function commit(mutator,message='已保存，正在同步',options={}){const next=structuredClone(state);mutator(next);if(persist(next,message,options)){render();return true;}return false;}
const editDay = (s,date=selectedDate) => (s.days[date] ||= {});
function pageHead(title,description,action='记录此刻',kind='quick'){
  return `<div class="page-head"><div><div class="eyebrow">YOUR LIFE, IN BALANCE</div><h1>${title}</h1><p>${description}</p></div><div class="head-actions">${datePicker()}<button class="btn btn-primary" data-action="add" data-kind="${kind}">${icon('plus')}${action}</button></div></div>`;
}
function datePicker(){return `<div class="date-picker-group"><button class="icon-button" data-action="date-prev" aria-label="查看前一天">${icon('chevron')}</button><label class="date-control" title="日期按北京时间"><span>${selectedDate===TODAY?'今天 · ':''}${dateLabel(selectedDate)}</span><input type="date" id="record-date" value="${selectedDate}" max="${TODAY}" aria-label="选择记录日期（北京时间）"></label><button class="icon-button date-next" data-action="date-next" aria-label="查看后一天" ${selectedDate>=TODAY?'disabled':''}>${icon('chevron')}</button></div>`;}
function calendarEditing(){return modal.open||journalDirty||reviewDirty||(typeof PersonalSync!=='undefined'&&PersonalSync.isEditing());}
function paintDayNotice(){
  const el=$('#day-notice');if(!el)return;
  el.hidden=selectedDate===TODAY&&!dayChangePending;
  el.innerHTML=dayChangePending?`<span>已进入 ${shortDate(TODAY)}。当前内容仍记在 ${shortDate(selectedDate)}，完成编辑后回到今天。</span>`:`<span>正在查看 / 补记 ${dateLabel(selectedDate)} · 北京时间</span><button class="text-btn" data-action="date-today">回到今天 ${icon('arrow')}</button>`;
  const input=$('#record-date');if(input)input.max=TODAY;
  const formDate=$('#f-date');if(formDate)formDate.max=TODAY;
}
function checkDayChange(paint=true){
  const next=shanghaiDate(),changed=next!==TODAY;
  if(changed){TODAY=next;if(followToday)dayChangePending=true;}
  let moved=false;
  if(dayChangePending&&followToday&&!calendarEditing()){selectedDate=TODAY;dayChangePending=false;moved=true;}
  if(paint&&(changed||moved)&&!calendarEditing())render();
  else if(changed||moved)paintDayNotice();
  return moved;
}
function setMobileMenu(open){
  $('#sidebar').classList.toggle('open',open);$('#mobile-overlay').classList.toggle('show',open);
  document.body?.classList.toggle('nav-open',open);
  document.querySelectorAll('[data-action="menu"]').forEach(b=>b.setAttribute('aria-expanded',String(open)));
}

function sampleBar(){return '';}
function art(){return `<svg class="welcome-art" viewBox="0 0 320 240" aria-hidden="true"><circle class="circle" cx="199" cy="120" r="99"/><circle class="circle" cx="199" cy="120" r="85"/><circle class="circle" cx="199" cy="120" r="70"/><circle class="circle" cx="199" cy="120" r="55"/><path d="M189 201c-15-45-2-104 39-158" stroke="#9ba879" stroke-width="1.5"/><path d="M200 142c-52 2-69-21-62-62 41 8 64 30 62 62" fill="#b6c398" opacity=".65" stroke="#a5b68b"/><path d="M204 121c39 4 64-11 69-47-32-1-58 16-69 47" fill="#cad5b1" stroke="#b6c59d"/><path d="M190 167c-43-1-62-19-60-48 30 3 55 21 60 48" fill="#c3cda8" stroke="#b0bd92"/><path d="M219 88c-8-31 2-50 26-61 11 26-1 48-26 61" fill="#a5b68a" opacity=".7"/><path d="m141 84 54 51m14-19 57-36m-129 44 47 36m39-79 19-46" stroke="#eff2e5" stroke-width="1.2"/><path d="M83 175c-7-5-13-3-17 2 5 7 12 7 17-2m194-22c8-1 10-7 8-12-7 1-10 5-8 12" fill="#b8c99b" opacity=".6"/><circle cx="95" cy="68" r="3" fill="#d0d9bd"/><circle cx="276" cy="184" r="2" fill="#bdcba5"/></svg>`;}
function greeting(){const hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Shanghai',hour:'2-digit',hourCycle:'h23'}).format(new Date()));return hour<11?'早上好':hour<14?'中午好':hour<18?'下午好':'晚上好';}
function streak(){let n=0;let date=completion(TODAY)?TODAY:shiftDate(TODAY,-1);while(completion(date)&&n<20000){n++;date=shiftDate(date,-1);}return n;}
function stats(){
  const h=health(),m=meals(),t=tasks(),done=t.filter(x=>x.done).length;
  const values=[['健康状态','heart',h.sleep??'—','小时睡眠',h.steps!==undefined?`今日步数 ${num(h.steps)} 步`:'从今天的身体状态开始','health'],['三餐记录','food',`${Object.keys(m).length}<small>/ 3 餐</small>`,'',`${Object.keys(m).length===3?'三餐已记录，认真对待每一餐':'记录食物，也记录生活的滋味'}`,'meals'],['工作与成长','work',`${done}<small>/ ${t.length} 项</small>`,'',t.length?`${Math.round(done/t.length*100)}% 今日计划已完成`:'给今天设定一个小目标','work'],['资产总览','wallet',assetHidden?'••••••':state.accounts.length?`<span style="font-size:17px;margin-right:3px">¥</span>${num(totalAssets())}`:'—','',state.accounts.length?`${state.accounts.length} 个账户 · 人民币`:'从添加第一个账户开始','assets']];
  return `<div class="stats-grid">${values.map((v,i)=>`<a class="stat-card" href="#${v[5]}"><div class="stat-top">${v[0]}<span class="stat-icon">${icon(v[1])}</span></div><div class="stat-value">${v[2]}${v[3]?`<small>${v[3]}</small>`:''}</div><div class="stat-foot">${i===0&&h.steps!==undefined?'<span class="positive">↗</span>':''}${v[4]}</div></a>`).join('')}</div>`;
}
function chartPanel(large=false){
  const metric={steps:['步数','步','walk'],sleep:['睡眠','小时','moon'],weight:['体重','kg','heart']}[chartMetric];
  const dates=Array.from({length:chartPeriod},(_,i)=>shiftDate(selectedDate,i-chartPeriod+1));
  const values=dates.map(d=>day(d).health?.[chartMetric]);
  const actual=values.filter(v=>v!==undefined&&v!==null);
  const avg=actual.length?actual.reduce((a,b)=>a+b,0)/actual.length:null;
  const max=actual.length?Math.max(...actual)*1.2:1;
  const yMax=chartMetric==='steps'?Math.max(10000,Math.ceil(max/2000)*2000):chartMetric==='sleep'?Math.max(10,Math.ceil(max)):Math.ceil(max/10)*10||80;
  const w=600, top=20, bottom=145,left=40,right=580;
  const coords=values.map((v,i)=>v===undefined||v===null?null:[left+(right-left)*i/(dates.length-1),bottom-(v/yMax)*(bottom-top)]);
  const segments=[];let segment=[];for(const p of coords){if(p)segment.push(p);else if(segment.length){segments.push(segment);segment=[];}}if(segment.length)segments.push(segment);
  const path=points=>points.map((p,i)=>`${i?'L':'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const graph=actual.length?`<div class="chart-wrap"${large?' style="height:240px"':''}><svg viewBox="0 0 600 175" preserveAspectRatio="none" role="img" aria-label="近${chartPeriod}天${metric[0]}趋势，${actual.length}天有记录"><defs><linearGradient id="chart-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#b2c29b" stop-opacity=".22"/><stop offset="1" stop-color="#b2c29b" stop-opacity=".015"/></linearGradient></defs>${[0,1,2,3,4].map(i=>{const y=top+(bottom-top)*i/4;return `<path d="M${left} ${y}H${right}" stroke="#e9eee2" stroke-width=".7" stroke-dasharray="3 4"/><text x="${left-11}" y="${y+3}" text-anchor="end">${num(Math.round(yMax*(4-i)/4))}</text>`;}).join('')}${segments.map(points=>`<path d="${path(points)} L${points.at(-1)[0]},${bottom} L${points[0][0]},${bottom}Z" fill="url(#chart-fill)" stroke="none"/><path d="${path(points)}" stroke="#97ad7f" stroke-width="2.2"/>`).join('')}${coords.map((p,i)=>p?`<circle cx="${p[0]}" cy="${p[1]}" r="${i===coords.length-1?4:2.6}" fill="#a0b589" stroke="#fff" stroke-width="1.8"><title>${shortDate(dates[i])}：${num(values[i])} ${metric[1]}</title></circle>`:'').join('')}${dates.map((d,i)=>i%Math.max(1,Math.floor(chartPeriod/6))===0||i===dates.length-1?`<text x="${left+(right-left)*i/(dates.length-1)}" y="166" text-anchor="middle">${Number(d.slice(5,7))}.${Number(d.slice(8))}</text>`:'').join('')}</svg></div>`:`<div class="chart-empty">${icon('chart')}<span style="margin-left:10px">这段时间还没有${metric[0]}记录，第一条记录从今天开始。</span></div>`;
  return `<section class="panel"><div class="panel-head"><h2>健康趋势 <span class="sub">看见每一点变化</span></h2><button class="period-badge" data-action="period">近 ${chartPeriod} 天 ${icon('down').replace('<svg','<svg style="width:10px;height:10px;vertical-align:middle;margin-left:3px"')}</button></div><div class="tab-row">${Object.entries({steps:['walk','步数'],sleep:['moon','睡眠'],weight:['heart','体重']}).map(([key,[ic,title]])=>`<button class="chart-tab ${chartMetric===key?'active':''}" data-action="metric" data-metric="${key}">${icon(ic)}${title}</button>`).join('')}<span class="chart-key"><i></i>每日${metric[0]}</span></div><div class="chart-summary"><strong>${avg===null?'—':num(chartMetric==='steps'?Math.round(avg):Number(avg.toFixed(1)))}</strong><span>${metric[1]} / 日均</span><em>${actual.length} 天有记录</em></div>${graph}</section>`;
}
const mealTypes={breakfast:'早餐',lunch:'午餐',dinner:'晚餐'};
function foodArt(type){
  if(type==='breakfast')return `<svg viewBox="0 0 100 80"><ellipse cx="50" cy="64" rx="34" ry="7" fill="#ddd6bc" stroke="none" opacity=".5"/><path d="M22 27c-8-5-8-17 1-19 9-3 17-2 21 3 8-7 24-3 24 6 0 5-2 7-5 9l-2 33H25Z" fill="#d6b887" stroke="#bd9b68" transform="rotate(-9 45 40)"/><path d="m29 27 1 24 25 2 3-27c6-7-3-13-13-8-10-7-21 2-16 9Z" fill="#eee0b6" stroke="none"/><path d="M35 25c4-8 15-7 17 1 8-2 13 7 8 13 1 10-10 14-16 8-11 3-18-7-13-15-1-3 0-5 4-7" fill="#fcfbef" stroke="#e4dfc7"/><circle cx="45" cy="34" r="8" fill="#dca856" stroke="#ca9749"/><path d="m66 38 10-20 12 3-3 33H69Z" fill="#b9c493" stroke="#98ad78"/><path d="m70 39 12-12m-10 20 10-13" stroke="#e5ead5"/></svg>`;
  if(type==='lunch')return `<svg viewBox="0 0 100 80"><ellipse cx="51" cy="66" rx="37" ry="7" fill="#cbd4b8" stroke="none" opacity=".45"/><path d="M12 36h77c-2 18-13 30-37 30S16 54 12 36Z" fill="#e9ece0" stroke="#b2bea4"/><ellipse cx="50" cy="36" rx="38" ry="16" fill="#f7f6e9" stroke="#c4cbb5"/><path d="m39 25 19-5 16 13-15 15-23-8Z" fill="#c5a36f" stroke="#b49159"/><path d="m43 27 20 13m-15-17 20 13m-25-3 14 11" stroke="#a58558"/><path d="M17 37c-7-10 3-17 10-11 0-9 15-9 16 0 10 8 0 15-7 10-3 9-12 8-14 0" fill="#99ad76" stroke="#839d65"/><path d="M58 44c7-7 17-7 23-1M60 46c8-6 13-6 19-2" stroke="#e9e5ca" stroke-width="3"/><circle cx="29" cy="43" r="5" fill="#ca9774" stroke="none"/><circle cx="79" cy="34" r="4" fill="#d6aa69" stroke="none"/></svg>`;
  return `<svg viewBox="0 0 100 80"><ellipse cx="50" cy="64" rx="36" ry="8" fill="#cbd3c4" stroke="none" opacity=".5"/><ellipse cx="50" cy="44" rx="39" ry="21" fill="#e4e9dd" stroke="#b7c3ad"/><ellipse cx="50" cy="42" rx="32" ry="15" fill="#f8f9f0" stroke="#d5ddc9"/><path d="M27 42c10-14 25-14 36-2l13-7v17l-13-7c-12 10-26 10-36-1Z" fill="#c7d0b8" stroke="#9eae8a"/><circle cx="35" cy="41" r="1.5" fill="#859774" stroke="none"/><path d="m45 34 2 12m5-10 2 9M26 30l7-7m34 32 8 2" stroke="#9eae7c"/><path d="M66 26c-2-8 9-10 9-3 9-2 11 9 3 10 0 7-11 7-10-1-7 0-8-6-2-6" fill="#9eaf81" stroke="#8ba172"/></svg>`;
}
function mealCards(large=false){return `<div class="${large?'meal-large-grid':'meal-grid'}">${Object.entries(mealTypes).map(([type,label])=>{const m=meals()[type];return `<button class="meal-card" data-action="add" data-kind="meal" data-type="${type}"><span class="meal-top">${label}<span>${m?esc(m.time):'待记录'}</span></span><span class="meal-illustration">${m||large?foodArt(type):`<span class="meal-empty">${icon('plus')}</span>`}</span><span class="meal-name">${m?esc(m.name):'给这一餐留个记录'}</span><span class="meal-desc">${icon(m?'check':'clock')}${m?(m.calories!==null?`${num(m.calories)} kcal · 手动记录`:'已记录 · 未填写热量'):'好好吃饭，好好生活'}</span>${large&&m?.note?`<p class="meal-notes">${esc(m.note)}</p>`:''}</button>`;}).join('')}</div>`;}
function mealsPanel(){const m=Object.values(meals());const c=m.reduce((s,x)=>s+(x.calories||0),0);return `<section class="panel meals-panel"><div class="panel-head"><h2>好好吃饭 <span class="sub">一日三餐，也是一日三幸</span></h2><a class="text-btn" href="#meals">全部记录 ${icon('chevron')}</a></div>${mealCards()}<div class="meals-bottom"><span>已记录摄入 <strong>${m.some(v=>v.calories!==null)?num(c):'—'} kcal</strong></span><span>三餐完成 ${m.length}/3 · 热量由你填写</span></div></section>`;}
function taskRows(list=tasks()){return typeof TaskCenter!=='undefined'?TaskCenter.rows(list):'<div class="empty">待办模块尚未载入，请刷新页面。</div>';}
function tasksPanel(){return `<section class="panel tasks-panel"><div class="panel-head"><h2>${selectedDate===TODAY?'今日':'当日'}要事 <span class="count-badge">${tasks().filter(t=>t.done).length}/${tasks().length}</span></h2><a href="#tasks" class="text-btn" aria-label="打开任务清单">${icon('arrow')}</a></div>${taskRows(tasks().slice(0,4))}<button class="add-task-inline" data-action="add" data-kind="task">${icon('plus')}添加一个小目标</button></section>`;}
function habitsPanel(){const h=health(),s=state.settings;return `<section class="panel"><div class="panel-head"><h2>照顾好自己</h2><span class="mini-label">每日小习惯</span></div><div class="habit-grid"><div class="habit">${icon('water')}<button data-action="water" aria-label="记录喝水 250 毫升">${icon('plus')}</button><div class="habit-label">今日饮水</div><div class="habit-value">${h.water===undefined?'—':num(h.water)}<small> ml</small></div><div class="habit-bar"><i style="width:${Math.min(100,(h.water||0)/s.waterGoal*100)}%"></i></div><div class="mini-label" style="margin-top:7px">个人目标 ${num(s.waterGoal)} ml</div></div><div class="habit">${icon('moon')}<button data-action="add" data-kind="health" aria-label="记录睡眠">${icon('plus')}</button><div class="habit-label">昨夜睡眠</div><div class="habit-value">${h.sleep??'—'}<small> 小时</small></div><div class="habit-bar"><i style="width:${Math.min(100,(h.sleep||0)/s.sleepGoal*100)}%"></i></div><div class="mini-label" style="margin-top:7px">个人目标 ${s.sleepGoal} 小时</div></div></div></section>`;}
function weekPanel(){return `<section class="panel"><div class="panel-head" style="margin-bottom:12px"><h2>日常的积累</h2><a class="text-btn" href="#calendar">生活日历 ${icon('arrow')}</a></div><div class="week-strip">${Array.from({length:7},(_,i)=>{const d=shiftDate(selectedDate,i-6);return `<button class="week-day ${d===selectedDate?'selected':''} ${completion(d)?'has-data':''}" data-action="date" data-date="${d}" aria-label="回看${shortDate(d)}"><span>${['日','一','二','三','四','五','六'][new Date(d+'T12:00:00').getDay()]}</span><strong>${Number(d.slice(8))}</strong><i></i></button>`;}).join('')}</div></section>`;}
function overview(){const count=completion(selectedDate);return `${pageHead(`${selectedDate===TODAY?greeting():'回看这一天'}，${esc(state.settings.name==='我的空间'?'亲爱的自己':state.settings.name)} <span>☀</span>`,'生活不必匆忙，慢慢记录，慢慢变好。')}${sampleBar()}<section class="welcome"><div class="hero-copy"><h2>每一天，都离更好的自己近一点。</h2><p>身体的状态、认真吃的饭、努力完成的小事，<br>那些微小的积累，终会成为你的底气。</p><div class="welcome-bottom"><span class="tag">${icon('leaf').replace('<svg','<svg style="width:11px;height:11px"')}持续记录 ${streak()} 天</span><span>${selectedDate===TODAY?'今日':'当日'}已记录 <b>${count} / 4</b> 个生活维度</span></div></div>${art()}</section>${stats()}${syncSummary()}<div class="dashboard-grid"><div class="main-column">${chartPanel()}${mealsPanel()}</div><div class="right-column">${tasksPanel()}${habitsPanel()}<section class="daily-note"><h3>${icon('sun')}给今天的自己</h3><p>不必把每一天都填满。<br>认真做一件事，好好吃一顿饭，<br>也给自己留一点放空的时间。</p><div class="quote-source">ONE DAY AT A TIME.</div><span class="quote-mark">”</span></section>${weekPanel()}</div></div>`;}
function metric(label,value,unit,note,ic){return `<div class="metric-box"><div class="metric-label">${icon(ic)}${label}</div><div class="metric-number">${value??'—'}<small>${unit}</small></div><div class="metric-note">${note}</div></div>`;}
function healthPage(){const h=health();const history=Object.entries(allDays()).filter(([d,x])=>d<=selectedDate&&x.health&&Object.keys(x.health).length).sort(([a],[b])=>b.localeCompare(a)).slice(0,14);return `${pageHead('好好照顾自己的身体','身体的每一个小变化，都值得被看见。','记录健康','health')}${sampleBar()}${syncSummary()}${typeof BodyReports!=='undefined'?BodyReports.panel():''}${typeof BodyTrends!=='undefined'?BodyTrends.panel():''}${typeof Fitness!=='undefined'?Fitness.panel():''}<div class="large-stats">${metric('昨夜睡眠',h.sleep,'小时',`个人目标 ${state.settings.sleepGoal} 小时`,'moon')}${metric('今日步数',h.steps===undefined?null:num(h.steps),'步',`个人目标 ${num(state.settings.stepsGoal)} 步`,'walk')}${metric('今日体重',h.weight,'kg','按自己的节奏，留意长期变化','heart')}</div>${appleMetricsPanel()}<div class="section-grid"><div>${chartPanel(true)}</div><div>${habitsPanel()}<section class="daily-note spaced-top"><h3>${icon('leaf')}今日运动</h3><p>${h.exercise!==undefined?`已记录 ${h.exercise} 分钟运动。`:'散步、跑步、伸展，每一点活动都算数。'}</p><button class="text-btn" style="margin-top:12px" data-action="add" data-kind="health">更新今日状态 ${icon('arrow')}</button></section></div><section class="panel full"><div class="panel-head"><h2>健康记录</h2><span class="mini-label">最近 14 条</span></div><div class="table-scroll"><table class="detail-list"><thead><tr><th>日期</th><th>睡眠 / 小时</th><th>步数</th><th>体重 / kg</th><th>饮水 / ml</th><th>运动 / 分钟</th></tr></thead><tbody>${history.map(([d,x])=>`<tr><td><button class="text-btn" data-action="date" data-date="${d}">${shortDate(d)}</button></td><td>${x.health.sleep??'—'}</td><td>${x.health.steps===undefined?'—':num(x.health.steps)}</td><td>${x.health.weight??'—'}</td><td>${x.health.water??'—'}</td><td>${x.health.exercise??'—'}</td></tr>`).join('')}</tbody></table>${!history.length?'<div class="table-empty">还没有健康记录，添加第一条吧。</div>':''}</div><p class="health-note">包含个人手动记录与已连接的 Apple 健康数据，目标可在偏好设置中调整。</p></section></div>`;}
function mealsPage(){const values=Object.values(meals());const total=values.reduce((s,m)=>s+(m.calories||0),0);const history=Object.entries(allDays()).filter(([d,x])=>d<=selectedDate&&Object.keys(x.meals||{}).length).sort(([a],[b])=>b.localeCompare(a)).slice(0,7);return `${pageHead('一日三餐，好好吃饭','记录吃下的食物，也收藏生活里的满足。','记录一餐','meal')}${sampleBar()}<div class="large-stats">${metric('今日三餐',values.length,'/ 3 餐','一餐一记，让生活有迹可循','food')}${metric('已填写热量',values.some(v=>v.calories!==null)?num(total):'—','kcal','仅汇总手动填写的数据','leaf')}${metric('热量填写',values.filter(m=>m.calories!==null).length,'餐','不填写热量也可以保存饮食','check')}</div>${mealCards(true)}<section class="panel spaced-top"><div class="panel-head"><h2>餐桌上的日常</h2><span class="mini-label">最近 7 个有记录的日子</span></div>${history.length?history.map(([d,x])=>`<div class="journal-entry"><small><button class="text-btn" data-action="date" data-date="${d}">${dateLabel(d)}</button></small><p>${Object.entries(x.meals).map(([k,m])=>`${mealTypes[k]}：${esc(m.name)}`).join('<br>')}</p></div>`).join(''):'<div class="empty">还没有饮食记录，下一餐就是一个好开始。</div>'}</section>`;}
function workPage(){const t=tasks(),done=t.filter(x=>x.done).length;return `${pageHead('专注工作，也留白生活','把大目标拆成小步，完成一件，再往前一点。','添加待办','task')}${sampleBar()}<div class="large-stats">${metric(selectedDate===TODAY?'今日计划':'当日计划',t.length,'项','把重要的事，放在今天','work')}${metric('已完成',done,'项',t.length?`${Math.round(done/t.length*100)}% 的${selectedDate===TODAY?'今日':'当日'}计划已完成`:'今天还有无限可能','check')}${metric('专注时间',day().focus||0,'分钟','来自完成的专注计时','clock')}</div><div class="section-grid"><section class="panel"><div class="panel-head"><h2>${selectedDate===TODAY?'今日':'当日'}待办</h2><span class="progress-pill">${done} / ${t.length} 已完成</span></div>${taskRows()}<button class="add-task-inline" data-action="add" data-kind="task">${icon('plus')}添加新的小目标</button></section>${typeof FocusTimer!=='undefined'?FocusTimer.panel():'<section class="focus-panel"><p>计时模块尚未载入，请刷新页面。</p></section>'}${typeof TaskCenter!=='undefined'?TaskCenter.historyPanel():''}<section class="panel full"><div class="panel-head"><h2>最近的积累</h2><span class="mini-label">近 7 天</span></div>${Array.from({length:7},(_,i)=>shiftDate(selectedDate,-i)).map(d=>{const t=day(d).tasks||[];return `<div class="week-detail"><button class="text-btn" data-action="date" data-date="${d}">${shortDate(d)}</button><span>完成 ${t.filter(t=>t.done).length} / ${t.length} 项</span><strong>${day(d).focus||0} 分钟专注</strong></div>`;}).join('')}</section></div>`;}
const typeColors={'现金与存款':'#81966e','投资理财':'#b2bf97','其他资产':'#d3d9bd','负债':'#c4a48c'};
function assetsPage(){const flows=[...state.transactions,...(typeof AssetLedger!=='undefined'?AssetLedger.flows():[])];const month=selectedDate.slice(0,7);const monthly=flows.filter(t=>t.date.startsWith(month)&&t.date<=selectedDate);const income=monthly.filter(t=>t.type==='收入').reduce((s,t)=>s+t.amount,0),expense=monthly.filter(t=>t.type==='支出').reduce((s,t)=>s+t.amount,0);const groups=Object.keys(typeColors).map(type=>({type,total:state.accounts.filter(a=>a.type===type).reduce((s,a)=>s+a.balance,0)})).filter(g=>g.total>0);const gross=groups.reduce((s,g)=>s+g.total,0);let angle=0;const conic=groups.map(g=>{const start=angle;angle+=g.total/gross*100;return `${typeColors[g.type]} ${start}% ${angle}%`;}).join(',')||'#edf1e6 0 100%';const transactions=flows.filter(t=>t.date<=selectedDate).sort((a,b)=>b.date.localeCompare(a.date));return `${pageHead('给自己的生活，一份底气','看清每一份积累，让钱有去处，生活有余地。','记一笔收支','transaction')}${sampleBar()}${typeof AssetLedger!=='undefined'?AssetLedger.panel():''}<div class="large-stats">${metric('当前净资产',assetHidden?'••••••':state.accounts.length?`¥ ${money(totalAssets())}`:'—','','当前余额 · 包含全部已记账变动','wallet')}${metric('本月收入',assetHidden?'••••••':monthly.length?`¥ ${money(income)}`:'—','',`${month} 月初至所选日期`,'chart')}${metric('本月支出',assetHidden?'••••••':monthly.length?`¥ ${money(expense)}`:'—','','关联流水自动更新账户余额','food')}</div><div class="section-grid"><section class="panel"><div class="panel-head"><h2>资产分布</h2><button class="text-btn" data-action="hide-assets">${assetHidden?'显示金额':'隐藏金额'}</button></div><div class="asset-overview"><div class="donut" style="background:conic-gradient(${conic})"><span>账户数量<strong>${state.accounts.length}</strong></span></div><div class="asset-legend">${groups.length?groups.map(g=>`<div class="legend-row"><i style="background:${typeColors[g.type]}"></i>${g.type}<strong>${assetHidden?'••••':`¥${num(g.total)}`}</strong></div>`).join(''):'<span class="mini-label">添加账户，建立自己的资产地图。</span>'}</div></div></section><section class="panel"><div class="panel-head"><h2>我的账户</h2><button class="text-btn" data-action="add" data-kind="account">${icon('plus')}添加账户</button></div>${state.accounts.length?`<div class="table-scroll"><table class="detail-list"><tbody>${state.accounts.map(a=>`<tr><td>${esc(a.name)}<div class="mini-label" style="margin-top:5px">${a.type}</div></td><td class="amount">${assetHidden?'••••':`${a.type==='负债'?'-':''}¥${money(a.balance)}`}</td><td class="actions"><button data-action="add" data-kind="account" data-id="${esc(a.id)}" aria-label="编辑账户${esc(a.name)}">${icon('edit')}</button><button data-action="delete-account" data-id="${esc(a.id)}" aria-label="删除账户${esc(a.name)}">${icon('trash')}</button></td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">从你的第一个储蓄账户开始。</div>'}</section><section class="panel full"><div class="panel-head"><h2>收支明细</h2><span class="mini-label">截至 ${shortDate(selectedDate)} · 最近 50 笔</span></div><div class="table-scroll"><table class="detail-list"><thead><tr><th>日期</th><th>分类</th><th>备注</th><th>金额</th><th></th></tr></thead><tbody>${transactions.slice(0,50).map(t=>`<tr><td>${shortDate(t.date)}</td><td><span class="task-tag ${t.type==='支出'?'orange':''}">${esc(t.category)}</span></td><td>${esc(t.description)||'—'}</td><td class="amount ${t.type==='收入'?'income':'expense'}">${assetHidden?'••••':`${t.type==='收入'?'+':'−'} ¥${money(t.amount)}`}</td><td class="actions">${t.linked?'已关联账户':`<button data-action="add" data-kind="transaction" data-id="${esc(t.id)}" aria-label="编辑收支">${icon('edit')}</button><button data-action="delete-transaction" data-id="${esc(t.id)}" aria-label="删除收支">${icon('trash')}</button>`}</td></tr>`).join('')}</tbody></table>${!transactions.length?'<div class="table-empty">还没有收支记录，记下第一笔吧。</div>':''}</div><p class="health-note">所有金额以人民币记录。关联账户的收支会增减余额；独立收支仅参与统计。转账与余额核对不计入收入支出。</p></section></div>`;}
function trendsPage(){const dates=Array.from({length:chartPeriod},(_,i)=>shiftDate(selectedDate,i-chartPeriod+1));const active=dates.filter(d=>completion(d)).length;const allTasks=dates.flatMap(d=>day(d).tasks||[]);return `${pageHead('看见积累的力量','把日常连成一条线，发现属于自己的节奏。')}${sampleBar()}<div class="large-stats">${metric('有记录的日子',active,`/ ${chartPeriod} 天`,'每一条记录，都在慢慢积累','calendar')}${metric('完成的小目标',allTasks.filter(t=>t.done).length,'项',`共设定 ${allTasks.length} 项计划`,'check')}${metric('认真吃的饭',dates.reduce((s,d)=>s+Object.keys(day(d).meals||{}).length,0),'餐',`近 ${chartPeriod} 天的三餐记录`,'food')}</div>${chartPanel(true)}${typeof BodyTrends!=='undefined'?BodyTrends.panel():''}<div class="section-grid spaced-top"><section class="panel"><div class="panel-head"><h2>生活维度</h2><span class="mini-label">近 ${chartPeriod} 天记录覆盖</span></div>${[['健康','health'],['三餐','meals'],['工作','tasks'],['手记','journal']].map(([label,key])=>{const count=dates.filter(d=>{const val=day(d)[key];return key==='journal'?val?.trim():key==='tasks'?val?.length:val&&Object.keys(val).length;}).length;return `<div class="week-detail"><span>${label}</span><div style="width:45%;align-self:center" class="habit-bar"><i style="width:${count/chartPeriod*100}%"></i></div><strong>${count} 天</strong></div>`;}).join('')}</section><section class="daily-note"><h3>${icon('leaf')}找到自己的节奏</h3><p>数据是帮助你看见自己的工具。<br>偶尔的空白也没关系，回来记录的这一天，<br>就是新的开始。</p><div class="quote-source">PROGRESS, AT YOUR OWN PACE.</div></section></div>`;}
const moods={1:['🌧️','有点低落'],2:['☁️','有些疲惫'],3:['🌤️','平平淡淡'],4:['☀️','心情不错'],5:['🌷','特别开心']};
function journalPage(){return `${pageHead('留一点时间，听听自己','今天有些什么小事，值得留下来？','保存手记','save-journal')}${sampleBar()}<div class="section-grid"><section class="panel"><div class="panel-head"><h2>今天的心情</h2><span class="mini-label">${shortDate(selectedDate)}</span></div><div class="mood-options">${Object.entries(moods).map(([k,[emoji,label]])=>`<button class="mood-btn ${day().mood===Number(k)?'active':''}" data-action="mood" data-mood="${k}" aria-pressed="${day().mood===Number(k)}"><span>${emoji}</span>${label}</button>`).join('')}</div><textarea class="journal-editor" id="journal-text" data-date="${selectedDate}" maxlength="10000" aria-label="今天的生活手记" placeholder="写一件开心的事，一个小小的收获，或是此刻的心情……">${esc(day().journal||'')}</textarea><div class="journal-footer"><span id="journal-save-state">${day().journal?'已保存 · 云端自动同步':'留给自己的一页空白'}</span><button class="btn btn-primary" data-action="save-journal">保存手记 ${icon('check')}</button></div></section><section class="panel"><div class="panel-head"><h2>往日的片段</h2><span class="mini-label">最近 10 篇</span></div>${Object.entries(allDays()).filter(([d,x])=>x.journal?.trim()&&d<=selectedDate).sort(([a],[b])=>b.localeCompare(a)).slice(0,10).map(([d,x])=>`<article class="journal-entry"><small><button class="text-btn" data-action="date" data-date="${d}">${shortDate(d)} ${x.mood?moods[x.mood][0]:''}</button></small><p>${esc(x.journal.slice(0,180))}${x.journal.length>180?'…':''}</p></article>`).join('')||'<div class="empty">写下今天，未来的你会在这里遇见自己。</div>'}</section></div>`;}
function settingsPage(){const s=state.settings;return `${pageHead('让这个空间，更像你','按照自己的生活节奏，设置小小的目标。','导出备份','export')}<section class="panel settings-form"><div class="panel-head"><h2>我的偏好</h2><span class="tag">${state.demo?'示例空间':'个人空间'}</span></div><form id="settings-form"><div class="form-field"><label for="setting-name">我希望被这样称呼</label><input id="setting-name" name="name" required maxlength="30" value="${esc(s.name)}"></div><div class="form-row"><div class="form-field"><label for="setting-water">每日饮水目标 / ml</label><input id="setting-water" name="waterGoal" type="number" min="250" max="10000" step="50" required value="${s.waterGoal}"></div><div class="form-field"><label for="setting-steps">每日步数目标 / 步</label><input id="setting-steps" name="stepsGoal" type="number" min="100" max="100000" step="100" required value="${s.stepsGoal}"></div></div><div class="form-field"><label for="setting-sleep">每日睡眠目标 / 小时</label><input id="setting-sleep" name="sleepGoal" type="number" min="1" max="24" step="0.5" required value="${s.sleepGoal}"><span class="field-help">这些是你自定义的记录目标，按自己的实际情况设置即可。</span></div><button class="btn btn-primary" type="submit">保存偏好 ${icon('check')}</button></form>${typeof PersonalSync!=='undefined'?PersonalSync.panel():''}${healthSyncCompact()}${typeof BackupCenter!=='undefined'?BackupCenter.panel():''}${demoArchiveAvailable?'<div class="settings-section"><button class="btn" data-action="export-demo-archive">下载清理前存档</button><p class="field-help">仅此浏览器留存的旧版原始数据。</p></div>':''}</section>`;}
function render(){
  checkDayChange(false);
  if(typeof DateNavigation!=='undefined')DateNavigation.write(selectedDate,followToday);
  paintDayNotice();
  $('#page-label').textContent=pages[page];
  $('#profile-name').textContent=state.settings.name;
  $('#avatar').textContent=state.settings.name==='我的空间'?'我':state.settings.name.slice(0,1);
  $('#top-avatar').textContent=$('#avatar').textContent;
  document.querySelectorAll('[data-page]').forEach(a=>{a.classList.toggle('active',a.dataset.page===page);if(a.dataset.page===page)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
  $('#main').innerHTML=({overview,health:healthPage,meals:mealsPage,work:workPage,tasks:()=>Checklist.page(),media:()=>SelfMedia.page(),assets:assetsPage,trends:trendsPage,journal:journalPage,review:()=>WeeklyReview.page(),calendar:()=>LifeCalendar.page(),settings:settingsPage,sync:syncPage,quality:()=>QualityCenter.page()})[page]();
  document.title=`${pages[page]} · 观己 SELFSPACE`;
  if(typeof PersonalSync!=='undefined')PersonalSync.paint();if(typeof DraftCenter!=='undefined')DraftCenter.mount();
}
function saveJournal(silent=false){const input=$('#journal-text');if(!input)return true;const value=input.value;if(silent&&typeof DraftCenter!=='undefined'&&DraftCenter.requiresConfirm('journal',input.dataset?.date||selectedDate)){toast('恢复的手记草稿请先核对并点击保存。');return false;}if(!journalDirty&&value===(day().journal||''))return true;const next=structuredClone(state);editDay(next,input.dataset?.date||selectedDate).journal=value;if(!persist(next,silent?null:'手记已保存，今天也值得被记住。'))return false;journalDirty=false;const label=$('#journal-save-state');if(label)label.textContent='本机已保存，云端同步中';return true;}
function navigate(next,view=null){if(page==='review'&&!WeeklyReview.save(true))return;if(page==='settings'&&next!=='settings'&&typeof PersonalSync!=='undefined')PersonalSync.settingsSaved();if(page==='journal'&&!saveJournal(true))return;if(view){selectedDate=view.date;followToday=!view.pinned;dayChangePending=false;}if(next!=='sync')syncSetup=null;page=next;setMobileMenu(false);checkDayChange(false);render();window.scrollTo({top:0,behavior:'instant'});}
function navigateLocation(){if(typeof DateNavigation!=='undefined'){if(!DateNavigation.changed())return;if(modal.open){DateNavigation.write(selectedDate,followToday,false,page);toast('请先完成或关闭当前表单。');return;}const view=DateNavigation.read(shanghaiDate());navigate(Object.hasOwn(pages,location.hash.slice(1))?location.hash.slice(1):'overview',view);DateNavigation.write(selectedDate,followToday,false,page);}else navigate(Object.hasOwn(pages,location.hash.slice(1))?location.hash.slice(1):'overview');}
window.addEventListener('hashchange',navigateLocation);
window.addEventListener('popstate',navigateLocation);
function setDate(date){checkDayChange(false);if(!date||!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(date))||new Date(date+'T12:00:00Z').toISOString().slice(0,10)!==date||date<'2000-01-01'||date>TODAY)return;if(modal.open){toast('请先完成或关闭当前表单。');return;}if(page==='journal'&&!saveJournal(true))return;selectedDate=date;followToday=date===TODAY;dayChangePending=false;if(typeof DateNavigation!=='undefined')DateNavigation.write(selectedDate,followToday,true);render();}
function closeModal(force=false){
  if(recordDraftDirty&&!force){const guard=$('#discard-record');if(guard){guard.hidden=false;guard.scrollIntoView?.({block:'nearest',behavior:'smooth'});}toast('记录尚未保存，可以继续编辑或放弃这次填写。');return;}
  if(typeof DraftCenter!=='undefined')DraftCenter.finishModal();recordDraftDirty=false;modal.close();checkDayChange();
}
function modalShell(title,subtitle,body){recordDraftDirty=false;$('#modal-content').innerHTML=`<div class="modal-header"><div><h2>${title}</h2><p>${subtitle}</p></div><button class="icon-button" data-action="close" aria-label="关闭弹窗">${icon('close')}</button></div><div class="modal-body">${body}<div id="discard-record" class="discard-record" hidden><p>这次填写尚未保存。</p><button type="button" class="btn" data-action="keep-record">继续编辑</button><button type="button" class="btn btn-danger" data-action="discard-record">放弃填写并关闭</button></div></div>`;if(!modal.open)modal.showModal();if($('#record-form')?.dataset.kind==='health'&&!state.demo){const synced=cloudHealth[selectedDate]?.health||{};let has=false;for(const key of ['sleep','weight','steps','water','exercise']){if(Object.hasOwn(synced,key)){const input=$('#f-'+key);if(input){input.readOnly=true;input.title='由 Apple 健康同步，请在健康 App 中更新';has=true;}}}if(has){const note=document.createElement('p');note.className='field-help';note.textContent='Apple 健康已同步的指标为只读；其他指标仍可手动填写。';$('#record-form').prepend(note);}}if(typeof DraftCenter!=='undefined')DraftCenter.mount();}
function field(label,name,value='',attrs='',type='text'){return `<div class="form-field"><label for="f-${name}">${label}</label><input id="f-${name}" name="${name}" type="${type}" value="${esc(value)}" ${type==='number'?'inputmode="decimal"':''} ${attrs}></div>`;}
function selectField(label,name,options,value){return `<div class="form-field"><label for="f-${name}">${label}</label><select id="f-${name}" name="${name}">${options.map(o=>{const [v,l]=Array.isArray(o)?o:[o,o];return `<option value="${v}" ${v===value?'selected':''}>${l}</option>`;}).join('')}</select></div>`;}
function submitFooter(label='保存记录',extra=''){return `<div class="modal-footer">${extra}<button class="btn" type="button" data-action="close">取消</button><button type="submit" class="btn btn-primary">${icon('check')}${label}</button></div>`;}
function showForm(kind='health',type='breakfast',id='',quick=false){
  if(recordDraftDirty){toast('请先保存当前记录，或关闭表单后再切换。');return;}
  if(kind==='quick'){kind='health';quick=true;}
  if(kind==='save-journal'){if(saveJournal()){checkDayChange(false);render();}return;}
  if(kind==='export'){exportData();return;}
  if(page==='review'&&!WeeklyReview.save(true))return;
  if(page==='journal'&&!saveJournal(true))return;
  if(kind==='task'){if(typeof TaskCenter!=='undefined')TaskCenter.open(id,selectedDate,quick);else toast('待办模块尚未载入，请刷新页面。');return;}
  const tabs=quick?`<div class="modal-tabs">${[['health','健康'],['meal','三餐'],['task','待办'],['transaction','收支']].map(([k,t])=>`<button type="button" data-action="quick-tab" data-kind="${k}" class="${k===kind?'active':''}">${t}</button>`).join('')}</div>`:'';
  let body='',title='记录此刻';
  if(kind==='health'){
    title='记下今天的身体状态';const h=health(),reportWeight=day().bodyReportWeight;
    const weightHelp=reportWeight?`<p class="field-help">今日体重 ${num(h.weight)} kg 来自体脂秤报告。体重栏留空会继续使用报告；主动填写后，将作为手动体重优先显示。报告数值请在「体脂秤报告」中修改。</p>`:'';
    body=`<div class="form-row">${field('昨夜睡眠 / 小时','sleep',h.sleep??'','min="0" max="24" step="0.1" placeholder="例如 7.5"','number')}${field('今日体重 / kg','weight',reportWeight?'':h.weight??'','min="1" max="500" step="any" placeholder="填写手动体重（选填）"','number')}</div>${weightHelp}<div class="form-row">${field('今日步数 / 步','steps',h.steps??'','min="0" max="100000" step="1" placeholder="例如 8000"','number')}${field('今日饮水 / ml','water',h.water??'','min="0" max="10000" step="1" placeholder="例如 1500"','number')}</div>${field('今日运动 / 分钟','exercise',h.exercise??'','min="0" max="1440" step="1" placeholder="例如 30"','number')}<span class="field-help">按实际情况填写；留空可移除对应指标。</span>`;
  }else if(kind==='meal'){
    title=meals()[type]?'更新这一餐':'认真记录一餐';const m=meals()[type]||{};
    body=`${selectField('这一餐','mealType',Object.entries(mealTypes),type)}${field('吃了些什么？','name',m.name||'','required maxlength="160" placeholder="例如：杂粮饭、清蒸鱼、时蔬"')}<div class="form-row">${field('用餐时间','time',m.time||({breakfast:'08:00',lunch:'12:00',dinner:'18:30'}[type]),'required','time')}${field('热量 / kcal（选填）','calories',m.calories??'','min="0" max="10000" step="1" placeholder="不填也可以"','number')}</div><div class="form-field"><label for="f-note">这一餐的小记（选填）</label><textarea id="f-note" name="note" maxlength="1000" placeholder="好吃的东西，值得记住。">${esc(m.note||'')}</textarea></div>`;
  }else if(kind==='account'){
    const a=state.accounts.find(a=>a.id===id)||{};title=id?'更新账户':'添加我的账户';body=`${field('账户名称','name',a.name||'','required maxlength="60" placeholder="例如：储蓄卡、应急资金"')}${selectField('账户类型','type',['现金与存款','投资理财','其他资产','负债'],a.type||'现金与存款')}${field('当前余额 / 元','balance',a.balance??'','required min="0" max="1000000000000" step="0.01" placeholder="0.00"','number')}<span class="field-help">负债填写正数，统计净资产时自动扣除。余额为独立快照。</span>`;
  }else if(kind==='transaction'){
    const t=state.transactions.find(t=>t.id===id)||{};title=id?'更新这笔收支':'记下一笔收支';body=`<div class="form-row">${selectField('收支类型','type',['支出','收入'],t.type||'支出')}${field('金额 / 元','amount',t.amount??'','required min="0.01" max="1000000000000" step="0.01" placeholder="0.00"','number')}</div><div class="form-row">${field('日期','date',t.date||selectedDate,`required max="${TODAY}"`,'date')}${selectField('分类','category',['餐饮','交通','生活','购物','健康','工资','投资','其他'],t.category||'餐饮')}</div>${field('备注（选填）','description',t.description||'','maxlength="160" placeholder="这笔钱，用在了哪里？"')}${!id&&typeof AssetLedger!=='undefined'?AssetLedger.accountField():'<span class="field-help">独立收支仅参与统计，不自动修改账户余额。</span>'}`;
  }
  const deleteMeal=kind==='meal'&&meals()[type]?`<button class="btn btn-danger" type="button" data-action="delete-meal" data-type="${type}">删除这一餐</button>`:'';
  modalShell(title,`${dateLabel(selectedDate)}${state.demo?' · 示例空间':''}`,`${tabs}<form id="record-form" data-record-date="${selectedDate}" data-kind="${kind}" data-id="${esc(id)}" data-meal="${type}" data-quick="${quick}">${body}${submitFooter('保存记录',deleteMeal)}</form>`);
  if(typeof AssetLedger!=='undefined'){AssetLedger.capture($('#record-form'));if(kind==='account'&&id&&AssetLedger.linked(id)){$('#f-balance').readOnly=true;$('#f-type').disabled=true;const note=document.createElement('p');note.className='field-help';note.textContent='已有记账记录，余额请使用资产页的余额核对更新。';$('#record-form').prepend(note);}}if(typeof DraftCenter!=='undefined')DraftCenter.refreshInitial($('#record-form'));
}
function submitRecord(form){
  if(form.dataset.kind==='task'){if(typeof TaskCenter!=='undefined')TaskCenter.save(form);return;}
  if(!form.reportValidity())return;
  if(form.dataset.kind==='transaction'&&form.querySelector?.('[name=accountId]')?.value){void AssetLedger.submit(form,true);return;}
  const f=new FormData(form),kind=form.dataset.kind,id=form.dataset.id,date=form.dataset.recordDate||selectedDate;
  if(kind==='health'&&!['sleep','weight','steps','water','exercise'].some(k=>f.get(k)!=='')){if(!Object.keys((day(date).health||{})).length){toast('至少填写一项身体状态。',true);return;}}
  const success=commit(s=>{
    if(kind==='health'){const h={...(s.days[date]?.health||{})};for(const k of ['sleep','weight','steps','water','exercise']){if(!s.demo&&Object.hasOwn(cloudHealth[date]?.health||{},k))continue;if(f.get(k)!=='')h[k]=Number(f.get(k));else delete h[k];}editDay(s,date).health=h;}
    if(kind==='meal'){const m=(editDay(s,date).meals ||= {});m[f.get('mealType')]={name:f.get('name').trim(),time:f.get('time'),calories:f.get('calories')===''?null:Number(f.get('calories')),note:f.get('note').trim()};}
    if(kind==='account'){const a={id:id||uid(),name:f.get('name').trim(),type:f.get('type')||s.accounts.find(a=>a.id===id)?.type,balance:Number(f.get('balance'))};if(id)s.accounts=s.accounts.map(x=>x.id===id?a:x);else s.accounts.push(a);}
    if(kind==='transaction'){const t={id:id||uid(),date:f.get('date'),type:f.get('type'),amount:Number(f.get('amount')),category:f.get('category'),description:f.get('description').trim()};if(id)s.transactions=s.transactions.map(x=>x.id===id?t:x);else s.transactions.push(t);}
  },state.demo?'示例记录已更新':'已保存，今天也有好好记录。',{baseRevisions:JSON.parse(form.dataset.revisions||'{}')});
  if(success)closeModal(true);
}
function confirmAction(title,copy,callback,button='确定'){modalShell(title,'请确认后继续',`<p class="confirm-copy">${copy}</p><div class="modal-footer"><button class="btn" data-action="close">取消</button><button class="btn btn-primary" id="confirm-action">${button}</button></div>`);$('#confirm-action').addEventListener('click',()=>{callback();closeModal();},{once:true});}
function startFresh(){
  if(typeof BackupCenter!=='undefined'){void BackupCenter.clear();return;}
  const isDemo=state.demo;
  confirmAction(isDemo?'开启属于自己的记录':'清空全部记录',isDemo?'将清除当前示例记录，保留你的偏好设置。从一个干净的空间开始，认真记录自己的每一天。':'这会同步删除所有设备上的手动健康、三餐、工作、手记与资产记录。请先导出备份；Apple 健康同步记录会保留。',()=>{
    if(page==='journal')saveJournal(true);
    const next=blank();next.settings={...state.settings};if(persist(next,isDemo?'欢迎来到你的个人空间。':'清空操作已保存，将同步到其他设备。')){resetFocus(true);journalDirty=false;selectedDate=TODAY;location.hash='overview';page='overview';render();}
  },isDemo?'开始我的记录':'确认清空');
}
function exportData(){if(page==='review'&&!WeeklyReview.save(true))return;if(typeof BackupCenter!=='undefined'){void BackupCenter.exportFull();return;}if(page==='journal'&&!saveJournal(true))return;const blob=new Blob([JSON.stringify({...state,days:structuredClone(allDays())},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`观己备份-${TODAY}${state.demo?'-示例':''}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('备份已导出，请妥善保存。');}
async function importFile(file){
  if(typeof BackupCenter!=='undefined'){await BackupCenter.importFile(file);return;}
  if(!file)return;
  if(file.size>10*1024*1024){toast('备份文件不能超过 10 MB。',true);return;}
  try{const next=cleanDemoRecords(validate(JSON.parse(await file.text())));confirmAction('从备份恢复记录',`将使用备份中的 ${Object.keys(next.days).length} 天记录和 ${next.accounts.length} 个账户替换当前空间。建议先导出当前数据。`,()=>{if(persist(next,'备份恢复成功。')){resetFocus(true);journalDirty=false;render();}},'恢复备份');}
  catch{toast('无法导入：请选择完整有效的观己 JSON 备份。',true);}
  finally{$('#import-file').value='';}
}
function toggleFocus(expected=null){return typeof FocusTimer!=='undefined'?FocusTimer.toggle(expected):false;}
function resetFocus(force=false){return typeof FocusTimer!=='undefined'?(force?FocusTimer.discard():FocusTimer.reset()):false;}
function tickFocus(){return typeof FocusTimer!=='undefined'?FocusTimer.tick():false;}
document.addEventListener('click',e=>{
  const el=e.target.closest('[data-action]');if(!el)return;
  const {action,id,kind,type}=el.dataset;
  if(checkDayChange()&&!['close','menu','date-today'].includes(action)){toast('已切换到今天，请重新选择要进行的操作。');return;}
  if(action==='add')showForm(kind,type||'breakfast',id||'');
  else if(action==='close')closeModal();
  else if(action==='menu')setMobileMenu(!$('#sidebar').classList.contains('open'));
  else if(action==='quick-tab')showForm(kind,'breakfast','',true);
  else if(action==='date')setDate(el.dataset.date);
  else if(action==='date-prev')setDate(shiftDate(selectedDate,-1));
  else if(action==='date-next')setDate(shiftDate(selectedDate,1));
  else if(action==='date-today')setDate(TODAY);
  else if(action==='keep-record'){$('#discard-record').hidden=true;}
  else if(action==='discard-record')closeModal(true);
  else if(action==='metric'){chartMetric=el.dataset.metric;render();}
  else if(action==='period'){chartPeriod=chartPeriod===7?30:7;render();}
  else if(action==='start')startFresh();
  else if(action==='export')exportData();
  else if(action==='export-demo-archive'){
    try{const raw=localStorage.getItem(DEMO_ARCHIVE_KEY);if(!raw)throw new Error();const url=URL.createObjectURL(new Blob([raw],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='观己-示例清理前存档.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch{toast('无法读取清理前存档，请检查浏览器存储。',true);}
  }
  else if(action==='import')$('#import-file').click();
  else if(action==='toggle-task'&&typeof TaskCenter!=='undefined')TaskCenter.change(el);
  else if(action==='delete-task'&&typeof TaskCenter!=='undefined')TaskCenter.change(el,true);
  else if(action==='delete-meal'){const date=$('#record-form')?.dataset.recordDate||selectedDate;if(recordDraftDirty){toast('请先保存当前修改，再删除这餐记录。');return;}confirmAction('删除这一餐的记录',`将移除 ${shortDate(date)} 的${mealTypes[type]}记录。`,()=>commit(s=>{delete editDay(s,date).meals[type];},'已删除这餐记录。'),'确认删除');}
  else if(action==='delete-account'&&typeof AssetLedger!=='undefined'&&AssetLedger.linked(id)){toast('这个账户有关联记账，请保留账户以便核对和撤销。',true);}
  else if(action==='delete-account')confirmAction('删除这个账户',`将移除账户「${esc(state.accounts.find(a=>a.id===id)?.name)}」。收支流水会保留。`,()=>commit(s=>{s.accounts=s.accounts.filter(a=>a.id!==id);},'账户已删除。'),'确认删除');
  else if(action==='delete-transaction')confirmAction('删除这笔收支','这笔记录将从收支明细与统计中移除。',()=>commit(s=>{s.transactions=s.transactions.filter(t=>t.id!==id);},'收支记录已删除。'),'确认删除');
  else if(action==='water'){if(!state.demo&&cloudHealth[selectedDate]?.health?.water!==undefined){toast('饮水已由 Apple 健康同步，请在健康 App 中更新。');return;}if((health().water||0)>=10000){toast('今日饮水记录已达到 10,000 ml 的录入上限。');return;}commit(s=>{const d=editDay(s);(d.health ||= {}).water=Math.min(10000,(d.health.water||0)+250);},'已记录 250 ml 饮水。',{counter:true});}
  else if(action==='hide-assets'){assetHidden=!assetHidden;render();}
  else if(action==='mood'){const journal=$('#journal-text')?.value;const saved=commit(s=>{const d=editDay(s);d.mood=Number(el.dataset.mood);if(journal!==undefined)d.journal=journal;},'记住此刻的心情。');if(saved)journalDirty=false;}
  else if(action==='save-journal'){if(saveJournal()){checkDayChange(false);render();}}
  else if(action==='focus-toggle')toggleFocus({id:el.dataset.focusId||'',phase:el.dataset.focusPhase||'idle'});
  else if(action==='focus-reset')resetFocus();
});
document.addEventListener('submit',e=>{
  if(e.target.id==='record-form'){e.preventDefault();const f=new FormData(e.target);for(const name of ['name','title'])if(f.has(name)&&!String(f.get(name)).trim()){toast('请填写有效的名称。',true);return;}submitRecord(e.target);}
  if(e.target.id==='settings-form'){e.preventDefault();if(!e.target.reportValidity())return;const f=new FormData(e.target);if(!f.get('name').trim()){toast('请填写你的称呼。',true);return;}const saved=commit(s=>{s.settings={name:f.get('name').trim(),waterGoal:Number(f.get('waterGoal')),stepsGoal:Number(f.get('stepsGoal')),sleepGoal:Number(f.get('sleepGoal'))};},'偏好已保存，按照你的节奏来。');if(saved&&typeof PersonalSync!=='undefined'){PersonalSync.settingsSaved();checkDayChange();}}
});
document.addEventListener('change',e=>{
  if(e.target.id==='record-date')setDate(e.target.value);
  if(e.target.id==='f-mealType'){const current=$('#record-form');const previous=current.dataset.meal,wasDirty=recordDraftDirty;current.dataset.meal=e.target.value;if(!wasDirty&&$('#f-time').value===({breakfast:'08:00',lunch:'12:00',dinner:'18:30'}[previous]))$('#f-time').value=({breakfast:'08:00',lunch:'12:00',dinner:'18:30'}[e.target.value]);recordDraftDirty=true;if(day(current.dataset.recordDate).meals?.[e.target.value])toast('保存将更新这一天已有的'+mealTypes[e.target.value]+'记录，请核对内容。');const del=current.querySelector('[data-action="delete-meal"]');if(del){del.dataset.type=e.target.value;del.hidden=!day(current.dataset.recordDate).meals?.[e.target.value];}}
  if(e.target.id==='import-file')importFile(e.target.files[0]);
});
document.addEventListener('input',e=>{if(e.target.closest?.('#record-form'))recordDraftDirty=true;if(e.target.id==='journal-text'){journalDirty=true;$('#journal-save-state').textContent='编辑中 · 离开此页时自动保存';}});
$('#mobile-overlay').addEventListener('click',()=>setMobileMenu(false));
document.addEventListener('keydown',e=>{if(e.key==='Escape')setMobileMenu(false);});
modal.addEventListener('cancel',e=>{e.preventDefault();closeModal();});
modal.addEventListener('close',()=>{recordDraftDirty=false;checkDayChange();});
modal.addEventListener('click',e=>{if(e.target===modal){const r=modal.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeModal();}});
window.addEventListener('beforeunload',e=>{if(recordDraftDirty||(reviewDirty&&!WeeklyReview.save(true))||(journalDirty&&!saveJournal(true))){e.preventDefault();e.returnValue='';}});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'&&journalDirty)saveJournal(true);if(document.visibilityState==='hidden'&&reviewDirty)WeeklyReview.save(true);if(document.visibilityState==='visible'){checkDayChange();tickFocus();}});
window.addEventListener('focus',()=>{checkDayChange();tickFocus();});
window.addEventListener('pageshow',()=>{checkDayChange();tickFocus();});
setInterval(()=>{if(document.visibilityState==='visible')checkDayChange();},30000);
if(typeof PersonalSync!=='undefined')PersonalSync.bootstrap();
render();
if(storageIssue)toast('无法读取部分本机记录，请在偏好设置检查原始存档或恢复备份。',true);
