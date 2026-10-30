import {database,json,readJSON} from '../../../../lib/health-api';
// One-time setup for this owner-private Site. Sites service authorization is
// checked at dispatch. Never infer an owner when more than one data scope exists,
// never accept a user ID, and never override an existing owner's paused setting.
const scopes="SELECT user_id FROM personal_records WHERE value IS NOT NULL UNION SELECT user_id FROM health_daily";
export async function POST(request:Request){
 if(request.headers.has('origin'))return json({error:'请通过私人站点后台完成首次配置。'},403);
 const body=await readJSON(request,100);if('error'in body||!body.data||typeof body.data!=='object'||Array.isArray(body.data)||Object.keys(body.data).length)return json({error:'首次配置不接受账号、记录或其他参数。'},422);
 try{
  const db=database();
  const result=await db.batch([
   db.prepare(`INSERT INTO backup_jobs(user_id,enabled,last_status) SELECT user_id,1,'waiting' FROM (${scopes}) WHERE (SELECT count(*) FROM (${scopes}))=1 ON CONFLICT(user_id) DO NOTHING`),
   db.prepare(`SELECT count(*) AS scopes FROM (${scopes})`),
   db.prepare(`SELECT enabled FROM backup_jobs WHERE user_id IN (${scopes})`),
  ]);
  if(Number((result[1].results[0] as any).scopes)!==1)return json({error:'无法唯一确定数据空间，请在登录后的偏好设置中开启后台备份。',needsOwnerEnrollment:true},409);
  const enabled=!!(result[2].results[0] as any)?.enabled;
  return json({ok:true,enabled,enrolled:result[0].meta.changes===1,paused:!enabled});
 }catch{return json({error:'首次配置未完成，请重试或在偏好设置中开启。'},503);}
}
