import {checklistModel} from './checklist-format.mjs';
import {mediaTopicModel} from './media-topic-format.mjs';
import {bodyModel} from './body-format.mjs';
import {validMedia,validMediaProfile} from './media-format.mjs';
import {validLedger} from './ledger-format.mjs';
export class PersonalFormatError extends Error {}
const fail=()=>{throw new PersonalFormatError('记录格式无效，请检查内容或更新页面后重试。');};
const obj=v=>v&&typeof v==='object'&&!Array.isArray(v);
const str=(v,n)=>typeof v==='string'&&v.length<=n;
const num=(v,n,min=0)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=n;
const health={sleep:24,weight:500,steps:100000,water:10000,exercise:1440,activeEnergy:20000,restingHeartRate:300,heartRate:300,heartRateMin:300,heartRateMax:300,hrv:2000,respiratoryRate:100,coreSleep:24,deepSleep:24,remSleep:24};
const id=v=>typeof v==='string'&&/^[a-zA-Z0-9_.:-]{1,100}$/.test(v);
export const stable=value=>JSON.stringify(value===null?null:canonical(value));
function canonical(v){if(Array.isArray(v))return v.map(canonical);if(obj(v))return Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])]));return v;}
export function validatePersonalValue(key,value){
  if(typeof key!=='string'||key.length>220)fail();
  const parts=key.split('/');let valid=false,kind='';
  if(parts[0]==='settings'&&parts.length===2){kind=parts[1];valid=['name','waterGoal','stepsGoal','sleepGoal'].includes(kind);}
  else if(['todo','account','transaction','ledger','media','media-profile','media-topic','body-report'].includes(parts[0])&&parts.length===2&&id(parts[1])){kind=parts[0];valid=true;}
  else if(parts[0]==='review'&&parts.length===3){const date=parts[1],dt=new Date(date+'T12:00:00Z');kind='review';valid=/^\d{4}-\d{2}-\d{2}$/.test(date)&&!Number.isNaN(+dt)&&dt.toISOString().slice(0,10)===date&&dt.getUTCDay()===1&&date>='2000-01-01'&&['wins','challenge','plan'].includes(parts[2]);}
  else if(parts[0]==='day'&&parts.length>=3){
    const date=parts[1],dt=new Date(date+'T12:00:00Z');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(+dt)||dt.toISOString().slice(0,10)!==date||date<'2000-01-01'||date>'9999-12-31')fail();
    kind=parts[2];
    valid=(parts.length===3&&['journal','mood','focus'].includes(kind))||(parts.length===4&&((kind==='health'&&(Object.hasOwn(health,parts[3])||['sleepStart','sleepEnd'].includes(parts[3])))||(kind==='meal'&&['breakfast','lunch','dinner'].includes(parts[3]))||(kind==='task'&&id(parts[3]))));
  }
  if(!valid)fail();if(value===null)return;
  if(kind==='name'){if(!str(value,30)||!value.trim())fail();}
  else if(['waterGoal','stepsGoal','sleepGoal'].includes(kind)){const c={waterGoal:[10000,250],stepsGoal:[100000,100],sleepGoal:[24,1]}[kind];if(!num(value,...c))fail();}
  else if(kind==='review'){if(!str(value,5000))fail();}
  else if(kind==='journal'){if(!str(value,10000))fail();}
  else if(kind==='mood'){if(!Number.isInteger(value)||value<1||value>5)fail();}
  else if(kind==='focus'){if(!num(value,1440))fail();}
  else if(kind==='health'){if(['sleepStart','sleepEnd'].includes(parts[3])){if(!str(value,64)||Number.isNaN(Date.parse(value)))fail();}else if(!num(value,health[parts[3]]))fail();}
  else if(kind==='meal'){if(!obj(value)||!str(value.name,160)||!value.name.trim()||!str(value.note,1000)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(value.time)||(value.calories!==null&&!num(value.calories,10000))||Object.keys(value).some(k=>!['name','note','time','calories'].includes(k)))fail();}
  else if(kind==='task'){if(!obj(value)||value.id!==parts[3]||!str(value.title,160)||!value.title.trim()||!['工作','学习','生活'].includes(value.tag)||typeof value.done!=='boolean'||Object.keys(value).some(k=>!['id','title','tag','done'].includes(k)))fail();}
  else if(kind==='todo'){if(!checklistModel.valid(value)||value.id!==parts[1])fail();}
  else if(kind==='body-report'){if(!bodyModel.valid(value)||value.id!==parts[1])fail();}
  else if(kind==='media-topic'){if(!mediaTopicModel.valid(value)||value.id!==parts[1])fail();}
  else if(kind==='media-profile'){if(!validMediaProfile(value)||value.id!==parts[1])fail();}
  else if(kind==='media'){if(!validMedia(value)||value.id!==parts[1])fail();}
  else if(kind==='ledger'){if(!validLedger(value)||value.id!==parts[1])fail();}
  else if(kind==='account'){if(!obj(value)||value.id!==parts[1]||!str(value.name,60)||!value.name.trim()||!['现金与存款','投资理财','其他资产','负债'].includes(value.type)||!num(value.balance,1e12)||Object.keys(value).some(k=>!['id','name','type','balance'].includes(k)))fail();}
  else if(kind==='transaction'){const d=value?.date,dt=new Date(d+'T12:00:00Z');if(!obj(value)||value.id!==parts[1]||!/^\d{4}-\d{2}-\d{2}$/.test(d)||Number.isNaN(+dt)||dt.toISOString().slice(0,10)!==d||!['收入','支出'].includes(value.type)||!str(value.category,60)||!str(value.description,160)||!num(value.amount,1e12,Number.MIN_VALUE)||Object.keys(value).some(k=>!['id','date','type','category','description','amount'].includes(k)))fail();}
}
export function validatePersonalBatch(body){
  if(!obj(body)||!Array.isArray(body.operations)||body.operations.length<1||body.operations.length>6)fail();
  const seen=new Set();return body.operations.map(op=>{
    if(!obj(op)||!id(op.id)||seen.has(op.id)||!Number.isSafeInteger(op.baseRevision)||op.baseRevision<0||!(op.after===undefined||op.after===null||id(op.after)))fail();seen.add(op.id);
    validatePersonalValue(op.key,op.value);
    let delta=null;if(op.delta!==undefined&&op.delta!==null){const max=op.key.endsWith('/focus')?1440:op.key.endsWith('/health/water')?10000:0;if(!max||!num(op.delta,max,Number.MIN_VALUE))fail();delta=op.delta;}
    return {id:op.id,key:op.key,value:op.value,baseRevision:op.baseRevision,after:op.after||null,delta};
  });
}
