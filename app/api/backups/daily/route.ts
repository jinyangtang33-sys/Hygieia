import {database,json,readJSON} from '../../../../lib/health-api';
import {runDailyBackups} from '../../../../lib/backup-store';
// This shared writer relies on Sites' owner-private dispatch boundary. Service
// access is consumed at dispatch and carries no visitor identity. It can only
// snapshot jobs explicitly enrolled by an authenticated owner, never restore,
// clear, select an arbitrary user, or return any saved personal/health content.
export async function POST(request:Request){
  if(request.headers.has('origin'))return json({error:'请通过私人站点后台任务运行备份。'},403);
  const body=await readJSON(request,100);if('error'in body||!body.data||typeof body.data!=='object'||Array.isArray(body.data)||Object.keys(body.data).length)return json({error:'后台备份不接受记录、账号或日期参数。'},422);
  try{const result=await runDailyBackups(database());return json(result,result.ok?200:503);}catch{return json({error:'后台备份未完成，请重试并检查执行状态。'},503);}
}
export async function GET(){
  try{const db=database(),rows=await db.prepare(`SELECT last_status AS status,last_run_day AS day,last_attempt AS lastAttempt,last_success AS lastSuccess,EXISTS(SELECT 1 FROM data_backups WHERE user_id=backup_jobs.user_id AND id=backup_jobs.last_backup_id) AS hasRecoveryPoint FROM backup_jobs WHERE enabled=1`).all();return json({enabledJobs:rows.results.length,results:rows.results});}catch{return json({error:'后台备份状态暂时不可用。'},503);}
}
