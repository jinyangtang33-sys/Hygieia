import {fitnessModel} from './fitness-format.mjs';
import {validatePersonalValue,stable} from './personal-format.mjs';
export const BACKUP_LIMIT=1500000;
const fail=()=>{throw new Error('备份内容无效，请选择观己导出的完整备份。');};
const groups={coreSleep:'sleep',deepSleep:'sleep',remSleep:'sleep',sleepStart:'sleep',sleepEnd:'sleep',heartRateMin:'heartRate',heartRateMax:'heartRate'};
const metrics=new Set(['steps','sleep','exercise','activeEnergy','restingHeartRate','heartRate','hrv','respiratoryRate','weight','water','fitness']);
export function validateBackup(value){
  if(!value||value.format!=='selfspace-backup'||value.version!==2||!Array.isArray(value.personal)||!Array.isArray(value.health)||value.personal.length>50000||value.health.length>50000)fail();
  const seen=new Set(),personal=value.personal.map(r=>{if(!r||r.value===null||r.value===undefined||seen.has(r.key))fail();validatePersonalValue(r.key,r.value);seen.add(r.key);return {key:r.key,value:r.value};});
  seen.clear();const health=value.health.map(r=>{
    if(!r||!metrics.has(r.metric)||typeof r.date!=='string'||!r.value||typeof r.value!=='object'||Array.isArray(r.value)||!Object.keys(r.value).length)fail();
    if(seen.has(r.date+'/'+r.metric))fail();seen.add(r.date+'/'+r.metric);
    if(r.metric==='fitness'){if(Object.keys(r.value).length!==1||!fitnessModel.valid(r.value.fitness,r.date))fail();return {date:r.date,metric:r.metric,value:r.value};}
    for(const [key,v]of Object.entries(r.value)){if((groups[key]||key)!==r.metric||v===null)fail();validatePersonalValue('day/'+r.date+'/health/'+key,v);}
    return {date:r.date,metric:r.metric,value:r.value};
  });
  const assets=new Set(personal.filter(r=>r.key.startsWith('account/')).map(r=>r.key.slice(8))),ledger=personal.filter(r=>r.key.startsWith('ledger/')).map(r=>r.value),ids=new Set(ledger.map(e=>e.id)),reversals=new Set();
  for(const e of ledger){if(e.effects.some(a=>!assets.has(a.id)))fail();if(e.originalId){if(!ids.has(e.originalId)||reversals.has(e.originalId)||ledger.find(x=>x.id===e.originalId)?.type==='撤销')fail();reversals.add(e.originalId);}}
  const backup={format:'selfspace-backup',version:2,createdAt:typeof value.createdAt==='string'?value.createdAt:null,personal,health};
  if(new TextEncoder().encode(stable(backup)).length>BACKUP_LIMIT)throw new Error('备份超过 1.5 MB，请保留下载文件并联系维护者分批恢复。');
  return backup;
}
