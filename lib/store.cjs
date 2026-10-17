'use strict';
const fs=require('node:fs'),path=require('node:path');
const {digest,mergeArticles,buildStories,LIMITS}=require('./core.cjs');
const {makeReports,toRss}=require('./reports.cjs');
const {validateProjects}=require('./projects.cjs');
const {validateShowcases}=require('./showcases.cjs');
const COVERAGE_NOTE='七个平台订阅源、Codex/Claude Code 官方 GitHub 发布流及 Meta 公司新闻，仅读取标题、短摘要和来源链接。共十个有限源，不是全网或 Meta AI 研究完整覆盖；发布流可能含预览版，中文为机器翻译。回溯数据不表示历史连续监测。';
function readJson(file,fallback=null){return fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):fallback;}
function json(value){return JSON.stringify(value,null,2)+'\n';}
function writeIfChanged(root,relative,body){
  const target=path.join(root,relative);if(fs.existsSync(target)&&fs.readFileSync(target,'utf8')===body)return false;
  fs.mkdirSync(path.dirname(target),{recursive:true});const temp=target+'.tmp';fs.writeFileSync(temp,body);fs.renameSync(temp,target);return true;
}
function loadState(root){
  const current=readJson(path.join(root,'current.json'));
  const index=readJson(path.join(root,'archive/index.json'));
  let articles=[];
  if(index){for(const part of index.partitions||[]){if(!/^archive\/(?:\d{4}-\d{2}|undated)\.json$/.test(part.path))throw Error('Unsafe archive partition path');const data=readJson(path.join(root,part.path));if(!data||!Array.isArray(data.articles)||data.articles.length!==part.articleCount)throw Error('Incomplete durable archive');articles.push(...data.articles);}}
  else articles=readJson(path.join(root,'archive.json'))?.articles||[];
  const reports=new Map(),reportIndex=readJson(path.join(root,'reports/index.json'));
  for(const row of reportIndex?.reports||[]){if(!/^reports\/(?:daily|weekly|monthly)\/\d{4}-\d{2}(?:-\d{2})?\.json$/.test(row.path))throw Error('Unsafe report path');const report=readJson(path.join(root,row.path));if(!report)throw Error('Missing historical report');reports.set(row.path,report);}
  const cache=readJson(path.join(root,'translation-cache.json'),{schemaVersion:1,entries:{}});
  return {articles:mergeArticles(articles),sources:current?.sources||[],current,reports,cache,projects:readJson(path.join(root,'projects.json')),showcases:readJson(path.join(root,'showcases.json')),
    monitoringSince:index?.monitoringSince||null,manifest:readJson(path.join(root,'manifest.json'))};
}
function cacheKey(a){return `${a.id}:${a.contentHash}`;}
const TRANSLATION_PIPELINE_VERSION='qwen2_5_1_5b_whole_text_v1';
function validTranslation(value,a){return value?.translation?.status==='ok'&&value.translation.sourceHash===a.contentHash&&value.translation.pipelineVersion===TRANSLATION_PIPELINE_VERSION&&typeof value.titleZh==='string'&&value.titleZh.length>0&&typeof value.summaryZh==='string';}
function combineArticles(previous,incoming,cache,now){
  const map=new Map(previous.map(a=>[a.id,a]));
  for(const item of incoming){
    const old=map.get(item.id),same=old?.contentHash===item.contentHash;
    const candidate=cache.entries[cacheKey(item)];
    const translated=validTranslation(candidate,item)?candidate:same&&validTranslation(old,item)?old:null;
    map.set(item.id,{...item,ingestedAt:same?old.ingestedAt:item.ingestedAt,firstSeenAt:old?.firstSeenAt||old?.ingestedAt||item.ingestedAt||now,
      lastChangedAt:same?old.lastChangedAt||old.ingestedAt:now,
      titleZh:translated?.titleZh||(item.language==='zh'?item.title:''),summaryZh:translated?.summaryZh||(item.language==='zh'?item.summary:''),
      translation:translated?.translation||(item.language==='zh'?{status:'ok',sourceHash:item.contentHash,engine:'original_chinese',pipelineVersion:TRANSLATION_PIPELINE_VERSION}:{status:'pending',sourceHash:item.contentHash})});
  }
  return mergeArticles([...map.values()]);
}
function makePublication(state,collected,{now,translations={},translationErrors={},translationError=null,translationRequested=0,translationDeferred=0,translationNote=null,translationLimit=20,seeded=false,projects=state.projects||null,showcases=state.showcases||null}){
  const cache={schemaVersion:1,entries:{...state.cache.entries}};
  let articles=combineArticles(state.articles,collected.articles,cache,now);
  let translated=0,translationFailed=0;const actualTranslationEngines={};
  const incomingKeys=new Set(collected.articles.map(cacheKey));
  for(const a of articles){
    const key=cacheKey(a),value=translations[key];
    if(value&&validTranslation(value,a)){
      const saved={...value,originalTitle:a.title,originalSummary:a.summary};cache.entries[key]=saved;a.titleZh=saved.titleZh;a.summaryZh=saved.summaryZh;a.translation=saved.translation;translated++;
      const engine=String(saved.translation.engine||'unknown').slice(0,60);actualTranslationEngines[engine]=(actualTranslationEngines[engine]||0)+1;
    }else if(value){translationFailed++;}
    if(a.translation?.status==='ok'&&!validTranslation(a,a)){a.titleZh='';a.summaryZh='';a.translation={status:'pending',sourceHash:a.contentHash};}
    if(!validTranslation(a,a)&&cache.entries[key]&&validTranslation(cache.entries[key],a)){a.titleZh=cache.entries[key].titleZh;a.summaryZh=cache.entries[key].summaryZh;a.translation=cache.entries[key].translation;}
    // A failed or pending translation never replaces the English original or another valid hash's cache.
    if(incomingKeys.has(key)&&a.translation?.status!=='ok'){a.titleZh='';a.summaryZh='';a.translation={status:'pending',sourceHash:a.contentHash};}
    if(translationErrors[key]&&!validTranslation(a,a)){a.translation={status:'failed',sourceHash:a.contentHash};translationFailed++;}
  }
  if(!articles.length)throw Error('Refusing to publish an empty archive');
  const monitoringSince=state.monitoringSince||now;
  const {reports,editions}=makeReports(articles,now,state.reports,monitoringSince);
  const dates=articles.map(a=>a.publishedAt).filter(Boolean).sort();
  const oldHashes=new Map(state.articles.map(p=>[p.id,p.contentHash]));
  const engines={};for(const a of articles)if(validTranslation(a,a)){const engine=String(a.translation.engine||'unknown').slice(0,60);engines[engine]=(engines[engine]||0)+1;}
  const receipt={schemaVersion:1,attemptAt:now,lastSuccessAt:Object.prototype.hasOwnProperty.call(collected,'lastSuccessAt')?collected.lastSuccessAt:state.current?.lastSuccessAt||null,
    status:collected.status,seeded,sourceOk:collected.sources.filter(s=>s.status==='ok').length,
    sourceStale:collected.sources.filter(s=>s.status==='stale').length,archiveArticles:articles.length,
    newArticles:articles.filter(a=>!oldHashes.has(a.id)).length,
    changedArticles:collected.articles.filter(a=>oldHashes.has(a.id)&&oldHashes.get(a.id)!==a.contentHash).length,
    translationRequested,translatedThisRun:translated,translationFailed,translationDeferred,translationError,translationNote,actualTranslationEngines,
    pendingTranslations:articles.filter(a=>a.translation?.status!=='ok').length,translationLimit,
    configuredModel:{id:'Qwen/Qwen2.5-1.5B-Instruct',revision:'989aa7980e4cf806f80c7fef2b1adb7bc71aa306',mode:'offline_cpu',pipelineVersion:TRANSLATION_PIPELINE_VERSION,
      note:'后续自动翻译的配置；本次实际译文来源见 actualTranslationEngines，各篇原有译文来源见文章 translation。'},
    scheduler:{expected:'hourly at minute 17 UTC',actualAttemptAt:now,runId:process.env.GITHUB_RUN_ID||null,
      event:process.env.GITHUB_EVENT_NAME||'local',note:'配置定时不代表每次准时执行；实际记录以本收据为准。'}};
  const current={schemaVersion:1,generatedAt:now,lastSuccessAt:receipt.lastSuccessAt,status:collected.status,
    articles:articles.slice(0,LIMITS.articles),sources:collected.sources,stories:buildStories(articles,now),
    coverage:{start:dates[0]||null,end:dates.at(-1)||null,note:COVERAGE_NOTE,monitoringSince},
    archive:{url:'/news/data/archive.json',publishedAt:now,totalArticles:articles.length,indexUrl:'data/archive/index.json'},
    refreshPolicy:{ttlSeconds:240,mode:'scheduled_persistent',note:'后台按小时计划采集，中文离线 CPU 翻译；不保证准点。历史档案保存在独立公开仓库。'},
    translation:{method:'machine_translation_with_provenance',translated:articles.filter(a=>validTranslation(a,a)).length,pending:receipt.pendingTranslations,engines},
    limits:{articles:LIMITS.articles,excerpt:LIMITS.excerpt,compatibilityArchiveWindow:4000},receipt};
  const partitionMap=new Map();
  for(const article of articles){const key=article.publishedAt?article.publishedAt.slice(0,7):'undated';if(!partitionMap.has(key))partitionMap.set(key,[]);partitionMap.get(key).push(article);}
  const files=new Map(),partitions=[];
  for(const [month,rows] of [...partitionMap].sort(([a],[b])=>b.localeCompare(a))){
    const file=`archive/${month}.json`,body=json({schemaVersion:1,month,articles:rows});files.set(file,body);
    partitions.push({month,path:file,articleCount:rows.length,bytes:Buffer.byteLength(body),sha256:digest(body)});
  }
  const archiveIndex={schemaVersion:1,monitoringSince,totalArticles:articles.length,coverageNote:COVERAGE_NOTE,partitions};
  const window=articles.slice(0,4000),visibleIds=new Set(window.map(a=>a.id));
  const compatibilityEditions=editions.map(e=>({...e,loadedArticleIds:e.articleIds.filter(id=>visibleIds.has(id))}));
  const archive={schemaVersion:1,publishedAt:now,coverageNote:COVERAGE_NOTE,articles:window,editions:compatibilityEditions,
    totalArticles:articles.length,windowed:articles.length>window.length,archiveIndexUrl:'data/archive/index.json',
    note:'此兼容文件最多载入最新 4000 条；全部历史仍按月保存在 archive/，不会从永久档案删除。'};
  files.set('current.json',json(current));files.set('archive.json',json(archive));files.set('archive/index.json',json(archiveIndex));
  files.set('translation-cache.json',json(cache));files.set('receipt.json',json(receipt));files.set('feed.xml',toRss(current));
  if(projects)files.set('projects.json',json(validateProjects(projects)));
  if(showcases)files.set('showcases.json',json(validateShowcases(showcases)));
  const reportRows=[];
  for(const [file,report] of reports){const body=json(report);files.set(file,body);reportRows.push({id:report.id,path:file,kind:report.kind,period:report.period,
    articleCount:report.articleCount,periodState:report.periodState,compiledAt:report.compiledAt,bytes:Buffer.byteLength(body),sha256:digest(body)});}
  reportRows.sort((a,b)=>b.period.localeCompare(a.period)||a.kind.localeCompare(b.kind));
  files.set('reports/index.json',json({schemaVersion:1,coverageNote:COVERAGE_NOTE,reports:reportRows}));
  const hashes={};for(const [file,body] of [...files].sort(([a],[b])=>a.localeCompare(b)))hashes[`data/${file}`]={sha256:digest(body),bytes:Buffer.byteLength(body)};
  const manifest={schemaVersion:1,generationId:digest(JSON.stringify(hashes)),generatedAt:now,lastSuccessAt:receipt.lastSuccessAt,
    status:collected.status,archiveArticles:articles.length,reportCount:reports.size,files:hashes,
    atomicity:'Read manifest and files at the same Git commit; manifest hashes omit manifest itself.'};
  return {files,manifest,receipt};
}
function publish(root,result){
  fs.mkdirSync(root,{recursive:true});let changed=0;
  for(const [file,body] of result.files)if(writeIfChanged(root,file,body))changed++;
  if(writeIfChanged(root,'manifest.json',json(result.manifest)))changed++;
  return {changed,generationId:result.manifest.generationId,...result.receipt};
}
function acquireLock(work){
  fs.mkdirSync(work,{recursive:true});const lock=path.join(work,'collector.lock');
  let fd;try{fd=fs.openSync(lock,'wx');}catch(error){if(error.code==='EEXIST')throw Error('Another collector is running; no files changed');throw error;}
  fs.writeFileSync(fd,JSON.stringify({pid:process.pid,startedAt:new Date().toISOString()}));
  return ()=>{fs.closeSync(fd);fs.unlinkSync(lock);};
}
module.exports={readJson,json,writeIfChanged,loadState,cacheKey,validTranslation,combineArticles,makePublication,publish,acquireLock,COVERAGE_NOTE,TRANSLATION_PIPELINE_VERSION};
