'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {discoveryDue}=require('../lib/creator-discovery.cjs');
const {collectSocialDiscovery}=require('../lib/social-discovery.cjs');
test('the single configured public workflow schedules 09:00 MYT daily on a standard runner',()=>{
 const workflow=fs.readFileSync(path.resolve(__dirname,'../.github/workflows/update.yml'),'utf8');
 const cron=[...workflow.matchAll(/^\s*- cron: ['"]([^'"]+)['"]/gm)].map(row=>row[1]);
 assert.deepEqual(cron,['0 1 * * *']);assert.match(workflow,/runs-on: ubuntu-latest/);assert.match(workflow,/group: publish-ai-news-data/);
});
test('a late prior run cannot postpone tomorrow discovery beyond its scheduled MYT cycle',()=>{
 const previous={state:{lastAttemptAt:'2026-10-20T01:15:00.000Z'}};
 assert.equal(discoveryDue(previous,'2026-10-20T23:59:59.000Z'),false);
 assert.equal(discoveryDue(previous,'2026-10-21T00:59:59.000Z'),false);
 assert.equal(discoveryDue(previous,'2026-10-21T01:00:00.000Z'),true);
 assert.equal(discoveryDue({...previous,state:{...previous.state,nextRetryAt:'2026-10-21T02:00:00.000Z'}},'2026-10-21T01:00:00.000Z'),false);
});
test('social discovery waits for the next 09:00 MYT cycle and executes after a shorter-than-24-hour gap',async()=>{
 let calls=0;const previous={state:{lastAttemptAt:'2026-10-20T01:15:00.000Z'}};
 const fetchImpl=async()=>{calls++;return new Response(JSON.stringify({jsonrpc:'2.0',id:1,result:{content:[{type:'text',text:JSON.stringify({requestId:'empty-result',searchTime:0.01})}]}}));};
 const idle=await collectSocialDiscovery({previous,now:'2026-10-21T00:59:59.000Z',fetchImpl});
 assert.equal(calls,0);assert.equal(idle.nextCheckAt,'2026-10-21T01:00:00.000Z');
 const due=await collectSocialDiscovery({previous,now:'2026-10-21T01:00:00.000Z',fetchImpl});
 assert.equal(calls,3);assert.equal(due.status,'ok');assert.equal(due.nextCheckAt,'2026-10-22T01:00:00.000Z');
});
test('models and task prices belong to the same durable daily generation and survive news-only rebuilds',()=>{
 const {normalizeArticle}=require('../lib/collect.cjs'),{makePublication}=require('../lib/store.cjs');
 const now='2026-10-20T01:00:00.000Z',article=normalizeArticle({title:'Official release',summary:'Source excerpt.',url:'https://openai.com/news/daily-fixture',source:{id:'openai'},publishedAt:now},now);
 const state={articles:[],sources:[],reports:new Map(),cache:{entries:{}},monitoringSince:null,current:null,manifest:null};
 const collected={articles:[article],sources:[{id:'openai',status:'ok',articleCount:1,lastSuccessAt:now}],status:'partial',lastSuccessAt:now};
 const models={checkedAt:now,status:'ok',models:[],taskGuide:{schemaVersion:1,tasks:[{id:'website'}]}};
 const first=makePublication(state,collected,{now,models}),saved=JSON.parse(first.files.get('current.json'));
 assert.deepEqual(saved.models,models);assert.equal(first.receipt.scheduler.cronUtc,'0 1 * * *');
 const retained=makePublication({...state,models},collected,{now:'2026-10-21T01:00:00.000Z'});
 assert.deepEqual(JSON.parse(retained.files.get('current.json')).models,models);
 assert.ok(first.manifest.files['data/current.json']);
});
