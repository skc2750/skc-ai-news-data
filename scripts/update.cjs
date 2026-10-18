#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const {collectNews,seedNews}=require('../lib/collect.cjs');
const {collectProjects}=require('../lib/projects.cjs');
const {collectShowcases,collectCreatorDiscovery}=require('../lib/showcases.cjs');
const {loadState,cacheKey,validTranslation,combineArticles,makePublication,publish,acquireLock}=require('../lib/store.cjs');
const ROOT=path.resolve(__dirname,'..');

function options(args){
  const out={output:path.join(ROOT,'data'),work:path.join(ROOT,'.work'),limit:20,translationSeconds:720,python:process.env.PYTHON||'python',seed:null,prepared:null,skipTranslation:false};
  for(let i=0;i<args.length;i++){
    const key=args[i];if(key==='--skip-translation'){out.skipTranslation=true;continue;}
    if(!['--output','--work','--translate-limit','--translation-seconds','--python','--seed','--prepared'].includes(key)||!args[i+1])throw Error('Unsupported or missing command option');
    const value=args[++i];if(key==='--translate-limit')out.limit=Number(value);else if(key==='--translation-seconds')out.translationSeconds=Number(value);
    else if(key==='--python')out.python=value;else if(key==='--seed')out.seed=path.resolve(value);else if(key==='--prepared')out.prepared=path.resolve(value);
    else out[key.slice(2)]=path.resolve(value);
  }
  if(!Number.isInteger(out.limit)||out.limit<0||out.limit>500)throw Error('Translation limit must be 0..500');
  if(!Number.isInteger(out.translationSeconds)||out.translationSeconds<30||out.translationSeconds>900)throw Error('Translation seconds must be 30..900');
  return out;
}
function runPython(executable,args,{timeoutMs=810000}={}){
  return new Promise((resolve,reject)=>{
    const child=spawn(executable,args,{shell:false,windowsHide:true,stdio:['ignore','ignore','pipe'],
      env:{...process.env,CUDA_VISIBLE_DEVICES:'',HF_HUB_DISABLE_IMPLICIT_TOKEN:'1',HF_HUB_DISABLE_TELEMETRY:'1'}});
    let timedOut=false;const timer=setTimeout(()=>{timedOut=true;child.kill();},timeoutMs);
    // Do not place library paths, public download errors, or subprocess environment values into published data.
    child.stderr.on('data',()=>{});
    child.on('error',()=>{clearTimeout(timer);reject(Error('Offline Python translator could not start; original retained'));});
    child.on('close',code=>{clearTimeout(timer);resolve({timedOut,exitCode:code});});
  });
}
async function update(opts,{now=new Date().toISOString(),fetchImpl=globalThis.fetch,translator=null}={}){
  const release=acquireLock(opts.work);
  try{
    const state=loadState(opts.output);
    let collected,projects=state.projects||null,showcases=state.showcases||null;
    if(opts.prepared){const ready=JSON.parse(fs.readFileSync(opts.prepared,'utf8'));if(ready.previousGenerationId!==(state.manifest?.generationId||null))throw Error('Published state changed after preparation');collected=ready.collected;projects=ready.projects||projects;showcases=ready.showcases||showcases;}
    else {collected=opts.seed?seedNews(JSON.parse(fs.readFileSync(opts.seed,'utf8')),now):await collectNews(state,{fetchImpl,now});if(!opts.seed){projects=await collectProjects({fetchImpl,now,previous:state.projects});const creatorDiscovery=await collectCreatorDiscovery({fetchImpl,now,previous:state.showcases?.discoveryState,enableSocial:true});showcases=await collectShowcases({fetchImpl,now,previous:state.showcases,projects,creatorDiscovery});}}
    const all=combineArticles(state.articles,collected.articles,state.cache,now);
    const requests=all.filter(a=>a.language!=='zh'&&!validTranslation(state.cache.entries[cacheKey(a)],a)&&!validTranslation(a,a)).slice(0,opts.limit)
      .map(a=>({id:a.id,contentHash:a.contentHash,title:a.title,summary:a.summary}));
    let result={entries:{}},translationError=null,translationNote=null;
    if(requests.length&&!opts.skipTranslation){
      try{
        if(translator)result=await translator(requests,now);
        else{
          const input=path.join(opts.work,'translation-input.json'),output=path.join(opts.work,'translation-output.json');
          fs.writeFileSync(input,JSON.stringify({records:requests}));if(fs.existsSync(output))fs.unlinkSync(output);
          const seconds=opts.translationSeconds||720;
          const processResult=await runPython(opts.python,[path.join(ROOT,'scripts/translate.py'),'--input',input,'--output',output,'--at',now,'--budget-seconds',String(seconds)],{timeoutMs:Math.min(990000,(seconds+90)*1000)});
          result=JSON.parse(fs.readFileSync(output,'utf8'));
          if(processResult.timedOut||processResult.exitCode!==0)translationNote='Translator stopped early; verified checkpoints retained and remaining items deferred';
        }
        if(result.error)translationError='Offline CPU translation unavailable; original retained';
      }catch{translationError='Offline CPU translation unavailable; original retained';}
    }
    const translationErrors=result.errors||{};if(translationError)for(const a of requests)translationErrors[cacheKey(a)]='Translation unavailable';
    const deferred=opts.skipTranslation?0:Math.max(0,requests.length-Object.keys(result.entries||{}).length-Object.keys(translationErrors).length);
    const publication=makePublication(state,collected,{now,translations:result.entries||{},translationErrors,translationError,translationDeferred:deferred,translationNote,
      translationRequested:opts.skipTranslation?0:requests.length,translationLimit:opts.limit,seeded:!!opts.seed,projects,showcases});
    return publish(opts.output,publication);
  }finally{release();}
}
if(require.main===module)update(options(process.argv.slice(2))).then(value=>console.log(JSON.stringify(value,null,2))).catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={options,runPython,update};
