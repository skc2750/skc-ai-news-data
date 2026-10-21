'use strict';
// Public directory metadata and official pages only. Never calls model inference.
const CONFIG=require('./ai-era-config.json');
const safeUrl=value=>{try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null;}catch{return null;}};
async function checkAgent(agent,now,previous,fetchImpl){
 const officialUrl=safeUrl(agent.officialUrl), prior=previous?.models?.find(x=>x.id==='agent:'+agent.id);
 const checkUrl=agent.id==='gemini-cli'?'https://raw.githubusercontent.com/google-gemini/gemini-cli/main/README.md':'https://r.jina.ai/'+officialUrl;
 let ok=false,httpStatus=null;
 try{const r=await fetchImpl(checkUrl,{signal:AbortSignal.timeout(12000),redirect:'error',headers:{'User-Agent':'SKC-AI-Studio/2.0 public-directory-check'}});httpStatus=r.status;
  const body=await r.text();ok=r.ok&&body.length>200&&body.length<1500000&&!/^Title: (?:Access Denied|Just a moment|Error)/mi.test(body);
 }catch{}
 return {...agent,id:'agent:'+agent.id,status:ok?'官方页面可访问 · 账户服务未实测':'入口暂无法核实 · 不等于已下线',
  availabilityStatus:ok?'official_page_accessible':'unverified',checkedAt:now,lastSuccessAt:ok?now:prior?.lastSuccessAt||null,
  sources:[{label:'官方入口 / 能力说明',url:officialUrl}],sourceCheck:{httpStatus,status:ok?'ok':'unavailable'}};
}
function languageModels(catalog,now){
 return (catalog?.models||[]).filter(m=>Array.isArray(m.outputModalities)&&m.outputModalities.includes('text')&&(!m.expirationDate||m.expirationDate>=now.slice(0,10))).map(m=>({
  id:'model:'+m.id,name:m.name,provider:m.provider,kind:'model',
  strongestChinese:(m.guidance?.strengthsZh||['目录支持文字输出；独立能力排名未知。']).join('；'),
  bestForChinese:(m.guidance?.useCasesZh||['一般文本任务候选；实际质量、地区和可用性需要样例测试。']).join('；'),
  status:'公开目录在架 · 未执行付费推理',availabilityStatus:'catalog_listed',officialUrl:safeUrl(m.pricingSourceUrl),
  checkedAt:catalog.catalogLastSuccessAt||catalog.checkedAt||now,
  sources:[{label:'公开模型目录与能力元数据',url:'https://openrouter.ai/api/v1/models'},{label:'型号详情 / 提供方',url:safeUrl(m.pricingSourceUrl)}].filter(x=>x.url),
  capabilityBasisChinese:m.guidance?.capabilityBasisZh||'公开目录元数据；用途为规则推导，非全模型横向实测',
 }));
}
async function collectAiEra({models,now=new Date().toISOString(),previous=null,fetchImpl=globalThis.fetch}={}){
 if(!Number.isFinite(Date.parse(now)))throw Error('Invalid collection time');
 const queue=[...CONFIG.agents],agents=[];
 await Promise.all(Array.from({length:3},async()=>{while(queue.length)agents.push(await checkAgent(queue.shift(),now,previous,fetchImpl));}));
 agents.sort((a,b)=>CONFIG.agents.findIndex(x=>'agent:'+x.id===a.id)-CONFIG.agents.findIndex(x=>'agent:'+x.id===b.id));
 const listed=languageModels(models,now),healthy=agents.filter(x=>x.availabilityStatus==='official_page_accessible').length;
 return {updatedAt:now,status:healthy===agents.length&&models?.catalogStatus!=='unavailable'?'ok':'partial',
  coverageChinese:'收录公开目录当前在架的语言模型，并人工精选主流 AI Agent；不是全网穷尽。目录在架或官方页面可访问，不等于实际账号、地区和推理服务均已实测。「最强功能」按已核实基准或官方能力元数据说明，非统一冠军榜。',
  models:[...agents,...listed],counts:{languageModels:listed.length,agents:agents.length,agentPagesVerified:healthy},
  rankings:structuredClone(CONFIG.rankings),rankingsVerifiedAt:CONFIG.policyVerifiedAt,
  rankingUpdateChinese:'每天刷新模型目录和 Agent 入口。活跃度统计保留原始测量月份与出处；尚未接入可核实新版时保持原值，不把每日抓取时间当作新统计。',
  sources:agents.map(a=>({sourceUrl:a.officialUrl,status:a.sourceCheck.status,checkedAt:now,httpStatus:a.sourceCheck.httpStatus})),
 };
}
module.exports={collectAiEra,languageModels,checkAgent};
