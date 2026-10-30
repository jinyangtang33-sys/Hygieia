function createBodyModel(){
  const fields=[
    ['weight','体重','kg',1,500,['当前体重','体重']],['bmi','BMI','',1,150,['BMI','身体质量指数']],['standardWeight','标准体重','kg',1,500,['标准体重']],
    ['bodyFatPercent','体脂率','%',0,100,['体脂率','体脂百分比']],['fatMass','脂肪重量','kg',0,500,['脂肪重量','脂肪量']],['waterPercent','体水分率','%',0,100,['体水分率','体水份率','水分率']],['waterMass','水含量','kg',0,500,['水含量','水分量']],
    ['musclePercent','肌肉率','%',0,100,['肌肉率']],['muscleMass','肌肉量','kg',0,500,['肌肉量']],['proteinPercent','蛋白质率','%',0,100,['蛋白质率']],['proteinMass','蛋白质量','kg',0,500,['蛋白质量']],
    ['skeletalMusclePercent','骨骼肌率','%',0,100,['骨骼肌率']],['skeletalMuscleMass','骨骼肌量','kg',0,500,['骨骼肌量']],['basalMetabolism','基础代谢','kcal/日',0,10000,['基础代谢率','基础代谢']],['visceralFat','内脏脂肪','级',0,100,['内脏脂肪等级','内脏脂肪']],
    ['boneMass','骨盐量','kg',0,100,['骨盐量','骨量']],['leanMass','去脂体重','kg',0,500,['去脂体重','除脂体重']],['score','综合得分','分',0,100,['综合得分','身体得分']],['obesityPercent','肥胖度','%',-100,300,['肥胖度']],['bodyAge','身体年龄','岁',1,150,['身体年龄','身体年齡']],
    ['weightControl','体重控制','kg',-500,500,['体重控制']],['muscleControl','肌肉控制','kg',-500,500,['肌肉控制']],['fatControl','脂肪控制','kg',-500,500,['脂肪控制']]
  ].map(([key,label,unit,min,max,aliases])=>({key,label,unit,min,max,aliases}));
  const str=(v,n)=>typeof v==='string'&&v.length<=n;
  function validTime(v){if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/.test(v)||v<'2000-01-01T00:00'||v>'9999-12-31T23:59')return false;const d=new Date(v.slice(0,10)+'T12:00:00Z');return !Number.isNaN(+d)&&d.toISOString().slice(0,10)===v.slice(0,10);}
  const idFor=time=>'scale-'+String(time).replace(/[-:T]/g,'');
  function validMetrics(v){return !!v&&typeof v==='object'&&!Array.isArray(v)&&Object.hasOwn(v,'weight')&&Object.keys(v).length<=fields.length&&Object.entries(v).every(([key,value])=>{const f=fields.find(f=>f.key===key);return !!f&&typeof value==='number'&&Number.isFinite(value)&&value>=f.min&&value<=f.max;});}
  function valid(v){if(!v||typeof v!=='object'||Array.isArray(v)||!validTime(v.measuredAt)||v.id!==idFor(v.measuredAt)||!validMetrics(v.metrics)||!str(v.source,80)||!v.source.trim()||!str(v.notes,1000))return false;for(const k of ['createdAt','updatedAt'])if(!str(v[k],40)||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v[k])||Number.isNaN(Date.parse(v[k]))||new Date(v[k]).toISOString()!==v[k])return false;return !Object.keys(v).some(k=>!['id','measuredAt','metrics','source','notes','createdAt','updatedAt'].includes(k));}
  const clean=t=>String(t||'').normalize('NFKC').replace(/[−–—]/g,'-').replace(/[，]/g,'.').replace(/[\u200b\uFEFF]/g,'');
  function labels(line){const compact=line.replace(/\s/g,'').toUpperCase(),found=[];for(const f of fields)for(const a of [...f.aliases].sort((a,b)=>b.length-a.length)){const at=compact.indexOf(a.toUpperCase());if(at>=0){found.push({f,alias:a,at,end:at+a.length,compact});break;}}return found.filter(x=>!found.some(y=>y!==x&&y.at<=x.at&&y.end>=x.end&&(y.end-y.at>x.end-x.at)));}
  function readNumber(text){const hit=text.replace(/\((?:KG|千克|公斤|%|KCAL|岁|级|分)\)/gi,'').trim().match(/^[:：=]?\s*([+-]?\d+(?:\.\d+)?)\s*(?:%|KG|千克|公斤|KCAL|岁|级|分|$)/i);return hit?Number(hit[1]):null;}
  function parseText(text){
    const lines=clean(text).split(/\r?\n/).map(v=>v.trim()).filter(Boolean),metrics={},warnings=[],values=new Map();let measuredAt='';
    const dateMatch=lines.filter(line=>!/上次|较前|变化|差值/.test(line)).join('\n').match(/(20\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})(?:日)?[ T\s]+(\d{1,2})[:：](\d{2})/);
    if(dateMatch){const [,y,m,d,h,min]=dateMatch,v=`${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}T${h.padStart(2,'0')}:${min}`;if(validTime(v))measuredAt=v;}
    for(let i=0;i<lines.length;i++){
      if(/上次|较前|变化|差值/.test(lines[i]))continue;const hits=labels(lines[i]);if(hits.length!==1)continue;const {f,end,compact}=hits[0];let value=readNumber(compact.slice(end));
      if(value===null)for(let j=i+1;j<Math.min(lines.length,i+5);j++){if(labels(lines[j]).length||/上次/.test(lines[j]))break;const n=readNumber(lines[j].replace(/\s/g,''));if(n!==null){value=n;break;}}
      if(value===null)continue;if(value<f.min||value>f.max){warnings.push(f.label+'超出可录入范围，请核对。');continue;}
      const list=values.get(f.key)||[];list.push(value);values.set(f.key,list);
    }
    for(const [key,list]of values){const unique=[...new Set(list)];if(unique.length===1)metrics[key]=unique[0];else warnings.push(fields.find(f=>f.key===key).label+'识别到多个不同值，请手动填写。');}
    if(!measuredAt)warnings.push('未识别到完整测量时间，请手动填写。');if(metrics.weight===undefined)warnings.push('未识别到当前体重，请手动填写。');
    return {measuredAt,metrics,warnings:[...new Set(warnings)]};
  }
  function parseFile(value){if(!value||value.format!=='selfspace-body-report'||value.version!==1||!validTime(value.measuredAt)||!validMetrics(value.metrics)||!str(value.source??'体脂秤',80)||!str(value.notes??'',1000))throw Error('请选择观己身体报告 JSON 文件，并检查测量时间与指标。');return {measuredAt:value.measuredAt,metrics:{...value.metrics},source:value.source||'体脂秤',notes:value.notes||'',warnings:[]};}
  return {fields,validTime,idFor,validMetrics,valid,parseText,parseFile};
}
const BodyReportModel=createBodyModel();
