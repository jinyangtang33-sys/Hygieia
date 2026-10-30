import test from 'node:test';
import assert from 'node:assert/strict';
import {parseBridgeSnapshot} from './lib/bridge-format.mjs';
const snapshot=health=>({source:'puls',days:[{date:'2026-10-14',health}]});
test('full daily view groups stage values and allows clearing an empty day',()=>{const p=parseBridgeSnapshot(snapshot({steps:4321,sleep:7,deepSleep:1,sleepEnd:'2026-10-14T07:00:00+08:00'}),'2026-10-15');assert.equal(p.rows.length,2);assert.equal(p.rows[1].value.deepSleep,1);assert.deepEqual(parseBridgeSnapshot(snapshot({}),'2026-10-15').rows,[]);});
test('invalid views reject atomically, including prototype keys, future dates, duplicate days, unsupported fields and missing sleep total',()=>{for(const value of [snapshot({steps:-1}),snapshot({steps:Infinity}),snapshot({deepSleep:1}),snapshot({unknown:1}),snapshot(JSON.parse('{"__proto__":1}')),{source:'puls',days:[{date:'2026-02-30',health:{}}]},{source:'puls',days:[{date:'2026-10-16',health:{}}]},{source:'puls',days:[{date:'2026-10-14',health:{}},{date:'2026-10-14',health:{}}]}])assert.throws(()=>parseBridgeSnapshot(value,'2026-10-15'));});
