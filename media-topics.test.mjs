import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {createRequire} from 'node:module';
import {mediaTopicModel as M} from './lib/media-topic-format.mjs';import {validMedia} from './lib/media-format.mjs';import {validatePersonalValue} from './lib/personal-format.mjs';import {validateBackup} from './lib/backup-format.mjs';import {searchModel} from './lib/search-format.mjs';
const require=createRequire(import.meta.url),{client}=require('./personal-browser-harness.cjs');
const setup=()=>client({base:'http://127.0.0.1:8787',owner:'synthetic-topics'});
const topic=()=>({id:'synthetic-topic',title:'合成新闻资料 <script>bad()</script>',eventDate:'2026-10-20',sources:[{title:'测试原始出处',url:'https://example.com/original',publishedDate:'2026-10-19'}],facts:'已由测试人员核对的事实',viewpoint:'个人判断与不确定性',questions:'后续需要观察的问题',createdAt:'2026-10-20T00:00:00.000Z',updatedAt:'2026-10-21T00:00:00.000Z'});
const post=()=>({id:'synthetic-post',topicId:'synthetic-topic',title:'平台版本',platform:'X',accountId:'primary-x',format:'图文',status:'已发布',plannedDate:'',publishedDate:'2026-10-21',url:'',script:'测试正文',notes:'',views:0,likes:null,comments:null,saves:null,createdAt:'2026-10-20T00:00:00.000Z',updatedAt:'2026-10-21T00:00:00.000Z'});

test('topic client and server share exact validation, including source links and real calendar dates',()=>{
 const c=setup(),cases=[topic(),{...topic(),eventDate:'',sources:[],facts:'',viewpoint:'',questions:''}];
 for(const mutate of [v=>v.title=' ',v=>v.id='bad/path',v=>v.eventDate='2026-02-30',v=>v.sources[0].url='javascript:alert(1)',v=>v.sources[0].url='https://user:pass@example.com',v=>v.sources[0].publishedDate='2025-02-29',v=>v.sources[0].unexpected='bad',v=>v.sources=Array(6).fill(v.sources[0]),v=>v.facts='x'.repeat(6001),v=>v.createdAt='2026-02-30T00:00:00.000Z',v=>v.token='unexpected']){const v=topic();mutate(v);cases.push(v);}
 cases.forEach((v,i)=>{assert.equal(M.valid(v),i<2);assert.equal(c.run(`MediaTopicModel.valid(${JSON.stringify(v)})`),i<2);if(i<2)assert.doesNotThrow(()=>validatePersonalValue('media-topic/'+v.id,v));else assert.throws(()=>validatePersonalValue('media-topic/'+v.id,v));});assert.throws(()=>validatePersonalValue('media-topic/wrong',topic()));
 assert.equal(fs.readFileSync('public/media-topic-model.js','utf8'),fs.readFileSync('lib/media-topic-format.mjs','utf8').replace('export function','function').replace('export const mediaTopicModel=createMediaTopicModel();','const MediaTopicModel=createMediaTopicModel();'));
});
test('linked posts remain backwards compatible, validate ids, and preserve their topic when reused',()=>{
 const c=setup(),v=post();assert.equal(validMedia(v),true);assert.equal(c.run(`SelfMedia.valid(${JSON.stringify(v)})`),true);const legacy={...v};delete legacy.topicId;assert.equal(validMedia(legacy),true);
 for(const topicId of [null,5,'bad/path','x'.repeat(101)]){assert.equal(validMedia({...v,topicId}),false);assert.equal(c.run(`SelfMedia.valid(${JSON.stringify({...v,topicId})})`),false);}
 const copy=JSON.parse(c.run(`JSON.stringify(SelfMedia.reusableDraft(${JSON.stringify(v)},'抖音','synthetic-copy'))`));assert.equal(copy.topicId,v.topicId);assert.equal(copy.status,'选题');assert.equal(copy.views,null);assert.equal(v.status,'已发布');
});
test('three platform progress retains every independent version, including unfinished ones beside published posts',()=>{
 const posts=[post(),{...post(),id:'x-unfinished',status:'创作中'},{...post(),id:'red',platform:'小红书',accountId:'primary-xiaohongshu',status:'待发布'},{...post(),id:'other-topic',topicId:'other'},{...post(),id:'unlinked',topicId:''}];
 const r=M.progress('synthetic-topic',posts);assert.equal(r[0].posts.length,2);assert.equal(r[0].counts['已发布'],1);assert.equal(r[0].counts['创作中'],1);assert.equal(r[1].counts['待发布'],1);assert.equal(r[2].posts.length,0);assert.equal(posts[1].status,'创作中');
});
test('topic pagination is bounded and searches complete facts and source names',()=>{
 const list=Array.from({length:14},(_,i)=>({...topic(),id:'topic-'+String(i).padStart(2,'0')}));assert.equal(M.select(list,'',1).rows.length,6);assert.equal(M.select(list,'',99).rows.length,2);assert.equal(M.select(list,'',99).page,3);assert.equal(M.select(list,'测试原始出处').total,14);assert.equal(M.select(list,'不存在').total,0);
});
test('topics and relationships survive local reload, cloud record flattening and both backup readers',()=>{
 const c=setup();c.commit(`s=>{s.mediaTopics.push(${JSON.stringify(topic())});s.media.push(${JSON.stringify(post())});}`);
 const reload=client({base:'http://127.0.0.1:8787',owner:'synthetic-topics',storage:c.storage});assert.deepEqual(reload.state().mediaTopics,[topic()]);assert.equal(reload.state().media[0].topicId,topic().id);
 const flat=JSON.parse(c.run('JSON.stringify(PersonalSync.flatten(state))')),backup={format:'selfspace-backup',version:2,personal:Object.entries(flat).map(([key,value])=>({key,value})),health:[]};assert.equal(validateBackup(backup).personal.find(r=>r.key==='media-topic/synthetic-topic').value.sources[0].url,topic().sources[0].url);
 c.run(fs.readFileSync('public/backup-center.js','utf8'));assert.equal(c.run(`BackupCenter.toBackup(${JSON.stringify(backup)}).personal.some(r=>r.key==='media-topic/synthetic-topic')`),true);
 const legacy=reload.state();delete legacy.mediaTopics;assert.doesNotThrow(()=>c.run(`validate(${JSON.stringify(legacy)})`));
});
test('topic rendering escapes titles and evidence, and search includes structured materials',()=>{
 const c=setup();c.commit(`s=>s.mediaTopics.push(${JSON.stringify(topic())})`);const html=c.run('MediaTopics.panel()');assert.match(html,/&lt;script&gt;/);assert.ok(!html.includes('<script>bad()'));assert.match(html,/尚未建稿/);
 const rows=searchModel.build(c.state());assert.equal(searchModel.search(rows,{kind:'topic',query:'测试原始出处'}).total,1);assert.equal(searchModel.search(rows,{kind:'topic',query:'后续需要观察'}).items[0].date,'2026-10-21');
});
test('topic save changes only its own record and refuses a stale or account-switched form',()=>{
 const c=setup(),fields={topicTitle:'合成选题',topicFacts:'合成事实',topicSourceTitle0:'官方出处',topicSourceUrl0:'https://example.com/source'},form={dataset:{id:'new-topic',created:'',owner:'synthetic-topics',original:'null',revisions:'{}'},reportValidity:()=>true};
 c.context.FormData=class{get(k){return fields[k]||''}};c.context.document.getElementById=id=>id==='media-topic-form'?form:null;c.context.topicForm=form;c.run('PersonalSync.dataState=()=>({owner:"synthetic-topics",ready:true});modal.open=true');
 assert.equal(c.run('MediaTopics.save(topicForm)'),true);assert.equal(c.state().mediaTopics.length,1);assert.equal(c.state().media.length,0);assert.equal(c.pending().filter(p=>p.key==='media-topic/new-topic').length,1);
 form.dataset.original=M.canonical(c.state().mediaTopics[0]);form.dataset.created=c.state().mediaTopics[0].createdAt;c.commit('s=>s.mediaTopics[0].facts="另一页面的新版本"');c.run('modal.open=true');assert.equal(c.run('MediaTopics.save(topicForm)'),false);assert.match(c.elements.get('#media-topic-error').textContent,/其他页面修改/);assert.equal(c.state().mediaTopics[0].facts,'另一页面的新版本');
 c.run('PersonalSync.dataState=()=>({owner:"another-account"})');assert.equal(c.run('MediaTopics.save(topicForm)'),false);assert.match(c.elements.get('#media-topic-error').textContent,/账号/);
});
