const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
function harness(fetch){
  const handlers={},timers=[],messages=[];
  const ctx=vm.createContext({AbortController,fetch,console,
    state:{demo:true,days:{example:{health:{steps:123}}}},cloudHealth:{},cloudConnection:null,cloudLoading:false,cloudError:null,syncSetup:null,page:'sync',modal:{open:false},
    document:{addEventListener:(type,fn)=>handlers[type]=fn},setInterval(){},setTimeout(fn){timers.push(fn);return timers.length;},clearTimeout(){},
    TODAY:'2026-10-16',shiftDate:(date,n)=>new Date(Date.parse(date+'T12:00:00Z')+n*86400000).toISOString().slice(0,10),
    icon:()=>'',metric:()=>'',art:()=>'',esc:x=>String(x),render(){},toast:m=>messages.push(m),confirmAction:(a,b,fn)=>fn()});
  vm.runInContext(fs.readFileSync(__dirname+'/public/health-sync.js','utf8'),ctx);
  const run=code=>vm.runInContext(code,ctx);
  return {ctx,run,timers,messages,click:()=>handlers.click({target:{closest:()=>({dataset:{syncAction:'pair'}})}})};
}
const response=data=>({ok:true,headers:{get:()=>'application/json'},json:async()=>data});
function pairButton(h){return h.run('syncPage()').match(/<button[^>]*data-sync-action="pair"[^>]*>/)[0];}
test('first pairing is available in demo mode even while status is pending',()=>{
  const h=harness();h.ctx.cloudLoading=true;
  assert.doesNotMatch(pairButton(h),/\sdisabled(?:\s|>)/);
  assert.match(h.run('syncPage()'),/这一步无需先连接 Mac 或手机/);
});
test('demo pairing finishes while the initial status request is unresolved and preserves local data',async()=>{
  let resolveStatus;const calls=[];
  const h=harness((path)=>{calls.push(path);return path==='/api/health'?new Promise(resolve=>resolveStatus=resolve):Promise.resolve(response({bridgeUrl:'synthetic',headers:[]}));});
  const saved=JSON.stringify(h.ctx.state);
  const status=h.run('loadCloudHealth()');
  assert.equal(h.ctx.cloudLoading,true);
  await h.click();
  assert.equal(h.ctx.syncSetup.bridgeUrl,'synthetic');assert.equal(h.run('pairingBusy'),false);
  assert.equal(JSON.stringify(h.ctx.state),saved);
  assert.deepEqual(calls,['/api/health','/api/health/connection']);
  assert.doesNotMatch(pairButton(h),/\sdisabled(?:\s|>)/);
  resolveStatus(response({days:{},connection:{enabled:true}}));await status;
});
test('a failed configuration request leaves the button available for retry',async()=>{
  const h=harness(async()=>{throw new Error('synthetic network failure');});
  await h.click();assert.equal(h.run('pairingBusy'),false);assert.equal(h.ctx.syncSetup,null);
  assert.doesNotMatch(pairButton(h),/\sdisabled(?:\s|>)/);assert.match(h.messages[0],/synthetic network failure/);
});
test('a stalled status request times out and restores refresh state',async()=>{
  const h=harness((path,options)=>new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(Object.assign(new Error(),{name:'AbortError'})))));
  const status=h.run('loadCloudHealth()');h.timers[0]();await status;
  assert.equal(h.ctx.cloudLoading,false);assert.match(h.ctx.cloudError,/响应超时/);
});
test('health state distinguishes stale heartbeat, pending, failure and phone queue uncertainty',()=>{
  const h=harness();h.ctx.cloudConnection={enabled:true,lastSync:'2026-10-15T00:00:00Z'};
  assert.match(h.run('healthSyncState().label'),/等待中转报告/);
  h.ctx.cloudConnection.bridge={version:2,pendingDays:0,lastReceived:'2026-10-15T00:00:00Z'};
  h.ctx.cloudConnection.bridgeSeenAt=new Date(Date.now()-240000).toISOString();
  assert.match(h.run('healthSyncState().label'),/未确认/);
  h.ctx.cloudConnection.bridgeSeenAt=new Date().toISOString();
  assert.match(h.run('healthSyncState().hint'),/手机是否还有待同步/);
  h.ctx.cloudConnection.bridge.pendingDays=3;assert.match(h.run('healthSyncState().label'),/补传/);
  h.ctx.cloudConnection.bridge.errorCode='upload_failed';assert.match(h.run('healthSyncState().label'),/重试/);
  h.ctx.cloudError='synthetic failure';assert.match(h.run('healthSyncState().label'),/读取失败/);
  h.ctx.cloudError=null;h.ctx.cloudConnection.enabled=false;assert.match(h.run('healthSyncState().label'),/暂停/);
});
test('metric coverage counts missing separately from real zeroes and ignores manual health',()=>{
  const h=harness();h.ctx.cloudHealth={'2026-10-16':{health:{steps:0}},'2026-10-15':{health:{sleep:7}}};
  const html=h.run('syncCoverage()');assert.match(html,/2026-10-16/);assert.match(html,/1 \/ 7 天/);assert.match(html,/尚未收到/);assert.doesNotMatch(html,/NaN/);
});
