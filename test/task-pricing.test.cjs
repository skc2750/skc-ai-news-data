'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {CONFIG,parseToolQuote,buildTaskGuide,refreshTools}=require('../lib/task-pricing.cjs');
test('Exact catalogue IDs update quotes while missing rows retain their real prior date',()=>{
 const seed=CONFIG.models[0],old='2026-10-19T01:00:00.000Z',now='2026-10-20T01:00:00.000Z';
 const row={id:seed.catalogId,inputUsdPerMillion:3,outputUsdPerMillion:12,contextTokens:900000,pricingSourceUrl:'https://openrouter.ai/'+seed.catalogId,pricingCheckedAt:now,pricingOverrides:[{min_prompt_tokens:272000,prompt:'0.000006',completion:'0.000018'}]};
 const guide=buildTaskGuide({models:[row],catalogStatus:'ok'},{models:[{...CONFIG.models[1],priceVerifiedAt:old}]},[],now);
 assert.equal(guide.models[0].inputUsdPerMillion,3);assert.equal(guide.models[0].contextTokens,900000);assert.match(guide.models[0].conditionalNoteZh,/272,000.*\$6.*\$18/);
 assert.equal(guide.models[1].priceVerifiedAt,old);assert.equal(guide.models[1].status,'last_verified');
});
test('Subscription parser follows plan-specific monthly price, not unrelated annual price',()=>{
 const plus=CONFIG.tools.find(t=>t.id==='codex-plus');
 assert.equal(parseToolQuote(plus,'<PricingCard name="Go" price="$8" interval="/month"><PricingCard name="Plus" subtitle="x" price="$25" interval="/month">').price,25);
 assert.equal(parseToolQuote(plus,'<PricingCard name="Pro" price="$100" interval="/month">'),null);
 const claude=CONFIG.tools.find(t=>t.id==='claude-pro');assert.equal(parseToolQuote(claude,'### Pro\n$17\n$200 billed up front. $22 if billed monthly.\n### Max').price,22);
});
test('Regional dollar symbol is not silently promoted to USD',()=>{
 const tool=CONFIG.tools.find(t=>t.id==='n8n-cloud-starter'),q=parseToolQuote(tool,'### Starter\n$20/mo, billed annually\n2.5K\nworkflow executions\n### Pro');
 assert.equal(q.price,20);assert.equal(q.currency,'$（地区待确认）');assert.match(q.billingZh,/\$240/);assert.doesNotMatch(q.unitZh,/€/);
 const euro=parseToolQuote(tool,'### Starter\n€24/mo, billed annually\n### Pro');assert.equal(euro.currency,'EUR');assert.equal(euro.price,24);
});
test('Source failure preserves quote value and verification time instead of claiming today verified',async()=>{
 const now='2026-10-21T01:00:00.000Z',prior={...CONFIG.tools[0],price:23,priceVerifiedAt:'2026-10-19T01:00:00.000Z'};
 const result=await refreshTools({tools:[prior]},now,async()=>new Response('',{status:503}));
 const tool=result.find(t=>t.id===prior.id);assert.equal(tool.price,23);assert.equal(tool.priceVerifiedAt,prior.priceVerifiedAt);assert.equal(tool.checkedAt,now);assert.equal(tool.status,'last_verified');
});
