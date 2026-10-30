export function createSearchModel(){
  const types={checklist:'任务清单',meal:'三餐',task:'待办',journal:'手记',report:'身体报告',media:'自媒体',topic:'选题资料',review:'每周复盘'};
  const text=v=>typeof v==='string'?v:'';
  const normalize=v=>text(v).normalize('NFKC').toLocaleLowerCase('zh-CN').replace(/\s+/g,' ').trim();
  const validDate=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&d>='2000-01-01'&&d<='9999-12-31'&&Number.isFinite(Date.parse(d+'T12:00:00Z'))&&new Date(d+'T12:00:00Z').toISOString().slice(0,10)===d;
  const localDate=t=>{const n=Date.parse(t);return Number.isFinite(n)?new Date(n+8*3600000).toISOString().slice(0,10):'';};
  function build(state,fields=[]){
    const rows=[];
    const add=(kind,id,date,title,body,meta='',detail='')=>{if(!validDate(date))return;rows.push({kind,id,date,title:text(title),body:text(body),meta:text(meta),detail:text(detail)});};
    for(const [date,d]of Object.entries(state.days||{})){
      for(const [kind,label]of [['breakfast','早餐'],['lunch','午餐'],['dinner','晚餐']]){const m=d.meals?.[kind];if(m)add('meal',kind,date,m.name,m.note,`${label} · ${m.time}${typeof m.calories==='number'?' · '+m.calories+' kcal':''}`,label);}
      for(const t of d.tasks||[])add('task',t.id,date,t.title,t.tag,t.done?'已完成':'待完成');
      if(text(d.journal).trim())add('journal','journal',date,'这一天的生活手记',d.journal,'生活手记');
    }
    for(const t of state.todos||[])add('checklist',t.id,localDate(t.updatedAt),t.title,t.notes,`${t.category} · ${t.priority}优先级 · ${t.status}${t.dueAt?' · 截止 '+t.dueAt.replace('T',' '):''}`,'按更新日期检索');
    for(const r of state.bodyReports||[]){const values=fields.filter(f=>typeof r.metrics?.[f.key]==='number'&&Number.isFinite(r.metrics[f.key])).map(f=>`${f.label} ${r.metrics[f.key]}${f.unit?' '+f.unit:''}`).join(' · ');add('report',r.id,text(r.measuredAt).slice(0,10),r.source||'体脂秤报告',`${r.notes||''}${r.notes?' · ':''}${values}`,text(r.measuredAt).replace('T',' '),'身体报告');}
    for(const t of state.mediaTopics||[])add('topic',t.id,localDate(t.updatedAt),t.title,[t.eventDate,t.facts,t.viewpoint,t.questions,...t.sources.flatMap(s=>[s.title,s.url,s.publishedDate])].filter(Boolean).join('\n'),'按更新日期检索','选题资料');
    for(const m of state.media||[]){const published=m.status==='已发布',date=published?m.publishedDate:m.plannedDate||localDate(m.updatedAt),label=published?'实际发布':m.plannedDate?'计划发布':'更新日期';add('media',m.id,date,m.title,[m.script,m.notes].filter(Boolean).join('\n'),`${m.platform} · ${m.status} · ${label}`,m.format);}
    for(const [date,r]of Object.entries(state.reviews||{}))if(['wins','challenge','plan'].some(k=>text(r[k]).trim()))add('review',date,date,'这一周的复盘',[['收获',r.wins],['问题与调整',r.challenge],['下周计划',r.plan]].filter(([,v])=>text(v).trim()).map(([k,v])=>`${k}：${v}`).join('\n'),'按周一日期检索','每周复盘');
    return rows.sort((a,b)=>b.date.localeCompare(a.date)||a.kind.localeCompare(b.kind)||a.id.localeCompare(b.id));
  }
  function search(rows,{query='',kind='',from='',to='',page=1,size=20}={}){
    const q=normalize(text(query).slice(0,160)),tokens=q.split(' ').filter(Boolean);
    if(from&&!validDate(from)||to&&!validDate(to)||from&&to&&from>to)return {error:'请填写有效的日期范围，开始日期不能晚于结束日期。',items:[],total:0,page:1,pages:0};
    const found=rows.filter(r=>(!kind||r.kind===kind)&&(!from||r.date>=from)&&(!to||r.date<=to)&&tokens.every(t=>normalize([types[r.kind],r.date,r.title,r.body,r.meta,r.detail].join(' ')).includes(t))),limit=Math.max(1,Math.min(50,Math.trunc(size)||20)),pages=Math.ceil(found.length/limit),current=Math.min(Math.max(1,Math.trunc(page)||1),pages||1);
    return {error:'',items:found.slice((current-1)*limit,current*limit),total:found.length,page:current,pages};
  }
  function excerpt(row,query='',limit=150){const body=row.body.replace(/\s+/g,' ').trim();if(!body)return '';const token=normalize(query).split(' ').filter(Boolean).find(t=>normalize(body).includes(t)),at=token?normalize(body).indexOf(token):0,start=Math.max(0,at-30);return (start?'…':'')+body.slice(start,start+limit)+(start+limit<body.length?'…':'');}
  return {types,build,search,excerpt,validDate};
}
export const searchModel=createSearchModel();
