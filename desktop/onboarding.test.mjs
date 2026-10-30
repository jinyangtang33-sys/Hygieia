import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {onboardingModel as model} from './onboarding-format.mjs';

test('引导偏好校验共享相同的浏览器与服务端规则',()=>{
  const context=vm.createContext({URL});
  vm.runInContext(fs.readFileSync(new URL('../dist/local/public/local-onboarding-model.js',import.meta.url),'utf8'),context);
  const browser=vm.runInContext('LocalOnboardingModel',context);
  const values=[
    {version:1,status:'complete',focus:['health','tasks'],expectedRevision:0},
    {version:1,status:'skipped',focus:[],expectedRevision:2},
  ];
  for(const value of values) assert.equal(JSON.stringify(browser.normalize(value)),JSON.stringify(model.normalize(value)));
  for(const value of [null,{}, {...values[0],focus:[]},{...values[0],focus:['tasks','tasks']},{...values[0],focus:['private-report']},{...values[0],focus:Array(1)},{...values[0],expectedRevision:-1},{...values[0],extra:'private-data'},{...values[0],version:2}]) {
    assert.throws(()=>model.normalize(value));assert.throws(()=>browser.normalize(value));
  }
  assert.equal(model.nickname('  合成昵称  '),'合成昵称');
  assert.throws(()=>model.nickname('  '));assert.throws(()=>model.nickname('字'.repeat(31)));
});

test('反馈链接仅预填版本与系统，拒绝把任意输入作为反馈内容',()=>{
  for(const kind of ['bug','feature']) {
    const url=new URL(model.feedbackURL(kind,'0.2.0-alpha.2','darwin'));
    assert.equal(url.origin,'https://github.com');
    assert.equal(url.pathname,'/jinyangtang33-sys/Hygieia/issues/new');
    assert.match(url.searchParams.get('body'),/0\.2\.0-alpha\.2/);
    assert.match(url.searchParams.get('body'),/macOS/);
  }
  const hostile=new URL(model.feedbackURL('https://untrusted.example','PRIVATE_REPORT_WITH_PERSONAL_DATA','PRIVATE_PATH_WITH_USERNAME'));
  assert.doesNotMatch(hostile.href,/PRIVATE_REPORT|PRIVATE_PATH|untrusted/);
  assert.equal(hostile.searchParams.get('template'),'bug_report.md');
});
