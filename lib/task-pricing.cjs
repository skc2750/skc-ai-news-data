'use strict';
// Public catalogue and official subscription pages only. No inference, keys or purchases.
const {collectModels}=require('./providers-models.cjs');
const CONFIG=require('./task-pricing-config.json');
const MONEY={USD:'$',EUR:'€',GBP:'£'};
const goodNumber=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0;
const cleanBody=b=>b.replace(/\r/g,'').replace(/&nbsp;|&#160;/g,' ').replace(/&dollar;|&#36;/g,'$');
const reader=u=>'https://r.jina.ai/'+u;
function sourceUrl(tool){return tool.id.startsWith('codex-')?'https://learn.chatgpt.com/docs/pricing.md':({'threejs':'https://raw.githubusercontent.com/mrdoob/three.js/dev/LICENSE','playwright':'https://raw.githubusercontent.com/microsoft/playwright/main/LICENSE','phaser':'https://raw.githubusercontent.com/phaserjs/phaser/master/LICENSE.md'}[tool.id]||reader(tool.sourceUrl));}
const ALLOWED=new Set(CONFIG.tools.map(sourceUrl));
async function publicText(url,fetchImpl){
 if(!ALLOWED.has(url))throw Error('Unapproved quote source');
 const r=await fetchImpl(url,{signal:AbortSignal.timeout(12000),headers:{'User-Agent':'SKC-AI-News/1.0 public-price-check'},redirect:'error'});
 if(!r.ok)throw Error('Quote source unavailable');
 const reader=r.body.getReader(),parts=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>1500000)throw Error('Quote source exceeds limit');parts.push(Buffer.from(value));}}finally{await reader.cancel().catch(()=>{});}
 return cleanBody(Buffer.concat(parts).toString('utf8'));
}
function parseToolQuote(tool,body){
 let m,price=null,currency=tool.currency,billingZh=tool.billingZh,unitZh=tool.unitZh,freeTierZh=tool.freeTierZh;
 const money=s=>({'$':'USD','€':'EUR','£':'GBP'}[s]);
 if(tool.id.startsWith('codex-')){
  const plan=tool.id==='codex-plus'?'Plus':'Pro';
  m=body.match(new RegExp('<PricingCard\\s+name="'+plan+'"[\\s\\S]{0,500}?price="\\$([0-9.]+)"[\\s\\S]{0,100}?interval="/month"'));
  if(m){price=Number(m[1]);currency='USD';billingZh=tool.id==='codex-plus'?'按月订阅，有共享用量限制；不是固定 token 包，不等于 API 余额。优先沿用现有套餐。':'Pro 起步月价；其他档次和用量以官方页为准，先核对现有额度再考虑升级。';}
 }else if(tool.id==='claude-pro'){
  const section=body.match(/### Pro\b([\s\S]{0,1500}?)(?=\n### |\n## |$)/)?.[1]||'';
  m=section.match(/\$([0-9.]+) if billed monthly/i);if(m){price=Number(m[1]);currency='USD';billingZh='本卡按月付费；年付折扣另看官网。Claude Code 用量和 API 权益依当前套餐条款，不按固定 token 包换算。';}
 }else if(tool.id==='meshy-pro'){
  const section=body.match(/\nPro\s*\n([\s\S]{0,1600}?)(?=\n(?:Premium|Studio|Enterprise)\s*\n|$)/)?.[1]||'';
  m=section.match(/Billed monthly,\s*([$€£])\s*([0-9.]+)\s*\/\s*month/i);
  if(m){price=Number(m[2]);currency=m[1]==='$'?'$（地区待确认）':money(m[1]);const credits=section.match(/([\d,]+) monthly credits/i)?.[1];billingZh='按月标准账单价，非首月促销。'+(credits?credits+' credits / 月；':'')+'按生成积分扣费，不是文本 token；页面会按地区显示币种，本次 $ 符号不宣称固定为 USD，结账前确认。';}
 }else if(tool.id==='meshy-free'){
  const section=body.match(/\nFree\s*\n([\s\S]{0,1000}?)(?=\nPro\s*\n|$)/)?.[1]||'';
  m=section.match(/([\d,]+) monthly credits/i);if(m&&/No credit card needed/i.test(section)&&/CC BY 4\.0/i.test(section)){price=0;currency='USD';billingZh=m[1]+' credits / 月；低优先队列；不是无限模型。具体下载与生成能力按官网限制。';freeTierZh='免费输出按 CC BY 4.0 要求署名；先测试质量，再判断是否需要多视图和付费。';}
 }else if(tool.id==='n8n-cloud-starter'){
  const section=body.match(/### Starter\s*([\s\S]{0,1600}?)(?=\n### |$)/)?.[1]||'';
  m=section.match(/([$€£])\s*([0-9.]+)\/mo, billed annually/i);
  if(m){price=Number(m[2]);currency=m[1]==='$'?'$（地区待确认）':money(m[1]);unitZh='每月折算 · 按年付费';const runs=section.match(/([\d.]+K|[\d,]+)\s*\n\s*workflow executions/i)?.[1];billingZh='年付总额 '+(MONEY[currency]||m[1])+(price*12)+'；'+(runs?runs+' 次工作流执行/月。':'')+'按整条工作流执行计，外部模型、工具和超额资源分开计费。官网按地区显示币种，本次 $ 符号未确认是 USD；以结账页币种为准。';}
 }else if(tool.id==='runway-standard'){
  const section=body.match(/(?:^|\n)(?:#{1,4} )?Standard\s*\n([\s\S]{0,1300}?)(?=\n(?:#{1,4} )?(?:Pro|Unlimited|Enterprise)\s*\n|$)/)?.[1]||'';
  // Reject the annual-discount figure unless the document explicitly pairs a monthly bill.
  m=section.match(/\$([0-9.]+)\s*(?:\/\s*month|per month)[\s\S]{0,100}billed monthly/i);
  if(m){price=Number(m[1]);currency='USD';billingZh='按月账单价；视频生成按 credits/秒另核对，重试会再次扣积分，不能把套餐积分当作保证可用成片时长。';}
 }else if(tool.id==='vercel-pro'){
  m=body.match(/platform fee[\s\S]{0,100}?\$([0-9.]+)\s*(?:\/\s*month|per month)/i)||body.match(/\$([0-9.]+)\s*(?:\/\s*month|per month)[\s\S]{0,100}?platform fee/i);
  if(m){price=Number(m[1]);currency='USD';billingZh='基础平台月费；席位、超额资源、域名和附加服务另按官方条款。已有托管不用每个页面再买一次。';}
 }else{
  const license={'threejs':/MIT License/i,'phaser':/MIT License/i,'blender':/GNU General Public License|GNU GPL/i,'playwright':/Apache License/i,'ffmpeg':/GNU (?:Lesser )?General Public License|LGPL/i,'n8n-community':/Community Edition|self.hosted version[\s\S]{0,100}(?:free|available)/i}[tool.id];
  if(license?.test(body))price=0;
 }
 return goodNumber(price)?{price,currency,billingZh,unitZh,freeTierZh}:null;
}
async function refreshTools(previous,now,fetchImpl){
 const old=new Map((previous?.tools||[]).map(t=>[t.id,t])),pending=new Map();
 const read=url=>{if(!pending.has(url))pending.set(url,publicText(url,fetchImpl));return pending.get(url)};
 let index=0;const result=[];
 await Promise.all(Array.from({length:3},async()=>{while(index<CONFIG.tools.length){const tool=CONFIG.tools[index++],prior=old.get(tool.id)||tool;let quote=null,sourceStatus='unavailable';
  try{quote=parseToolQuote(tool,await read(sourceUrl(tool)));sourceStatus=quote?'ok':'changed_needs_review';}catch{}
  result.push({...tool,...prior,...(quote||{}),checkedAt:now,priceVerifiedAt:quote?now:prior.priceVerifiedAt,status:quote?'verified_current':'last_verified',sourceStatus,verificationNoteZh:quote?'本次已从官方页面解析到匹配的计划、币种和报价。':sourceStatus==='unavailable'?'本次官网读取失败；显示上次核实报价与日期，请打开出处确认。':'来源格式或条件无法自动匹配；保留上次核实报价与日期，待核对。'});
 }}));return CONFIG.tools.map(t=>result.find(x=>x.id===t.id));
}
function buildTaskGuide(catalog,previous,tools,now){
 const prior=new Map((previous?.models||[]).map(m=>[m.id,m]));
 const models=CONFIG.models.map(config=>{
  const row=catalog.models?.find(m=>m.id===config.catalogId),fresh=row&&goodNumber(row.inputUsdPerMillion)&&goodNumber(row.outputUsdPerMillion)&&!['unavailable','stale'].includes(catalog.catalogStatus);
  if(!fresh)return {...config,...prior.get(config.id),checkedAt:now,status:'last_verified',verificationNoteZh:'本次目录无精确匹配；保留上次已核实报价与日期，不当作免费。'};
  const conditions=Array.isArray(row.pricingOverrides)?row.pricingOverrides:[],long=conditions.find(r=>goodNumber(r.min_prompt_tokens)&&r.prompt!=null&&r.completion!=null);
  const conditionalNoteZh=long?'单次输入达到目录长上下文门槛 '+Number(long.min_prompt_tokens).toLocaleString('en-US')+' token 时，输入 $'+(Number(long.prompt)*1e6)+'、输出 $'+(Number(long.completion)*1e6)+' / 百万 token。':'';
  return {...config,name:config.name,provider:config.provider,checkedAt:row.pricingCheckedAt||now,priceVerifiedAt:row.pricingCheckedAt||now,inputUsdPerMillion:row.inputUsdPerMillion,outputUsdPerMillion:row.outputUsdPerMillion,contextTokens:row.contextTokens,pricingSourceUrl:row.pricingSourceUrl,contextSourceUrl:'https://openrouter.ai/api/v1/models',quoteLabelZh:'OpenRouter API · 标准未缓存文本输入 / 输出',conditionalNoteZh:conditionalNoteZh+' 本表不含缓存、搜索、图片、音视频、工具和税；订阅另列。',status:'verified_current'};
 });
 return {schemaVersion:1,checkedAt:now,policyVerifiedAt:CONFIG.checkedAt,status:models.every(m=>m.status==='verified_current')?'ok':'partial',models,tasks:CONFIG.tasks,tools,methodologyZh:CONFIG.methodologyZh,updatePolicyZh:'每天马来西亚时间09:00计划读取公开模型目录与官方工具价格；免费调度可能延迟。模型报价按精确ID更新；工具解析失败保留旧报价及其核实日期，不能当作当前已确认。'};
}
async function collectDailyModels({now=new Date().toISOString(),previous=null,fetchImpl=globalThis.fetch}={}){
 let catalog;try{catalog=await collectModels({now,fetchImpl});}catch{catalog={...(previous||{}),catalogStatus:'unavailable',status:'partial'};}
 const tools=await refreshTools(previous?.taskGuide,now,fetchImpl);
 return {...catalog,taskGuide:buildTaskGuide(catalog,previous?.taskGuide,tools,now),refreshPolicy:{mode:'scheduled_daily',timezone:'Asia/Kuala_Lumpur',hour:9}};
}
module.exports={collectDailyModels,buildTaskGuide,refreshTools,parseToolQuote,CONFIG};
