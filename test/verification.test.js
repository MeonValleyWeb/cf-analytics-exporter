import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyZone } from '../scripts/lib/verification.js';
import fixture from './fixtures/dataset-settings.json' with { type: 'json' };
const zoneId='a'.repeat(32);
const env={CF_API_TOKEN:'private-token',EXPORT_API_KEY:'s'.repeat(48),CF_ALLOWED_ZONE_IDS:zoneId};
const now=Date.parse('2026-09-05T12:00:00Z');
const baseline={zoneId,windows:[{from:'2026-09-04',to:'2026-09-05',requests:1,bytes:10},{from:'2026-08-29',to:'2026-09-05',requests:7,bytes:70}]};
const fetchImpl=async (_,options)=>{
  const {query,variables}=JSON.parse(options.body);
  if(query.includes('DatasetCapabilities')) return Response.json(fixture);
  const rows=[];
  for(let ms=Date.parse(variables.from);ms<Date.parse(variables.to);ms+=86400000) rows.push({dimensions:{date:new Date(ms).toISOString().slice(0,10)},sum:{requests:1,bytes:10}});
  return Response.json({data:{viewer:{zones:[{httpRequests1dGroups:rows}]}}});
};

test('live access alone never claims dashboard verification',async()=>{
  const result=await verifyZone(env,{zoneId,now,fetchImpl});
  assert.equal(result.status,'awaiting-dashboard-comparison');
  assert.equal(result.singleDayMatchesSevenDay,true);
  assert.equal(result.dashboardComparison,'not-provided');
  assert.ok(!JSON.stringify(result).includes(env.CF_API_TOKEN));
});

test('independent baseline match verifies, mismatch fails',async()=>{
  assert.equal((await verifyZone(env,{zoneId,now,fetchImpl,baseline})).status,'verified');
  const mismatch=structuredClone(baseline);mismatch.windows[0].requests=99;
  const result=await verifyZone(env,{zoneId,now,fetchImpl,baseline:mismatch});
  assert.equal(result.status,'failed');assert.equal(result.dashboardComparison,'mismatched');
});

test('empty responses do not verify even if zero dashboard totals match',async()=>{
  const zero=structuredClone(baseline);zero.windows.forEach(row=>{row.requests=0;row.bytes=0;});
  const empty=async(_,options)=>JSON.parse(options.body).query.includes('DatasetCapabilities')?Response.json(fixture):Response.json({data:{viewer:{zones:[{httpRequests1dGroups:[]}]}}});
  assert.equal((await verifyZone(env,{zoneId,now,fetchImpl:empty,baseline:zero})).status,'incomplete-data');
});

test('wrong-zone and invalid-window baselines are rejected',async()=>{
  await assert.rejects(verifyZone(env,{zoneId,now,fetchImpl,baseline:{...baseline,zoneId:'b'.repeat(32)}}),/Baseline must match/);
  const invalid=structuredClone(baseline);invalid.windows[0].requests=-1;
  await assert.rejects(verifyZone(env,{zoneId,now,fetchImpl,baseline:invalid}),/Baseline needs/);
});
