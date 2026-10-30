import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import vm from 'node:vm';
import {bodyModel as model} from './lib/body-format.mjs';
import {validatePersonalValue} from './lib/personal-format.mjs';
import {validateBackup} from './lib/backup-format.mjs';
const require=createRequire(import.meta.url),{client}=require('./personal-browser-harness.cjs');
const setup=()=>client({base:'http://127.0.0.1:8787',owner:'synthetic-body'});
const report=()=>({id:'scale-202610120930',measuredAt:'2026-10-12T09:30',source:'测试秤',notes:'测试记录',metrics:{weight:70.5,bmi:24,bodyFatPercent:20.1,muscleMass:52,obesityPercent:-2.3,weightControl:0,fatControl:-1.5},createdAt:'2026-10-12T01:30:00.000Z',updatedAt:'2026-10-12T01:30:00.000Z'});
test('saved reports can reimport a matching screenshot without replacing entered fields',()=>{
 const c=setup();c.elements.set('#record-form',{dataset:{}});c.run(`state.bodyReports=[${JSON.stringify(report())}];BodyReports.open('scale-202610120930');`);
 assert.match(c.elements.get('#modal-content').innerHTML,/body-report-file/);
 c.elements.set('#body-report-form',{dataset:{original:'scale-202610120930'}});
 c.run('$("#f-bodyMeasuredAt").value="2026-10-12T09:30";$("#f-body-weight").value="70.5";$("#f-body-score").value="";');
 assert.equal(c.run('BodyReports.apply({measuredAt:"2026-10-13T09:30",metrics:{score:80}})'),null);
 assert.equal(c.run('$("#f-body-score").value'),'');
 c.run('BodyReports.apply({measuredAt:"2026-10-12T09:30",metrics:{weight:99,score:80}})');
 assert.equal(c.run('$("#f-body-weight").value'),'70.5');assert.equal(c.run('$("#f-body-score").value'),'80');
 assert.equal(c.pending().length,0);
});
test('text parser handles stacked labels, Chinese spaces, signed controls and comparison deltas',()=>{
 const text='身体指标\n2026-10-12 09:30\n当前体重 (kg)\n70.5\n比上次 (2026-10-12 09:29)\n体重 +0.00kg 体脂率 +0.00%\nBMI\n正常\n24.0\n标 准 体 重\n72.5kg\n体脂率\n20.1%\n基础代谢\n1600\n肥胖度\n-2.3%\n体重控制\n+0.0kg\n脂肪控制\n-1.5kg';
 const parsed=model.parseText(text);assert.equal(parsed.measuredAt,'2026-10-12T09:30');assert.deepEqual(parsed.metrics,{weight:70.5,bmi:24,standardWeight:72.5,bodyFatPercent:20.1,basalMetabolism:1600,obesityPercent:-2.3,weightControl:0,fatControl:-1.5});
 const c=setup();assert.deepEqual(JSON.parse(c.run('JSON.stringify(BodyReportModel.parseText('+JSON.stringify(text)+'))')),parsed);
 const ambiguous=model.parseText('当前体重70kg\n体脂率20%\n体脂率25%');assert.equal(ambiguous.metrics.bodyFatPercent,undefined);assert.ok(ambiguous.warnings.some(v=>v.includes('多个不同值')));assert.equal(ambiguous.measuredAt,'');
 assert.equal(model.parseText('当前体重70kg\n比上次 (2026-10-12 09:29)').measuredAt,'');
});
test('report and standalone import validators preserve all metrics with strict ids, ranges and date validation',()=>{
 const c=setup(),r=report();assert.equal(model.fields.length,23);assert.equal(model.valid(r),true);assert.equal(c.run('BodyReportModel.valid('+JSON.stringify(r)+')'),true);assert.doesNotThrow(()=>validatePersonalValue('body-report/'+r.id,r));
 const b={format:'selfspace-body-report',version:1,measuredAt:r.measuredAt,metrics:r.metrics,source:r.source,notes:r.notes};assert.deepEqual(model.parseFile(b).metrics,r.metrics);
 for(const mutate of [r=>r.id='random',r=>r.measuredAt='2026-02-30T09:30',r=>r.measuredAt='2026-10-12T25:00',r=>r.metrics.weight=0,r=>r.metrics.bodyFatPercent=101,r=>r.metrics.muscleMass=-1,r=>r.metrics.unknown=1,r=>r.metrics.weight='70',r=>r.rawImage='private',r=>r.source='']){const v=report();mutate(v);assert.equal(model.valid(v),false);assert.equal(c.run('BodyReportModel.valid('+JSON.stringify(v)+')'),false);assert.throws(()=>validatePersonalValue('body-report/'+v.id,v));}
 assert.throws(()=>model.parseFile({...b,metrics:{...b.metrics,password:1}}));assert.throws(()=>validatePersonalValue('body-report/different',r));
});
test('body reports survive reload and backup round trips without persisting OCR text or original images',()=>{
 const c=setup(),r=report();c.commit('s=>s.bodyReports.push('+JSON.stringify(r)+')');const reload=client({base:'http://127.0.0.1:8787',owner:'synthetic-body',storage:c.storage});assert.deepEqual(reload.state().bodyReports,[r]);
 const flat=JSON.parse(c.run('JSON.stringify(PersonalSync.flatten(state))'));assert.deepEqual(flat['body-report/'+r.id],r);assert.equal(Object.keys(flat).filter(k=>k.startsWith('day/')).length,0);
 const b={format:'selfspace-backup',version:2,personal:Object.entries(flat).map(([key,value])=>({key,value})),health:[]};assert.deepEqual(validateBackup(b).personal.find(v=>v.key==='body-report/'+r.id).value,r);vm.runInContext(fs.readFileSync('public/backup-center.js','utf8'),c.context);assert.equal(c.run('BackupCenter.toBackup('+JSON.stringify(b)+').personal.length'),Object.keys(flat).length);
});
test('report weight is a view-only fallback, preserving existing manual and Apple values',()=>{
 const c=setup(),r=report();c.commit('s=>s.bodyReports.push('+JSON.stringify(r)+')');const before=JSON.stringify(c.state());assert.equal(c.run('day("2026-10-12").health.weight'),70.5);assert.equal(c.run('allDays()["2026-10-12"].bodyReportWeight'),true);assert.equal(JSON.stringify(c.state()),before);
 c.commit('s=>s.days["2026-10-12"]={health:{weight:71}}');assert.equal(c.run('day("2026-10-12").health.weight'),71);c.run('cloudHealth["2026-10-12"]={health:{weight:72},apple:{metrics:["weight"]}}');assert.equal(c.run('day("2026-10-12").health.weight'),72);assert.equal(c.state().bodyReports[0].metrics.weight,70.5);
});
test('duplicate timestamps require explicit update; edits use the captured record revision',()=>{
 const c=setup(),r=report();c.commit('s=>s.bodyReports.push('+JSON.stringify(r)+')');c.context.FormData=class{constructor(form){this.fields=form.fields;}get(k){return this.fields[k]??null;}};
 c.run('var bodyForm={dataset:{original:"",revisions:\'{"body-report/scale-202610120930":7}\'},fields:{bodyMeasuredAt:"2026-10-12T09:30",bodySource:"测试更新",bodyNotes:"", "body-weight":"71", "body-fatControl":"-2"},reportValidity:()=>true};');c.elements.set('#body-report-form',c.run('bodyForm'));c.run('$("#f-bodyMeasuredAt").value="2026-10-12T09:30"');assert.equal(c.run('BodyReports.save(bodyForm)'),false);assert.equal(c.state().bodyReports[0].metrics.weight,70.5);
 c.run('$("#body-replace").checked=true');assert.equal(c.run('BodyReports.save(bodyForm)'),true);assert.equal(c.state().bodyReports.length,1);assert.equal(c.state().bodyReports[0].metrics.weight,71);assert.equal(c.state().bodyReports[0].metrics.fatControl,-2);assert.equal(c.pending().at(-1).baseRevision,7);
});

function healthForm(c,fields={}){
 c.context.FormData=class{constructor(form){this.fields=form.fields;}get(k){return this.fields[k]??'';}};
 c.context.healthTestForm={dataset:{kind:'health',recordDate:'2026-10-12'},fields,reportValidity:()=>true};
 c.elements.set('#record-form',c.context.healthTestForm);
}
test('saving water does not copy report weight into manual data; later reports and reload remain live',()=>{
 const c=setup(),r=report();r.metrics.weight=70.55;c.commit('s=>s.bodyReports.push('+JSON.stringify(r)+')');c.run('selectedDate="2026-10-12"');healthForm(c,{water:'500'});
 c.run('showForm("health")');const html=c.elements.get('#modal-content').innerHTML;
 assert.match(html,/name="weight" type="number" value=""/);assert.match(html,/step="any"/);assert.match(html,/体重栏留空会继续使用报告/);
 c.run('submitRecord(healthTestForm)');assert.equal(c.state().days['2026-10-12'].health.weight,undefined);assert.equal(c.state().days['2026-10-12'].health.water,500);
 assert.ok(!c.pending().some(op=>op.key==='day/2026-10-12/health/weight'));
 c.commit('s=>s.bodyReports[0].metrics.weight=71.25');assert.equal(c.run('health().weight'),71.25);
 const reload=client({base:'http://127.0.0.1:8787',owner:'synthetic-body',storage:c.storage});assert.equal(reload.run('day("2026-10-12").health.weight'),71.25);assert.equal(reload.state().days['2026-10-12'].health.weight,undefined);
});
test('explicit manual weights preserve precision and priority; clearing returns to report; Apple stays protected',()=>{
 const c=setup(),r=report();c.commit('s=>s.bodyReports.push('+JSON.stringify(r)+')');c.run('selectedDate="2026-10-12"');healthForm(c,{weight:'70.55',water:'500'});
 c.run('submitRecord(healthTestForm)');assert.equal(c.state().days['2026-10-12'].health.weight,70.55);
 c.commit('s=>s.bodyReports[0].metrics.weight=71.25');assert.equal(c.run('health().weight'),70.55);
 healthForm(c,{water:'750'});c.run('submitRecord(healthTestForm)');assert.equal(c.run('health().weight'),71.25);assert.equal(c.state().days['2026-10-12'].health.weight,undefined);
 c.run('cloudHealth["2026-10-12"]={health:{weight:72.35},apple:{metrics:["weight"]}}');healthForm(c,{weight:'73.55',water:'1000'});c.run('submitRecord(healthTestForm)');assert.equal(c.run('health().weight'),72.35);assert.equal(c.state().days['2026-10-12'].health.weight,undefined);assert.equal(c.state().bodyReports[0].metrics.weight,71.25);
});
