'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {WATCHLIST,collectProjects,validateProjects,getJson,licenseFor}=require('../lib/projects.cjs');
const {createHash}=require('node:crypto');
const os=require('node:os');
const {makePublication,publish,loadState}=require('../lib/store.cjs');
const {normalizeArticle}=require('../lib/collect.cjs');
const {verify}=require('../scripts/verify.cjs');
const NOW='2026-10-17T14:00:00.000Z';
function mock({failId=null,tag='v1',licenseChange=false}={}){return async url=>{
 const config=WATCHLIST.find(r=>url.startsWith('https://api.github.com/repos/'+r.id)&&['','/license','/releases/latest'].includes(url.slice(('https://api.github.com/repos/'+r.id).length)));
 assert.ok(config,'Requests stay inside curated official repositories');if(config.id===failId)throw Error('error including secret should never escape');
 let value;if(url.endsWith('/license'))value={path:'LICENSE',encoding:'base64',content:Buffer.from((config.licenseNeedles||['standard license']).join('\n')+(licenseChange?' changed':'')).toString('base64')};
 else if(url.endsWith('/releases/latest'))value={tag_name:tag,name:'Release '+tag,published_at:NOW,html_url:'https://github.com/'+config.id+'/releases/tag/'+tag,body:'Security fix. Windows improvements.',draft:false,prerelease:false};
 else value={full_name:config.id,html_url:'https://github.com/'+config.id,default_branch:'main',pushed_at:NOW,stargazers_count:500,forks_count:20,archived:false,license:{spdx_id:config.expectedSpdx,name:config.customLicense||config.expectedSpdx}};
 return new Response(JSON.stringify(value),{status:200});
};}
test('fixed official watchlist is Chinese, contains four priorities, and never implies model execution',async()=>{
 const data=await collectProjects({now:NOW,fetchImpl:mock()});assert.equal(data.status,'ok');assert.equal(data.projects.length,14);validateProjects(data);
 assert.deepEqual([...new Set(data.projects.map(r=>r.categoryZh))],['重点AI产品','三维到交互成品','网站优化','脚本到视频','办公自动化']);
 // Synthetic fixture license bodies do not match the real reviewed SHA and must never appear reviewed.
 assert.ok(data.projects.every(r=>r.license.isOpenSource===null));
 assert.match(data.costNoteZh,/不触发/);assert.equal(data.changes.length,0);
});
test('release 404 is an honest no-formal-release state',async()=>{
 const base=mock(),data=await collectProjects({now:NOW,fetchImpl:async(u,o)=>u.endsWith('/releases/latest')?new Response('{}',{status:404}):base(u,o)});
 assert.equal(data.status,'ok');assert.ok(data.projects.every(r=>r.latestRelease===null));
});
test('partial repository failure preserves previous data and success timestamps without leaking error text',async()=>{
 const before=await collectProjects({now:NOW,fetchImpl:mock()}),later='2026-10-17T15:00:00.000Z';
 const after=await collectProjects({now:later,previous:before,fetchImpl:mock({failId:'n8n-io/n8n'})});
 assert.equal(after.status,'partial');const row=after.projects.find(r=>r.id==='n8n-io/n8n');assert.equal(row.status,'stale');assert.equal(row.lastSuccessAt,NOW);assert.equal(row.latestRelease.tag,'v1');assert.equal(after.lastSuccessAt,NOW);assert.ok(!JSON.stringify(after).includes('secret'));
});
test('all source failure retains previous stable snapshot content and marks stale',async()=>{
 const before=await collectProjects({now:NOW,fetchImpl:mock()}),after=await collectProjects({now:'2026-10-17T15:00:00.000Z',previous:before,fetchImpl:async()=>{throw Error('offline');}});
 assert.equal(after.status,'stale');assert.equal(after.lastSuccessAt,NOW);assert.equal(after.projects.length,14);assert.ok(after.projects.every(r=>r.latestRelease.tag==='v1'));
});
test('only actual previous comparison creates release and license change records; unchanged polls do not duplicate',async()=>{
 const first=await collectProjects({now:NOW,fetchImpl:mock()}),second=await collectProjects({now:'2026-10-17T15:00:00.000Z',previous:first,fetchImpl:mock({tag:'v2',licenseChange:true})});
 assert.equal(second.changes.filter(r=>r.type==='release').length,14);assert.equal(second.changes.filter(r=>r.type==='license').length,14);
 const third=await collectProjects({now:'2026-10-17T16:00:00.000Z',previous:second,fetchImpl:mock({tag:'v2',licenseChange:true})});assert.equal(third.changes.length,second.changes.length);assert.ok(third.projects.every(r=>r.changes.length===0));
});
test('arbitrary endpoints, identity redirects, huge bodies, and wrong returned repository are rejected',async()=>{
 await assert.rejects(()=>getJson('https://example.com'),/fixed watchlist/);
 await assert.rejects(()=>getJson('https://api.github.com/repos/'+WATCHLIST[0].id,{fetchImpl:async()=>({ok:true,status:200,url:'https://example.com',headers:new Headers()})}),/redirect/);
 await assert.rejects(()=>getJson('https://api.github.com/repos/'+WATCHLIST[0].id,{fetchImpl:async()=>new Response('x'.repeat(3000000),{status:200})}),/limit/);
 const data=await collectProjects({now:NOW,fetchImpl:async()=>new Response(JSON.stringify({full_name:'other/repo'}),{status:200})});assert.equal(data.status,'unavailable');
});
test('validator rejects arbitrary projects and release links',async()=>{
 const value=await collectProjects({now:NOW,fetchImpl:mock()});value.projects[0].latestRelease.url='https://example.com';assert.throws(()=>validateProjects(value),/release/);
});
test('same self-contained module is shipped to public publisher and web function bundle',()=>{
 const site=path.resolve(__dirname,'../../../scripts/ainews/providers-github.cjs');if(fs.existsSync(site))assert.equal(fs.readFileSync(site,'utf8'),fs.readFileSync(path.resolve(__dirname,'../lib/projects.cjs'),'utf8'));
});
test('projects are part of the same verified durable generation and survive later news-only seeding',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'ainews-project-publication-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const state={articles:[],sources:[],reports:new Map(),cache:{entries:{}},monitoringSince:null,current:null,manifest:null};
 const projects=await collectProjects({now:NOW,fetchImpl:mock()}),article=normalizeArticle({title:'A public source headline',summary:'A bounded summary.',url:'https://openai.com/news/project-test',source:{id:'openai'},publishedAt:NOW},NOW);
 const collected={articles:[article],sources:[{id:'openai',status:'ok'}],status:'ok',lastSuccessAt:NOW};
 const publication=makePublication(state,collected,{now:NOW,projects});publish(root,publication);
 assert.ok(publication.manifest.files['data/projects.json']);assert.equal(verify(root).ok,true);
 const later=makePublication(loadState(root),collected,{now:NOW,seeded:true});assert.equal(later.files.get('projects.json'),publication.files.get('projects.json'));
 fs.appendFileSync(path.join(root,'projects.json'),' ');assert.throws(()=>verify(root),/mismatch/);
});
test('unchanged SPDX with a changed license body requires review; review date and reviewed hash remain fixed',()=>{
 const body='This is a fixture license',sha=createHash('sha256').update(body).digest('hex'),config={...WATCHLIST[0],expectedSpdx:'MIT',customLicense:null,approvedLicenseSha256:sha};
 const repo={default_branch:'main',license:{spdx_id:'MIT',name:'MIT'}},file={path:'LICENSE',encoding:'base64',content:Buffer.from(body).toString('base64')};
 const first=licenseFor(config,repo,file);assert.equal(first.isOpenSource,true);assert.equal(first.reviewedSha256,sha);assert.equal(first.reviewedAt,'2026-10-17');
 const next=licenseFor(config,repo,{...file,content:Buffer.from(body+' an additional restriction').toString('base64')});assert.equal(next.spdx,'MIT');assert.equal(next.isOpenSource,null);assert.equal(next.reviewedSha256,sha);assert.equal(next.reviewedAt,first.reviewedAt);assert.match(next.noteZh,/复核/);
});
