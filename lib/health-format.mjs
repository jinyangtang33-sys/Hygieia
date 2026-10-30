export class HealthFormatError extends Error {}
const fail=message=>{throw new HealthFormatError(message);};
const numeric=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
const round=v=>Math.round(v*100)/100;
const allowedDate=value=>{
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}(?:$|[ T])/.test(value))fail('日期格式不正确，请使用 Health Auto Export 的按天汇总 JSON。');
  const d=value.slice(0,10);
  if(Number.isNaN(Date.parse(d))||new Date(d+'T12:00:00Z').toISOString().slice(0,10)!==d)fail('包含无效日期。');
  return d;
};
const units=u=>String(u||'').trim().toLowerCase();
const read=(v,max,label)=>{if(!numeric(v)||v>max)fail(`${label}数值或单位不正确。`);return round(v);};
const unitFactor=(u,choices,label)=>{const factor=Object.hasOwn(choices,units(u))?choices[units(u)]:undefined;if(typeof factor!=='number')fail(`${label}单位不支持，请检查导出单位设置。`);return factor;};
const aliases={
  step_count:'steps',sleep_analysis:'sleep',apple_exercise_time:'exercise',exercise_time:'exercise',
  active_energy:'activeEnergy',active_energy_burned:'activeEnergy',resting_heart_rate:'restingHeartRate',
  heart_rate:'heartRate',heart_rate_variability:'hrv',heart_rate_variability_sdnn:'hrv',
  respiratory_rate:'respiratoryRate','weight_&_body_mass':'weight',body_mass:'weight',dietary_water:'water',
};
export const metricLabels={steps:'步数',sleep:'睡眠',exercise:'运动时长',activeEnergy:'活动能量',restingHeartRate:'静息心率',heartRate:'平均心率',hrv:'心率变异性',respiratoryRate:'呼吸频率',weight:'体重',water:'饮水'};

// Only daily snapshots are accepted. Repeated uploads replace snapshots rather
// than adding cumulative totals; duplicate days/sources are rejected explicitly.
export function parseHealthExport(payload,aggregation){
  if(!['day','days','daily'].includes(String(aggregation||'').trim().toLowerCase()))fail('请将 Time Grouping 设为 Days（按天），并开启 Summarize Data；不要使用小时或原始样本。');
  const metrics=payload?.data?.metrics??payload?.metrics;
  if(!Array.isArray(metrics)||metrics.length>100)fail('未找到有效的 metrics 列表，请使用 Health Metrics 的 JSON 导出。');
  const rows=[],seen=new Set(),ignored=new Set();
  let points=0;
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  for(const m of metrics){
    if(!m||typeof m.name!=='string'||!Array.isArray(m.data))fail('健康指标结构不正确。');
    const metric=Object.hasOwn(aliases,m.name)?aliases[m.name]:null;
    if(!metric){ignored.add(m.name.slice(0,80));continue;}
    points+=m.data.length;if(points>5000)fail('本次数据过多，请缩短导出范围或使用批量请求。');
    for(const item of m.data){
      if(!item||typeof item!=='object'||Array.isArray(item))fail('健康样本结构不正确。');
      const date=allowedDate(item.date);
      if(date>'9999-12-31'||date<'2000-01-01'||date>today)fail('记录日期必须在 2000 年至今天之间。');
      if(/\d{4}-\d{2}-\d{2}[ T](?!00:00:00(?:[ .+-]|$))/.test(item.date))fail('检测到非零点的时间样本，请改用 Days 按天汇总。');
      const key=`${date}:${metric}`;
      if(seen.has(key))fail('同一指标、同一天出现多份记录，请按天汇总并在 Preferred Sources 中选择首选来源，避免重复计算。');
      seen.add(key);
      let value={};
      if(metric==='sleep'){
        unitFactor(m.units,{hr:1,h:1,hour:1,hours:1},'睡眠');
        if(item.value||item.startDate)fail('请开启 Summarize Data，上传每日睡眠汇总，而非睡眠片段。');
        const total=item.totalSleep??item.asleep;
        if(total===undefined)fail('睡眠汇总缺少 totalSleep 或 asleep。');
        value.sleep=read(total,24,'睡眠');
        for(const [key,dest]of [['core','coreSleep'],['deep','deepSleep'],['rem','remSleep']])if(item[key]!==undefined)value[dest]=read(item[key],24,'睡眠阶段');
        for(const key of ['sleepStart','sleepEnd'])if(item[key]!==undefined){
          if(typeof item[key]!=='string'||item[key].length>64)fail('睡眠起止时间格式不正确。');
          value[key]=item[key];
        }
      }else if(metric==='heartRate'){
        unitFactor(m.units,{bpm:1,'count/min':1,'count/minute':1},'心率');
        value.heartRate=read(item.Avg??item.qty,300,'心率');
        if(item.Min!==undefined)value.heartRateMin=read(item.Min,300,'最低心率');
        if(item.Max!==undefined)value.heartRateMax=read(item.Max,300,'最高心率');
      }else{
        const configs={
          steps:[{count:1,steps:1},100000,'步数'],
          exercise:[{min:1,mins:1,minute:1,minutes:1,hr:60,h:60,s:1/60,sec:1/60},1440,'运动时长'],
          activeEnergy:[{kcal:1,kj:1/4.184,j:1/4184},20000,'活动能量'],
          restingHeartRate:[{bpm:1,'count/min':1,'count/minute':1},300,'静息心率'],
          hrv:[{ms:1,s:1000,sec:1000},2000,'心率变异性'],
          respiratoryRate:[{'count/min':1,'count/minute':1,'breaths/min':1,'breaths/minute':1,bpm:1},100,'呼吸频率'],
          weight:[{kg:1,g:.001,lb:.45359237,lbs:.45359237},500,'体重'],
          water:[{ml:1,l:1000,'fl oz':29.5735295625,'fl_oz_us':29.5735295625},10000,'饮水'],
        };
        const [choices,max,label]=configs[metric];
        if(!numeric(item.qty))fail(`${label}缺少有效的 qty 数值。`);
        value[metric]=read(item.qty*unitFactor(m.units,choices,label),max,label);
        if(metric==='steps')value.steps=Math.round(value.steps);
      }
      rows.push({date,metric,value});
      if(rows.length>200)fail('本次每日指标超过 200 条，请按最近 7 天或更短范围分批导出。');
    }
  }
  if(!rows.length)fail('没有找到可接收的健康数据。请先选择步数、睡眠、心率等指标，并确认已授权读取。');
  return {rows,ignored:[...ignored],metrics:[...new Set(rows.map(r=>r.metric))]};
}
