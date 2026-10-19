'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {DISCOVERY,originalUrl,postTime,candidatesFromChallenge,candidatesFromHistory,parseOriginal,classify,chineseDescription,eventFrom,collectCodexActivity,mergeEvents,translationRequests,applyTranslations}=require('../lib/codex-activity.cjs');
const {makePublication,publish,loadState,validTranslation,TRANSLATION_PIPELINE_VERSION}=require('../lib/store.cjs');
const {normalizeArticle}=require('../lib/collect.cjs');
const {verify}=require('../scripts/verify.cjs');
const NOW='2026-10-18T12:00:00.000Z',LATER='2026-10-18T13:00:00.000Z',BASE='https://x.com/thsottiaux/status/';
const DONE=BASE+'2111566005684289735',ANNOUNCE=BASE+'2111492673890824348',FEATURE=BASE+'2111244596131111253';
function candidate(url=FEATURE,hint='feature_update'){return {sourceUrl:url,publishedAt:postTime(url,NOW),discoverySourceUrl:DISCOVERY[0].sourceUrl,originalText:'Day 12/ We improved context across subagents.',hint,relatedSourceUrls:[]};}
function challenge(){return `<section data-state="${encodeURIComponent(JSON.stringify({entries:[{outcome:'improvement',post:{url:FEATURE,text:'Day 12/ We improved context across subagents.'}},{outcome:'reset',post:{url:ANNOUNCE,text:'Day 13/ Le limit reset'}}]}))}"></section>`;}
function history(){return `<table><tr id="event-codex-2111566005684289735" class="row"><td>Usage reset</td><td><a href="${DONE}">Original post</a></td></tr><tr id="event-codex-2111566005684289735-sources"><td><li><span class="role landed">Landed</span><a href="${DONE}">View</a></li></td></tr></table>`;}
const bodies=new Map([[DONE,'Done'],[ANNOUNCE,'Day 13/ Le limit reset'],[FEATURE,'Day 12/ We improved context across subagents.'],[BASE+'2111492738025959922','Landing sometime today by EOD PST']]);
function network({failDiscovery=false,failOriginal=false,wrongAuthor=false}={}){const calls=[];return {calls,fetchImpl:async url=>{calls.push(url);if(url===DISCOVERY[0].sourceUrl){if(failDiscovery)throw Error('network');return new Response(challenge());}if(url===DISCOVERY[1].sourceUrl){if(failDiscovery)throw Error('network');return new Response(history());}if(url.startsWith('https://mcp.exa.ai/')){if(failDiscovery)throw Error('network');return new Response(JSON.stringify({jsonrpc:'2.0',id:1,result:{content:[{type:'text',text:JSON.stringify({results:[]})}]}}));}assert.equal(new URL(url).origin,'https://publish.twitter.com');if(failOriginal)throw Error('network');const original=new URL(url).searchParams.get('url');return new Response(JSON.stringify({url:original,author_url:wrongAuthor?'https://x.com/attacker':'https://x.com/thsottiaux',html:`<blockquote><p>${bodies.get(original)||'Codex update'}</p></blockquote>`}));}};}
test('original author, canonical URLs, source page formats and dates are validated',()=>{
 assert.equal(originalUrl('https://twitter.com/thsottiaux/status/2111566005684289735?utm_source=test'),DONE);
 for(const url of ['http://x.com/thsottiaux/status/2111566005684289735','https://x.com/other/status/2111566005684289735','https://x.com.evil.com/thsottiaux/status/2111566005684289735','https://secret@x.com/thsottiaux/status/2111566005684289735'])assert.equal(originalUrl(url),null);
 assert.equal(postTime(DONE,NOW),'2026-10-17T21:12:21.411Z');assert.equal(postTime(DONE,'2026-10-16T00:00:00Z'),null);
 assert.equal(candidatesFromChallenge(challenge(),NOW).length,2);assert.equal(candidatesFromHistory(history(),NOW).length,1);
 assert.throws(()=>candidatesFromChallenge('<h1>Changed</h1>',NOW));assert.throws(()=>candidatesFromHistory('<html>Challenge page</html>',NOW));
 assert.throws(()=>parseOriginal(JSON.stringify({url:DONE,author_url:'https://x.com/other',html:'<p>Done</p>'}),DONE),/作者/);
});
test('preview, completion and banked reset cannot be conflated; unknown timing stays null',()=>{
 assert.equal(classify('Day 13/ Le limit reset',candidate(ANNOUNCE,'reset_announced')).kind,'reset_announced');
 assert.equal(classify('The usage reset is not done yet.',candidate(ANNOUNCE,'reset_completed')).kind,'feature_update');
 assert.equal(classify('When the usage reset is completed, we will tell you.',candidate(ANNOUNCE,'reset_completed')).kind,'feature_update');
 assert.deepEqual(classify('Done',candidate(DONE,'reset_completed')),{kind:'reset_completed',verifiedMeaning:true,manualCorrelation:true});
 assert.equal(classify('Done',candidate(BASE+'2110618732666257557','reset_completed')).verifiedMeaning,false);
 assert.equal(classify('Loading a banked reset in everyone’s paid accounts.',candidate()).kind,'banked_reset');
 assert.equal(classify('Put the reset in the bag. All propagated.',candidate(ANNOUNCE,'reset_completed')).kind,'reset_completed');
 const event=eventFrom(candidate(ANNOUNCE,'reset_announced'),'Day 13/ Reset',{now:NOW,verified:true});assert.equal(event.effectiveAt,null);assert.match(event.effectiveTimeText,/未知/);assert.match(event.summaryChinese,/不代表已经完成/);
 assert.match(chineseDescription('feature_update','We reuse context by reusing context across subagents and keeping context cached longer').summaryChinese,/上下文/);
});
test('negative and hypothetical reset language cannot become positive reset or banked announcements',()=>{
 for(const body of ['There will be no reset today.','We are not giving banked resets.','We won’t give a banked reset today.','The limits have not been reset.','The usage reset is not done yet.','We will not be giving out any banked resets.','If we ship the feature, there will be no reset.']){
  const event=eventFrom(candidate(ANNOUNCE,'banked_reset'),body,{now:NOW,verified:true});assert.equal(event.kind,'feature_update',body);assert.equal(event.verification,'secondary_only',body);assert.match(event.summaryChinese,/否定|尚未发生/);assert.equal(event.effectiveAt,null);
 }
 for(const body of ["If we don't ship then reset.","If we don't ship, everyone gets a reset.",'We will reset usage limits if the feature is not ready.']){
  const event=eventFrom(candidate(ANNOUNCE,'reset_completed'),body,{now:NOW,verified:true});assert.equal(event.kind,'reset_announced',body);assert.match(event.summaryChinese,/条件/);assert.match(event.summaryChinese,/不能当作已经完成/);assert.equal(event.effectiveAt,null);
 }
 for(const body of ['The usage has been reset.','The limits have now been reset.','The usage reset has been completed.'])assert.equal(classify(body,candidate(ANNOUNCE,'reset_announced')).kind,'reset_completed',body);
 const standalone=eventFrom(candidate(DONE,'reset_completed'),'Done',{now:NOW,verified:true});assert.match(standalone.verificationNote,/人工关联/);assert.doesNotMatch(standalone.verificationNote,/回复关系.*核实/);
});
test('one source URL keeps one interpretation when original reading corrects a secondary category',()=>{
 const weak=eventFrom(candidate(FEATURE,'reset_announced'),'Day 12/ Reset',{now:NOW,verified:false}),feature=eventFrom(candidate(FEATURE),'Day 12/ Reusing context across subagents.',{now:LATER,verified:true}),other=eventFrom(candidate(DONE,'reset_completed'),'Done',{now:NOW,verified:true});
 const merged=mergeEvents([weak,other],[feature]);assert.equal(merged.length,2);assert.equal(merged.filter(e=>e.sourceUrl===FEATURE).length,1);assert.equal(merged.find(e=>e.sourceUrl===FEATURE).kind,'feature_update');assert.equal(merged.find(e=>e.sourceUrl===FEATURE).firstSeenAt,NOW);assert.equal(merged.find(e=>e.sourceUrl===DONE).id,other.id);
 const wrongPositive=eventFrom(candidate(FEATURE,'banked_reset'),'Loading a banked reset.',{now:NOW,verified:true}),negative=eventFrom(candidate(FEATURE),'We are not giving banked resets.',{now:LATER,verified:true});
 const corrected=mergeEvents([wrongPositive],[negative]);assert.equal(corrected.length,1);assert.equal(corrected[0].kind,'feature_update');assert.equal(corrected[0].verification,'secondary_only');assert.equal(corrected[0].firstSeenAt,NOW);
 const failed=eventFrom(candidate(FEATURE,'banked_reset'),'Loading a banked reset.',{now:'2026-10-18T14:00:00.000Z',verified:false});const retained=mergeEvents(corrected,[failed]);assert.equal(retained.length,1);assert.equal(retained[0].originalExcerpt,negative.originalExcerpt);assert.equal(retained[0].kind,'feature_update');
});
test('free discovery and original verification build Chinese events; repeated runs deduplicate and failed sources retain history',async()=>{
 const good=network(),first=await collectCodexActivity({now:NOW,fetchImpl:good.fetchImpl});assert.equal(first.status,'ok');assert.equal(first.events.length,4);assert.equal(first.nextResetAt,null);assert.ok(first.events.every(e=>e.verification==='original_verified'));assert.ok(first.events.every(e=>/[\u3400-\u9fff]/.test(e.titleChinese+e.summaryChinese)));
 assert.equal(first.events.find(e=>e.sourceUrl===DONE).kind,'reset_completed');
 const second=await collectCodexActivity({now:LATER,previous:first,fetchImpl:network().fetchImpl});assert.equal(second.events.length,4);assert.equal(second.events[0].firstSeenAt,NOW);
 const bad=network({failDiscovery:true,failOriginal:true}),failed=await collectCodexActivity({now:LATER,previous:first,fetchImpl:bad.fetchImpl});assert.equal(failed.status,'stale');assert.equal(failed.events.length,4);assert.equal(failed.lastSuccessAt,NOW);assert.ok(failed.sources.filter(s=>s.id!=='tibo-search-index').every(s=>s.status==='stale'));assert.ok(failed.events.every(e=>e.verification==='original_verified'));assert.ok(failed.sources.some(s=>s.error));
 for(const url of [...good.calls,...bad.calls])assert.doesNotMatch(url,/api\.x\.com|api\.openai|api\.anthropic|oauth|login|generate|inference/i);
});
test('author index runs at most once per six hours, respects 429 backoff, and never admits other authors',async()=>{
 const mock=network(),calls=[];const fetchImpl=async(url,opts)=>{if(!url.startsWith('https://mcp.exa.ai/'))return mock.fetchImpl(url,opts);calls.push({url,opts});return new Response(JSON.stringify({jsonrpc:'2.0',id:1,result:{content:[{type:'text',text:JSON.stringify({results:[{url:'https://x.com/other/status/2111244596131111253',text:'Codex update'}]})}]}}));};
 const first=await collectCodexActivity({now:NOW,fetchImpl}),second=await collectCodexActivity({now:LATER,previous:first,fetchImpl});assert.equal(calls.length,1);const request=JSON.parse(calls[0].opts.body);assert.match(request.params.arguments.query,/site:x.com\/thsottiaux\/status\//);assert.equal(request.params.arguments.numResults,5);assert.ok(second.events.every(e=>e.sourceUrl.startsWith(BASE)));
 const late='2026-10-18T19:00:00.000Z';let limited=0;const limitFetch=async(url,opts)=>{if(!url.startsWith('https://mcp.exa.ai/'))return mock.fetchImpl(url,opts);limited++;return new Response('',{status:429,headers:{'retry-after':'86400'}});};
 const third=await collectCodexActivity({now:late,previous:second,fetchImpl:limitFetch});assert.equal(limited,1);assert.match(third.sources.find(s=>s.id==='tibo-search-index').error,/未启用付费/);assert.equal(third.discoveryState.search.nextRetryAt,'2026-10-19T19:00:00.000Z');
 await collectCodexActivity({now:'2026-10-18T20:00:00.000Z',previous:third,fetchImpl:limitFetch});assert.equal(limited,1);
});
test('a transient WhenReset 503 gets only one short retry and does not publish a false stale incident after recovery',async()=>{
 const mock=network();let attempts=0;const fetchImpl=async(url,opts)=>{if(url===DISCOVERY[1].sourceUrl&&++attempts===1)return new Response('Unavailable',{status:503});return mock.fetchImpl(url,opts);};
 const result=await collectCodexActivity({now:NOW,fetchImpl,discoveryConfig:{retryDelayMs:0}}),source=result.sources.find(s=>s.id==='whenreset-codex');
 assert.equal(attempts,2);assert.equal(source.status,'ok');assert.equal(source.attemptsThisRun,2);assert.equal(source.lastSuccessAt,NOW);assert.equal(source.consecutiveFailures,0);assert.equal(source.error,undefined);assert.equal(source.incidentId,undefined);assert.match(source.retryNoteChinese,/短重试 1 次/);
});
test('one failed source cannot block a newly original-verified reset from another source; incident backoff stays stable and later recovery clears it',async()=>{
 const mock=network(),baseline=await collectCodexActivity({now:NOW,fetchImpl:mock.fetchImpl}),NEW=BASE+'2111492673890824349';let whenCalls=0,addNew=false,unavailable=true;
 const fetchImpl=async(url,opts)=>{
  if(url===DISCOVERY[1].sourceUrl){whenCalls++;if(unavailable)return new Response('Unavailable',{status:503});}
  if(addNew&&url===DISCOVERY[0].sourceUrl){const encoded=encodeURIComponent(JSON.stringify({entries:[{outcome:'reset',post:{url:NEW,text:'All usage limits have now been reset.'}}]}));return new Response(`<section data-state="${encoded}"></section>`);}
  if(addNew&&url.startsWith('https://publish.twitter.com/')&&new URL(url).searchParams.get('url')===NEW)return new Response(JSON.stringify({url:NEW,author_url:'https://x.com/thsottiaux',html:'<p>All usage limits have now been reset.</p>'}));
  return mock.fetchImpl(url,opts);
 };
 const failed=await collectCodexActivity({now:LATER,previous:baseline,fetchImpl,discoveryConfig:{retryDelayMs:0}}),incident=failed.sources.find(s=>s.id==='whenreset-codex');
 assert.equal(whenCalls,2);assert.equal(incident.errorCode,'http_503');assert.equal(incident.checkedAt,LATER);assert.equal(incident.lastSuccessAt,NOW);assert.equal(incident.failureSince,LATER);assert.equal(incident.nextRetryAt,'2026-10-18T13:15:00.000Z');
 addNew=true;const BACKOFF='2026-10-18T13:05:00.000Z',continued=await collectCodexActivity({now:BACKOFF,previous:failed,fetchImpl,discoveryConfig:{retryDelayMs:0}}),still=continued.sources.find(s=>s.id==='whenreset-codex'),newEvent=continued.events.find(e=>e.sourceUrl===NEW);
 assert.equal(whenCalls,2);assert.equal(still.backoff,true);assert.equal(still.attemptsThisRun,0);assert.equal(still.checkedAt,LATER);assert.equal(still.lastSuccessAt,NOW);assert.equal(still.incidentId,incident.incidentId);assert.equal(still.lastFailureAt,LATER);assert.ok(newEvent);assert.equal(newEvent.kind,'reset_completed');assert.equal(newEvent.verification,'original_verified');assert.equal(newEvent.effectiveAt,null);
 for(const old of baseline.events){const retained=continued.events.find(e=>e.sourceUrl===old.sourceUrl);assert.ok(retained);for(const key of ['publishedAt','effectiveAt','firstSeenAt','kind','verification'])assert.equal(retained[key],old[key],key);}
 const AGAIN='2026-10-18T14:00:00.000Z',repeated=await collectCodexActivity({now:AGAIN,previous:continued,fetchImpl,discoveryConfig:{retryDelayMs:0}}),same=repeated.sources.find(s=>s.id==='whenreset-codex');assert.equal(whenCalls,4);assert.equal(same.consecutiveFailures,2);assert.equal(same.incidentId,incident.incidentId);assert.equal(same.failureSince,LATER);assert.equal(same.nextRetryAt,'2026-10-18T15:00:00.000Z');
 unavailable=false;const RECOVERED='2026-10-18T15:00:00.000Z',recovered=await collectCodexActivity({now:RECOVERED,previous:repeated,fetchImpl,discoveryConfig:{retryDelayMs:0}}),healthy=recovered.sources.find(s=>s.id==='whenreset-codex');assert.equal(whenCalls,5);assert.equal(healthy.status,'ok');assert.equal(healthy.lastSuccessAt,RECOVERED);assert.equal(healthy.checkedAt,RECOVERED);assert.equal(healthy.recoveredAt,RECOVERED);assert.equal(healthy.consecutiveFailures,0);assert.equal(healthy.error,undefined);assert.equal(healthy.incidentId,undefined);assert.equal(healthy.nextRetryAt,undefined);assert.ok(recovered.events.some(e=>e.sourceUrl===NEW));
});
test('HTTP 403/429 and Retry-After stop immediate retry without blocking the healthy source or requesting paid alternatives',async()=>{
 for(const [status,retryAfter] of [[403,null],[429,null],[403,'86400'],[429,'86400'],[503,'86400']]){
  const mock=network();let attempts=0;const fetchImpl=async(url,opts)=>{if(url===DISCOVERY[1].sourceUrl){attempts++;return new Response('Wait',{status,headers:retryAfter?{'retry-after':retryAfter}:{}});}return mock.fetchImpl(url,opts);};
  const first=await collectCodexActivity({now:NOW,fetchImpl,discoveryConfig:{retryDelayMs:0}}),source=first.sources.find(s=>s.id==='whenreset-codex');assert.equal(attempts,1);assert.equal(source.errorCode,'http_'+status);assert.equal(source.nextRetryAt,retryAfter?'2026-10-19T12:00:00.000Z':'2026-10-18T18:00:00.000Z');if(retryAfter)assert.match(source.retryNoteChinese,/Retry-After/);assert.equal(first.sources.find(s=>s.id==='codexlimits-tibo').status,'ok');assert.ok(first.events.some(e=>e.verification==='original_verified'));
  await collectCodexActivity({now:LATER,previous:first,fetchImpl,discoveryConfig:{retryDelayMs:0}});assert.equal(attempts,1);for(const url of mock.calls)assert.doesNotMatch(url,/api\.x\.com|api\.openai|paid|oauth/i);
 }
});
test('a timeout and a format change have distinct failure evidence; a format change is not retried as an empty successful scan',async()=>{
 for(const [mode,expectedAttempts,code] of [['timeout',2,'timeout'],['parser',1,'parser']]){
  const mock=network();let attempts=0;const fetchImpl=async(url,opts)=>{if(url===DISCOVERY[1].sourceUrl){attempts++;if(mode==='timeout'){const error=new Error('fixture timeout');error.name='TimeoutError';throw error;}return new Response('<html>Temporary maintenance</html>');}return mock.fetchImpl(url,opts);};
  const out=await collectCodexActivity({now:NOW,fetchImpl,discoveryConfig:{retryDelayMs:0}}),source=out.sources.find(s=>s.id==='whenreset-codex');assert.equal(attempts,expectedAttempts);assert.equal(source.status,'unavailable');assert.equal(source.errorCode,code);assert.equal(source.lastSuccessAt,null);assert.ok(source.nextRetryAt);assert.equal(out.sources.find(s=>s.id==='codexlimits-tibo').status,'ok');
 }
});
test('third-party claims never become original-verified when original fetch or author check fails',async()=>{
 for(const flags of [{failOriginal:true},{wrongAuthor:true}]){const result=await collectCodexActivity({now:NOW,fetchImpl:network(flags).fetchImpl});assert.equal(result.status,'partial');assert.ok(result.events.every(e=>e.verification==='secondary_only'));assert.equal(result.nextResetAt,null);}
 const weak=eventFrom(candidate(DONE,'reset_completed'),'Done',{now:LATER,verified:false}),strong=eventFrom(candidate(DONE,'reset_completed'),'Done',{now:NOW,verified:true});assert.equal(mergeEvents([strong],[weak])[0].verification,'original_verified');
});
test('unregistered discovery redirects are refused before sending any request to their destination',async()=>{
 const calls=[],mock=network(),fetchImpl=async(url,opts)=>{calls.push(url);if(url===DISCOVERY[0].sourceUrl)return new Response('',{status:302,headers:{location:'http://127.0.0.1/private'}});return mock.fetchImpl(url,opts);};
 const out=await collectCodexActivity({now:NOW,fetchImpl});assert.ok(out.sources.find(s=>s.id===DISCOVERY[0].id).error);assert.ok(calls.every(url=>!url.startsWith('http:')));assert.ok(calls.every(url=>!url.includes('127.0.0.1')));
});
test('pending feature translation accepts only exact provenance plus real Chinese text',()=>{
 const event=eventFrom(candidate(),'We added a new Codex terminal feature.',{now:NOW,verified:true}),codex={events:[event]};const requests=translationRequests(codex,{entries:{}},validTranslation);assert.equal(requests.length,1);
 const key=event.id+':'+event.contentHash,provenance={status:'ok',sourceHash:event.contentHash,pipelineVersion:TRANSLATION_PIPELINE_VERSION,engine:'offline_cpu_qwen'};
 for(const value of [{titleZh:'Translation unavailable',summaryZh:'failed',translation:provenance},{titleZh:'翻译失败',summaryZh:'翻译不可用',translation:provenance},{titleZh:'新终端功能',summaryZh:'新增终端功能。',translation:{...provenance,sourceHash:'wrong'}}])assert.equal(applyTranslations(codex,{[key]:value},validTranslation).events[0].translation.status,'pending');
 const applied=applyTranslations(codex,{[key]:{titleZh:'新增终端功能',summaryZh:'Codex 新增终端功能。',translation:provenance}},validTranslation);assert.equal(applied.events[0].translation.status,'ok');assert.equal(applied.events[0].titleChinese,'新增终端功能');
});
test('UTF-8 byte windows bound large Codex snapshots while all 5002 events survive monthly archives',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'skc-codex-pipeline-'));t.after(()=>{const absolute=path.resolve(dir);assert.equal(path.dirname(absolute),path.resolve(os.tmpdir()));assert.ok(path.basename(absolute).startsWith('skc-codex-pipeline-'));fs.rmSync(absolute,{recursive:true,force:true});});
 const base=eventFrom(candidate(),'Day 12/ Reusing context across subagents.',{now:NOW,verified:true});const events=Array.from({length:5002},(_,i)=>({...base,id:'tibo-test-'+i,sourceUrl:BASE+String(BigInt('2111244596131111253')+BigInt(i)),publishedAt:new Date(Date.UTC(2025,i%12,1)).toISOString(),summaryChinese:'归档体积测试中文内容。'.repeat(200)}));
 const codex={schemaVersion:1,status:'ok',checkedAt:NOW,lastSuccessAt:NOW,sources:[],coverageNote:'Test',events,nextResetAt:null,nextResetLabel:'未知（未公布准确时间）'};
 const article=normalizeArticle({title:'Codex update',summary:'News.',url:'https://openai.com/news/test-codex',source:{id:'openai'},publishedAt:NOW},NOW);
 const state={articles:[],reports:new Map(),cache:{entries:{}},current:null,manifest:null},collected={articles:[article],sources:[],status:'ok',lastSuccessAt:NOW};
 const publication=makePublication(state,collected,{now:NOW,codex});publish(dir,publication);assert.equal(verify(dir).ok,true);
 const currentBody=publication.files.get('codex.json'),archiveBody=publication.files.get('codex-archive.json'),current=JSON.parse(currentBody),archive=JSON.parse(archiveBody);
 assert.ok(Buffer.byteLength(currentBody)<=4*1024*1024);assert.ok(Buffer.byteLength(archiveBody)<=6*1024*1024);assert.ok(current.events.length<600);assert.ok(archive.events.length<5000);assert.ok(archive.events.length>current.events.length);assert.equal(current.archive.windowed,true);assert.equal(current.archive.totalEvents,5002);assert.equal(archive.windowed,true);assert.equal(archive.totalEvents,5002);assert.equal(archive.indexUrl,'data/codex/archive/index.json');assert.equal(loadState(dir).codex.events.length,5002);
 const partitionPaths=Object.keys(publication.manifest.files).filter(file=>/^data\/codex\/archive\/\d{4}-\d{2}\.json$/.test(file));assert.equal(partitionPaths.length,12);assert.ok(partitionPaths.every(file=>publication.manifest.files[file].bytes<=8*1024*1024));assert.equal(JSON.parse(publication.files.get('codex/archive/index.json')).totalEvents,5002);assert.equal(JSON.parse(publication.files.get('current.json')).codex.events.length,current.events.length);assert.ok(Buffer.byteLength(publication.files.get('current.json'))<8*1024*1024);
 // A future oversized single month fails before publish(), rather than emitting
 // a manifest generation which the website must reject. No history is clipped.
 assert.throws(()=>makePublication(state,collected,{now:NOW,codex:{...codex,events:events.map(e=>({...e,publishedAt:NOW}))}}),/monthly archive.*8 MiB/);assert.equal(loadState(dir).codex.events.length,5002);
});
