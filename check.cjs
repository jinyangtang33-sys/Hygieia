const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const {randomUUID} = require('node:crypto');
const elements = new Map();
const element = key => {
  if (!elements.has(key)) elements.set(key, {innerHTML:'',textContent:'',value:'',className:'',dataset:{},classList:{add(){},remove(){},toggle(){}},addEventListener(){},setAttribute(){},removeAttribute(){},close(){this.open=false;},showModal(){this.open=true;}});
  return elements.get(key);
};
let tick, now=Date.now(), blocked=false;
class ClockDate extends Date {static now(){return now;}}
const memory = new Map();
const context = vm.createContext({
  console, Date:ClockDate, Intl, structuredClone, crypto:{randomUUID},
  localStorage:{getItem:k=>memory.get(k)||null,setItem:(k,v)=>{if(blocked)throw new Error('QuotaExceeded');memory.set(k,v);}},
  document:{querySelector:element,querySelectorAll:()=>[],addEventListener(){},title:''},
  location:{hash:''},window:{addEventListener(){},scrollTo(){}},
  setTimeout:()=>1,clearTimeout(){},setInterval:fn=>{tick=fn;return 1;},clearInterval(){},
});
vm.runInContext(fs.readFileSync(__dirname+'/public/health-sync.js','utf8')+'\n'+fs.readFileSync(__dirname+'/public/app.js','utf8'),context);
const run = code => vm.runInContext(code,context);
let passed=0;
function check(name,fn){fn();passed++;console.log('PASS '+name);}
check('first visit starts with empty real records',()=>{assert.equal(run('state.demo'),false);assert.equal(run('Object.keys(state.days).length'),0);assert.equal(run('state.accounts.length'),0);});
check('blank and demo backups validate',()=>{assert.equal(run('validate(blank()).version'),1);assert.equal(run('validate(legacyDemoTemplate()).demo'),true);});
check('invalid dates are rejected',()=>assert.throws(()=>run("const invalidDate=blank();invalidDate.days['2026-02-30']={};validate(invalidDate)")));
check('negative health data is rejected',()=>assert.throws(()=>run("const invalidHealth=legacyDemoTemplate();invalidHealth.days[TODAY].health.water=-1;validate(invalidHealth)")));
check('duplicate account IDs are rejected',()=>assert.throws(()=>run('const duplicate=legacyDemoTemplate();duplicate.accounts.push(duplicate.accounts[0]);validate(duplicate)')));
check('invalid meal times are rejected',()=>assert.throws(()=>run("const invalidMeal=legacyDemoTemplate();invalidMeal.days[TODAY].meals.breakfast.time='25:00';validate(invalidMeal)")));
check('zero-value financial transactions are rejected',()=>assert.throws(()=>run('const invalidMoney=legacyDemoTemplate();invalidMoney.transactions[0].amount=0;validate(invalidMoney)')));
check('user text is escaped',()=>assert.equal(run('esc(\'<img src=x onerror="alert(1)">\')'),'&lt;img src=x onerror=&quot;alert(1)&quot;&gt;'));
check('all eight sections render with empty data',()=>{run('state=blank()');for(const p of ['overview','health','meals','work','assets','trends','journal','settings']){run(`page='${p}';render()`);assert.ok(element('#main').innerHTML.length>200);assert.ok(!element('#main').innerHTML.includes('NaN'));}});
check('all eight sections render with demo data',()=>{run('state=legacyDemoTemplate()');for(const p of ['overview','health','meals','work','assets','trends','journal','settings'])run(`page='${p}';render()`);});
check('failed persistence preserves committed state',()=>{blocked=true;const oldName=run('state.settings.name');assert.equal(run("commit(s=>s.settings.name='Unsaved')"),false);assert.equal(run('state.settings.name'),oldName);blocked=false;});
check('liabilities are deducted from net assets',()=>{run("state=blank();state.accounts=[{id:'a',name:'现金',type:'现金与存款',balance:100},{id:'b',name:'负债',type:'负债',balance:30}]");assert.equal(run('totalAssets()'),70);});
check('JSON round-trip retains records',()=>{run("state=blank();commit(s=>s.days[TODAY]={journal:'Round-trip record'})");const saved=JSON.parse(memory.get('selfspace-v1'));assert.equal(saved.version,1);assert.equal(Object.values(saved.days)[0].journal,'Round-trip record');});
check('synced fields merge without changing local manual records',()=>{run("state=blank();state.days[TODAY]={health:{sleep:6,weight:58},journal:'手记'};cloudHealth={[TODAY]:{health:{sleep:7.5,steps:8000},apple:{source:'Apple 健康',updatedAt:new Date().toISOString()}}}");assert.equal(run('health().sleep'),7.5);assert.equal(run('health().weight'),58);assert.equal(run('state.days[TODAY].health.sleep'),6);assert.equal(run('day().journal'),'手记');});
check('cloud health remains visible after clearing legacy examples',()=>{run('state=cleanDemoRecords(legacyDemoTemplate());selectedDate=TODAY');assert.equal(run('health().sleep'),7.5);});
check('cloud-inclusive backups validate and preserve stage details',()=>{run('cloudHealth[TODAY].health.deepSleep=1.2;cloudHealth[TODAY].health.hrv=45');assert.equal(run('validate({...state,days:structuredClone(allDays())}).days[TODAY].health.deepSleep'),1.2);});
check('sync section renders without exposing setup credentials',()=>{run("page='sync';render()");assert.ok(element('#main').innerHTML.includes('生成连接配置'));assert.ok(!element('#main').innerHTML.includes('hax_'));});
check('legacy examples from earlier dates are fully removed and cleanup is idempotent',()=>{
  run('var oldDemo=legacyDemoTemplate(shiftDate(TODAY,-45));oldDemo.settings.name="我的名字";var cleanedDemo=cleanDemoRecords(oldDemo)');
  assert.equal(run('cleanedDemo.demo'),false);assert.equal(run('Object.keys(cleanedDemo.days).length'),0);assert.equal(run('cleanedDemo.accounts.length'),0);assert.equal(run('cleanedDemo.transactions.length'),0);assert.equal(run('cleanedDemo.settings.name'),'我的名字');assert.equal(run('JSON.stringify(cleanDemoRecords(cleanedDemo))'),run('JSON.stringify(cleanedDemo)'));
});
check('personal additions and edited fields survive legacy cleanup',()=>{
  run(`var mixed=legacyDemoTemplate();mixed.days[TODAY].health.steps=12345;mixed.days[TODAY].meals.breakfast.name='我的早餐';mixed.days[TODAY].tasks[0].title='我的真实工作';mixed.days[TODAY].journal='我的真实手记';mixed.accounts[0].balance=42;mixed.accounts.push({id:'real-account',name:'真实账户',type:'现金与存款',balance:100});mixed.transactions.push({id:'real-payment',date:TODAY,type:'支出',category:'生活',amount:42,description:'真实消费'});var personal=cleanDemoRecords(mixed)`);
  assert.equal(run('personal.days[TODAY].health.steps'),12345);assert.equal(run('Object.keys(personal.days[TODAY].health).length'),1);assert.equal(run('personal.days[TODAY].meals.breakfast.name'),'我的早餐');assert.equal(run('personal.days[TODAY].tasks.length'),1);assert.equal(run('personal.days[TODAY].journal'),'我的真实手记');assert.equal(run('personal.accounts.length'),2);assert.equal(run('personal.transactions.length'),1);
});
check('existing personal spaces and Apple-marked local records are preserved',()=>{
  run('var alreadyPersonal=legacyDemoTemplate();alreadyPersonal.demo=false;var beforePersonal=JSON.stringify(alreadyPersonal)');assert.equal(run('JSON.stringify(cleanDemoRecords(alreadyPersonal))'),run('beforePersonal'));
  run("var withApple=legacyDemoTemplate();withApple.days[TODAY].apple={source:'Apple 健康'};var appleCleaned=cleanDemoRecords(withApple)");assert.equal(run('appleCleaned.days[TODAY].health.sleep'),run('withApple.days[TODAY].health.sleep'));
});
check('opening an old browser archive migrates once and keeps a downloadable original',()=>{
  const raw=run('JSON.stringify(legacyDemoTemplate(shiftDate(TODAY,-20)))');memory.set('selfspace-v1',raw);memory.delete('selfspace-v1-before-demo-cleanup');
  const reboot=vm.createContext({...context});vm.runInContext(fs.readFileSync(__dirname+'/public/health-sync.js','utf8')+'\n'+fs.readFileSync(__dirname+'/public/app.js','utf8'),reboot);
  assert.equal(vm.runInContext('state.demo',reboot),false);assert.equal(vm.runInContext('Object.keys(state.days).length',reboot),0);assert.equal(memory.get('selfspace-v1-before-demo-cleanup'),raw);assert.equal(JSON.parse(memory.get('selfspace-v1')).demo,false);assert.ok(vm.runInContext('settingsPage()',reboot).includes('下载清理前存档'));
});
console.log(`\n${passed} checks passed.`);
