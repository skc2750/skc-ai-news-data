'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {SHOWCASES,collectShowcases,validateShowcases,publicSource,reviewEvidence,checkLink}=require('../lib/showcases.cjs');
const NOW='2026-10-17T15:00:00.000Z';
function mock({fail=null,changed=false,linkStatus=200}={}){return async(url,options)=>{
 if(options?.method==='HEAD')return new Response(null,{status:linkStatus});
 const config=SHOWCASES.find(r=>url==='https://api.github.com/repos/'+r.repository||url==='https://raw.githubusercontent.com/'+r.repository+'/'+r.ref+'/'+r.path);
 assert.ok(config);if(config.id===fail)throw Error('Never expose exception secret');
 return url.startsWith('https://api.github.com/')?new Response(JSON.stringify({full_name:config.repository,html_url:'https://github.com/'+config.repository,pushed_at:NOW,stargazers_count:20,archived:false,description:config.needles.join('\n')}),{status:200}):new Response(config.needles.join('\n')+(changed?' changed':''),{status:200});
};}
test('editorial sources have named authors, AI evidence, costs and precise work type rather than popularity claims',async()=>{
 const out=await collectShowcases({now:NOW,fetchImpl:mock()});validateShowcases(out);assert.equal(out.status,'ok');assert.equal(out.showcases.length,SHOWCASES.length);assert.equal(out.showcases.filter(r=>r.authorType==='personal').length,11);
 for(const row of out.showcases){assert.ok(row.author&&row.kindZh&&row.aiTools.length&&row.aiEvidenceSourceUrl&&row.costZh);assert.equal(row.reviewStatus,'needs_review');}
 assert.equal(out.showcases.find(r=>r.id==='llamacoder-prompt-app').focusId,'other');assert.match(out.coverageZh,/人工精选与规则自动收录分别标识/);
});
test('personal works have distinct demo, source, process and author AI build proof',async()=>{
 const out=await collectShowcases({now:NOW,fetchImpl:mock()});for(const r of out.showcases.filter(r=>r.authorType==='personal')){assert.ok(r.repoUrl&&r.demoUrl&&r.processUrl&&r.authorUrl&&r.buildRelationshipZh);assert.equal(r.linkChecks.demo.status,'reachable');assert.match(r.linkChecks.demo.noteZh,/未播放/);assert.equal(r.reviewedAt,'2026-10-18');}
 const changed=structuredClone(out);changed.showcases[0].demoUrl='https://attacker.example';assert.throws(()=>validateShowcases(changed),/link differs/);
});
test('link failures retain previous success without certifying an interactive product or following redirects',async()=>{
 const url=SHOWCASES.find(r=>r.demoUrl).demoUrl,good=await checkLink(url,{fetchImpl:mock(),now:NOW});
 const failed=await checkLink(url,{fetchImpl:mock({linkStatus:302}),now:'2026-10-18T00:00:00Z',previous:good});assert.equal(failed.status,'stale');assert.equal(failed.lastSuccessAt,NOW);assert.equal(failed.httpStatus,302);
 await assert.rejects(()=>checkLink('http://127.0.0.1/private',{now:NOW,fetchImpl:mock()}),/registry/);
 const no=await checkLink(url,{now:NOW,fetchImpl:async()=>{throw Error('Do not leak credentials');}});assert.equal(no.status,'unverified');assert.ok(!JSON.stringify(no).includes('credentials'));
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
