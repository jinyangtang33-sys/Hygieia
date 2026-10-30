import {database,identity,json} from '../../../../lib/health-api';
import {validatePersonalValue} from '../../../../lib/personal-format.mjs';
const keyOK=(key:string)=>/^(media|media-topic)\/[a-zA-Z0-9_.:-]{1,100}$/.test(key);
const decode=(r:any)=>({key:r.record_key,value:r.value===null?null:JSON.parse(r.value),revision:r.revision,updatedAt:r.updated_at});
// Read only: restoration is a new ordinary revision-checked personal operation.
export async function GET(request:Request){
  const user=identity(request);if(!user)return json({error:'请先登录你的个人空间。'},401);
  const p=new URL(request.url).searchParams,key=p.get('key');
  try{
    const db=database();
    if(key!==null){
      const raw=p.get('before'),before=raw===null?Number.MAX_SAFE_INTEGER:Number(raw);
      if(!keyOK(key)||raw!==null&&!/^\d{1,16}$/.test(raw)||!Number.isSafeInteger(before)||before<=0)return json({error:'历史记录参数无效。'},400);
      const [record,history]=await db.batch([
        db.prepare('SELECT record_key,value,revision,updated_at FROM personal_records WHERE user_id=? AND record_key=?').bind(user,key),
        db.prepare(`WITH versions AS (
          SELECT MIN(sequence) AS sequence FROM personal_mutations WHERE user_id=? AND record_key=?
          AND json_type(result,'$.revision')='integer' GROUP BY json_extract(result,'$.revision')
        ) SELECT m.sequence,m.result FROM personal_mutations m JOIN versions v ON v.sequence=m.sequence
        WHERE m.user_id=? AND m.record_key=? AND m.sequence<? ORDER BY m.sequence DESC LIMIT 21`).bind(user,key,user,key,before),
      ]);
      if(!record.results.length)return json({error:'这条云端记录不存在，或不属于当前账号。'},404);
      const current=decode(record.results[0]);validatePersonalValue(key,current.value);
      const versions=history.results.slice(0,20).map((row:any)=>{const r=JSON.parse(row.result);if(r.key!==key)throw Error('INVALID_HISTORY');validatePersonalValue(key,r.value);return {sequence:row.sequence,key,value:r.value,revision:r.revision,updatedAt:r.updatedAt};});
      return json({owner:user,current,versions,nextBefore:history.results.length>20?versions.at(-1)!.sequence:null});
    }
    const kind=p.get('kind')||'media',q=(p.get('q')||'').trim(),raw=p.get('page')||'1',page=Number(raw),deleted=p.get('deleted')||'0';
    if(!['media','media-topic'].includes(kind)||q.length>160||!/^\d{1,3}$/.test(raw)||!Number.isInteger(page)||page<1||page>500||!['0','1'].includes(deleted))return json({error:'请检查类型、关键词和页码。'},400);
    const rows=await db.prepare(`WITH records AS (
      SELECT r.record_key,r.revision,r.updated_at,r.value IS NULL AS deleted,
      COALESCE(json_extract(r.value,'$.title'),(
        SELECT json_extract(m.result,'$.value.title') FROM personal_mutations m
        WHERE m.user_id=r.user_id AND m.record_key=r.record_key AND json_type(m.result,'$.value')='object'
        ORDER BY m.sequence DESC LIMIT 1),'已删除的记录（无可用标题）') AS title
      FROM personal_records r WHERE r.user_id=? AND r.record_key LIKE ?
    ) SELECT * FROM records WHERE (?='0' OR deleted=1) AND (?='' OR instr(lower(title),lower(?))>0)
    ORDER BY updated_at DESC,record_key ASC LIMIT 21 OFFSET ?`).bind(user,kind+'/%',deleted,q,q,(page-1)*20).all();
    return json({owner:user,records:rows.results.slice(0,20).map((r:any)=>({key:r.record_key,title:r.title,revision:r.revision,updatedAt:r.updated_at,deleted:!!r.deleted})),page,hasMore:rows.results.length>20});
  }catch{return json({error:'修改历史暂时无法读取，请稍后重试。'},503);}
}
