import {database,json,hashToken,readJSON} from '../../../../lib/health-api';
import {parseBridgeStatus} from '../../../../lib/bridge-status.mjs';

export async function POST(request:Request){
  const token=request.headers.get('authorization')?.replace(/^Bearer /i,'')||'';
  if(!/^hax_[a-f0-9]{64}$/.test(token))return json({error:'连接无效。'},401);
  try{
    const db=database(),hash=await hashToken(token);
    if(!await db.prepare('SELECT user_id FROM health_connections WHERE token_hash=?').bind(hash).first())return json({error:'连接已暂停或密钥已更换。'},401);
    const body=await readJSON(request,4096);if('error'in body)return json({error:body.error},body.status);
    let status;try{status=parseBridgeStatus(body.data);}catch{return json({error:'中转状态格式无效。'},422);}
    const now=new Date().toISOString();
    const result=await db.prepare('UPDATE health_connections SET bridge_seen_at=?,bridge_status=? WHERE token_hash=?').bind(now,JSON.stringify(status),hash).run();
    if(!result.meta.changes)return json({error:'连接已暂停。'},401);
    return json({ok:true,receivedAt:now});
  }catch{return json({error:'状态暂未保存，中转稍后重试。'},503);}
}
