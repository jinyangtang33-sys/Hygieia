'use strict';
const LifeCalendar=(()=>{
  const types=[['health','健康','heart'],['meals','三餐','food'],['work','工作','work'],['journal','手记','book'],['assets','资产','wallet']];
  const mealKeys=['breakfast','lunch','dinner'];
  function monthDates(month){
    if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||month<'2000-01'||month>'9999-12')return [];
    const [year,m]=month.split('-').map(Number),length=new Date(Date.UTC(year,m,0)).getUTCDate();
    return Array.from({length},(_,i)=>month+'-'+String(i+1).padStart(2,'0'));
  }
  function moveMonth(date,delta,today){
    const [year,m]=date.split('-').map(Number),target=new Date(Date.UTC(year,m-1+delta,1)).toISOString().slice(0,7);
    const dates=monthDates(target);if(!dates.length)return date;
    const value=dates[Math.min(Number(date.slice(8)),dates.length)-1];return value>today?today:value;
  }
  function financial(date,transactions=[],ledger=[]){
    const reversed=new Set(ledger.filter(e=>e.type==='撤销').map(e=>e.originalId));
    const legacy=transactions.filter(e=>e.date===date).map(e=>({...e,linked:false,voided:false}));
    const linked=ledger.filter(e=>e.date===date).map(e=>({...e,linked:true,voided:reversed.has(e.id)}));
    const records=[...linked.sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||'')),...legacy];
    const active=records.filter(e=>!e.voided&&['收入','支出'].includes(e.type));
    return {records,income:active.filter(e=>e.type==='收入').reduce((s,e)=>s+e.amount,0),expense:active.filter(e=>e.type==='支出').reduce((s,e)=>s+e.amount,0),cashCount:active.length};
  }
  function summarize(date,days,transactions=[],ledger=[]){
    const d=days[date]||{},health=Object.keys(d.health||{}).length>0,meals=mealKeys.filter(k=>d.meals?.[k]).length,tasks=d.tasks||[],focus=typeof d.focus==='number'?d.focus:null,journal=!!d.journal?.trim(),mood=d.mood!==undefined,assets=financial(date,transactions,ledger);
    const coverage={health,meals:meals>0,work:tasks.length>0||focus!==null,journal:journal||mood,assets:assets.records.length>0};
    return {date,day:d,meals,tasks:tasks.length,done:tasks.filter(t=>t.done).length,focus,journal,mood,assets,coverage,count:Object.values(coverage).filter(Boolean).length};
  }
  function monthSummary(month,days,transactions,ledger,today){
    const rows=monthDates(month).filter(date=>date<=today).map(date=>summarize(date,days,transactions,ledger));
    return {rows,recorded:rows.filter(r=>r.count).length,health:rows.filter(r=>r.coverage.health).length,meals:rows.reduce((n,r)=>n+r.meals,0),done:rows.reduce((n,r)=>n+r.done,0),elapsed:rows.length};
  }
  const link=(route,label)=>`<button class="text-btn" data-life-route="${route}">${label}${icon('arrow')}</button>`;
  const add=(kind,label)=>`<button class="text-btn" data-life-open="${kind}">${icon('plus')}${label}</button>`;
  const amount=n=>assetHidden?'••••':`¥${money(n)}`;
  function healthCard(r){
    const d=r.day,h=d.health||{},apple=new Set(d.apple?.metrics||[]),groups={coreSleep:'sleep',deepSleep:'sleep',remSleep:'sleep',sleepStart:'sleep',sleepEnd:'sleep',heartRateMin:'heartRate',heartRateMax:'heartRate'};
    const metrics=[['sleep','睡眠','小时'],['steps','步数','步'],['weight','体重','kg'],['water','饮水','ml'],['exercise','运动','分钟'],['activeEnergy','活动能量','kcal'],['restingHeartRate','静息心率','次/分'],['heartRate','平均心率','次/分'],['hrv','心率变异性','ms'],['respiratoryRate','呼吸频率','次/分'],['coreSleep','核心睡眠','小时'],['deepSleep','深度睡眠','小时'],['remSleep','快速动眼睡眠','小时'],['heartRateMin','最低心率','次/分'],['heartRateMax','最高心率','次/分']].filter(([key])=>h[key]!==undefined);
    return `<section class="panel life-detail-card"><div class="panel-head"><h3>${icon('heart')}身体与活动</h3>${link('health','查看健康')}</div>${metrics.length?`<div class="life-health-grid">${metrics.map(([key,label,unit])=>`<div><span>${label}</span><strong>${num(h[key])}<small>${unit}</small></strong><small>${apple.has(groups[key]||key)?'Apple 健康':key==='weight'&&d.bodyReportWeight?'体脂秤报告':'手动记录'}</small></div>`).join('')}</div>`:'<p class="life-empty">这一天暂无健康指标；尚未同步的数据不会按零计算。</p>'}<div class="life-card-footer">${add('health','补记健康')}<span>睡眠按醒来日期归档</span></div></section>`;
  }
  function mealsCard(r){return `<section class="panel life-detail-card"><div class="panel-head"><h3>${icon('food')}一日三餐 <small>${r.meals} / 3</small></h3>${link('meals','查看饮食')}</div><ol class="life-meal-list">${mealKeys.map(key=>{const m=r.day.meals?.[key];return `<li><span class="life-meal-time">${mealTypes[key]}<small>${m?esc(m.time):'未记录'}</small></span><div>${m?`<strong>${esc(m.name)}</strong>${m.note?`<p>${esc(m.note)}</p>`:''}<small>${m.calories===null?'未填写热量':num(m.calories)+' kcal'}</small>`:`<span class="life-empty">给这一餐留个位置</span>`}</div><button class="text-btn" data-life-meal="${key}" aria-label="${m?'更新':'补记'}${mealTypes[key]}">${icon(m?'edit':'plus')}</button></li>`;}).join('')}</ol></section>`;}
  function workCard(r){return `<section class="panel life-detail-card"><div class="panel-head"><h3>${icon('work')}工作与成长</h3>${link('work','查看工作')}</div>${r.tasks?`<p class="life-work-summary">完成 ${r.done} / ${r.tasks} 项待办</p><ul class="life-task-list">${(r.day.tasks||[]).map(t=>`<li><span class="life-task-state ${t.done?'done':''}" aria-label="${t.done?'已完成':'未完成'}">${icon(t.done?'check':'clock')}</span><span>${esc(t.title)}</span><small>${esc(t.tag)}</small></li>`).join('')}</ul>`:'<p class="life-empty">这一天还没有待办记录。</p>'}<div class="life-card-footer"><span>专注时长：${r.focus===null?'未记录':num(r.focus)+' 分钟'}</span>${add('task','添加待办')}</div></section>`;}
  function journalCard(r){const moods={1:'低落',2:'有点疲惫',3:'平静',4:'不错',5:'很开心'};return `<section class="panel life-detail-card"><div class="panel-head"><h3>${icon('book')}生活手记</h3>${link('journal',r.journal?'查看 / 编辑':'写下今天')}</div>${r.mood?`<span class="life-mood">心情 · ${moods[r.day.mood]}</span>`:''}${r.journal?`<p class="life-journal">${esc(r.day.journal)}</p>`:'<p class="life-empty">还没有写下手记。记住一件小事，也很好。</p>'}</section>`;}
  function assetsCard(r){const f=r.assets;return `<section class="panel life-detail-card"><div class="panel-head"><h3>${icon('wallet')}这一天的资产记录</h3>${link('assets','查看资产')}</div>${f.records.length?`<div class="life-finance-summary"><span>有效收入<strong>${amount(f.income)}</strong></span><span>有效支出<strong>${amount(f.expense)}</strong></span><button class="text-btn" data-action="hide-assets">${assetHidden?'显示':'隐藏'}金额</button></div><ol class="life-finance-list">${f.records.map(e=>`<li><div><strong>${esc(e.type)}${e.voided?' · 已撤销':''}</strong><small>${e.linked?e.effects.map(a=>esc(a.name)).join(e.type==='转账'?' → ':'、'):'独立收支 · 未关联账户'}</small>${e.description?`<p>${esc(e.description)}</p>`:''}</div><span>${e.type==='核对'?e.effects.map(a=>`${amount(a.before)} → ${amount(a.after)}`).join('；'):amount(e.amount)}</span></li>`).join('')}</ol>`:'<p class="life-empty">这一天暂无收支、转账或余额核对记录。</p>'}<div class="life-card-footer">${add('transaction','补记收支')}<span>转账、核对和撤销不计作收入支出</span></div><p class="life-data-note">按填写的记录日期归档，已撤销的原流水不计入有效收支。此处展示记账记录，不推算当天账户余额。</p></section>`;}
  function pageView(){
    const month=selectedDate.slice(0,7),dates=monthDates(month),days=allDays(),m=monthSummary(month,days,state.transactions,state.ledger||[],TODAY),current=summarize(selectedDate,days,state.transactions,state.ledger||[]),offset=(new Date(month+'-01T12:00:00Z').getUTCDay()+6)%7;
    return `${pageHead('把生活，连成日历。','健康、三餐、工作与收支，都在同一天相遇。','记录这一天','quick')}<div class="life-share-row"><span>日期链接可跨设备回看，仍需登录你的私人空间</span><button class="text-btn" data-date-copy>${icon('export')}复制这一天的链接</button></div><div class="life-calendar-layout"><div class="life-month-column"><section class="panel life-month"><div class="panel-head"><div><span class="eyebrow">LIFE, DAY BY DAY</span><h2>${Number(month.slice(0,4))} 年 ${Number(month.slice(5))} 月</h2></div><div class="life-month-controls"><button class="icon-button" data-life-month="-1" aria-label="上一个月" ${month==='2000-01'?'disabled':''}>${icon('chevron')}</button><label class="life-month-picker"><span>选择月份</span><input type="month" value="${month}" min="2000-01" max="${TODAY.slice(0,7)}" id="life-month-picker" aria-label="选择日历月份"></label><button class="icon-button date-next" data-life-month="1" aria-label="下一个月" ${month>=TODAY.slice(0,7)?'disabled':''}>${icon('chevron')}</button></div></div><div class="life-legend">${types.map(([key,label])=>`<span><i class="life-dot life-dot-${key}"></i>${label}</span>`).join('')}</div><div class="life-weekdays" aria-hidden="true">${['一','二','三','四','五','六','日'].map(d=>`<span>${d}</span>`).join('')}</div><div class="life-month-grid" role="group" aria-label="${month} 的每日记录">${Array.from({length:offset},()=>'<span class="life-day-padding" aria-hidden="true"></span>').join('')}${dates.map(date=>{const future=date>TODAY,r=future?null:summarize(date,days,state.transactions,state.ledger||[]),labels=r?types.filter(([k])=>r.coverage[k]).map(([,label])=>label):[];return `<button class="life-day ${date===selectedDate?'selected':''} ${date===TODAY?'today':''}" data-life-date="${date}" ${future?'disabled':''} aria-pressed="${date===selectedDate}" ${date===TODAY?'aria-current="date"':''} aria-label="${date}${future?'，尚未到来':labels.length?'，有'+labels.join('、')+'记录':'，暂无记录'}"><strong>${Number(date.slice(8))}</strong>${date===TODAY?'<small>今</small>':''}<span class="life-day-dots" aria-hidden="true">${types.map(([key])=>`<i class="life-dot life-dot-${key} ${r?.coverage[key]?'':'life-missing'}"></i>`).join('')}</span></button>`;}).join('')}</div><div class="life-month-bottom"><span>色点表示有记录，不代表目标达成</span><button class="text-btn" data-action="date-today">回到今天</button></div></section><section class="panel life-month-summary"><h3>这个月，留下的足迹</h3><div><span><strong>${m.recorded}<small>/ ${m.elapsed} 天</small></strong>有记录的日子</span><span><strong>${m.health}<small>天</small></strong>健康记录</span><span><strong>${m.meals}<small>餐</small></strong>三餐记录</span><span><strong>${m.done}<small>项</small></strong>已完成待办</span></div><p class="life-data-note">仅统计本月截至今天已留下的记录；缺失不代表零。</p></section></div><div class="life-day-column" id="life-day-details"><div class="life-selected-heading"><div><span class="eyebrow">ONE DAY, MANY MOMENTS</span><h2>${dateLabel(selectedDate)}</h2><p>${current.count?`这一天留下了 ${current.count} 个方面的记录。`:'这一天还是一张留白，随时可以回来补记。'}</p></div><div class="life-detail-links"><button class="text-btn life-back-calendar" data-life-top>回到月历${icon('calendar')}</button><a class="text-btn" href="#review">每周复盘${icon('arrow')}</a></div></div>${healthCard(current)}${mealsCard(current)}${workCard(current)}${journalCard(current)}${assetsCard(current)}</div></div>`;
  }
  document.addEventListener('click',e=>{
    const b=e.target.closest('[data-life-date],[data-life-month],[data-life-route],[data-life-open],[data-life-meal],[data-life-top]');if(!b)return;
    if(checkDayChange()){toast('已切换到今天，请重新选择操作。');return;}
    if(b.hasAttribute('data-life-top'))$('.life-month')?.scrollIntoView?.({behavior:'smooth',block:'start'});
    else if(b.dataset.lifeDate){setDate(b.dataset.lifeDate);if(window.matchMedia?.('(max-width:1100px)').matches)$('#life-day-details')?.scrollIntoView?.({behavior:'smooth',block:'start'});}
    else if(b.dataset.lifeMonth)setDate(moveMonth(selectedDate,Number(b.dataset.lifeMonth),TODAY));
    else if(b.dataset.lifeRoute)location.hash=b.dataset.lifeRoute;
    else if(b.dataset.lifeOpen)showForm(b.dataset.lifeOpen);
    else if(b.dataset.lifeMeal)showForm('meal',b.dataset.lifeMeal);
  });
  document.addEventListener('change',e=>{if(e.target.id==='life-month-picker'){const dates=monthDates(e.target.value);if(dates.length&&e.target.value<=TODAY.slice(0,7)){const date=dates[Math.min(Number(selectedDate.slice(8)),dates.length)-1];setDate(date>TODAY?TODAY:date);}}});
  return {page:pageView,monthDates,moveMonth,summarize,monthSummary,financial};
})();
