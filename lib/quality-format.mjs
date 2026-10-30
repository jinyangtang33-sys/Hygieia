export function createQualityFormat(){
  const specs=[['sleep','睡眠','小时'],['steps','步数','步'],['weight','体重','kg'],['water','饮水','ml'],['exercise','运动时长','分钟'],['activeEnergy','活动能量','kcal'],['restingHeartRate','静息心率','次/分'],['heartRate','平均心率','次/分'],['hrv','心率变异性','ms'],['respiratoryRate','呼吸频率','次/分']];
  function build(state,cloud,date){
    const local=state.days?.[date]?.health||{},synced=cloud[date]?.health||{},report=(state.bodyReports||[]).filter(r=>r.measuredAt.slice(0,10)===date).sort((a,b)=>b.measuredAt.localeCompare(a.measuredAt))[0]||null;
    const known=v=>typeof v==='number'&&Number.isFinite(v);
    const rows=specs.map(([key,label,unit])=>{const apple=known(synced[key]),manual=known(local[key]),scale=key==='weight'&&known(report?.metrics.weight),value=apple?synced[key]:manual?local[key]:scale?report.metrics.weight:null;return {key,label,unit,value,source:apple?'Apple 健康':manual?'手动记录':scale?'体脂秤报告':'未记录',updated:apple?cloud[date]?.apple?.updatedAt||null:scale&&!manual?report.measuredAt:null,parallel:apple&&manual&&synced[key]!==local[key]?local[key]:null};});
    const rings=cloud[date]?.fitness?.rings||null,ringParts=rings?[rings.moveMode===1?rings.moveTimeMin:rings.moveKcal,rings.exerciseMin,rings.standHours].filter(known).length:0;
    return {date,rows,report,rings,ringParts,missing:rows.filter(r=>r.value===null),parallel:rows.filter(r=>r.parallel!==null)};
  }
  return {build};
}
export const qualityFormat=createQualityFormat();
