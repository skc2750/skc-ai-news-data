#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path');
const {options}=require('./update.cjs');
const {collectNews}=require('../lib/collect.cjs');
const {collectProjects}=require('../lib/projects.cjs');
const {collectShowcases,collectCreatorDiscovery}=require('../lib/showcases.cjs');
const {collectCodexActivity,translationRequests}=require('../lib/codex-activity.cjs');
const {loadState,combineArticles,cacheKey,validTranslation,acquireLock}=require('../lib/store.cjs');
async function prepare(opts){
  const release=acquireLock(opts.work);
  try{
    const now=new Date().toISOString(),state=loadState(opts.output);
    const [collected,projects,codex]=await Promise.all([collectNews(state,{now}),collectProjects({now,previous:state.projects}),collectCodexActivity({now,previous:state.codex})]);
    const creatorDiscovery=await collectCreatorDiscovery({now,previous:state.showcases?.discoveryState,enableSocial:true});
    const showcases=await collectShowcases({now,previous:state.showcases,projects,creatorDiscovery});
    const all=combineArticles(state.articles,collected.articles,state.cache,now);
    const pending=Math.min(opts.limit,translationRequests(codex,state.cache,validTranslation).length+all.filter(a=>a.language!=='zh'&&!validTranslation(state.cache.entries[cacheKey(a)],a)&&!validTranslation(a,a)).length);
    fs.writeFileSync(path.join(opts.work,'prepared.json'),JSON.stringify({schemaVersion:1,preparedAt:now,
      previousGenerationId:state.manifest?.generationId||null,collected,projects,showcases,codex}));
    if(process.env.GITHUB_OUTPUT)fs.appendFileSync(process.env.GITHUB_OUTPUT,`pending=${pending}\n`);
    return {pending,sourcesOk:collected.sources.filter(s=>s.status==='ok').length,articles:collected.articles.length,projectsOk:projects.sources.filter(s=>s.status==='ok').length,showcasesOk:showcases.sources.filter(s=>s.status==='ok').length};
  }finally{release();}
}
if(require.main===module)prepare(options(process.argv.slice(2))).then(value=>console.log(JSON.stringify(value))).catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={prepare};
