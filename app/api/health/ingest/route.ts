import {database,json,hashToken,readJSON} from '../../../../lib/health-api';
import {parseHealthExport,HealthFormatError} from '../../../../lib/health-format.mjs';

export async function POST(request:Request){
  const token=request.headers.get('authorization')?.replace(/^Bearer /i,'')||'';
  if(!/^hax_[a-f0-9]{64}$/.test(token))return json({error:'同步密钥缺失或无效，请检查 HTTP Headers。'},401);
  try{
    const db=database(),hash=await hashToken(token);
    const connection=await db.prepare('SELECT user_id FROM health_connections WHERE token_hash=?').bind(hash).first<{user_id:string}>();
    if(!connection)return json({error:'连接已断开或密钥已失效，请重新生成连接配置。'},401);
    const user=connection.user_id;
    const reject=async(error:string,status:number)=>{await db.prepare('UPDATE health_connections SET last_error=? WHERE user_id=? AND token_hash=?').bind(error,user,hash).run();return json({error},status);};
    if(/since.*last/i.test(request.headers.get('automation-period')||''))return reject('请将 Date Range 设置为 Default，避免把增量片段当成完整日汇总。',422);
    const body=await readJSON(request);if('error'in body)return reject(body.error!,body.status!);
    let parsed;
    try{parsed=parseHealthExport(body.data,request.headers.get('automation-aggregation'));}
    catch(error){if(error instanceof HealthFormatError)return reject(error.message,422);throw error;}
    const now=new Date().toISOString();
    // Each request is a transaction. No partial uploads are committed, and
    // a rotation/disconnect that races an upload prevents writes via EXISTS.
    const statements=parsed.rows.map((r:any)=>db.prepare('INSERT INTO health_daily (user_id,date,metric,value,updated_at) SELECT ?,?,?,?,? WHERE EXISTS (SELECT 1 FROM health_connections WHERE user_id=? AND token_hash=?) ON CONFLICT(user_id,date,metric) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at WHERE health_daily.value<>excluded.value').bind(user,r.date,r.metric,JSON.stringify(r.value),now,user,hash));
    statements.push(db.prepare('UPDATE health_connections SET health_revision=health_revision+1,last_sync=?,last_error=NULL,last_records=?,last_metrics=? WHERE user_id=? AND token_hash=?').bind(now,parsed.rows.length,JSON.stringify(parsed.metrics),user,hash));
    const results=await db.batch(statements);
    if(!results.at(-1)?.meta.changes)return json({error:'连接已在上传期间暂停，请检查连接状态。'},401);
    return json({ok:true,records:parsed.rows.length,days:new Set(parsed.rows.map((r:any)=>r.date)).size,metrics:parsed.metrics,ignored:parsed.ignored,receivedAt:now});
  }catch{return json({error:'健康同步服务暂时不可用，数据尚未确认保存，请稍后重试。'},503);}
}
