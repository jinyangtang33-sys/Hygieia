export function createFocusModel(){
  const duration=25*60*1000;
  const validDate=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&d>='2000-01-01'&&Number.isFinite(Date.parse(d+'T12:00:00Z'))&&new Date(d+'T12:00:00Z').toISOString().slice(0,10)===d;
  const day=ms=>new Date(ms+8*3600000).toISOString().slice(0,10);
  function valid(s,owner){return !!s&&s.version===1&&s.owner===owner&&typeof owner==='string'&&owner.length>0&&typeof s.id==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(s.id)&&['running','paused','complete','recorded'].includes(s.phase)&&Number.isSafeInteger(s.startedAt)&&s.startedAt>=946656000000&&s.startedAt<=253402271999999&&validDate(s.date)&&s.date===day(s.startedAt)&&Number.isSafeInteger(s.remainingMs)&&s.remainingMs>=0&&s.remainingMs<=duration&&Number.isSafeInteger(s.endsAt)&&s.endsAt>=0&&(s.phase==='running'?s.remainingMs>0&&s.endsAt>=s.startedAt:s.endsAt===0)&&(s.phase==='paused'?s.remainingMs>0:true)&&(['complete','recorded'].includes(s.phase)?s.remainingMs===0:true);}
  function start(owner,id,now){const s={version:1,owner,id,date:day(now),startedAt:now,phase:'running',remainingMs:duration,endsAt:now+duration};if(!valid(s,owner))throw Error('无法开始计时，请检查当前账号和设备时间。');return s;}
  const remaining=(s,now)=>s.phase==='running'?Math.min(s.remainingMs,Math.max(0,s.endsAt-now)):s.remainingMs;
  function pause(s,now){const left=remaining(s,now);return {...s,phase:left?'paused':'complete',remainingMs:left,endsAt:0};}
  const resume=(s,now)=>({...s,phase:'running',endsAt:now+s.remainingMs});
  const complete=s=>({...s,phase:'complete',remainingMs:0,endsAt:0});
  const operation=s=>({id:'focus:'+s.id,key:'day/'+s.date+'/focus',value:25,baseRevision:0,after:null,delta:25});
  return {duration,valid,start,remaining,pause,resume,complete,operation,day};
}
export const focusModel=createFocusModel();
