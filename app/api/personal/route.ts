import {database,identity,json,sameOrigin,readJSON,hashToken} from '../../../lib/health-api';
import {validatePersonalBatch,PersonalFormatError,stable} from '../../../lib/personal-format.mjs';
const decode=(r:any)=>({key:r.record_key,value:r.value===null?null:JSON.parse(r.value),revision:r.revision,updatedAt:r.updated_at});

export async function GET(request:Request){
  const user=identity(request);if(!user)return json({error:'请登录同一账号后同步个人记录。'},401);
  try{
    const u=new URL(request.url),cursor=u.searchParams.get('cursor')||'',at=u.searchParams.get('at'),since=u.searchParams.get('since');
    if(cursor.length>220)return json({error:'分页参数无效。'},400);
    const db=database(),[generation,rows]=await db.batch([
      db.prepare('SELECT COALESCE(MAX(sequence),0) AS generation FROM personal_mutations WHERE user_id=?').bind(user),
      db.prepare('SELECT record_key,value,revision,updated_at FROM personal_records WHERE user_id=? AND record_key>? ORDER BY record_key LIMIT 1001').bind(user,cursor),
    ]);
    const g=Number((generation.results[0] as any).generation);
    if(at!==null&&String(g)!==at)return json({restart:true,error:'记录已更新，请重新读取。'},409);
    if(!cursor&&since!==null&&String(g)===since)return json({owner:user,generation:g,unchanged:true});
    const records=rows.results.slice(0,1000).map(decode);
    return json({owner:user,generation:g,records,nextCursor:rows.results.length>1000?records.at(-1)!.key:null});
  }catch{return json({error:'云端记录暂时无法读取，本机待同步内容会保留。'},503);}
}
export async function POST(request:Request){
  const user=identity(request);if(!user)return json({error:'请登录后同步个人记录。'},401);
  if(!sameOrigin(request))return json({error:'请从当前私人站点操作。'},403);
  try{
    const body=await readJSON(request,256*1024);if('error'in body)return json({error:body.status===413?'个人记录内容过大，请分批保存。':body.error},body.status);
    if(body.data?.owner!==user)return json({accountMismatch:true,error:'登录账号已变化，请重新登录原账号后同步。'},403);
    let ops;try{ops=validatePersonalBatch(body.data);}catch(error){if(error instanceof PersonalFormatError)return json({error:error.message},422);throw error;}
    if(ops.some((op:any)=>op.key.startsWith('ledger/')))return json({error:'关联记账记录只能通过记账操作创建或撤销。'},422);
    const db=database(),results=[];
    for(const op of ops){
      if(op.key.startsWith('account/')){const receipt=await db.prepare('SELECT op_hash,result FROM personal_mutations WHERE user_id=? AND mutation_id=?').bind(user,op.id).first<any>();if(receipt){results.push(receipt.op_hash===await hashToken(stable(op))?{id:op.id,status:'ok',record:JSON.parse(receipt.result)}:{id:op.id,status:'rejected',error:'请求标识已使用。'});continue;}const referenced=await db.prepare("SELECT 1 FROM personal_records,json_each(personal_records.value,'$.effects') AS effect WHERE user_id=? AND record_key LIKE 'ledger/%' AND json_extract(effect.value,'$.id')=? LIMIT 1").bind(user,op.key.slice(8)).first();if(referenced){const current=await db.prepare('SELECT record_key,value,revision,updated_at FROM personal_records WHERE user_id=? AND record_key=?').bind(user,op.key).first<any>();const previous=current?.value?JSON.parse(current.value):null;if(op.value===null||!previous||op.value.balance!==previous.balance||op.value.type!==previous.type){results.push({id:op.id,status:'conflict',record:decode(current)});continue;}}}
      const hash=await hashToken(stable(op));let expected=op.baseRevision;
      if(op.after){
        const prior=await db.prepare('SELECT result,record_key FROM personal_mutations WHERE user_id=? AND mutation_id=?').bind(user,op.after).first<{result:string;record_key:string}>();
        if(!prior){results.push({id:op.id,status:'dependency'});continue;}
        if(prior.record_key!==op.key)return json({error:'记录依赖关系无效。'},422);
        expected=JSON.parse(prior.result).revision;
      }
      const now=new Date().toISOString(),value=op.value===null?null:stable(op.value);
      let write;
      if(op.delta===null){
        write=db.prepare(`INSERT INTO personal_records (user_id,record_key,value,revision,updated_at)
          SELECT ?,?,?,1,? WHERE (?=0 OR EXISTS(SELECT 1 FROM personal_records WHERE user_id=? AND record_key=?)) AND NOT EXISTS(SELECT 1 FROM personal_mutations WHERE user_id=? AND mutation_id=?)
          ON CONFLICT(user_id,record_key) DO UPDATE SET value=excluded.value,
          revision=CASE WHEN personal_records.value IS excluded.value THEN personal_records.revision ELSE personal_records.revision+1 END,
          updated_at=CASE WHEN personal_records.value IS excluded.value THEN personal_records.updated_at ELSE excluded.updated_at END
          WHERE (personal_records.revision=? OR personal_records.value IS excluded.value) AND NOT EXISTS(SELECT 1 FROM personal_mutations WHERE user_id=? AND mutation_id=?)`).bind(user,op.key,value,now,expected,user,op.key,user,op.id,expected,user,op.id);
      }else{
        const max=op.key.endsWith('/focus')?1440:10000;
        write=db.prepare(`INSERT INTO personal_records (user_id,record_key,value,revision,updated_at)
          SELECT ?,?,?,1,? WHERE NOT EXISTS(SELECT 1 FROM personal_mutations WHERE user_id=? AND mutation_id=?)
          ON CONFLICT(user_id,record_key) DO UPDATE SET value=CAST(COALESCE(CAST(personal_records.value AS REAL),0)+? AS TEXT),revision=personal_records.revision+1,updated_at=excluded.updated_at
          WHERE COALESCE(CAST(personal_records.value AS REAL),0)+?<=? AND NOT EXISTS(SELECT 1 FROM personal_mutations WHERE user_id=? AND mutation_id=?)`).bind(user,op.key,String(op.delta),now,user,op.id,op.delta,op.delta,max,user,op.id);
      }
      // The acknowledgement is inserted only when the preceding write succeeds.
      // batch is a transaction: a response can be lost without losing exactly-once
      // semantics, and a conflicting edit never replaces the other device's data.
      const out=await db.batch([
        write,
        db.prepare(`INSERT INTO personal_mutations (user_id,mutation_id,op_hash,record_key,result)
          SELECT ?,?,?,record_key,json_object('key',record_key,'value',json(value),'revision',revision,'updatedAt',updated_at)
          FROM personal_records WHERE user_id=? AND record_key=? AND changes()=1`).bind(user,op.id,hash,user,op.key),
        db.prepare('SELECT op_hash,result FROM personal_mutations WHERE user_id=? AND mutation_id=?').bind(user,op.id),
        db.prepare('SELECT record_key,value,revision,updated_at FROM personal_records WHERE user_id=? AND record_key=?').bind(user,op.key),
      ]);
      const receipt=out[2].results[0] as any;
      if(receipt){if(receipt.op_hash!==hash)results.push({id:op.id,status:'rejected',error:'请求标识已使用，请刷新页面。'});else results.push({id:op.id,status:'ok',record:JSON.parse(receipt.result)});}
      else results.push({id:op.id,status:'conflict',record:out[3].results.length?decode(out[3].results[0]):{key:op.key,value:null,revision:0,updatedAt:null}});
    }
    return json({owner:user,results});
  }catch{return json({error:'云端暂时无法确认保存，本机待同步内容会保留并重试。'},503);}
}
