import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {checklistModel as M} from './lib/checklist-format.mjs';
import {validatePersonalValue} from './lib/personal-format.mjs';
import {draftFormat} from './lib/draft-format.mjs';
import {searchModel} from './lib/search-format.mjs';
const require=createRequire(import.meta.url),{client,Storage}=require('./personal-browser-harness.cjs');
const now=Date.parse('2026-10-28T02:00:00.000Z'),stamp=new Date(now).toISOString();
const task=(v={})=>({id:'synthetic-task',title:'整理新闻来源',notes:'核对原始公告',category:'自媒体',priority:'高',status:'未开始',dueAt:'2026-10-28T18:00',remindAt:'2026-10-28T09:00',completedAt:'',createdAt:stamp,updatedAt:stamp,schemaVersion:1,...v});
test('strict schema accepts future dates, empty optional times and completed records; rejects malformed data',()=>{
  for(const t of [task(),task({dueAt:'2030-01-01T18:00'}),task({dueAt:'',remindAt:''}),task({status:'已完成',completedAt:stamp})]){assert.ok(M.valid(t));validatePersonalValue('todo/'+t.id,t);}
  for(const t of [task({dueAt:'2026-02-30T10:00'}),task({remindAt:'2026-10-28T19:00'}),task({status:'已完成'}),task({completedAt:stamp}),task({title:'  '}),task({status:'未知'}),task({extra:true}),task({dueAt:'2026-10-28T24:00'})]){assert.equal(M.valid(t),false);assert.throws(()=>validatePersonalValue('todo/'+t.id,t));}
  assert.throws(()=>validatePersonalValue('todo/mismatch',task()));validatePersonalValue('todo/synthetic-task',null);
});
test('Beijing dates and exact cutoff distinguish today, overdue, future and undated tasks',()=>{
  assert.equal(M.localNow(Date.parse('2026-10-27T17:00:00Z')),'2026-10-28T01:00');
  assert.equal(M.phase(task(),now),'today');assert.equal(M.phase(task({dueAt:'2026-10-28T09:59'}),now),'overdue');
  assert.equal(M.phase(task({dueAt:'2026-10-29T01:00'}),now),'upcoming');assert.equal(M.phase(task({dueAt:''}),now),'unscheduled');
  assert.equal(M.phase(task({status:'已完成',completedAt:stamp,dueAt:'2026-10-27T01:00'}),now),'done');
  assert.deepEqual(M.summary([task(),task({dueAt:'2026-10-28T09:00'}),task({status:'已完成',completedAt:stamp})],now),{open:2,today:2,overdue:1,done:1});
});
test('filters, normalization, sort and pagination include all tasks without duplicate pages',()=>{
  const items=Array.from({length:32},(_,i)=>task({id:'task-'+i,priority:i===0?'低':'高',title:i===0?'ＡＩ 新闻':'其他新闻',dueAt:i%2?'2026-10-29T10:00':'2026-10-28T09:00'}));
  assert.equal(M.select(items,{query:'AI',now}).total,1);assert.equal(M.select(items,{filter:'overdue',now}).total,16);
  const pages=[1,2,3].flatMap(page=>M.select(items,{page,now}).rows);assert.equal(pages.length,32);assert.equal(new Set(pages.map(v=>v.id)).size,32);
  assert.notEqual(M.select(items,{sort:'priority',now}).rows[0].id,'task-0');assert.equal(M.select(items,{category:'健康',now}).total,0);
});
test('future delivery contract excludes completed, unscheduled and not-yet-due reminders',()=>{
  const items=[task(),task({id:'future',remindAt:'2026-10-28T11:00'}),task({id:'done',status:'已完成',completedAt:stamp}),task({id:'no-reminder',remindAt:''})];
  const candidates=M.reminderCandidates(items,now);assert.equal(candidates.length,1);assert.equal(candidates[0].scheduledAt,'2026-10-28T01:00:00.000Z');assert.equal(candidates[0].timezone,'Asia/Shanghai');
});
test('browser and server models share schema and task drafts/search retain key fields',()=>{
  const c=vm.createContext({Date});vm.runInContext(fs.readFileSync('public/checklist-model.js','utf8')+';globalThis.M=ChecklistModel;',c);assert.equal(c.M.canonical(task()),M.canonical(task()));
  assert.deepEqual(draftFormat.names({type:'todo'}),['todoTitle','todoCategory','todoPriority','todoStatus','todoDueAt','todoRemindAt','todoNotes']);
  const rows=searchModel.build({days:{},todos:[task()]});assert.equal(rows[0].kind,'checklist');assert.equal(searchModel.search(rows,{query:'原始公告'}).total,1);
});
function setup(storage=new Storage()){
  storage.setItem('selfspace-personal-v1',JSON.stringify({version:1,owner:'synthetic-checklist',records:{'todo/synthetic-task':{key:'todo/synthetic-task',value:task(),revision:4,updatedAt:stamp}},generation:null,migrated:true,lastSynced:null}));
  const c=client({base:'http://127.0.0.1:8787',owner:'synthetic-checklist',storage});c.context.document.getElementById=id=>c.elements.get('#'+id)||null;return c;
}
test('sync and backup state round-trip tasks while stale quick actions cannot overwrite edits',()=>{
  const c=setup();assert.equal(c.state().todos[0].title,task().title);
  c.context.action={dataset:{id:'synthetic-task',owner:'synthetic-checklist',original:M.canonical(task()),revision:'4'}};
  assert.equal(c.run('Checklist.change(action)'),true);assert.equal(c.state().todos[0].status,'已完成');assert.ok(c.state().todos[0].completedAt);
  const v=c.state().todos[0];assert.ok(M.valid(v));assert.equal(c.pending()[0].baseRevision,4);
  assert.equal(c.run('Checklist.change(action)'),false);assert.equal(c.state().todos[0].status,'已完成');
  assert.equal(c.run('validate(structuredClone(state)).todos[0].id'),'synthetic-task');
  const damaged=c.state();damaged.todos[0].remindAt='invalid';c.context.damaged=damaged;assert.throws(()=>c.run('validate(damaged)'));
});
test('task editor refuses stale values and owner switches while preserving a rejected form',()=>{
  const c=setup();c.context.FormData=class{constructor(f){this.f=f;}get(k){return this.f.values[k]||'';}};
  const form={dataset:{id:'synthetic-task',owner:'synthetic-checklist',original:M.canonical(task()),revisions:JSON.stringify({'todo/synthetic-task':4})},values:{todoTitle:'更新标题',todoNotes:'',todoCategory:'工作',todoPriority:'中',todoStatus:'进行中',todoDueAt:'2030-10-28T10:00',todoRemindAt:''},reportValidity:()=>true};
  c.context.form=form;c.elements.set('#checklist-form',form);c.edit();
  assert.equal(c.run('Checklist.save(form)'),true);assert.equal(c.state().todos[0].dueAt,'2030-10-28T10:00');assert.equal(c.state().todos[0].status,'进行中');
  c.edit();assert.equal(c.run('Checklist.save(form)'),false);form.dataset.original=M.canonical(c.state().todos[0]);form.dataset.owner='other';assert.equal(c.run('Checklist.save(form)'),false);
});
