import {describe,expect,it} from 'vitest';
import {testOnly} from '../server/http.ts';

describe('public hosted pilot remains explicitly synthetic-only',()=>{
 it('blocks production unless the explicit public demo gate is enabled',()=>{
  expect(()=>testOnly('PILOT_TEST','production')).toThrow('LIVE_BLOCKED');
  expect(()=>testOnly('PILOT_TEST','production','false')).toThrow('LIVE_BLOCKED');
  expect(()=>testOnly('PILOT_TEST','production','true')).not.toThrow();
 });
 it('never enables live mode, even with the public demo gate',()=>{
  expect(()=>testOnly('PILOT_LIVE','production','true')).toThrow('LIVE_BLOCKED');
  expect(()=>testOnly('PILOT_LIVE','development','true')).toThrow('LIVE_BLOCKED');
 });
 it('preserves local pilot operation without public production override',()=>{
  expect(()=>testOnly('PILOT_TEST','development')).not.toThrow();
 });
});
