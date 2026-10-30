import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
const base=process.env.BACKUP_TEST_BASE||'http://127.0.0.1:8787';if(!['127.0.0.1','localhost','[::1]'].includes(new URL(base).hostname))throw Error('Local preview only');
const owner='synthetic-backup-health',headers={'oai-authenticated-user-id':owner,Origin:base,'Content-Type':'application/json'};
const list=async()=>{const r=await fetch(base+'/api/backups',{headers});assert.equal(r.status,200);return r.json();};
const old=await list(),upload=()=>fetch(base+'/api/health/bridge',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer hax_'+'b'.repeat(64)},body:JSON.stringify({source:'puls',days:[{date:'2026-10-15',health:{steps:3456}}]})});
assert.equal((await upload()).status,200);assert.equal((await list()).revision.health,old.revision.health+1);
let r=await fetch(base+'/api/backups',{method:'POST',headers,body:JSON.stringify({owner,action:'clear-health',id:randomUUID(),expected:old.revision,confirm:'删除健康汇总'})});assert.equal(r.status,409);
r=await fetch(base+'/api/backups',{method:'POST',headers,body:JSON.stringify({owner,action:'clear-health',id:randomUUID(),expected:(await list()).revision,confirm:'删除健康汇总'})});assert.equal(r.status,200);assert.equal((await upload()).status,401);
console.log('PASS concurrent health upload invalidates preview; health clear revokes active bridge key');
