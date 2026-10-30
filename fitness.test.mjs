import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import vm from 'node:vm';
import {fitnessModel as m} from './lib/fitness-format.mjs';
import {parseBridgeSnapshot} from './lib/bridge-format.mjs';
import {validateBackup} from './lib/backup-format.mjs';
const require=createRequire(import.meta.url),{client}=require('./personal-browser-harness.cjs');
const date='2026-10-14';
const workout=()=>({id:'00000000-0000-4000-8000-000000000001',type:'running',start:'2026-10-13T23:00:00.000Z',end:'2026-10-13T23:35:00.000Z',durationSec:1800,source:'合成测试',distanceMeters:5000,energyKcal:250,heartRateAvg:130});
const fitness=()=>({rings:{moveKcal:650,moveGoalKcal:500,exerciseMin:0,exerciseGoalMin:30,standHours:6,standGoalHours:12,moveMode:0},workouts:[workout()]});
const clientUI=()=>client({base:'http://127.0.0.1:8787',owner:'synthetic-fitness-ui'});
test('fitness format parity, units, Shanghai start date, missing values and strict privacy boundary',()=>{
 const c=clientUI(),f=fitness();assert.equal(m.valid(f,date),true);assert.equal(c.run('FitnessModel.valid('+JSON.stringify(f)+','+JSON.stringify(date)+')'),true);
 const mutations=[f=>f.workouts.push(f.workouts[0]),f=>f.workouts[0].durationSec=-1,f=>f.workouts[0].start='bad',f=>f.workouts[0].end='2026-10-13T22:00:00.000Z',f=>f.workouts[0].distanceMeters=-1,f=>f.rings.standHours=25,f=>f.rings.moveMode=3,f=>f.workouts[0].route=[{lat:1,lon:2}],f=>f.rawImage='private'];
 for(const change of mutations){const f=fitness();change(f);assert.equal(m.valid(f,date),false);assert.equal(c.run('FitnessModel.valid('+JSON.stringify(f)+','+JSON.stringify(date)+')'),false);}
 assert.equal(m.valid(f,'2026-10-13'),false);assert.equal(m.valid({rings:null,workouts:[]},date),true);assert.equal(m.valid({...f,rings:{moveMode:1,moveTimeMin:0,moveTimeGoalMin:60}},date),true);
});
test('fitness snapshots and complete backups preserve rings/workouts without mixing into daily health',()=>{
 const f=fitness(),p=parseBridgeSnapshot({source:'puls',days:[{date,health:{steps:4000},fitness:f}]},'2026-10-17');assert.equal(p.rows.length,2);assert.deepEqual(p.rows[1],{date,metric:'fitness',value:{fitness:f}});
 const b={format:'selfspace-backup',version:2,personal:[],health:p.rows};assert.deepEqual(validateBackup(b).health[1].value.fitness,f);assert.throws(()=>validateBackup({...b,health:[{date,metric:'fitness',value:{fitness:{...f,route:[]}}}]}));
 const c=clientUI();vm.runInContext(fs.readFileSync('public/backup-center.js','utf8'),c.context);c.run('cloudHealth['+JSON.stringify(date)+']='+JSON.stringify({health:{steps:4000},fitness:f}));
 const converted=c.run('BackupCenter.fromDevice(BackupCenter.localBackup())');assert.deepEqual(JSON.parse(JSON.stringify(converted.health)),b.health);
 const full=c.run('BackupCenter.toBackup('+JSON.stringify(b)+')');assert.deepEqual(JSON.parse(JSON.stringify(full.health)),b.health);
});
test('rings show missing values separately from zero, support move minutes, and never add workouts to daily totals',()=>{
 const c=clientUI(),f=fitness();c.run('selectedDate='+JSON.stringify(date)+';cloudHealth['+JSON.stringify(date)+']='+JSON.stringify({health:{activeEnergy:900},fitness:f}));let html=c.run('Fitness.panel()');assert.match(html,/130/);assert.match(html,/0%/);assert.match(html,/跑步/);assert.equal(c.run('health().activeEnergy'),900);assert.equal(c.run('state.days[selectedDate]?.health'),undefined);
 c.run('cloudHealth[selectedDate].fitness.rings=null');assert.match(c.run('Fitness.panel()'),/尚未收到圆环摘要/);
 c.run('cloudHealth[selectedDate].fitness.rings={moveMode:1,moveTimeMin:20,moveTimeGoalMin:40}');html=c.run('Fitness.panel()');assert.match(html,/活动分钟/);assert.match(html,/50/);assert.match(html,/未收到该项数值/);
});
test('workout list pages, filters by type/date, escapes source and uses source dates in details',()=>{
 const c=clientUI(),f=fitness();f.workouts=Array.from({length:8},(_,i)=>({...workout(),id:'00000000-0000-4000-8000-'+String(i+1).padStart(12,'0'),type:i%2?'cycling':'running',source:'<img onerror=alert(1)>'}));
 c.run('selectedDate='+JSON.stringify(date)+';cloudHealth['+JSON.stringify(date)+']='+JSON.stringify({health:{},fitness:f}));const html=c.run('Fitness.panel()');assert.match(html,/第 1 \/ 2 页/);assert.equal((html.match(/data-fitness="detail"/g)||[]).length,6);
 c.elements.set('#record-form',{dataset:{}});c.run('Fitness.detail("'+f.workouts[0].id+'")');const detail=c.elements.get('#modal-content').innerHTML;assert.match(detail,/&lt;img/);assert.ok(!detail.includes('<img onerror'));assert.match(detail,/2026.10.14 07:00/);
});
