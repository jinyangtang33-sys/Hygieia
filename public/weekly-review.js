'use strict';
const WeeklyReview=(()=>{
  const add=(date,n)=>new Date(Date.parse(date+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
  const monday=date=>add(date,-((new Date(date+'T12:00:00Z').getUTCDay()+6)%7));
  const stats=values=>({count:values.length,total:values.length?values.reduce((a,b)=>a+b,0):null,average:values.length?values.reduce((a,b)=>a+b,0)/values.length:null});
  function summarize(days,start,length){
    const dates=Array.from({length},(_,i)=>add(start,i)),rows=dates.map(date=>({date,...(days[date]||{})}));
    const health=key=>stats(rows.map(d=>d.health?.[key]).filter(v=>typeof v==='number'&&Number.isFinite(v)));
    const tasks=rows.flatMap(d=>d.tasks||[]),meals=rows.flatMap(d=>Object.entries(d.meals||{}).filter(([k])=>['breakfast','lunch','dinner'].includes(k)).map(([,m])=>m));
    const focus=stats(rows.map(d=>d.focus).filter(v=>typeof v==='number'&&Number.isFinite(v)));
    return {dates,rows,sleep:health('sleep'),steps:health('steps'),exercise:health('exercise'),focus,meals:meals.length,mealDays:rows.filter(d=>Object.keys(d.meals||{}).length).length,calories:stats(meals.map(m=>m.calories).filter(v=>typeof v==='number'&&Number.isFinite(v))),tasks:tasks.length,done:tasks.filter(t=>t.done).length,journals:rows.filter(d=>d.journal?.trim()).length,moodDays:rows.filter(d=>d.mood!==undefined).length};
  }
  function build(days,start,today){
    start=monday(start);const end=add(start,6),cutoff=end<today?end:today,length=cutoff<start?0:Math.min(7,Math.round((Date.parse(cutoff)-Date.parse(start))/86400000)+1);
    return {start,end,cutoff,length,current:summarize(days,start,length),previous:summarize(days,add(start,-7),length)};
  }
  let selectedWeek=null,followWeek=true;
  const currentWeek=()=>{if(!selectedWeek||(followWeek&&!reviewDirty))selectedWeek=monday(TODAY);return selectedWeek;};
  const round=(value,digits=1)=>value===null?'—':Number(value.toFixed(digits)).toLocaleString('zh-CN');
  function comparison(current,previous,unit,digits=1){if(current.average===null||previous.average===null)return '上周同阶段记录不足，暂不比较';const delta=current.average-previous.average;return `较上周同阶段 ${delta>0?'+':''}${round(delta,digits)} ${unit} · ${current.count} / ${previous.count} 天有记录`;}
  function pageView(){
    const start=currentWeek(),r=build(allDays(),start,TODAY),c=r.current,notes=state.reviews?.[start]||{},current=start===monday(TODAY);
    return `<div class="page-head"><div><div class="eyebrow">A WEEK IN YOUR LIFE</div><h1>一周，慢慢看见。</h1><p>回看已经留下的记录，也给下一周一点方向。</p></div><div class="head-actions"><div class="date-picker-group"><button class="icon-button" data-review="previous" aria-label="查看上一周">${icon('chevron')}</button><label class="date-control"><span>${start.slice(5).replace('-','.')} — ${r.end.slice(5).replace('-','.')}</span><input type="date" id="review-week-date" min="2000-01-03" value="${start}" max="${TODAY}" aria-label="选择要复盘的一周（任意一天）"></label><button class="icon-button date-next" data-review="next" aria-label="查看下一周" ${current?'disabled':''}>${icon('chevron')}</button></div><button class="btn" data-review="export">${icon('export')}导出本周摘要</button></div></div>
    <section class="weekly-intro"><div><span class="tag">${current?'本周进行中':'这一周的记录'}</span><h2>${start} — ${r.end}</h2><p>按北京时间、周一至周日汇总。${current?`当前统计到 ${r.cutoff}，今日记录仍可能更新。`:'已结束的一周仍可补记。'}</p></div>${!current?'<button class="btn btn-light" data-review="today">回到本周</button>':''}</section>
    <div class="weekly-stats">${metric('平均睡眠',round(c.sleep.average),'小时',`${c.sleep.count} / ${r.length} 天有记录`,'moon')}${metric('日均步数',round(c.steps.average,0),'步',`${c.steps.count} / ${r.length} 天有记录`,'walk')}${metric('三餐记录',c.meals,'餐',`已过 ${r.length} 天，共 ${r.length*3} 个餐次位置`,'food')}${metric('待办完成',c.tasks?`${c.done} / ${c.tasks}`:'—','项',c.tasks?`已完成 ${Math.round(c.done/c.tasks*100)}%`:'还没有待办记录','work')}</div>
    <section class="panel spaced-bottom"><div class="panel-head"><h2>${icon('chart')}从记录里看见这一周</h2><span class="mini-label">只统计实际记录</span></div><div class="weekly-observations"><div><h3>身体与活动</h3><p>${c.sleep.count?`记录了 ${c.sleep.count} 天睡眠，平均 ${round(c.sleep.average)} 小时。`:'还没有睡眠记录。'}${c.steps.count?`记录了 ${c.steps.count} 天步数，日均 ${round(c.steps.average,0)} 步。`:''}</p><p class="field-help">${comparison(c.sleep,r.previous.sleep,'小时')}<br>${comparison(c.steps,r.previous.steps,'步',0)}</p></div><div><h3>认真生活的小事</h3><p>${c.meals?`留下 ${c.meals} 餐记录，分布在 ${c.mealDays} 天。`:'这一周还没有三餐记录。'}${c.journals?`写下 ${c.journals} 天手记。`:'也可以从写下一件小事开始。'}</p><p class="field-help">${c.calories.count?`${c.calories.count} 餐填写热量，共 ${round(c.calories.total,0)} kcal；未填部分不计入。`:'没有填写热量的餐次不会估算热量。'}</p></div><div><h3>投入与完成</h3><p>${c.tasks?`共 ${c.tasks} 项待办，完成 ${c.done} 项。`:'尚无待办记录。'}${c.focus.count?`已记录专注 ${round(c.focus.total,0)} 分钟。`:'尚无专注时长记录。'}</p><p class="field-help">${c.exercise.count?`运动时长合计 ${round(c.exercise.total,0)} 分钟，来自 ${c.exercise.count} 天记录。`:'运动时长尚未记录。'}</p></div></div><p class="health-note">缺失不代表零，也不代表没有吃饭、运动或工作。对比使用上周同样已过天数内的现有记录，覆盖天数不同时请结合明细阅读。</p></section>
    <section class="panel spaced-bottom"><div class="panel-head"><h2>${icon('calendar')}逐日回看</h2><span class="mini-label">点击日期查看当天</span></div><div class="table-scroll"><table class="detail-list weekly-days"><thead><tr><th>日期</th><th>睡眠 / 小时</th><th>步数</th><th>三餐记录</th><th>待办完成</th></tr></thead><tbody>${Array.from({length:7},(_,i)=>{const date=add(start,i),d=r.current.rows.find(d=>d.date===date),future=date>TODAY;return `<tr class="${future?'weekly-future':''}"><td>${future?shortDate(date):`<button class="text-btn" data-review="day" data-date="${date}">${shortDate(date)}</button>`}</td><td>${future?'尚未到来':d?.health?.sleep??'—'}</td><td>${d?.health?.steps===undefined?'—':num(d.health.steps)}</td><td>${future?'—':`${Object.keys(d?.meals||{}).length} / 3`}</td><td>${d?.tasks?.length?`${d.tasks.filter(t=>t.done).length} / ${d.tasks.length}`:'—'}</td></tr>`;}).join('')}</tbody></table></div></section>
    <section class="panel weekly-notes"><div class="panel-head"><h2>${icon('book')}留给自己的复盘</h2><span class="mini-label">保存后跨设备同步</span></div><form id="weekly-review-form" data-week="${start}" data-revisions="${esc(JSON.stringify(PersonalSync.revisions(['wins','challenge','plan'].map(k=>'review/'+start+'/'+k))))}">${[['wins','这周值得记住的收获','做成的一件事、开心的时刻，或者一个小进步。'],['challenge','遇到的问题与想调整的地方','哪些事情消耗了你？有什么值得换种方式试试？'],['plan','下周想认真做的事','写下一个具体、可以开始的小行动。']].map(([key,label,placeholder])=>`<div class="form-field"><label for="review-${key}">${label}</label><textarea id="review-${key}" name="${key}" maxlength="5000" placeholder="${placeholder}">${esc(notes[key]||'')}</textarea></div>`).join('')}<div class="weekly-save-row"><span id="review-save-status">${reviewDirty?'编辑中 · 请保存复盘':'与个人记录一起保存到私人云端'}</span><button class="btn btn-primary" type="submit">${icon('check')}保存本周复盘</button></div></form></section>`;
  }
  function save(silent=false){
    const form=$('#weekly-review-form');if(!form||!reviewDirty)return true;
    const week=form.dataset.week;if(silent&&typeof DraftCenter!=='undefined'&&DraftCenter.requiresConfirm('review',week)){toast('恢复的复盘草稿请先核对并点击保存。');return false;}const values=Object.fromEntries(['wins','challenge','plan'].map(k=>[k,$('#review-'+k).value]));
    for(const key of Object.keys(values))if(!values[key]&&state.reviews?.[week]?.[key]===undefined)delete values[key];
    const next=structuredClone(state);(next.reviews||={})[week]=values;
    if(!persist(next,silent?null:'复盘已保存，正在同步到私人云端。',{baseRevisions:JSON.parse(form.dataset.revisions||'{}')}))return false;
    reviewDirty=false;const label=$('#review-save-status');if(label)label.textContent='本机已保存，云端同步中';return true;
  }
  function move(week){if(!save(true))return;selectedWeek=monday(week);if(selectedWeek<'2000-01-03')selectedWeek='2000-01-03';if(selectedWeek>monday(TODAY))selectedWeek=monday(TODAY);followWeek=selectedWeek===monday(TODAY);render();}
  function exportSummary(){
    const week=currentWeek();if(!save(true))return;const r=build(allDays(),week,TODAY),c=r.current,n=state.reviews?.[week]||{};
    const text=`# 观己每周复盘\n\n${r.start} — ${r.end}（北京时间，截至 ${r.cutoff}）\n\n- 平均睡眠：${round(c.sleep.average)} 小时（${c.sleep.count} 天有记录）\n- 日均步数：${round(c.steps.average,0)} 步（${c.steps.count} 天有记录）\n- 三餐记录：${c.meals} 餐 / 已过 ${r.length} 天\n- 待办完成：${c.done} / ${c.tasks} 项\n- 专注时长：${round(c.focus.total,0)} 分钟（${c.focus.count} 天有记录）\n- 运动时长：${round(c.exercise.total,0)} 分钟（${c.exercise.count} 天有记录）\n\n缺失数据未当作零。本摘要根据导出时当前可见的个人记录和健康汇总生成；后续补传或修改可能改变结果。\n\n## 收获\n${n.wins||'尚未填写'}\n\n## 问题与调整\n${n.challenge||'尚未填写'}\n\n## 下周计划\n${n.plan||'尚未填写'}\n`;
    const url=URL.createObjectURL(new Blob([text],{type:'text/markdown;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download=`观己每周复盘-${week}.md`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('本周摘要下载已发起，请确认文件已保存。');
  }
  document.addEventListener('input',e=>{if(e.target.closest?.('#weekly-review-form')){reviewDirty=true;const label=$('#review-save-status');if(label)label.textContent='编辑中 · 请保存复盘';}});
  document.addEventListener('submit',e=>{if(e.target.id==='weekly-review-form'){e.preventDefault();if(save()){checkDayChange(false);render();}}});
  document.addEventListener('change',e=>{if(e.target.id==='review-week-date'&&/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)&&e.target.value<=TODAY)move(e.target.value);});
  document.addEventListener('click',e=>{const b=e.target.closest('[data-review]');if(!b)return;const action=b.dataset.review;if(action==='previous')move(add(currentWeek(),-7));else if(action==='next')move(add(currentWeek(),7));else if(action==='today')move(monday(TODAY));else if(action==='export')exportSummary();else if(action==='day'&&save(true)){setDate(b.dataset.date);location.hash='journal';}});
  return {page:pageView,build,monday,save,openWeek:move};
})();
