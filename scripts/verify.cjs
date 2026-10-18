#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path');
const {digest}=require('../lib/core.cjs');
const {loadState,validTranslation}=require('../lib/store.cjs');
const {validateProjects}=require('../lib/projects.cjs');
const {validateShowcases}=require('../lib/showcases.cjs');
const {validateCodexActivity}=require('../lib/codex-activity.cjs');
function verify(root){
  const data=path.resolve(root),manifest=JSON.parse(fs.readFileSync(path.join(data,'manifest.json'),'utf8'));
  if(manifest.schemaVersion!==1||!/^[a-f0-9]{64}$/.test(manifest.generationId))throw Error('Bad manifest schema');
  const hashes={};
  for(const [file,expected] of Object.entries(manifest.files)){
    if(!/^data\/[a-zA-Z0-9/_.-]+$/.test(file)||file.includes('..'))throw Error('Unsafe manifest path');
    const body=fs.readFileSync(path.join(data,file.slice(5)));
    if(body.length!==expected.bytes||digest(body)!==expected.sha256)throw Error(`Published file mismatch: ${file}`);
    hashes[file]=expected;
  }
  if(digest(JSON.stringify(hashes))!==manifest.generationId)throw Error('Manifest generation hash mismatch');
  const state=loadState(data),ids=new Set(state.articles.map(a=>a.id));
  if(!state.articles.length||ids.size!==state.articles.length)throw Error('Empty or duplicate durable archive');
  if(state.articles.length!==manifest.archiveArticles)throw Error('Archive count differs from manifest');
  for(const a of state.articles){
    if(digest(a.title+'\n'+a.summary)!==a.contentHash)throw Error('Original content hash mismatch');
    if(a.translation?.status==='ok'&&!validTranslation(a,a))throw Error('Translation points to another content hash');
  }
  for(const report of state.reports.values())for(const id of report.articleIds)if(!ids.has(id))throw Error('Report refers to a missing durable article');
  if(state.projects){validateProjects(state.projects);if(!manifest.files['data/projects.json'])throw Error('Project snapshot is outside the verified generation');}
  if(state.showcases){validateShowcases(state.showcases);if(!manifest.files['data/showcases.json'])throw Error('Showcases are outside the verified generation');}
  if(state.codex){validateCodexActivity(state.codex);for(const file of ['data/codex.json','data/codex-archive.json','data/codex/archive/index.json'])if(!manifest.files[file])throw Error('Codex activity is outside the verified generation');}
  return {ok:true,generationId:manifest.generationId,articles:ids.size,reports:state.reports.size,files:Object.keys(hashes).length};
}
if(require.main===module){try{console.log(JSON.stringify(verify(process.argv[2]||path.resolve(__dirname,'../data')),null,2));}catch(error){console.error(error.message);process.exitCode=1;}}
module.exports={verify};
