'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {SOURCES,digest,parseFeed,fetchFeed}=require('../lib/core.cjs');
const {normalizeArticle,collectNews,seedNews}=require('../lib/collect.cjs');
const {cacheKey,validTranslation,loadState,combineArticles,makePublication,publish,acquireLock,TRANSLATION_PIPELINE_VERSION}=require('../lib/store.cjs');
const {reportPeriod,periodBounds,makeReports,toRss}=require('../lib/reports.cjs');
const {update,options,runPython}=require('../scripts/update.cjs');
const {verify}=require('../scripts/verify.cjs');
const NOW='2026-10-17T08:13:47.297Z';
function article(n=1,overrides={}){return normalizeArticle({title:`OpenAI releases model ${n}`,summary:'An official engineering update.',url:`https://openai.com/news/test-${n}`,source:{id:'openai'},publishedAt:'2026-10-16T08:00:00Z',...overrides},NOW);}
function translated(a){return {titleZh:'OpenAI 发布新模型',summaryZh:'官方工程更新。',translation:{status:'ok',sourceHash:a.contentHash,model:'fixture',modelRevision:'fixture',engine:'offline_cpu_marian',pipelineVersion:TRANSLATION_PIPELINE_VERSION,translatedAt:NOW}};}
function empty(){return {articles:[],sources:[],reports:new Map(),cache:{entries:{}},monitoringSince:null,current:null,manifest:null};}
function collected(rows){return {articles:rows,sources:[{id:'openai',status:'ok',articleCount:rows.length,articleIds:rows.map(a=>a.id),lastSuccessAt:NOW}],status:'partial',lastSuccessAt:NOW};}
function temp(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'skc-ainews-test-'));t.after(()=>{const verified=path.resolve(root);assert.ok(verified.startsWith(path.resolve(os.tmpdir(),'skc-ainews-test-')));fs.rmSync(verified,{recursive:true,force:true});});return root;}
function rss(source){return `<rss version="2.0"><channel><title>Test</title><item><title>Model update</title><link>${source.url.replace(/\/$/,'')}/test-entry</link><description>Engineering news.</description><pubDate>Fri, 16 Oct 2026 08:00:00 GMT</pubDate></item></channel></rss>`;}

test('only seven news feeds; no auxiliary endpoints or arbitrary redirect target',async()=>{
  assert.equal(SOURCES.length,7);
  assert.throws(()=>parseFeed('<!DOCTYPE rss [<!ENTITY x "bad">]><rss/>',SOURCES[0],NOW),/DTD/);
  await assert.rejects(()=>fetchFeed({...SOURCES[0],feedUrl:'https://example.com/rss'},{fetchImpl:()=>{throw Error('must not fetch');}}),/fixed registry/);
  await assert.rejects(()=>fetchFeed(SOURCES[0],{fetchImpl:async()=>({ok:true,url:'https://example.com/rss',headers:new Headers()})}),/redirect/);
});

test('partial upstream failure preserves that source and exposes stale state',async()=>{
  const old=article(1),state={articles:[old],sources:[{id:'openai',articleIds:[old.id],lastSuccessAt:NOW}]};
  const out=await collectNews(state,{now:NOW,fetchImpl:async url=>{
    const source=SOURCES.find(s=>s.feedUrl===url);if(source.id==='openai')throw Error('timeout');
    return new Response(rss(source),{status:200});
  }});
  assert.equal(out.status,'partial');assert.ok(out.articles.some(a=>a.id===old.id));
  assert.equal(out.sources[0].status,'stale');assert.equal(out.sources[0].lastSuccessAt,NOW);
});

test('all feeds failing cannot overwrite any existing published data',async t=>{
  const root=temp(t),data=path.join(root,'data'),work=path.join(root,'work');
  publish(data,makePublication(empty(),collected([article()]),{now:NOW}));
  const before=fs.readFileSync(path.join(data,'manifest.json'),'utf8'),archive=fs.readFileSync(path.join(data,'archive.json'),'utf8');
  await assert.rejects(()=>update({output:data,work,limit:100,skipTranslation:true},{now:NOW,fetchImpl:async()=>{throw Error('offline');}}),/All news sources failed/);
  assert.equal(fs.readFileSync(path.join(data,'manifest.json'),'utf8'),before);assert.equal(fs.readFileSync(path.join(data,'archive.json'),'utf8'),archive);
  assert.equal(fs.existsSync(path.join(work,'collector.lock')),false);
});

test('translation is reused only for exact source hash; content change retains original and old cache',()=>{
  const a=article(),value=translated(a),cache={entries:{[cacheKey(a)]:value}};
  const old=combineArticles([], [a],cache,NOW)[0];assert.ok(validTranslation(old,a));
  const same=combineArticles([old],[{...a,ingestedAt:'2026-10-18T00:00:00Z'}],cache,NOW)[0];
  assert.equal(same.titleZh,value.titleZh);assert.equal(same.ingestedAt,a.ingestedAt);
  const changed=article(1,{summary:'A changed claim must be translated again.'}),next=combineArticles([old],[changed],cache,NOW)[0];
  assert.equal(next.title,changed.title);assert.equal(next.summary,changed.summary);assert.equal(next.translation.status,'pending');assert.equal(next.titleZh,'');
  assert.ok(cache.entries[cacheKey(a)]);assert.notEqual(next.contentHash,a.contentHash);
});

test('failed translation remains visible as failure, never labelled Chinese, and preserves old exact cache',()=>{
  const a=article(),state=empty(),key=cacheKey(a);state.cache.entries['older:hash']={titleZh:'旧译文'};
  const out=makePublication(state,collected([a]),{now:NOW,translationRequested:1,translationErrors:{[key]:'offline'}});
  const current=JSON.parse(out.files.get('current.json'));
  assert.equal(current.articles[0].translation.status,'failed');assert.equal(current.articles[0].title,a.title);assert.equal(current.articles[0].titleZh,'');
  assert.equal(out.receipt.translationFailed,1);assert.ok(JSON.parse(out.files.get('translation-cache.json')).entries['older:hash']);
});

test('MYT dates, Monday week boundaries, year crossing and leap-month ends are exact',()=>{
  assert.equal(reportPeriod('daily','2026-10-16T16:00:00Z'),'2026-10-17');
  assert.equal(reportPeriod('weekly','2026-10-18T15:59:59Z'),'2026-10-12');
  assert.equal(reportPeriod('weekly','2026-10-18T16:00:00Z'),'2026-10-19');
  assert.equal(reportPeriod('monthly','2026-10-31T16:00:00Z'),'2026-11');
  assert.deepEqual(periodBounds('monthly','2028-02'),{startAt:'2028-01-31T16:00:00.000Z',endAt:'2028-02-29T16:00:00.000Z'});
  assert.equal(reportPeriod('weekly','2027-01-01T00:00:00Z'),'2026-12-28');
});

test('reports use Chinese with source links; unchanged historical reports do not rewrite compiledAt',()=>{
  const a=article(),all=combineArticles([],[a],{entries:{[cacheKey(a)]:translated(a)}},NOW);
  const first=makeReports(all,NOW,new Map(),NOW),second=makeReports(all,'2026-10-17T09:00:00Z',first.reports,NOW);
  const report=second.reports.get('reports/daily/2026-10-16.json');
  assert.equal(report.items[0].title,'OpenAI 发布新模型');assert.equal(report.items[0].url,a.url);
  assert.equal(report.compiledAt,NOW);assert.equal(report.partial,true);assert.equal(report.retroactive,true);assert.equal(report.periodState,'closed');
  assert.deepEqual([...first.reports],[...second.reports]);
});

test('durable monthly partitions retain more than 4000 while compatibility window is explicit',t=>{
  const root=temp(t),rows=Array.from({length:4003},(_,n)=>article(n));
  const out=makePublication(empty(),collected(rows),{now:NOW});publish(root,out);
  const restored=loadState(root),window=JSON.parse(out.files.get('archive.json'));
  assert.equal(restored.articles.length,4003);assert.equal(window.articles.length,4000);assert.equal(window.windowed,true);assert.equal(window.totalArticles,4003);
  assert.equal(verify(root).articles,4003);assert.equal(JSON.parse(out.files.get('current.json')).articles.length,300);
});

test('two collectors cannot write simultaneously, and lock is released safely',t=>{
  const root=temp(t),release=acquireLock(root);assert.throws(()=>acquireLock(root),/Another collector/);release();const next=acquireLock(root);next();
});

test('publication verifies atomically identified files and detects data tampering',t=>{
  const root=temp(t),out=makePublication(empty(),collected([article()]),{now:NOW});publish(root,out);
  assert.equal(verify(root).ok,true);fs.appendFileSync(path.join(root,'feed.xml'),'changed');assert.throws(()=>verify(root),/mismatch/);
});

test('second seed with identical content skips the translator and keeps archived Chinese',async t=>{
  const root=temp(t),seed=path.join(root,'seed.json'),a=article(),opts={output:path.join(root,'data'),work:path.join(root,'work'),limit:100,seed,python:'unused'};
  fs.writeFileSync(seed,JSON.stringify({articles:[a],generatedAt:NOW}));let calls=0;
  const translator=async records=>{calls++;return {entries:Object.fromEntries(records.map(r=>[cacheKey(r),translated(r)]))};};
  await update(opts,{now:NOW,translator});await update(opts,{now:NOW,translator});
  assert.equal(calls,1);const restored=loadState(opts.output);assert.equal(restored.articles[0].titleZh,'OpenAI 发布新模型');assert.equal(verify(opts.output).ok,true);
});

test('RSS escapes translated text and labels untranslated fallback explicitly',()=>{
  const a=article();a.title='A & B <test>';a.summary='"quoted"';
  const rss=toRss({generatedAt:NOW,articles:[a]});assert.ok(rss.includes('A &amp; B &lt;test&gt;'));assert.ok(rss.includes('原文；译文待补'));
});

test('CLI bounds and unsupported options prevent accidental unlimited work',()=>{
  assert.throws(()=>options(['--translate-limit','501']),/0..500/);assert.throws(()=>options(['--url','https://example.com']),/Unsupported/);
  assert.equal(options(['--translate-limit','0']).limit,0);
});

test('translation pipeline upgrades invalidate old output while editorial reviewed seeds share the current contract',()=>{
  const a=article(),old=translated(a);old.translation.pipelineVersion='old_fragmented_marian';
  assert.equal(validTranslation(old,a),false);
  const state=empty();state.articles=[{...a,...old}];
  const out=makePublication(state,collected([article(2)]),{now:NOW});
  const retained=JSON.parse(out.files.get('archive.json')).articles.find(x=>x.id===a.id);
  assert.equal(retained.translation.status,'pending');assert.equal(retained.titleZh,'');
  const editorial=translated(a);editorial.translation.engine='editorial_seed';editorial.translation.model='Codex session review';
  assert.equal(validTranslation(editorial,a),true);
  const seeded=makePublication(empty(),collected([a]),{now:NOW,translations:{[cacheKey(a)]:editorial},translationRequested:1});
  const current=JSON.parse(seeded.files.get('current.json'));
  assert.equal(current.translation.method,'machine_translation_with_provenance');assert.deepEqual(current.translation.engines,{editorial_seed:1});
  assert.deepEqual(seeded.receipt.actualTranslationEngines,{editorial_seed:1});assert.equal(seeded.receipt.configuredModel.mode,'offline_cpu');assert.equal(seeded.receipt.model,undefined);
});

test('a partial translation checkpoint publishes completed items and defers the remainder',async t=>{
  const root=temp(t),seed=path.join(root,'seed.json'),rows=[article(1),article(2)];
  fs.writeFileSync(seed,JSON.stringify({articles:rows,generatedAt:NOW}));
  const opts={output:path.join(root,'data'),work:path.join(root,'work'),limit:20,seed,python:'unused'};
  const receipt=await update(opts,{now:NOW,translator:async requests=>({entries:{[cacheKey(requests[0])]:translated(requests[0])},deferred:1})});
  assert.equal(receipt.translatedThisRun,1);assert.equal(receipt.translationDeferred,1);assert.equal(receipt.translationFailed,0);
  assert.equal(loadState(opts.output).articles.filter(a=>a.translation.status==='ok').length,1);assert.equal(verify(opts.output).ok,true);
});

test('subprocess deadline returns a checkpoint-readable outcome instead of discarding partial work',async()=>{
  const result=await runPython(process.execPath,['-e','setTimeout(()=>{},30000)'],{timeoutMs:80});
  assert.equal(result.timedOut,true);
});

test('re-seeding a newer generated artifact cannot manufacture a newer successful source collection',()=>{
  const checked='2026-10-17T08:13:47.297Z',later='2026-10-17T11:00:00.000Z';
  const original={articles:[article()],generatedAt:NOW,sources:[{id:'openai',lastSuccessAt:checked}]};
  assert.equal(seedNews(original,later).lastSuccessAt,checked);
  const regenerated={...original,generatedAt:later};assert.equal(seedNews(regenerated,later).lastSuccessAt,checked);
  assert.equal(seedNews({...regenerated,lastSuccessAt:null},later).lastSuccessAt,null);
  assert.equal(seedNews({articles:[article()],generatedAt:later},later).lastSuccessAt,null);
  const state=empty();state.current={lastSuccessAt:checked};
  const out=makePublication(state,seedNews({...regenerated,lastSuccessAt:null},later),{now:later,seeded:true});
  assert.equal(out.receipt.lastSuccessAt,null);assert.equal(out.receipt.attemptAt,later);
});
