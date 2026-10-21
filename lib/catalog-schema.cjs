'use strict';
const {createHash}=require('node:crypto');
const digest=value=>createHash('sha256').update(value).digest('hex');
const FILES=Object.freeze(['data/catalog.json','data/receipt.json']);
const FORBIDDEN=Object.freeze(['articles','stories','editions','archive','resets','codex','translation','translationCache','bookmarks']);
const TOP_KEYS=new Set(['schemaVersion','generatedAt','lastSuccessAt','status','models','projects','showcases','aiEra','sources','refreshPolicy','receipt']);
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const iso=v=>typeof v==='string'&&v.length<=40&&Number.isFinite(Date.parse(v));
function assert(value,message){if(!value)throw Error(message);}
function validateCatalog(data){
 assert(object(data)&&data.schemaVersion===2&&iso(data.generatedAt)&&(data.lastSuccessAt==null||iso(data.lastSuccessAt)),'Invalid catalogue metadata');
 assert(FORBIDDEN.every(key=>!Object.hasOwn(data,key)),'Retired content cannot enter the catalogue');
 assert(Object.keys(data).every(key=>TOP_KEYS.has(key)),'Unknown catalogue fields are not permitted');
 assert(object(data.models)&&Array.isArray(data.models.models)&&data.models.models.length<=2000,'Invalid model catalogue');
 assert(object(data.projects)&&Array.isArray(data.projects.projects)&&data.projects.projects.length<=300,'Invalid project catalogue');
 assert(object(data.showcases)&&Array.isArray(data.showcases.showcases)&&data.showcases.showcases.length<=300,'Invalid showcase catalogue');
 assert(object(data.aiEra)&&Array.isArray(data.sources)&&data.sources.length<=500,'Invalid AI era or sources');
 assert(object(data.refreshPolicy)&&data.refreshPolicy.timezone==='Asia/Kuala_Lumpur'&&data.refreshPolicy.hour===9,'Invalid daily publication policy');
 assert(object(data.receipt)&&iso(data.receipt.generatedAt),'Missing publication receipt');
 return data;
}
function validateManifest(data){
 assert(object(data)&&data.schemaVersion===2&&iso(data.generatedAt)&&/^[a-f0-9]{64}$/.test(data.generationId)&&object(data.files),'Invalid catalogue manifest');
 assert(Object.keys(data.files).length===FILES.length&&FILES.every(file=>Object.hasOwn(data.files,file)),'Catalogue manifest contains retired or unknown files');
 for(const descriptor of Object.values(data.files))assert(object(descriptor)&&/^[a-f0-9]{64}$/.test(descriptor.sha256)&&Number.isSafeInteger(descriptor.bytes)&&descriptor.bytes>0&&descriptor.bytes<=8*1024*1024,'Invalid catalogue file descriptor');
 assert(digest(JSON.stringify(data.files))===data.generationId,'Catalogue manifest hash differs');
 return data;
}
module.exports={digest,FILES,FORBIDDEN,object,iso,assert,validateCatalog,validateManifest};
