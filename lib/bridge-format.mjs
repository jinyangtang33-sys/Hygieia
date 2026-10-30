import {fitnessModel} from './fitness-format.mjs';
export class BridgeFormatError extends Error {}
const bounds={steps:100000,sleep:24,coreSleep:24,deepSleep:24,remSleep:24,exercise:1440,activeEnergy:20000,restingHeartRate:300,heartRate:300,hrv:2000,respiratoryRate:100,weight:500,water:10000};
const groups={coreSleep:'sleep',deepSleep:'sleep',remSleep:'sleep',sleepStart:'sleep',sleepEnd:'sleep'};
export function parseBridgeSnapshot(body,today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())){
  const fail=()=>{throw new BridgeFormatError('Mac 中转数据格式不正确，请更新中转程序后重试。');};
  if(!body||body.source!=='puls'||!Array.isArray(body.days)||!body.days.length||body.days.length>25)fail();
  const dates=[],rows=[],seen=new Set();
  for(const d of body.days){
    if(!d||typeof d.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(d.date)||d.date<'2000-01-01'||d.date>today||seen.has(d.date))fail();
    const dt=new Date(d.date+'T12:00:00Z');if(Number.isNaN(+dt)||dt.toISOString().slice(0,10)!==d.date)fail();
    if(!d.health||typeof d.health!=='object'||Array.isArray(d.health))fail();
    dates.push(d.date);seen.add(d.date);const metrics={};
    for(const [key,value]of Object.entries(d.health)){
      if(Object.hasOwn(bounds,key)){if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>bounds[key])fail();}
      else if(['sleepStart','sleepEnd'].includes(key)){if(typeof value!=='string'||value.length>64||Number.isNaN(Date.parse(value)))fail();}
      else fail();
      const metric=groups[key]||key;(metrics[metric]||={})[key]=value;
    }
    if(Object.keys(metrics.sleep||{}).length&&d.health.sleep===undefined)fail();
    for(const [metric,value]of Object.entries(metrics))rows.push({date:d.date,metric,value});
    if(Object.hasOwn(d,'fitness')){if(!fitnessModel.valid(d.fitness,d.date))fail();if(d.fitness.rings!==null||d.fitness.workouts.length)rows.push({date:d.date,metric:'fitness',value:{fitness:d.fitness}});}
  }
  return {dates,rows,metrics:[...new Set(rows.map(r=>r.metric))]};
}
