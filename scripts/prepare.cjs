#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path');
const {options}=require('./update.cjs');
const {collectNews}=require('../lib/collect.cjs');
const {loadState,combineArticles,cacheKey,validTranslation,acquireLock}=require('../lib/store.cjs');
async function prepare(opts){
  const release=acquireLock(opts.work);
  try{
    const now=new Date().toISOString(),state=loadState(opts.output),collected=await collectNews(state,{now});
    const all=combineArticles(state.articles,collected.articles,state.cache,now);
    const pending=all.filter(a=>a.language!=='zh'&&!validTranslation(state.cache.entries[cacheKey(a)],a)&&!validTranslation(a,a)).slice(0,opts.limit).length;
    fs.writeFileSync(path.join(opts.work,'prepared.json'),JSON.stringify({schemaVersion:1,preparedAt:now,
      previousGenerationId:state.manifest?.generationId||null,collected}));
    if(process.env.GITHUB_OUTPUT)fs.appendFileSync(process.env.GITHUB_OUTPUT,`pending=${pending}\n`);
    return {pending,sourcesOk:collected.sources.filter(s=>s.status==='ok').length,articles:collected.articles.length};
  }finally{release();}
}
if(require.main===module)prepare(options(process.argv.slice(2))).then(value=>console.log(JSON.stringify(value))).catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={prepare};
