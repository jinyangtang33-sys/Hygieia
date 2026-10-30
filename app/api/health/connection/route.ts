import {env} from 'cloudflare:workers';
import {database,identity,json,sameOrigin,hashToken} from '../../../../lib/health-api';

export async function POST(request:Request){
  const user=identity(request);if(!user)return json({error:'请先登录你的个人空间。'},401);
  if(!sameOrigin(request))return json({error:'请从当前站点的设置页面操作。'},403);
  if(!env.HEALTH_SYNC_SERVICE_TOKEN)return json({error:'服务连接尚未完成配置，请稍后重试。'},503);
  try{
    const token=`hax_${Array.from(crypto.getRandomValues(new Uint8Array(32)),v=>v.toString(16).padStart(2,'0')).join('')}`;
    const hash=await hashToken(token),now=new Date().toISOString();
    await database().prepare('INSERT INTO health_connections (user_id,token_hash,created_at) VALUES (?,?,?) ON CONFLICT(user_id) DO UPDATE SET token_hash=excluded.token_hash, created_at=excluded.created_at, last_error=NULL, bridge_seen_at=NULL, bridge_status=NULL').bind(user,hash,now).run();
    // Configuration is returned once, only to an authenticated same-origin
    // owner request. Tokens are never embedded in source, URLs or localStorage.
    return json({bridgeUrl:new URL('/api/health/bridge',request.url).href,url:new URL('/api/health/ingest',request.url).href,headers:[{key:'OAI-Sites-Authorization',value:`Bearer ${env.HEALTH_SYNC_SERVICE_TOKEN}`},{key:'Authorization',value:`Bearer ${token}`}],format:'JSON',version:2,summarize:true,grouping:'Days',period:'Default'});
  }catch{return json({error:'连接配置生成失败，请稍后重试。'},503);}
}
export async function DELETE(request:Request){
  const user=identity(request);if(!user)return json({error:'请先登录你的个人空间。'},401);
  if(!sameOrigin(request))return json({error:'请从当前站点的设置页面操作。'},403);
  try{await database().prepare('UPDATE health_connections SET token_hash=NULL WHERE user_id=?').bind(user).run();return json({ok:true});}catch{return json({error:'断开失败，请重试。'},503);}
}
