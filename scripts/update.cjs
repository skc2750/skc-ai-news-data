#!/usr/bin/env node
'use strict';
const path=require('node:path');
const {collectProjects}=require('../lib/projects.cjs');
const {collectShowcases,collectCreatorDiscovery}=require('../lib/showcases.cjs');
const {collectDailyModels}=require('../lib/task-pricing.cjs');
const {collectAiEra}=require('../lib/ai-era.cjs');
const {loadState,makePublication,publish,acquireLock}=require('../lib/store.cjs');
const ROOT=path.resolve(__dirname,'..');
function options(args){
 const result={output:path.join(ROOT,'data'),work:path.join(ROOT,'.work')};
 for(let i=0;i<args.length;i++){const key=args[i];if(!['--output','--work'].includes(key)||!args[i+1])throw Error('Unsupported or missing option');result[key.slice(2)]=path.resolve(args[++i]);}
 return result;
}
async function update(opts,{now=new Date().toISOString(),fetchImpl=globalThis.fetch,collectors={}}={}){
 const release=acquireLock(opts.work);
 try{
  const previous=loadState(opts.output);
  const [collectedModels,projects]=await Promise.all([(collectors.models||collectDailyModels)({now,fetchImpl,previous:previous?.models}),(collectors.projects||collectProjects)({now,fetchImpl,previous:previous?.projects})]);
  const models=!collectedModels.models?.length&&previous?.models?.models?.length?{...collectedModels,models:previous.models.models,leaderboard:collectedModels.leaderboard?.length?collectedModels.leaderboard:previous.models.leaderboard||[],status:'partial',catalogStatus:'stale',catalogLastSuccessAt:previous.models.catalogLastSuccessAt||previous.models.checkedAt}:collectedModels;
  const creatorDiscovery=await (collectors.discovery||collectCreatorDiscovery)({now,fetchImpl,previous:previous?.showcases?.discoveryState,enableSocial:true});
  const showcases=await (collectors.showcases||collectShowcases)({now,fetchImpl,previous:previous?.showcases,projects,creatorDiscovery});
  const aiEra=await (collectors.era||collectAiEra)({now,fetchImpl,previous:previous?.aiEra,models});
  return publish(opts.output,makePublication(previous,{models,projects,showcases,aiEra,now}));
 }finally{release();}
}
if(require.main===module)update(options(process.argv.slice(2))).then(result=>console.log(JSON.stringify(result,null,2))).catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={options,update};
