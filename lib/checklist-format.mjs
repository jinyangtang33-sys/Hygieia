export function createChecklistModel(){
  const canonical=v=>JSON.stringify(v&&typeof v==='object'?Array.isArray(v)?v.map(x=>JSON.parse(canonical(x))):Object.fromEntries(Object.keys(v).sort().map(k=>[k,JSON.parse(canonical(v[k]))])):v??null);
  const date=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&v>='2000-01-01'&&v<='9999-12-31'&&Number.isFinite(Date.parse(v+'T12:00:00Z'))&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;
  const local=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/.test(v)&&date(v.slice(0,10));
  const stamp=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
  const instant=v=>local(v)?Date.parse(v+':00+08:00'):NaN;
  const localNow=(now=Date.now())=>new Date(now+8*3600000).toISOString().slice(0,16);
  const statuses=['未开始','进行中','已完成'],categories=['工作','学习','生活','健康','自媒体'],priorities=['高','中','低'];
  function valid(v){return !!(v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===12&&Object.keys(v).every(k=>['id','title','notes','category','priority','status','dueAt','remindAt','completedAt','createdAt','updatedAt','schemaVersion'].includes(k))&&v.schemaVersion===1&&typeof v.id==='string'&&/^[a-zA-Z0-9_.:-]{1,100}$/.test(v.id)&&typeof v.title==='string'&&v.title.trim()&&v.title.length<=160&&typeof v.notes==='string'&&v.notes.length<=5000&&categories.includes(v.category)&&priorities.includes(v.priority)&&statuses.includes(v.status)&&(v.dueAt===''||local(v.dueAt))&&(v.remindAt===''||local(v.remindAt))&&(!v.remindAt||!v.dueAt||instant(v.remindAt)<=instant(v.dueAt))&&stamp(v.createdAt)&&stamp(v.updatedAt)&&(v.status==='已完成'?stamp(v.completedAt):v.completedAt===''));}
  function phase(v,now=Date.now()){if(v.status==='已完成')return 'done';if(!v.dueAt)return 'unscheduled';const today=localNow(now).slice(0,10);if(instant(v.dueAt)<now)return 'overdue';return v.dueAt.slice(0,10)===today?'today':'upcoming';}
  function select(items=[],{filter='open',query='',category='',priority='',sort='due',page=1,now=Date.now()}={}){
    const q=String(query).normalize('NFKC').toLocaleLowerCase().trim(),today=localNow(now).slice(0,10);
    const found=items.filter(v=>(!category||v.category===category)&&(!priority||v.priority===priority)&&(!q||[v.title,v.notes,v.category].join('\n').normalize('NFKC').toLocaleLowerCase().includes(q))&&(filter==='all'||filter==='open'&&v.status!=='已完成'||filter==='doing'&&v.status==='进行中'||filter==='today'&&v.status!=='已完成'&&v.dueAt.slice(0,10)===today||phase(v,now)===filter));
    const rank=v=>priorities.indexOf(v.priority),due=(a,b)=>(a.dueAt||'~').localeCompare(b.dueAt||'~');
    found.sort((a,b)=>(a.status==='已完成')-(b.status==='已完成')||(sort==='priority'?rank(a)-rank(b)||due(a,b):sort==='updated'?b.updatedAt.localeCompare(a.updatedAt):due(a,b)||rank(a)-rank(b))||a.id.localeCompare(b.id));
    const pages=Math.max(1,Math.ceil(found.length/15)),p=Math.max(1,Math.min(pages,Math.trunc(page)||1));return {total:found.length,pages,page:p,rows:found.slice((p-1)*15,p*15)};
  }
  function summary(items=[],now=Date.now()){const today=localNow(now).slice(0,10);return {open:items.filter(v=>v.status!=='已完成').length,today:items.filter(v=>v.status!=='已完成'&&v.dueAt.slice(0,10)===today).length,overdue:items.filter(v=>phase(v,now)==='overdue').length,done:items.filter(v=>v.status==='已完成').length};}
  // Read-only contract for a future authenticated delivery worker. No sending occurs here.
  function reminderCandidates(items=[],now=Date.now()){return items.filter(v=>valid(v)&&v.status!=='已完成'&&v.remindAt&&instant(v.remindAt)<=now).map(v=>({taskId:v.id,taskRevisionTime:v.updatedAt,scheduledAt:new Date(instant(v.remindAt)).toISOString(),timezone:'Asia/Shanghai',title:v.title,dueAt:v.dueAt?new Date(instant(v.dueAt)).toISOString():null}));}
  return {valid,canonical,date,local,instant,localNow,statuses,categories,priorities,phase,select,summary,reminderCandidates};
}
export const checklistModel=createChecklistModel();
