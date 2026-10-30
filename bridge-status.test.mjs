import test from 'node:test';
import assert from 'node:assert/strict';
import {parseBridgeStatus} from './lib/bridge-status.mjs';
const good={version:2,pendingDays:3,lastReceived:'2026-10-15T00:00:00Z',lastForwarded:null,lastAttempt:null,errorCode:null};
test('status strips raw health and credentials and normalizes timestamps',()=>{const s=parseBridgeStatus({...good,token:'secret',samples:[1]});assert.equal(s.lastReceived,'2026-10-15T00:00:00.000Z');assert.equal(s.pendingDays,3);assert.equal(s.token,undefined);assert.equal(s.samples,undefined);});
test('invalid operational telemetry cannot be stored',()=>{for(const changes of [{pendingDays:-1},{pendingDays:Infinity},{version:1},{lastAttempt:'bad'},{lastReceived:'2099-01-01'},{errorCode:'secret error details'}])assert.throws(()=>parseBridgeStatus({...good,...changes}));});
