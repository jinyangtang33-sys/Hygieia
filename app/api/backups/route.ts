import {snapshot,prune,jobSelect} from '../../../lib/backup-store';
import {database,identity,json,sameOrigin,hashToken,readJSON} from '../../../lib/health-api';
import {validateBackup,BACKUP_LIMIT} from '../../../lib/backup-format.mjs';
import {stable} from '../../../lib/personal-format.mjs';
const validId=(v:any)=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(v);
const generation='COALESCE((SELECT MAX(sequence) FROM personal_mutations WHERE user_id=?),0)';
const healthRevision='COALESCE((SELECT health_revision FROM health_connections WHERE user_id=?),0)';
export async function GET(request:Request){
  const user=identity(request);if(!user)return json({error:'请先登录你的个人空间。'},401);
  try{
    const db=database(),id=new URL(request.url).searchParams.get('id');
    if(id!==null){if(!validId(id))return json({error:'备份标识无效。'},400);const row=await db.prepare('SELECT payload FROM data_backups WHERE user_id=? AND id=?').bind(user,id).first<{payload:string}>();if(!row)return json({error:'备份不存在，或已超出最近 20 份保留范围。'},404);return json(JSON.parse(row.payload));}
    const [list,version,scheduled]=await db.batch([
      db.prepare("SELECT id,reason,created_at AS createdAt,json_array_length(payload,'$.personal') AS personalCount,json_array_length(payload,'$.health') AS healthCount,length(CAST(payload AS BLOB)) AS bytes FROM data_backups WHERE user_id=? ORDER BY created_at DESC,id DESC LIMIT 20").bind(user),
      db.prepare(`SELECT ${generation} AS personal,${healthRevision} AS health,(SELECT count(*) FROM personal_records WHERE user_id=? AND value IS NOT NULL) AS personalCount,(SELECT count(*) FROM health_daily WHERE user_id=?) AS healthCount`).bind(user,user,user,user),
      db.prepare(jobSelect).bind(user),
    ]);
    return json({owner:user,backups:list.results,revision:version.results[0],scheduled:scheduled.results[0]||null});
  }catch{return json({error:'备份服务暂时不可用，请稍后重试。'},503);}
}
export async function POST(request:Request){
  const user=identity(request);if(!user)return json({error:'请先登录你的个人空间。'},401);
  if(!sameOrigin(request))return json({error:'请从当前私人站点操作。'},403);
  const body=await readJSON(request,BACKUP_LIMIT+10000);if('error'in body)return json({error:'请求内容无效或超过 1.5 MB。'},body.status);
  const b=body.data;if(b?.owner!==user)return json({error:'账号已变化，请刷新页面。'},403);
  try{
    const db=database(),now=new Date().toISOString();
    if(b.action==='schedule-enable'||b.action==='schedule-disable'){const enabled=b.action==='schedule-enable'?1:0;await db.prepare('INSERT INTO backup_jobs(user_id,enabled,last_status) VALUES (?,?,?) ON CONFLICT(user_id) DO UPDATE SET enabled=excluded.enabled').bind(user,enabled,'waiting').run();return json({ok:true,scheduled:await db.prepare(jobSelect).bind(user).first()});}
    if(b.action==='create'){
      const daily=b.reason==='daily',date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
      const id=daily?'daily-'+date:crypto.randomUUID();
      await db.batch([snapshot(db,user,id,daily?'daily':'manual',now,'NOT EXISTS(SELECT 1 FROM data_backups WHERE user_id=? AND id=?) AND (EXISTS(SELECT 1 FROM personal_records WHERE user_id=? AND value IS NOT NULL) OR EXISTS(SELECT 1 FROM health_daily WHERE user_id=?))',[user,id,user,user]),prune(db,user)]);
      const exists=await db.prepare('SELECT id FROM data_backups WHERE user_id=? AND id=?').bind(user,id).first();
      return json({ok:true,id:exists?id:null,empty:!exists});
    }
    if(!['restore','clear-personal','clear-health'].includes(b.action)||!validId(b.id)||b.id.length>80||!Number.isSafeInteger(b.expected?.personal)||!Number.isSafeInteger(b.expected?.health))return json({error:'操作参数无效，请重新预览。'},422);
    let backup:any=null;
    if(b.action==='restore'){
      if(b.snapshotId){if(!validId(b.snapshotId))return json({error:'备份标识无效。'},422);}
      else try{backup=validateBackup(b.backup);}catch(e){return json({error:(e as Error).message},422);}
      if(!['merge','replace'].includes(b.mode))return json({error:'请选择恢复方式。'},422);
    }
    if(b.action==='clear-personal'&&b.confirm!=='清空手动记录'||b.action==='clear-health'&&b.confirm!=='删除健康汇总')return json({error:'请完整输入确认文字。'},422);
    const hash=await hashToken(stable({action:b.action,expected:b.expected,backup,snapshotId:b.snapshotId||null,mode:b.mode||null,includeHealth:b.includeHealth===true}));
    const prior=await db.prepare('SELECT op_hash,completed,backup_id FROM data_actions WHERE user_id=? AND id=?').bind(user,b.id).first<{op_hash:string;completed:number;backup_id:string}>();
    if(prior){if(prior.op_hash!==hash)return json({error:'操作标识已使用，请重新预览。'},409);if(prior.completed)return json({ok:true,backupId:prior.backup_id,replayed:true});}
    if(b.action==='restore'&&b.snapshotId){
      const row=await db.prepare('SELECT payload FROM data_backups WHERE user_id=? AND id=?').bind(user,b.snapshotId).first<{payload:string}>();
      if(!row)return json({error:'该恢复点已不存在，请刷新列表。'},404);
      try{backup=validateBackup(JSON.parse(row.payload));}catch{return json({error:'恢复点格式无效，请下载后联系维护者。'},422);}
    }
    if(b.action==='restore'&&b.mode==='merge'){const linked=await db.prepare("SELECT 1 FROM personal_records WHERE user_id=? AND record_key LIKE 'ledger/%' AND value IS NOT NULL LIMIT 1").bind(user).first();if(linked||backup.personal.some((r:any)=>r.key.startsWith('ledger/')))return json({error:'关联记账需要完整替换手动记录，以保持余额和流水一致。'},422);}
    const before='before-'+b.id,guard='EXISTS(SELECT 1 FROM data_actions WHERE user_id=? AND id=? AND completed=0)',args=[user,b.id];
    const statements=[
      db.prepare(`INSERT INTO data_actions (user_id,id,op_hash,backup_id,created_at) SELECT ?,?,?,?,? WHERE ${generation}=? AND ${healthRevision}=? ON CONFLICT(user_id,id) DO NOTHING`).bind(user,b.id,hash,before,now,user,b.expected.personal,user,b.expected.health),
      snapshot(db,user,before,b.action,now,guard,args),
    ];
    const restored=backup?.personal?[...backup.personal]:[];
    if(b.action==='restore'&&b.mode==='replace')for(const [key,value] of Object.entries({name:'我的空间',waterGoal:2000,stepsGoal:8000,sleepGoal:8}))if(!restored.some(r=>r.key==='settings/'+key))restored.push({key:'settings/'+key,value});
    const personal=JSON.stringify(restored),health=JSON.stringify(backup?.health||[]);
    if(b.action==='clear-personal'||b.action==='restore'&&b.mode==='replace')statements.push(db.prepare(`UPDATE personal_records SET value=NULL,revision=revision+1,updated_at=? WHERE user_id=? AND value IS NOT NULL AND record_key NOT LIKE 'settings/%' AND ${guard}`).bind(now,user,...args));
    if(b.action==='restore')statements.push(db.prepare(`INSERT INTO personal_records (user_id,record_key,value,revision,updated_at)
      SELECT ?,json_extract(value,'$.key'),value->'$.value',1,? FROM json_each(?) WHERE ${guard}
      ON CONFLICT(user_id,record_key) DO UPDATE SET value=excluded.value,revision=personal_records.revision+1,updated_at=excluded.updated_at ${b.mode==='merge'?'WHERE personal_records.value IS NULL':''}`).bind(user,now,personal,...args));
    if(b.action==='restore'||b.action==='clear-personal')statements.push(db.prepare(`INSERT INTO personal_mutations (user_id,mutation_id,op_hash,record_key,result) SELECT ?,?,?,?,'{}' WHERE ${guard}`).bind(user,'data-'+b.id,hash,'system/data-action',...args));
    if(b.action==='clear-health'){
      statements.push(db.prepare(`DELETE FROM health_daily WHERE user_id=? AND ${guard}`).bind(user,...args));
      statements.push(db.prepare(`UPDATE health_connections SET token_hash=NULL,bridge_seen_at=NULL,bridge_status=NULL,last_sync=NULL,last_records=0,last_metrics=NULL,last_error=NULL,health_revision=health_revision+1 WHERE user_id=? AND ${guard}`).bind(user,...args));
    }
    if(b.action==='restore'&&b.includeHealth){
      statements.push(db.prepare(`INSERT INTO health_daily (user_id,date,metric,value,updated_at) SELECT ?,json_extract(value,'$.date'),json_extract(value,'$.metric'),value->'$.value',? FROM json_each(?) WHERE ${guard} ON CONFLICT(user_id,date,metric) DO NOTHING`).bind(user,now,health,...args));
      statements.push(db.prepare(`INSERT INTO health_connections (user_id,created_at,health_revision) SELECT ?,?,1 WHERE ${guard} ON CONFLICT(user_id) DO UPDATE SET health_revision=health_revision+1`).bind(user,now,...args));
    }
    statements.push(db.prepare(`UPDATE data_actions SET completed=1 WHERE user_id=? AND id=? AND completed=0`).bind(user,b.id),prune(db,user));
    const result=await db.batch(statements);
    if(!result[0].meta.changes){const done=await db.prepare('SELECT op_hash,completed,backup_id FROM data_actions WHERE user_id=? AND id=?').bind(user,b.id).first<{op_hash:string;completed:number;backup_id:string}>();if(done?.completed&&done.op_hash===hash)return json({ok:true,backupId:done.backup_id,replayed:true});return json({error:'其他设备或健康中转刚刚更新了数据，请重新预览后再操作。',changed:true},409);}
    return json({ok:true,backupId:before});
  }catch{return json({error:'操作未完成，当前数据未改变。请重试；超过 1.5 MB 的恢复点需要分批处理。'},503);}
}
