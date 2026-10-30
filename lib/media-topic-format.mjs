export function createMediaTopicModel(){
  const id=v=>typeof v==='string'&&/^[a-zA-Z0-9_.:-]{1,100}$/.test(v);
  const str=(v,n)=>typeof v==='string'&&v.length<=n;
  const date=v=>v===''||typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&v>='2000-01-01'&&v<='9999-12-31'&&!Number.isNaN(Date.parse(v+'T12:00:00Z'))&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;
  const stamp=v=>str(v,40)&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v)&&!Number.isNaN(Date.parse(v))&&new Date(v).toISOString()===v;
  const url=v=>{try{const u=new URL(v);return str(v,1000)&&['http:','https:'].includes(u.protocol)&&!u.username&&!u.password;}catch{return false;}};
  const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&!Object.keys(v).some(k=>!keys.includes(k));
  function valid(v){return !!(exact(v,['id','title','eventDate','sources','facts','viewpoint','questions','createdAt','updatedAt'])&&id(v.id)&&str(v.title,160)&&v.title.trim()&&date(v.eventDate)&&Array.isArray(v.sources)&&v.sources.length<=5&&v.sources.every(s=>exact(s,['title','url','publishedDate'])&&str(s.title,160)&&url(s.url)&&date(s.publishedDate))&&['facts','viewpoint','questions'].every(k=>str(v[k],6000))&&stamp(v.createdAt)&&stamp(v.updatedAt));}
  const canonical=v=>JSON.stringify(v&&typeof v==='object'?Array.isArray(v)?v.map(x=>JSON.parse(canonical(x))):Object.fromEntries(Object.keys(v).sort().map(k=>[k,JSON.parse(canonical(v[k]))])):v??null);
  function progress(topicId,media=[]){return ['X','小红书','抖音'].map(platform=>{const posts=media.filter(v=>v.topicId===topicId&&v.platform===platform).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)||a.id.localeCompare(b.id));return {platform,posts,counts:Object.fromEntries(['选题','创作中','待发布','已发布'].map(s=>[s,posts.filter(p=>p.status===s).length]))};});}
  function select(topics=[],query='',page=1){const q=String(query).trim().toLocaleLowerCase(),all=topics.filter(v=>!q||[v.title,v.facts,v.viewpoint,v.questions,...v.sources.flatMap(s=>[s.title,s.url])].some(x=>x.toLocaleLowerCase().includes(q))).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)||a.id.localeCompare(b.id)),pages=Math.max(1,Math.ceil(all.length/6)),current=Math.min(pages,Math.max(1,Number.isInteger(page)?page:1));return {total:all.length,page:current,pages,rows:all.slice((current-1)*6,current*6)};}
  return {valid,canonical,progress,select};
}
export const mediaTopicModel=createMediaTopicModel();
