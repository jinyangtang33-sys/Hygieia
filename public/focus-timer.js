'use strict';
const FocusTimer=(()=>{
  const prefix='selfspace-focus-timer-v1:';
  let lastError='',retryAt=0,busy=false;
  const identity=()=>{const c=PersonalSync.dataState();return c.ready&&!c.blocked&&c.owner?c.owner:null;};
  const supported=()=>typeof navigator!=='undefined'&&typeof navigator.locks?.request==='function';
  const key=owner=>prefix+encodeURIComponent(owner);
  function read(owner){const raw=localStorage.getItem(key(owner));if(raw===null)return null;const s=JSON.parse(raw);if(!FocusModel.valid(s,owner))throw Error('本机计时存档需要检查，原记录已保留，请联系维护者。');return s;}
  const write=s=>localStorage.setItem(key(s.owner),JSON.stringify(s));
  function view(){const owner=identity();let s=null,error=lastError,invalid=false;try{if(owner)s=read(owner);}catch(e){error=e.message;invalid=true;}const now=Date.now(),left=s?FocusModel.remaining(s,now):FocusModel.duration,ended=s&&s.phase==='running'&&left===0,phase=ended?'complete':s?.phase||'idle';
    return {owner,s,error,left,phase,seconds:Math.ceil(left/1000),disabled:!owner||!supported()||invalid,note:!owner?'请等待当前账号连接完成，再开始专注。':!supported()?'当前浏览器不支持可靠的多页面计时，本轮无法开始。':error?error:s?.phase==='recorded'?`本轮 25 分钟已记入 ${s.date}；保存与云端同步状态可在偏好设置查看。`:phase==='complete'?`本轮已结束，正在保存到 ${s.date}；失败时可点击重试。`:s?`本轮归属 ${s.date}（北京时间）${s.phase==='paused'?' · 已暂停':''}`:'新计时会记入开始时的北京时间日期。'};
  }
  function panel(){const v=view();return `<section class="focus-panel" id="focus-center">${icon('clock')}<h3>给自己一段专注时间</h3><p>25 分钟，只做眼前这一件事。</p><div class="focus-time" id="focus-time">${text(v)}</div><div class="focus-buttons"><button class="btn btn-primary" data-action="focus-toggle" id="focus-toggle" data-focus-id="${esc(v.s?.id||'')}" data-focus-phase="${v.s?.phase||'idle'}" ${v.disabled?'disabled':''}>${label(v)}</button><button class="btn" data-action="focus-reset" id="focus-reset" ${v.disabled||!v.s||v.phase==='recorded'?'disabled':''}>重置</button></div><p id="focus-note" role="status" class="${v.error?'focus-error':''}">${esc(v.note)}</p><p class="focus-storage-note">刷新后可恢复，同一浏览器的多个页面共用本轮计时。进行中的计时不跨设备；完成记录会同步。关闭网页后无到点提醒，下次打开时会核对是否完成。</p></section>`;}
  const text=v=>{const seconds=v.phase==='recorded'?1500:v.seconds;return `${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;};
  const label=v=>v.phase==='running'?'暂停专注':v.phase==='paused'?'继续专注':v.phase==='complete'?'重试保存':v.phase==='recorded'?'开始下一轮':'开始专注';
  function paint(){const v=view(),time=document.getElementById?.('focus-time'),toggle=document.getElementById?.('focus-toggle'),reset=document.getElementById?.('focus-reset'),note=document.getElementById?.('focus-note');if(time)time.textContent=text(v);if(toggle){toggle.textContent=label(v);toggle.disabled=v.disabled;toggle.dataset.focusId=v.s?.id||'';toggle.dataset.focusPhase=v.s?.phase||'idle';}if(reset)reset.disabled=v.disabled||!v.s||v.phase==='recorded';if(note){note.textContent=v.note;note.classList.toggle('focus-error',!!v.error);}}
  async function locked(action){if(busy)return false;const owner=identity();if(!owner||!supported()){paint();return false;}busy=true;
    try{return await navigator.locks.request('selfspace-focus:'+owner,async()=>{if(identity()!==owner)return false;const s=read(owner);if(s&&Date.now()<s.startedAt)throw Error('设备时间早于本轮开始时间，请核对系统时间后再继续。');return action(s,owner);});}
    catch(e){lastError=e.message||'本机存储暂时无法保存，原计时仍保留。';retryAt=Date.now()+15000;paint();return false;}
    finally{busy=false;paint();}
  }
  function finish(s){if(s.phase==='running'){s=FocusModel.complete(s);write(s);}if(s.phase!=='complete')return;
    PersonalSync.completeFocus(s);write({...s,phase:'recorded'});lastError='';retryAt=0;
    if(!calendarEditing())render();
  }
  async function toggle(expected=null){const current=view(),wanted=expected||{id:current.s?.id||'',phase:current.s?.phase||'idle'};return locked((s,owner)=>{
    if((s?.id||'')!==wanted.id||(s?.phase||'idle')!==wanted.phase)return false;
    lastError='';retryAt=0;const now=Date.now();
    if(s&&(s.phase==='complete'||s.phase==='running'&&FocusModel.remaining(s,now)===0)){finish(s);return true;}
    if(!s||s.phase==='recorded')write(FocusModel.start(owner,uid(),now));
    else if(s.phase==='running')write(FocusModel.pause(s,now));else write(FocusModel.resume(s,now));
    return true;
  });}
  async function reset(confirmed=false,expectedId=null){
    const v=view();if(v.disabled||!v.s||v.s.phase==='recorded')return false;
    if(!confirmed){const id=v.s.id;confirmAction('重置本轮专注',`将停止 ${esc(v.s.date)} 开始的这一轮。本轮尚未记入的时间会放弃，已经保存的专注记录保留。`,()=>void reset(true,id),'确认重置');return false;}
    return locked(s=>{if(!s||s.id!==expectedId||s.phase==='recorded')return false;localStorage.removeItem(key(s.owner));lastError='';retryAt=0;return true;});
  }
  async function discard(){const owner=identity();if(!owner||!supported())return false;let expected;
    try{expected=read(owner)?.id;return await navigator.locks.request('selfspace-focus:'+owner,()=>{if(identity()!==owner)return false;const s=read(owner);if(s&&s.id===expected)localStorage.removeItem(key(owner));lastError='';retryAt=0;return true;});}
    catch(e){lastError=e.message;return false;}finally{paint();}
  }
  async function tick(){paint();if(busy||Date.now()<retryAt)return;const v=view();if(v.disabled||v.error&&!v.s)return;if(v.s&&(v.phase==='complete'))await locked(s=>{if(s&&(s.phase==='complete'||s.phase==='running'&&FocusModel.remaining(s,Date.now())===0))finish(s);});}
  document.addEventListener('DOMContentLoaded',()=>{void tick();setInterval(()=>void tick(),500);});
  window.addEventListener('storage',e=>{if(e.key?.startsWith(prefix)||e.key==='selfspace-personal-v1'){lastError='';retryAt=0;void tick();}});
  window.addEventListener('focus',()=>void tick());window.addEventListener('pageshow',()=>void tick());document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')void tick();});
  return {panel,paint,view,toggle,reset,discard,tick};
})();
