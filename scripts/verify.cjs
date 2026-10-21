#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path');
const {digest,validateManifest,validateCatalog}=require('../lib/catalog-schema.cjs');
const {validateProjects}=require('../lib/projects.cjs');
const {validateShowcases}=require('../lib/showcases.cjs');
function verify(root){
 const data=path.resolve(root),manifest=validateManifest(JSON.parse(fs.readFileSync(path.join(data,'manifest.json'),'utf8')));
 for(const [file,expected] of Object.entries(manifest.files)){const body=fs.readFileSync(path.join(data,file.slice(5)));if(body.length!==expected.bytes||digest(body)!==expected.sha256)throw Error('Published file mismatch: '+file);}
 const catalog=validateCatalog(JSON.parse(fs.readFileSync(path.join(data,'catalog.json'),'utf8')));
 validateProjects(catalog.projects);validateShowcases(catalog.showcases);
 const actual=fs.readdirSync(data).sort();if(JSON.stringify(actual)!==JSON.stringify(['catalog.json','manifest.json','receipt.json']))throw Error('Data directory contains files outside the current catalogue');
 if(JSON.stringify(catalog.receipt)!==JSON.stringify(JSON.parse(fs.readFileSync(path.join(data,'receipt.json'),'utf8'))))throw Error('Receipt differs from catalogue');
 return {ok:true,generationId:manifest.generationId,files:Object.keys(manifest.files).length,models:catalog.models.models.length,projects:catalog.projects.projects.length,showcases:catalog.showcases.showcases.length};
}
if(require.main===module){try{console.log(JSON.stringify(verify(process.argv[2]||path.resolve(__dirname,'../data')),null,2));}catch(error){console.error(error.message);process.exitCode=1;}}
module.exports={verify};
