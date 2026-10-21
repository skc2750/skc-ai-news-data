'use strict';
const fs=require('node:fs'),path=require('node:path');
const {digest,validateCatalog,validateManifest}=require('./catalog-schema.cjs');
const read=file=>fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):null;
const json=value=>JSON.stringify(value,null,2)+'\n';
const POLICY=Object.freeze({mode:'scheduled_daily',timezone:'Asia/Kuala_Lumpur',hour:9,cronUtc:'0 1 * * *',noteZh:'每天马来西亚时间早上9点计划更新保留的模型、价格、项目与作品资料；免费调度和来源限额可能延迟，以实际核实时间为准。'});
function loadState(root){const data=read(path.join(root,'catalog.json'));return data?validateCatalog(data):null;}
function makePublication(previous,{models,projects,showcases,aiEra,now=new Date().toISOString()}={}){
 const states=[models?.status,projects?.status,showcases?.status,aiEra?.status];
 const status=states.every(state=>state==='ok')?'ok':states.some(state=>['ok','partial','stale','seeded'].includes(state))?'partial':'unavailable';
 const scheduler={kind:process.env.GITHUB_ACTIONS==='true'?'github_actions':'local',event:process.env.GITHUB_EVENT_NAME||'local',runId:process.env.GITHUB_RUN_ID||null,timeZone:'Asia/Kuala_Lumpur',localTime:'09:00',cronUtc:POLICY.cronUtc};
 const lastSuccessAt=status!=='unavailable'?now:previous?.lastSuccessAt||null;
 const receipt={schemaVersion:2,generatedAt:now,lastSuccessAt,status,scheduler,components:{models:models?.status||'unavailable',projects:projects?.status||'unavailable',showcases:showcases?.status||'unavailable',aiEra:aiEra?.status||'unavailable'},costPolicyZh:'只读公开资料，不调用付费推理、不自动购买或更改订阅。'};
 const sources=[...(models?.sources||[]),...(projects?.sources||[]),...(showcases?.sources||[]),...(aiEra?.sources||[])].slice(0,500);
 const catalog=validateCatalog({schemaVersion:2,generatedAt:now,lastSuccessAt,status,models,projects,showcases,aiEra,sources,refreshPolicy:POLICY,receipt});
 const bodies={'data/catalog.json':json(catalog),'data/receipt.json':json(receipt)},files={};
 for(const [key,body] of Object.entries(bodies))files[key]={bytes:Buffer.byteLength(body),sha256:digest(body)};
 const manifest=validateManifest({schemaVersion:2,generatedAt:now,lastSuccessAt,generationId:digest(JSON.stringify(files)),files});
 return {catalog,receipt,manifest,bodies};
}
function write(root,relative,body){
 const base=path.resolve(root),target=path.resolve(base,relative);if(!target.startsWith(base+path.sep))throw Error('Write target outside data directory');
 fs.mkdirSync(path.dirname(target),{recursive:true});const temp=target+'.tmp';fs.writeFileSync(temp,body);fs.renameSync(temp,target);
}
function publish(root,publication){
 for(const [key,body] of Object.entries(publication.bodies))write(root,key.slice(5),body);
 write(root,'manifest.json',json(publication.manifest));
 return {ok:true,generationId:publication.manifest.generationId,status:publication.catalog.status,files:Object.keys(publication.bodies).length};
}
function acquireLock(work){
 const root=path.resolve(work);fs.mkdirSync(root,{recursive:true});const lock=path.join(root,'publish.lock');let fd;
 try{fd=fs.openSync(lock,'wx');fs.writeFileSync(fd,String(process.pid));}catch{throw Error('Another catalogue update is already running');}
 return ()=>{if(fd!==undefined)fs.closeSync(fd);if(fs.existsSync(lock))fs.unlinkSync(lock);};
}
module.exports={POLICY,digest,json,loadState,makePublication,publish,acquireLock};
