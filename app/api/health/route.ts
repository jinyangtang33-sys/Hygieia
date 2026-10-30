import {database,identity,json} from '../../../lib/health-api';

export async function GET(request:Request){
  const user=identity(request);if(!user)return json({error:'请先登录你的个人空间。'},401);
  try{
    const db=database();
    const [connection,result]=await Promise.all([
      db.prepare('SELECT token_hash IS NOT NULL AS enabled, last_sync, last_error, last_records, last_metrics, bridge_seen_at, bridge_status FROM health_connections WHERE user_id = ?').bind(user).first(),
      db.prepare('SELECT date,metric,value,updated_at FROM health_daily WHERE user_id = ? ORDER BY date ASC').bind(user).all<{date:string;metric:string;value:string;updated_at:string}>(),
    ]);
    const days:Record<string,object>={};
    for(const row of result.results){const d:any=(days[row.date] ||= {health:{},apple:{source:'Apple 健康',updatedAt:row.updated_at,metrics:[]}});if(row.metric==='fitness')Object.assign(d,JSON.parse(row.value));else Object.assign(d.health,JSON.parse(row.value));d.apple.metrics.push(row.metric);if(row.updated_at>d.apple.updatedAt)d.apple.updatedAt=row.updated_at;}
    return json({days,connection:connection?{enabled:!!connection.enabled,lastSync:connection.last_sync,bridgeSeenAt:connection.bridge_seen_at,bridge:connection.bridge_status?JSON.parse(String(connection.bridge_status)):null,lastError:connection.last_error,lastRecords:connection.last_records,lastMetrics:connection.last_metrics?JSON.parse(String(connection.last_metrics)):[]}:null});
  }catch{return json({error:'健康同步服务暂时不可用，请稍后重试。本地记录不受影响。'},503);}
}
