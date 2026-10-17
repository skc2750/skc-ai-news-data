'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {SHOWCASES,collectShowcases,validateShowcases,publicSource,reviewEvidence}=require('../lib/showcases.cjs');
const {SOURCES,parseFeed,digest}=require('../lib/core.cjs');
const {normalizeArticle}=require('../lib/collect.cjs');
const NOW='2026-10-17T15:00:00.000Z';
function mock({fail=null,changed=false}={}){return async url=>{
 const config=SHOWCASES.find(r=>url==='https://api.github.com/repos/'+r.repository||url==='https://raw.githubusercontent.com/'+r.repository+'/'+r.ref+'/'+r.path);
 assert.ok(config);if(config.id===fail)throw Error('Never expose exception secret');
 return url.startsWith('https://api.github.com/')?new Response(JSON.stringify({full_name:config.repository,html_url:'https://github.com/'+config.repository,pushed_at:NOW,stars:20,archived:false}),{status:200}):new Response(config.needles.join('\n')+(changed?' changed':''),{status:200});
};}
test('editorial sources have named authors, AI evidence, costs and precise work type rather than popularity claims',async()=>{
 const out=await collectShowcases({now:NOW,fetchImpl:mock()});validateShowcases(out);assert.equal(out.status,'ok');assert.equal(out.showcases.length,7);
 for(const row of out.showcases){assert.ok(row.author&&row.kindZh&&row.aiTools.length&&row.aiEvidenceSourceUrl&&row.costZh);assert.equal(row.reviewStatus,'needs_review');}
 assert.equal(out.showcases.find(r=>r.id==='llamacoder-prompt-app').focusId,'other');assert.match(out.coverageZh,/不是人气/);
});
test('source review compares both fixed hash and AI evidence and never refreshes the editorial date automatically',()=>{
 const body='Author explicitly uses Codex in this workflow',config={needles:['Codex'],approvedEvidenceSha256:crypto.createHash('sha256').update(body).digest('hex')};
 assert.equal(reviewEvidence(config,body).verified,true);assert.equal(reviewEvidence(config,body+' different claim').verified,false);assert.equal(reviewEvidence({...config,needles:['unmentioned Claude']},body).verified,false);
});
test('failed checks preserve known author evidence and earlier source success',async()=>{
 const first=await collectShowcases({now:NOW,fetchImpl:mock()}),next=await collectShowcases({now:'2026-10-17T16:00:00.000Z',previous:first,fetchImpl:mock({fail:'llamacoder-prompt-app'})});
 const row=next.showcases.find(r=>r.id==='llamacoder-prompt-app');assert.equal(row.status,'stale');assert.equal(row.lastSuccessAt,NOW);assert.equal(row.summaryZh,first.showcases.find(r=>r.id===row.id).summaryZh);assert.equal(next.lastSuccessAt,NOW);assert.ok(!JSON.stringify(next).includes('exception secret'));
});
test('showcase source requests are bounded and restricted to author evidence',async()=>{
 await assert.rejects(()=>publicSource('https://example.com'),/registry/);
 const row=SHOWCASES[0],url='https://raw.githubusercontent.com/'+row.repository+'/'+row.ref+'/'+row.path;
 await assert.rejects(()=>publicSource(url,{fetchImpl:async()=>new Response('x'.repeat(600000),{status:200})}),/large/);
});
test('editorial validator rejects replacement authors source links',async()=>{
 const value=await collectShowcases({now:NOW,fetchImpl:mock()});value.showcases[0].aiEvidenceSourceUrl='https://example.com';assert.throws(()=>validateShowcases(value),/URL/);
});
test('product Atom prefix preserves literal source title, publication date and content hash through normalization',()=>{
 const source=SOURCES.find(r=>r.id==='codex-releases'),xml='<feed><entry><title>v1.2.3-alpha</title><link href="https://github.com/openai/codex/releases/tag/v1.2.3-alpha"/><updated>2026-10-16T12:00:00Z</updated><summary>Security fix</summary></entry></feed>';
 const parsed=parseFeed(xml,source,NOW).articles[0],row=normalizeArticle(parsed,NOW);assert.equal(row.sourceTitle,'v1.2.3-alpha');assert.equal(row.title,'OpenAI Codex v1.2.3-alpha');assert.match(row.titleTransform,/非逐字/);assert.equal(row.publishedAt,'2026-10-16T12:00:00.000Z');assert.equal(row.contentHash,digest(row.title+'\n'+row.summary));
});
test('GitHub release feed cannot swap to another repository on the same host',()=>{
 const source=SOURCES.find(r=>r.id==='claude-releases'),xml='<feed><entry><title>v1</title><link href="https://github.com/other/repo/releases/tag/v1"/><updated>2026-10-16T12:00:00Z</updated></entry></feed>';
 assert.throws(()=>parseFeed(xml,source,NOW),/no valid articles/);assert.throws(()=>normalizeArticle({title:'Test',url:'https://github.com/other/repo/releases/tag/v1',source:{id:source.id}},NOW),/invalid/);
});
