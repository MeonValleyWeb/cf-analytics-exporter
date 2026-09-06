import test from 'node:test';
import assert from 'node:assert/strict';
import { handleBilling, sumAmounts } from '../src/lib/billing.js';

const accountId='a'.repeat(32);
const env={EXPORT_API_KEY:'s'.repeat(48),CF_BILLING_API_TOKEN:'billing-read-only',CF_ALLOWED_ACCOUNT_IDS:accountId};
const info={covered:true,subscriptions:[{id:'sub-1',billing_cycle_anchor_timestamp:'2026-09-01T00:00:00Z',start_timestamp:'2026-01-01T00:00:00Z'}]};
const row={BillingAccountId:accountId,BillingCurrency:'USD',BillingPeriodStart:'2026-09-01T00:00:00Z',ChargeCategory:'Usage',ChargePeriodStart:'2026-09-01T00:00:00Z',ChargePeriodEnd:'2026-09-02T00:00:00Z',ContractedCost:0.1,CumulatedContractedCost:20,ServiceName:'D1 Writes',ServiceFamilyName:'D1',SubscriptionId:'sub-1',ConsumedQuantity:100,ConsumedUnit:'Rows',PricingQuantity:10,PricingUnit:'Rows'};
const wrap=result=>Response.json({success:true,errors:[],result});
const request=(params={accountId},options={})=>new Request(`https://app.test/api/billing?${new URLSearchParams(params)}`,{headers:{Authorization:`Bearer ${env.EXPORT_API_KEY}`},...options});
function deps(rows=[row],coverage=info){return {now:Date.parse('2026-09-06T12:00:00Z'),sleep:async()=>{},fetchImpl:async url=>url.endsWith('/info')?wrap(coverage):wrap(rows)};}
async function error(response,status,code){assert.equal(response.status,status);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal((await response.json()).error.code,code);}

test('billing authenticates independently of analytics configuration and queries current period',async()=>{
 const calls=[];const d=deps();const response=await handleBilling(request(),env,{...d,fetchImpl:async(url,options)=>{calls.push(url);assert.equal(options.method,'GET');assert.equal(options.redirect,'error');assert.equal(options.headers.Authorization,'Bearer billing-read-only');return d.fetchImpl(url);}});
 assert.equal(response.status,200);const result=await response.json();
 assert.deepEqual(calls,[`https://api.cloudflare.com/client/v4/accounts/${accountId}/billable-usage/info`,`https://api.cloudflare.com/client/v4/accounts/${accountId}/billable-usage`]);
 assert.equal(result.status,'available');assert.equal(result.rows[0].contractedCost,'0.1');assert.equal(result.summaries[0].contractedCost,'0.1');
 assert.equal(result.freshness.sourceUpdatedAt,null);assert.equal(result.freshness.updateCadence,'daily');assert.equal(result.supportsHardCap,false);
 assert.ok(!JSON.stringify(result).includes(env.CF_BILLING_API_TOKEN));
});

test('missing billing configuration and invalid caller credentials fail closed',async()=>{
 const d={fetchImpl:()=>assert.fail('must not fetch')};
 await error(await handleBilling(request(),{EXPORT_API_KEY:env.EXPORT_API_KEY},d),503,'NOT_CONFIGURED');
 await error(await handleBilling(request({}, {headers:{}}),env,d),401,'UNAUTHORIZED');
 await error(await handleBilling(request(),{...env,CF_ALLOWED_ACCOUNT_IDS:'invalid'},d),503,'NOT_CONFIGURED');
 await error(await handleBilling(request(),{...env,CF_BILLING_API_TOKEN:'',CF_API_TOKEN:'analytics-token'},d),503,'NOT_CONFIGURED');
});

test('method, account allowlist, date inputs and duplicates are rejected before fetching',async()=>{
 const d={fetchImpl:()=>assert.fail('must not fetch')};
 await error(await handleBilling(request({}, {method:'POST'}),env,d),405,'METHOD_NOT_ALLOWED');
 await error(await handleBilling(request({accountId:'b'.repeat(32)}),env,d),403,'ACCOUNT_FORBIDDEN');
 for(const params of [{accountId:'bad'},{accountId,from:'2026-09-01'},{}]) await error(await handleBilling(request(params),env,d),400,'INVALID_INPUT');
 const req=request();await error(await handleBilling(new Request(req.url+'&accountId='+accountId,{headers:req.headers}),env,d),400,'INVALID_INPUT');
});

test('uncovered account avoids querying usage',async()=>{
 let calls=0;await error(await handleBilling(request(),env,{...deps(),fetchImpl:async()=>{calls++;return wrap({covered:false});}}),422,'BILLING_UNAVAILABLE');assert.equal(calls,1);
});

test('period costs sum exactly without adding cumulative cost or merging currencies/periods',async()=>{
 const rows=[row,{...row,ContractedCost:0.2,CumulatedContractedCost:999},{...row,BillingCurrency:'EUR',ContractedCost:1},{...row,BillingPeriodStart:'2026-08-01T00:00:00Z',ContractedCost:2}];
 const result=await(await handleBilling(request(),env,deps(rows))).json();
 assert.equal(result.summaries.length,3);
 assert.equal(result.summaries.find(s=>s.billingPeriodStart.startsWith('2026-09')&&s.currency==='USD').contractedCost,'0.3');
 assert.equal(result.summaries.find(s=>s.currency==='EUR').contractedCost,'1');
 assert.equal(sumAmounts(['0.000001','2e-7','-1e-7']),'0.0000011');
 assert.equal(sumAmounts(['1.2','-1.2']),'0');
});

test('missing costs remain unknown and empty result does not claim zero spend',async()=>{
 const result=await(await handleBilling(request(),env,deps([row,{...row,ContractedCost:null}]))).json();
 assert.equal(result.status,'partial-cost-data');assert.equal(result.summaries[0].contractedCost,null);assert.equal(result.summaries[0].knownContractedCost,'0.1');assert.equal(result.summaries[0].missingCostRows,1);
 const empty=await(await handleBilling(request(),env,deps([]))).json();assert.equal(empty.status,'no-data');assert.deepEqual(empty.summaries,[]);assert.equal(empty.freshness.latestChargePeriodEnd,null);
});

test('invalid billing records and cross-account data are rejected',async()=>{
 for(const change of [{BillingAccountId:'b'.repeat(32)},{BillingCurrency:'not-currency'},{ContractedCost:'0.1'},{ChargePeriodStart:'bad'},{ChargePeriodEnd:row.ChargePeriodStart},{BillingPeriodStart:'2026-10-01T00:00:00Z'},{ServiceName:null},{ChargeCategory:'Purchase'},{ZoneId:'bad'},{ContractedCost:1,BillingCurrency:null}]){
  await error(await handleBilling(request(),env,deps([{...row,...change}])),502,'UPSTREAM_INVALID_BILLING');
 }
});

test('API errors, invalid envelope and pagination cannot look like successful ingestion',async()=>{
 for(const payload of [{success:false,errors:[{message:'billing-read-only'}]},{success:true,result:null},{success:true,result:[row],result_info:{total_pages:2}}]){
  const d=deps();const response=await handleBilling(request(),env,{...d,fetchImpl:async url=>url.endsWith('/info')?wrap(info):Response.json(payload)});
  assert.equal(response.status,502);assert.ok(!(await response.text()).includes(env.CF_BILLING_API_TOKEN));
 }
});

test('billing HTTP failures retry within bounds and sanitize errors',async()=>{
 let calls=0;const d=deps();await error(await handleBilling(request(),env,{...d,fetchImpl:async()=>{calls++;return new Response('secret',{status:503});}}),503,'UPSTREAM_HTTP_ERROR');assert.equal(calls,2);
});

test('invalid coverage info and expired deadlines fail explicitly',async()=>{
 await error(await handleBilling(request(),env,deps([],{covered:true})),502,'UPSTREAM_INVALID_BILLING');
 await error(await handleBilling(request(),env,{...deps(),signal:AbortSignal.abort(),fetchImpl:()=>assert.fail('deadline expired')}),504,'EXPORT_TIMEOUT');
});
