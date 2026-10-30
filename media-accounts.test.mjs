import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {validMedia,validMediaProfile} from './lib/media-format.mjs';
import {validatePersonalValue} from './lib/personal-format.mjs';
import {validateBackup} from './lib/backup-format.mjs';
const require=createRequire(import.meta.url),{client}=require('./personal-browser-harness.cjs');
const setup=()=>client({base:'http://127.0.0.1:8787',owner:'synthetic-profile'});
const profile=(id='primary-x',platform='X')=>({id,platform,status:'筹备中',nickname:'测试昵称 <b>安全</b>',handle:'',url:'',positioning:'记录个人创作过程',audience:'',bio:'',cadence:'',notes:'',followers:null,followersDate:'',avatarReady:false,bioReady:false,firstPostReady:false,createdAt:'2026-10-16T00:00:00.000Z',updatedAt:'2026-10-16T00:00:00.000Z'});
const post=(accountId='primary-x',platform='X')=>({id:'synthetic-post',accountId,platform,title:'测试选题',format:'图文',status:'选题',plannedDate:'',publishedDate:'',url:'',script:'',notes:'',views:null,likes:null,comments:null,saves:null,createdAt:'2026-10-16T00:00:00.000Z',updatedAt:'2026-10-16T00:00:00.000Z'});
test('three requested platform cards are empty preparation slots without phantom persisted records',()=>{
 const c=setup(),p=JSON.parse(c.run('JSON.stringify(MediaAccounts.profiles())'));assert.deepEqual(p.map(v=>v.platform),['X','小红书','抖音']);assert.ok(p.every(v=>v.status==='待开通'&&v.followers===null&&v.nickname===''));assert.equal(c.state().mediaProfiles.length,0);assert.equal(c.pending().length,0);
 c.run('page="media";render()');assert.match(c.elements.get('#main').innerHTML,/我的平台账号/);assert.match(c.elements.get('#main').innerHTML,/账号 ID 待填写/);
});
test('profile validation agrees across client and server with strict platforms, links, dates and zero followers',()=>{
 const c=setup(),cases=[profile(),{...profile(),followers:0,followersDate:'2026-10-16'},profile('primary-xiaohongshu','小红书'),profile('primary-douyin','抖音')];
 for(const mutate of [v=>v.id='another-id',v=>v.id=['primary-x'],v=>v.platform='抖音',v=>v.status='registered',v=>v.url='javascript:alert(1)',v=>v.url='https://user:secret@example.com',v=>v.followers=-1,v=>v.followers=.5,v=>v.followers=1e9+1,v=>v.followers=0,v=>v.followersDate='2026-02-30',v=>v.bio='x'.repeat(1001),v=>v.avatarReady='yes',v=>v.password='never save this',v=>v.createdAt='not-a-time']){const p=profile();mutate(p);cases.push(p);}
 for(const [i,p]of cases.entries()){const expected=i<4;assert.equal(validMediaProfile(p),expected);assert.equal(c.run('MediaAccounts.valid('+JSON.stringify(p)+')'),expected);if(expected)assert.doesNotThrow(()=>validatePersonalValue('media-profile/'+p.id,p));else assert.throws(()=>validatePersonalValue('media-profile/'+p.id,p));}
 assert.throws(()=>validatePersonalValue('media-profile/primary-douyin',profile()));
});
test('account associations preserve old content, enforce platform matching, and filter explicitly linked posts',()=>{
 const c=setup(),legacy=post();delete legacy.accountId;legacy.id='legacy-post';assert.equal(validMedia(legacy),true);
 for(const v of [post(),post('primary-xiaohongshu','小红书'),post('primary-douyin','抖音'),post('', '自定义平台')]){assert.equal(validMedia(v),true);assert.equal(c.run('SelfMedia.valid('+JSON.stringify(v)+')'),true);}
 for(const v of [post('primary-x','抖音'),post('unknown','X'),post(['primary-x'],'X'),post(null,'X')]){assert.equal(validMedia(v),false);assert.equal(c.run('SelfMedia.valid('+JSON.stringify(v)+')'),false);}
 const list=[post(),legacy,{...post('primary-douyin','抖音'),id:'douyin-post'}];c.commit('s=>s.media='+JSON.stringify(list));assert.equal(c.run('MediaAccounts.contentCounts("primary-x").total'),1);assert.equal(c.run('SelfMedia.filtered(state.media,{account:"primary-x"}).length'),1);
 c.run('page="media";SelfMedia.forAccount("primary-douyin")');assert.match(c.elements.get('#main').innerHTML,/1 条内容 · 抖音账号/);
});
test('saved profiles and associated posts survive reload and both backup formats; labels escape user text',()=>{
 const c=setup(),p=profile(),v=post();c.commit('s=>{s.mediaProfiles.push('+JSON.stringify(p)+');s.media.push('+JSON.stringify(v)+')}');
 const reload=client({base:'http://127.0.0.1:8787',owner:'synthetic-profile',storage:c.storage});assert.deepEqual(reload.state().mediaProfiles,[p]);assert.deepEqual(reload.state().media,[v]);
 const flat=JSON.parse(c.run('JSON.stringify(PersonalSync.flatten(state))')),backup={format:'selfspace-backup',version:2,personal:Object.entries(flat).map(([key,value])=>({key,value})),health:[]};assert.deepEqual(validateBackup(backup).personal.find(r=>r.key==='media-profile/primary-x').value,p);
 vm.runInContext(fs.readFileSync('public/backup-center.js','utf8'),c.context);assert.equal(c.run('BackupCenter.toBackup('+JSON.stringify(backup)+').personal.length'),Object.keys(flat).length);assert.deepEqual(JSON.parse(c.run('JSON.stringify(PersonalSync.hydrate('+JSON.stringify(flat)+').mediaProfiles)')),[p]);
 const html=c.run('MediaAccounts.panel()+MediaAccounts.selectFieldHTML("primary-x")');assert.ok(html.includes('&lt;b&gt;'));assert.ok(!html.includes('<b>安全</b>'));
 const legacy=c.state();delete legacy.mediaProfiles;assert.doesNotThrow(()=>c.run('validate('+JSON.stringify(legacy)+')'));assert.throws(()=>c.run('validate('+JSON.stringify({...legacy,mediaProfiles:[p,p]})+')'));
});

test('account form saves complete real inputs and preserves the captured revision',()=>{
 const c=setup();c.context.FormData=class{constructor(form){this.fields=form.fields;}get(k){return this.fields[k]??null;}has(k){return Object.hasOwn(this.fields,k);}};
 c.run(`var profileForm={dataset:{id:'primary-x',created:'',revisions:'{"media-profile/primary-x":7}'},fields:{profileNickname:'保存测试',profileStatus:'筹备中',profileHandle:'tester',profilePositioning:'测试定位',profileFollowers:'0',profileFollowersDate:TODAY,bioReady:'on'},reportValidity:()=>true};`);
 assert.equal(c.run('MediaAccounts.save(profileForm)'),true);assert.equal(c.state().mediaProfiles[0].nickname,'保存测试');assert.equal(c.state().mediaProfiles[0].followers,0);assert.equal(c.state().mediaProfiles[0].bioReady,true);assert.equal(c.pending()[0].baseRevision,7);
});

test('editorial drafts match the news direction and never overwrite existing account facts or auto-save',()=>{
 const c=setup(),before=JSON.stringify(c.state()),defaults=JSON.parse(c.run('JSON.stringify(MediaAccounts.profiles())'));
 for(const p of defaults){const draft=JSON.parse(c.run('JSON.stringify(MediaAccounts.draftProfile('+JSON.stringify(p)+'))'));assert.match(draft.positioning,/AI 与科技/);assert.ok(draft.bio.length>0);assert.ok(draft.audience.length>0);assert.equal(draft.followers,null);assert.equal(draft.nickname,'');assert.equal(draft.bioReady,false);assert.equal(draft.firstPostReady,false);assert.ok(validMediaProfile({...draft,createdAt:'2026-10-16T00:00:00.000Z',updatedAt:'2026-10-16T00:00:00.000Z'}));}
 const existing={...profile(),positioning:'我的既有定位',bio:'我的既有简介',cadence:'自己安排的节奏',notes:'保留原备注',audience:'既有读者',status:'运营中',followers:123,followersDate:'2026-10-16',bioReady:true};
 assert.deepEqual(JSON.parse(c.run('JSON.stringify(MediaAccounts.draftProfile('+JSON.stringify(existing)+'))')),existing);assert.equal(JSON.stringify(c.state()),before);assert.equal(c.pending().length,0);
});
