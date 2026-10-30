import {database,json,hashToken,readJSON} from '../../../../lib/health-api';
import {parseBridgeSnapshot,BridgeFormatError} from '../../../../lib/bridge-format.mjs';

export async function POST(request:Request){
  const token=request.headers.get('authorization')?.replace(/^Bearer /i,'')||'';
  if(!/^hax_[a-f0-9]{64}$/.test(token))return json({error:'Mac 中转连接无效，请重新配对。'},401);
  try{
    const db=database(),hash=await hashToken(token);
    const connection=await db.prepare('SELECT user_id FROM health_connections WHERE token_hash=?').bind(hash).first<{user_id:string}>();
    if(!connection)return json({error:'连接已暂停或密钥已更换，请重新配对。'},401);
    const user=connection.user_id;
    const body=await readJSON(request);if('error'in body)return json({error:body.error},body.status);
    let parsed;try{parsed=parseBridgeSnapshot(body.data);}catch(error){if(error instanceof BridgeFormatError)return json({error:error.message},422);throw error;}
    const now=new Date().toISOString();
    // A full projection of each named day replaces its old projection, including
    // empty days after HealthKit deletions. Every statement checks revocation.
    const statements=parsed.dates.map((date:string)=>db.prepare("DELETE FROM health_daily WHERE user_id=? AND date=? AND (metric<>'fitness' OR ?=1) AND EXISTS (SELECT 1 FROM health_connections WHERE user_id=? AND token_hash=?)").bind(user,date,body.data.days.some((d:any)=>d.date===date&&Object.hasOwn(d,'fitness'))?1:0,user,hash));
    for(const r of parsed.rows)statements.push(db.prepare('INSERT INTO health_daily (user_id,date,metric,value,updated_at) SELECT ?,?,?,?,? WHERE EXISTS (SELECT 1 FROM health_connections WHERE user_id=? AND token_hash=?)').bind(user,r.date,r.metric,JSON.stringify(r.value),now,user,hash));
    statements.push(db.prepare('UPDATE health_connections SET health_revision=health_revision+1,last_sync=?,last_error=NULL,last_records=?,last_metrics=? WHERE user_id=? AND token_hash=?').bind(now,parsed.rows.length,JSON.stringify(parsed.metrics),user,hash));
    const results=await db.batch(statements);
    if(!results.at(-1)?.meta.changes)return json({error:'连接已暂停，请重新配对。'},401);
    return json({ok:true,records:parsed.rows.length,days:parsed.dates.length,receivedAt:now});
  }catch{return json({error:'网站暂时无法保存，Mac 将保留数据并稍后重试。'},503);}
}
