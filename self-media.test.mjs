import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {validMedia} from './lib/media-format.mjs';
import {validatePersonalValue} from './lib/personal-format.mjs';
import {validateBackup} from './lib/backup-format.mjs';
const require=createRequire(import.meta.url),{client}=require('./personal-browser-harness.cjs');
const sample=()=>({id:'synthetic-post',title:'测试选题 <script>alert(1)</script>',platform:'小红书',format:'图文',status:'选题',plannedDate:'2026-11-01',publishedDate:'',url:'',script:'测试正文',notes:'',views:null,likes:null,comments:null,saves:null,createdAt:'2026-10-16T00:00:00.000Z',updatedAt:'2026-10-16T00:00:00.000Z'});
const setup=()=>client({base:'http://127.0.0.1:8787',owner:'synthetic-media'});
test('client and server agree on content validation and reject unsafe or malformed data',()=>{
 const c=setup(),cases=[sample(),{...sample(),status:'已发布',publishedDate:'2026-10-16',views:0,url:'https://example.com/post'}];
 for(const mutate of [v=>v.id='__bad/path',v=>v.title=' ',v=>v.platform='',v=>v.status='bad',v=>v.plannedDate='2026-02-30',v=>v.publishedDate=null,v=>v.status='已发布',v=>v.url='javascript:alert(1)',v=>v.url='https://user:password@example.com',v=>v.views=-1,v=>v.likes=.5,v=>v.comments=1e9+1,v=>v.script='x'.repeat(12001),v=>v.createdAt='2026-02-30T00:00:00.000Z',v=>v.token='unexpected']){const v=sample();mutate(v);cases.push(v);}
 for(const [i,v]of cases.entries()){const expected=i<2;assert.equal(validMedia(v),expected,'server case '+i);assert.equal(c.run('SelfMedia.valid('+JSON.stringify(v)+')'),expected,'browser case '+i);if(expected)assert.doesNotThrow(()=>validatePersonalValue('media/'+v.id,v));else assert.throws(()=>validatePersonalValue('media/'+v.id,v));}
 assert.throws(()=>validatePersonalValue('media/another-id',sample()));assert.doesNotThrow(()=>validatePersonalValue('media/synthetic-post',null));
});
test('empty and recorded zero metrics remain distinct and only published content contributes',()=>{
 const c=setup(),list=[{...sample(),status:'已发布',publishedDate:'2026-10-16',views:0},{...sample(),id:'second',status:'已发布',publishedDate:'2026-09-16',views:null,likes:12},{...sample(),id:'draft',views:999}];
 const s=JSON.parse(c.run('JSON.stringify(SelfMedia.summary('+JSON.stringify(list)+',"2026-10-16"))'));
 assert.equal(s.month,1);assert.equal(s.published,2);assert.deepEqual(s.metrics.views,{value:0,count:1});assert.deepEqual(s.metrics.comments,{value:null,count:0});assert.equal(s.metrics.likes.value,12);assert.equal(s.counts['选题'],1);
});
test('search and filters combine without losing long-form content; planned dates sort first',()=>{
 const c=setup(),list=[sample(),{...sample(),id:'b',plannedDate:'2026-10-19',platform:'B站',script:'独特脚本关键词'},{...sample(),id:'c',plannedDate:'',status:'创作中'}];
 const search=(f)=>JSON.parse(c.run('JSON.stringify(SelfMedia.filtered('+JSON.stringify(list)+','+JSON.stringify({search:'',platform:'',status:'',...f})+'))'));
 assert.equal(search({search:'脚本',platform:'B站'})[0].id,'b');assert.equal(search({status:'创作中'}).length,1);assert.deepEqual(search({}).map(v=>v.id),['b','synthetic-post','c']);
});
test('content survives local reload, legacy migration and backup round trips without affecting existing records',()=>{
 const c=setup(),v=sample();c.commit('s=>{s.media.push('+JSON.stringify(v)+');s.days["2026-10-16"]={journal:"保留手记"}}');
 const reload=client({base:'http://127.0.0.1:8787',owner:'synthetic-media',storage:c.storage});assert.deepEqual(reload.state().media,[v]);assert.equal(reload.state().days['2026-10-16'].journal,'保留手记');
 const flat=JSON.parse(c.run('JSON.stringify(PersonalSync.flatten(state))'));assert.deepEqual(flat['media/'+v.id],v);assert.deepEqual(JSON.parse(c.run('JSON.stringify(PersonalSync.hydrate('+JSON.stringify(flat)+').media)')),[v]);
 const backup={format:'selfspace-backup',version:2,personal:Object.entries(flat).map(([key,value])=>({key,value})),health:[]};assert.deepEqual(validateBackup(backup).personal.find(x=>x.key==='media/'+v.id).value,v);
 vm.runInContext(fs.readFileSync('public/backup-center.js','utf8'),c.context);assert.equal(c.run('BackupCenter.toBackup('+JSON.stringify(backup)+').personal.some(x=>x.key==="media/synthetic-post")'),true);
 const old=c.state();delete old.media;assert.doesNotThrow(()=>c.run('validate('+JSON.stringify(old)+')'));assert.throws(()=>c.run('validate('+JSON.stringify({...old,media:[v,v]})+')'));
});
test('new navigation and empty page render with escaped user content and zero fabricated entries',()=>{
 const c=setup();c.run('page="media";render()');assert.match(c.elements.get('#main').innerHTML,/记录第一个选题/);assert.equal(c.state().media.length,0);
 c.commit('s=>s.media.push('+JSON.stringify(sample())+')');const html=c.elements.get('#main').innerHTML;assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<script>alert(1)</script>'));assert.match(fs.readFileSync('ui/shell.html','utf8'),/data-page="media"/);
});

test('reused platform drafts preserve full text but reset publication state and leave the source untouched',()=>{
 const c=setup(),source={...sample(),platform:'X',accountId:'primary-x',format:'文章',status:'已发布',plannedDate:'2026-10-15',publishedDate:'2026-10-16',url:'https://example.com/synthetic',script:'保留完整正文\n'+ '长文'.repeat(5900),notes:'原始出处与核对备注',views:0,likes:123,comments:4,saves:8};
 for(const [platform,account,format] of [['X','primary-x','图文'],['小红书','primary-xiaohongshu','图文'],['抖音','primary-douyin','短视频']]){
  const draft=JSON.parse(c.run(`JSON.stringify(SelfMedia.reusableDraft(${JSON.stringify(source)},${JSON.stringify(platform)},'new-platform-draft','2026-10-18T00:00:00.000Z'))`));
  assert.equal(draft.accountId,account);assert.equal(draft.platform,platform);assert.equal(draft.format,format);assert.equal(draft.status,'选题');assert.equal(draft.script,source.script);assert.equal(draft.notes,source.notes);assert.equal(draft.title,source.title);assert.notEqual(draft.id,source.id);
  for(const key of ['plannedDate','publishedDate','url'])assert.equal(draft[key],'');for(const key of ['views','likes','comments','saves'])assert.equal(draft[key],null);
  assert.equal(validMedia(draft),true);assert.doesNotThrow(()=>validatePersonalValue('media/'+draft.id,draft));
 }
 assert.equal(source.status,'已发布');assert.equal(source.likes,123);assert.throws(()=>c.run(`SelfMedia.reusableDraft(${JSON.stringify(source)},'微博')`));assert.throws(()=>c.run(`SelfMedia.reusableDraft(${JSON.stringify(source)},'X','${source.id}')`));
});

test('reuse dialog escapes the source and blocks changed, deleted or account-switched sources before opening a draft',()=>{
 const c=setup(),source=sample();c.commit('s=>s.media.push('+JSON.stringify(source)+')');
 c.run('PersonalSync.dataState=()=>({owner:"synthetic-media"});modalShell=(title,subtitle,body)=>{testDialog=body;modal.open=true};');c.run('SelfMedia.chooseReuse("synthetic-post")');assert.match(c.run('testDialog'),/&lt;script&gt;/);assert.ok(!c.run('testDialog').includes('<script>alert(1)</script>'));
 const original=JSON.stringify(Object.keys(source).sort().map(k=>[k,source[k]])),form={dataset:{id:source.id,owner:'synthetic-media',original},elements:{namedItem:()=>({value:'抖音'})}};c.context.testReuseForm=form;c.context.document.getElementById=id=>id==='media-reuse-form'?form:null;
 c.commit('s=>s.media[0].script="Changed in another page"');assert.equal(c.run('SelfMedia.startReuse(testReuseForm)'),false);assert.match(c.elements.get('#media-reuse-error').textContent,/修改或删除/);assert.equal(c.state().media.length,1);
 c.commit('s=>s.media=[]');assert.equal(c.run('SelfMedia.startReuse(testReuseForm)'),false);c.run('PersonalSync.dataState=()=>({owner:"different-account"})');assert.equal(c.run('SelfMedia.startReuse(testReuseForm)'),false);assert.match(c.elements.get('#media-reuse-error').textContent,/账号/);
});

test('copying text uses current unsaved input, leaves records unchanged and handles empty or denied clipboard',async()=>{
 const c=setup(),input={value:'未保存的正文\n保留换行'},note={textContent:''},form={elements:{namedItem:()=>input}};c.context.document.getElementById=id=>id==='media-form'?form:note;c.run('modal.open=true');const before=c.state();assert.equal(await c.run('SelfMedia.copyScript()'),true);assert.equal(c.copied(),input.value);assert.deepEqual(c.state(),before);assert.match(note.textContent,/已复制/);
 input.value=' ';assert.equal(await c.run('SelfMedia.copyScript()'),false);assert.match(note.textContent,/空/);input.value='正文仍在';c.context.navigator.clipboard.writeText=async()=>{throw Error('denied')};assert.equal(await c.run('SelfMedia.copyScript()'),false);assert.match(note.textContent,/手动/);assert.equal(input.value,'正文仍在');
});
