import test from 'node:test';
import assert from 'node:assert/strict';
import {validateBackup} from './lib/backup-format.mjs';
const base=()=>({format:'selfspace-backup',version:2,createdAt:'2026-10-16T00:00:00Z',personal:[{key:'settings/name',value:'我'}],health:[{date:'2026-10-15',metric:'sleep',value:{sleep:7,deepSleep:1}}]});
test('backup strips unrelated metadata and preserves manual and Apple data separately',()=>{const b=validateBackup({...base(),headers:[{token:'secret'}],device:{private:'local'}});assert.equal(b.personal[0].value,'我');assert.equal(b.health[0].value.sleep,7);assert.equal(b.headers,undefined);assert.equal(b.device,undefined);});
test('backup rejects duplicate keys, prototype paths, negative values and mismatched groups',()=>{const cases=[b=>b.personal.push(b.personal[0]),b=>b.personal.push({key:'day/__proto__/health/steps',value:3}),b=>b.health[0].value.sleep=-1,b=>b.health[0].value.steps=4,b=>b.health.push(b.health[0])];for(const mutate of cases){const b=base();mutate(b);assert.throws(()=>validateBackup(b));}});
