'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {collectAiEra,languageModels}=require('../lib/ai-era.cjs');
test('only in-directory language endpoints with no expired date enter the directory',()=>{
 const rows=languageModels({models:[{id:'a/active',name:'Active',outputModalities:['text']},{id:'a/old',outputModalities:['text'],expirationDate:'2026-01-01'},{id:'a/image',outputModalities:['image']}]},'2026-10-21T15:00:00.000Z');
 assert.deepEqual(rows.map(x=>x.id),['model:a/active']);assert.equal(rows[0].availabilityStatus,'catalog_listed');assert.match(rows[0].status,/未执行/);
});
test('an individual blocked agent keeps last success, reports uncertainty and does not remove other entries or change measured dates',async()=>{
 const previous={models:[{id:'agent:comet',lastSuccessAt:'2026-10-20T01:00:00.000Z'}]};
 const r=await collectAiEra({models:{models:[{id:'a/text',name:'Text',provider:'a',outputModalities:['text']}]},previous,now:'2026-10-21T15:00:00.000Z',fetchImpl:async url=>new Response(url.includes('perplexity')?'blocked':'Official Agent documentation '.repeat(15),{status:url.includes('perplexity')?403:200})});
 assert.equal(r.status,'partial');assert.equal(r.counts.agents,17);assert.equal(r.counts.agentPagesVerified,16);assert.equal(r.counts.languageModels,1);
 const blocked=r.models.find(x=>x.id==='agent:comet');assert.equal(blocked.lastSuccessAt,previous.models[0].lastSuccessAt);assert.equal(blocked.availabilityStatus,'unverified');
 assert.equal(r.rankings[0].entries[0].measuredAt,'2026-08');assert.equal(r.rankings[1].entries[0].rank,null);
});
