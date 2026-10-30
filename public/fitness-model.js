function createFitnessModel(){
  const obj=v=>v&&typeof v==='object'&&!Array.isArray(v);
  const finite=(v,max)=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=max;
  const date=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&v>='2000-01-01'&&!Number.isNaN(Date.parse(v+'T12:00:00Z'))&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;
  const time=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v)&&!Number.isNaN(Date.parse(v))&&new Date(v).toISOString()===v;
  const day=v=>new Date(Date.parse(v)+8*3600000).toISOString().slice(0,10);
  const ringBounds={moveKcal:20000,moveGoalKcal:20000,exerciseMin:1440,exerciseGoalMin:1440,standHours:24,standGoalHours:24,moveTimeMin:1440,moveTimeGoalMin:1440};
  const workoutBounds={distanceMeters:10000000,energyKcal:200000,heartRateAvg:500,heartRateMin:500,heartRateMax:500};
  function validRings(v){return v===null||obj(v)&&Object.keys(v).length>0&&Object.entries(v).every(([k,n])=>k==='moveMode'?[null,0,1].includes(n):Object.hasOwn(ringBounds,k)&&(n===null||finite(n,ringBounds[k])));}
  function validWorkout(v,d){return obj(v)&&typeof v.id==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v.id)&&typeof v.type==='string'&&/^[a-zA-Z0-9_]{1,80}$/.test(v.type)&&time(v.start)&&time(v.end)&&day(v.start)===d&&Date.parse(v.end)>=Date.parse(v.start)&&Date.parse(v.end)-Date.parse(v.start)<=604800000&&finite(v.durationSec,604800)&&typeof v.source==='string'&&v.source.length<=120&&Object.entries(v).every(([k,n])=>['id','type','start','end','durationSec','source'].includes(k)||Object.hasOwn(workoutBounds,k)&&finite(n,workoutBounds[k]));}
  function valid(v,d){return date(d)&&obj(v)&&Object.keys(v).every(k=>['rings','workouts'].includes(k))&&Object.hasOwn(v,'rings')&&validRings(v.rings)&&Array.isArray(v.workouts)&&v.workouts.length<=500&&v.workouts.every(w=>validWorkout(w,d))&&new Set(v.workouts.map(w=>w.id)).size===v.workouts.length;}
  const names={running:'跑步',walking:'步行',cycling:'骑行',hiking:'徒步',swimming:'游泳',strength_training:'力量训练',traditional_strength_training:'传统力量训练',functional_strength_training:'功能性力量训练',hiit:'高强度间歇训练',high_intensity_interval_training:'高强度间歇训练',yoga:'瑜伽',pilates:'普拉提',rowing:'划船',elliptical:'椭圆机',stair_climbing:'爬楼梯',core_training:'核心训练',cross_training:'交叉训练',flexibility:'柔韧训练',mixed_cardio:'混合有氧',dance:'舞蹈',tennis:'网球',basketball:'篮球',soccer:'足球',golf:'高尔夫',skating:'滑冰',snow_sports:'雪上运动',surfing:'冲浪',paddle_sports:'桨类运动',climbing:'攀岩',cooldown:'整理放松',other:'其他训练'};
  return {valid,validWorkout,validRings,date,day,name:type=>Object.hasOwn(names,type)?names[type]:'其他训练 · '+type};
}
const FitnessModel=createFitnessModel();
