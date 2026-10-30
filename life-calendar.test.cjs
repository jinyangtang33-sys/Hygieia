const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {client}=require('./personal-browser-harness.cjs');
function setup(){const c=client({base:'http://127.0.0.1:8787',owner:'synthetic-calendar'});vm.runInContext(fs.readFileSync('public/life-calendar.js','utf8'),c.context);return c;}
const plain=(c,code)=>JSON.parse(c.run('JSON.stringify('+code+')'));
test('month lengths and same-day navigation handle leap years, year changes and future clamping',()=>{
 const c=setup();assert.equal(plain(c,"LifeCalendar.monthDates('2024-02')").length,29);assert.equal(plain(c,"LifeCalendar.monthDates('2025-02')").length,28);
 assert.equal(c.run("LifeCalendar.moveMonth('2026-03-31',-1,'2026-10-16')"),'2026-02-28');assert.equal(c.run("LifeCalendar.moveMonth('2025-12-31',1,'2026-10-16')"),'2026-01-31');assert.equal(c.run("LifeCalendar.moveMonth('2026-09-30',1,'2026-10-16')"),'2026-10-16');assert.equal(c.run("LifeCalendar.moveMonth('2000-01-03',-1,'2026-10-16')"),'2000-01-03');assert.deepEqual(plain(c,"LifeCalendar.monthDates('2026-13')"),[]);
});
test('coverage distinguishes absent data from recorded zero, mood only and finance only days',()=>{
 const c=setup();const s=plain(c,"LifeCalendar.summarize('2026-10-12',{'2026-10-12':{health:{steps:0},focus:0,mood:3}},[],[])");assert.equal(s.count,3);assert.equal(s.coverage.health,true);assert.equal(s.focus,0);assert.equal(s.coverage.journal,true);assert.equal(s.coverage.meals,false);
 const empty=plain(c,"LifeCalendar.summarize('2026-10-13',{},[],[])");assert.equal(empty.count,0);assert.equal(empty.focus,null);
 const finance=plain(c,"LifeCalendar.summarize('2026-10-13',{},[{id:'x',date:'2026-10-13',type:'支出',amount:5}],[])");assert.equal(finance.count,1);assert.equal(finance.coverage.assets,true);
});
test('daily financial view counts legacy and active linked income/expense exactly once, excluding transfer, reconciliation and voids',()=>{
 const c=setup();const f=plain(c,`LifeCalendar.financial('2026-10-12',[{id:'legacy',date:'2026-10-12',type:'支出',amount:10}],[{id:'income',date:'2026-10-12',type:'收入',amount:50},{id:'expense',date:'2026-10-12',type:'支出',amount:20},{id:'transfer',date:'2026-10-12',type:'转账',amount:100},{id:'reconcile',date:'2026-10-12',type:'核对',amount:500},{id:'void',date:'2026-10-13',type:'撤销',amount:20,originalId:'expense'}])`);
 assert.equal(f.income,50);assert.equal(f.expense,10);assert.equal(f.records.length,5);assert.equal(f.records.find(e=>e.id==='expense').voided,true);
});
test('month totals exclude records outside the month and future days',()=>{
 const c=setup(),m=plain(c,`LifeCalendar.monthSummary('2026-10',{'2026-09-30':{health:{sleep:9}},'2026-10-12':{health:{sleep:0},meals:{breakfast:{name:'A'}},tasks:[{done:true}]},'2026-10-17':{health:{sleep:8},tasks:[{done:true}]}},[],[],'2026-10-16')`);
 assert.equal(m.elapsed,16);assert.equal(m.recorded,1);assert.equal(m.health,1);assert.equal(m.meals,1);assert.equal(m.done,1);
});
test('calendar merges Apple health with manual records without mutating or persisting anything',()=>{
 const c=setup();c.run(`TODAY='2026-10-16';state.days['2026-10-12']={health:{sleep:6,water:0},journal:'<img src=x onerror=alert(1)>',meals:{breakfast:{name:'<b>餐</b>',time:'08:00',note:'test',calories:null}},tasks:[{id:'t',title:'<script>bad</script>',tag:'工作',done:false}]};cloudHealth={'2026-10-12':{health:{sleep:8,steps:0},apple:{metrics:['sleep','steps']}}};selectedDate='2026-10-12';`);
 const before=c.run('JSON.stringify(state)'),storageBefore=[...c.storage.values];const html=c.run('LifeCalendar.page()');assert.match(html,/Apple 健康/);assert.match(html,/手动记录/);assert.match(html,/&lt;img/);assert.match(html,/&lt;script/);assert.doesNotMatch(html,/<img src=x/);assert.match(html,/data-life-meal="dinner"/);assert.match(html,/data-life-route="journal"/);assert.match(html,/2026-10-17，尚未到来/);assert.equal(c.run('JSON.stringify(state)'),before);assert.deepEqual([...c.storage.values],storageBefore);assert.equal(plain(c,"LifeCalendar.summarize('2026-10-12',allDays(),[],[])").day.health.sleep,8);
});
test('hidden asset amounts remain hidden in the daily finance card',()=>{
 const c=setup();c.run(`selectedDate='2026-10-12';assetHidden=true;state.transactions=[{id:'t',date:'2026-10-12',type:'支出',category:'其他',amount:98765.43,description:'测试'}]`);const html=c.run('LifeCalendar.page()');assert.match(html,/••••/);assert.doesNotMatch(html,/98,765\.43/);
});
