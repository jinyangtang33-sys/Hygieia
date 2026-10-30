export function createTaskModel(){
  const canonical=v=>JSON.stringify(v&&{id:v.id,title:v.title,tag:v.tag,done:v.done});
  const validDate=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&d>='2000-01-01'&&d<='9999-12-31'&&Number.isFinite(Date.parse(d+'T12:00:00Z'))&&new Date(d+'T12:00:00Z').toISOString().slice(0,10)===d;
  const shift=(d,n)=>new Date(Date.parse(d+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
  function history(days,target,period=7){if(!validDate(target))return [];const start=period==='all'?'2000-01-01':shift(target,-([7,30].includes(period)?period:7));return Object.entries(days||{}).filter(([date])=>validDate(date)&&date<target&&date>=start).flatMap(([date,d])=>(d.tasks||[]).filter(t=>!t.done).map(task=>({date,task}))).sort((a,b)=>b.date.localeCompare(a.date)||a.task.id.localeCompare(b.task.id));}
  async function carryId(sourceDate,id,target,subtle){if(!validDate(sourceDate)||!validDate(target)||sourceDate>=target||typeof id!=='string'||!id)throw Error('待办来源或目标日期无效。');const bytes=new TextEncoder().encode(JSON.stringify(['selfspace-task-copy-v1',sourceDate,id,target])),digest=await subtle.digest('SHA-256',bytes);return 'carry-'+Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');}
  function updated(current,title,tag){title=typeof title==='string'?title.trim():'';if(!title||title.length>160||!['工作','学习','生活'].includes(tag))throw Error('请填写有效的待办标题和分类。');return {id:current.id,title,tag,done:current.done};}
  return {canonical,validDate,history,carryId,updated};
}
export const taskModel=createTaskModel();
