import {BACKUP_LIMIT} from './backup-format.mjs';
export function snapshot(db:any,user:string,id:string,reason:string,now:string,guard='1',guardArgs:any[]=[]){
  return db.prepare(`INSERT INTO data_backups (user_id,id,reason,created_at,payload)
    SELECT ?,?,?,?,CASE WHEN length(CAST(payload AS BLOB))<=${BACKUP_LIMIT} THEN payload ELSE NULL END FROM (
      SELECT json_object('format','selfspace-backup','version',2,'createdAt',?,
      'personal',json((SELECT COALESCE(json_group_array(json_object('key',record_key,'value',json(value))),'[]') FROM personal_records WHERE user_id=? AND value IS NOT NULL)),
      'health',json((SELECT COALESCE(json_group_array(json_object('date',date,'metric',metric,'value',json(value))),'[]') FROM health_daily WHERE user_id=?))) AS payload
    ) WHERE ${guard}`).bind(user,id,reason,now,now,user,user,...guardArgs);
}
export function prune(db:any,user:string,guard='1',args:any[]=[]){return db.prepare(`DELETE FROM data_backups WHERE user_id=? AND id NOT IN (SELECT id FROM data_backups WHERE user_id=? ORDER BY created_at DESC,id DESC LIMIT 20) AND ${guard}`).bind(user,user,...args);}
export const jobSelect=`SELECT enabled,last_attempt AS lastAttempt,last_success AS lastSuccess,last_error AS lastError,last_status AS lastStatus,last_run_day AS lastRunDay,last_backup_id AS lastBackupId FROM backup_jobs WHERE user_id=?`;
export async function runDailyBackups(db:any,now=new Date().toISOString()){
  const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now)),id='scheduled-'+day,cutoff=new Date(Date.parse(now)-300000).toISOString();
  const jobs=await db.prepare('SELECT user_id FROM backup_jobs WHERE enabled=1').all(),results=[];
  for(const job of jobs.results){
    const user=job.user_id,run=crypto.randomUUID(),guard='EXISTS(SELECT 1 FROM backup_jobs WHERE user_id=? AND enabled=1 AND run_id=?)',args=[user,run];
    try{
      await db.batch([
        db.prepare(`UPDATE backup_jobs SET last_attempt=?,last_status='running',last_error=NULL,run_id=? WHERE user_id=? AND enabled=1 AND (last_run_day IS NULL OR last_run_day<>? OR last_status NOT IN ('success','empty')) AND (last_status<>'running' OR last_attempt<?)`).bind(now,run,user,day,cutoff),
        snapshot(db,user,id,'scheduled',now,`${guard} AND NOT EXISTS(SELECT 1 FROM data_backups WHERE user_id=? AND id=?) AND (EXISTS(SELECT 1 FROM personal_records WHERE user_id=? AND value IS NOT NULL) OR EXISTS(SELECT 1 FROM health_daily WHERE user_id=?))`,[...args,user,id,user,user]),
        db.prepare(`UPDATE backup_jobs SET last_run_day=?,last_status=CASE WHEN EXISTS(SELECT 1 FROM data_backups WHERE user_id=? AND id=?) THEN 'success' ELSE 'empty' END,last_success=CASE WHEN EXISTS(SELECT 1 FROM data_backups WHERE user_id=? AND id=?) THEN (SELECT created_at FROM data_backups WHERE user_id=? AND id=?) ELSE last_success END,last_backup_id=CASE WHEN EXISTS(SELECT 1 FROM data_backups WHERE user_id=? AND id=?) THEN ? ELSE last_backup_id END WHERE user_id=? AND run_id=? AND enabled=1`).bind(day,user,id,user,id,user,id,user,id,id,user,run),
        prune(db,user,guard,args),
      ]);
    }catch{
      // Snapshot size or write failures roll the entire transaction back. Record
      // a separate failure without replacing a concurrent successful result.
      await db.prepare(`UPDATE backup_jobs SET last_attempt=?,last_status='failed',last_run_day=?,last_error=? WHERE user_id=? AND enabled=1 AND (last_attempt IS NULL OR last_attempt<?)`).bind(now,day,'恢复点保存失败，可能超过 1.5 MB。请下载应急副本并检查备份服务。',user,now).run();
    }
    const status=await db.prepare(jobSelect).bind(user).first();
    results.push({status:status?.lastStatus||'unknown',day:status?.lastRunDay,lastAttempt:status?.lastAttempt,lastSuccess:status?.lastSuccess});
  }
  return {ok:results.every(r=>['success','empty'].includes(r.status)),day,enabledJobs:jobs.results.length,results};
}
