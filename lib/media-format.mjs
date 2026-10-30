export function validMedia(v){
  const str=(s,n)=>typeof s==='string'&&s.length<=n;
  const date=s=>s===''||(typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&s>='2000-01-01'&&s<='9999-12-31'&&!Number.isNaN(Date.parse(s+'T12:00:00Z'))&&new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s);
  if(!v||typeof v!=='object'||Array.isArray(v)||!str(v.id,100)||!/^[a-zA-Z0-9_.:-]{1,100}$/.test(v.id)||!str(v.title,160)||!v.title.trim()||!str(v.platform,40)||!v.platform.trim()||!['图文','短视频','长视频','文章','直播','其他'].includes(v.format)||!['选题','创作中','待发布','已发布'].includes(v.status)||!date(v.plannedDate)||!date(v.publishedDate)||v.status==='已发布'&&!v.publishedDate||!str(v.url,1000)||!str(v.script,12000)||!str(v.notes,3000))return false;
  if(v.url){try{const u=new URL(v.url);if(!['https:','http:'].includes(u.protocol)||u.username||u.password)return false;}catch{return false;}}
  for(const k of ['views','likes','comments','saves'])if(v[k]!==null&&(!Number.isSafeInteger(v[k])||v[k]<0||v[k]>1e9))return false;
  for(const k of ['createdAt','updatedAt'])if(!str(v[k],40)||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v[k])||Number.isNaN(Date.parse(v[k]))||new Date(v[k]).toISOString()!==v[k])return false;
  if(v.accountId!==undefined){if(typeof v.accountId!=='string')return false;const p={'primary-x':'X','primary-xiaohongshu':'小红书','primary-douyin':'抖音'};if(v.accountId!==''&&(!Object.hasOwn(p,v.accountId)||p[v.accountId]!==v.platform))return false;}
  if(v.topicId!==undefined&&(typeof v.topicId!=='string'||v.topicId!==''&&!/^[a-zA-Z0-9_.:-]{1,100}$/.test(v.topicId)))return false;
  return !Object.keys(v).some(k=>!['id','title','platform','format','status','plannedDate','publishedDate','url','script','notes','views','likes','comments','saves','createdAt','updatedAt','accountId','topicId'].includes(k));
}

export function validMediaProfile(v){
  const platforms={'primary-x':'X','primary-xiaohongshu':'小红书','primary-douyin':'抖音'},str=(s,n)=>typeof s==='string'&&s.length<=n;
  const date=s=>s===''||(typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&s>='2000-01-01'&&s<='9999-12-31'&&!Number.isNaN(Date.parse(s+'T12:00:00Z'))&&new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s);
  if(!v||typeof v!=='object'||Array.isArray(v)||typeof v.id!=='string'||!Object.hasOwn(platforms,v.id)||platforms[v.id]!==v.platform||!['待开通','筹备中','运营中','暂停更新'].includes(v.status))return false;
  for(const [key,limit]of [['nickname',80],['handle',80],['url',1000],['positioning',160],['audience',160],['bio',1000],['cadence',120],['notes',3000]])if(!str(v[key],limit))return false;
  if(v.url){try{const u=new URL(v.url);if(!['https:','http:'].includes(u.protocol)||u.username||u.password)return false;}catch{return false;}}
  if(v.followers!==null&&(!Number.isSafeInteger(v.followers)||v.followers<0||v.followers>1e9))return false;
  if(!date(v.followersDate)||v.followers!==null&&!v.followersDate)return false;
  for(const key of ['avatarReady','bioReady','firstPostReady'])if(typeof v[key]!=='boolean')return false;
  for(const key of ['createdAt','updatedAt'])if(!str(v[key],40)||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v[key])||Number.isNaN(Date.parse(v[key]))||new Date(v[key]).toISOString()!==v[key])return false;
  return !Object.keys(v).some(k=>!['id','platform','status','nickname','handle','url','positioning','audience','bio','cadence','notes','followers','followersDate','avatarReady','bioReady','firstPostReady','createdAt','updatedAt'].includes(k));
}
