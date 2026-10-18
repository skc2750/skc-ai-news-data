'use strict';
// Search-index metadata only. No platform login, candidate GET, media, or inference.
const {createHash}=require('node:crypto');
const ENDPOINT='https://mcp.exa.ai/mcp?tools=web_search_advanced_exa';
const SOURCE_URL='https://exa.ai/docs/get-started/exa-mcp';
const PLATFORMS=Object.freeze([{id:'youtube',labelZh:'YouTube',domain:'youtube.com'},{id:'x',labelZh:'X',domain:'x.com'},{id:'reddit',labelZh:'Reddit',domain:'reddit.com'}]);
const PRODUCTS=Object.freeze([{id:'codex',name:'Codex',match:/\b(?:OpenAI\s+)?Codex\b/i},{id:'claude',name:'Claude',match:/\bClaude(?:\s+Code)?\b/i},{id:'muse',name:'Muse Code',match:/\bMuse\s+Code\b|\bMeta(?:'s)?\s+Muse\b/i}]);
const DOMAINS=Object.freeze([{id:'3d',labelZh:'三维到交互成品',query:'(3D OR "three.js" OR WebGL OR Blender)',match:/\b(?:3d|threejs|webgl|blender|r3f)\b|three\.js|三维/i},{id:'video',labelZh:'脚本到视频',query:'(video OR Remotion OR ffmpeg)',match:/\b(?:video|remotion|ffmpeg)\b|视频/i},{id:'office',labelZh:'办公自动化',query:'(automation OR workflow OR spreadsheet OR n8n)',match:/\b(?:automation|workflow|crm|spreadsheet|calendar|invoice|office|n8n)\b|办公|自动化|报表/i}]);
const SOCIAL_TASKS=Object.freeze(DOMAINS.flatMap(domain=>PLATFORMS.map(platform=>Object.freeze({id:platform.id+'-'+domain.id,platform:platform.id,domainId:domain.id,query:'("Codex" OR "Claude Code" OR "Muse Code") '+domain.query+' (built OR created OR made OR "build log") ("github.com" OR "source code")'}))));
const MAX_BYTES=256*1024,TTL=7*86400000,INTERVAL=6*3600000;
const hash=value=>createHash('sha256').update(value).digest('hex');
const iso=value=>{if(typeof value!=='string'||value.length>40)return null;const date=new Date(value);return Number.isFinite(date.getTime())?date.toISOString():null;};
const plus=(now,ms)=>new Date(Date.parse(now)+ms).toISOString();
const boundedText=(value,max)=>typeof value==='string'?value.replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,max):'';
const repositoryName=value=>typeof value==='string'&&/^[a-z\d](?:[a-z\d-]{0,38})\/[a-z\d_.-]{1,100}$/i.test(value)&&!['.','..'].includes(value.split('/')[1])?value:null;
const platformById=id=>PLATFORMS.find(row=>row.id===id);
function canonicalSocialUrl(value,platform){
 if(typeof value!=='string'||value.length>1800||/[\u0000-\u0020\u007f\\]/.test(value))return null;
 try{const u=new URL(value),host=u.hostname.toLowerCase();if(u.protocol!=='https:'||u.username||u.password||u.port||host.endsWith('.'))return null;
  for(const key of u.searchParams.keys())if(/token|api[-_]?key|secret|auth|password|signature|credential|session|jwt/i.test(key))return null;
  if(!platform||platform==='youtube'){
   if(['youtube.com','www.youtube.com','m.youtube.com'].includes(host)){
    if(u.pathname==='/watch'&&u.searchParams.getAll('v').length===1&&/^[A-Za-z0-9_-]{11}$/.test(u.searchParams.get('v')))return 'https://www.youtube.com/watch?v='+u.searchParams.get('v');
    const match=u.pathname.match(/^\/shorts\/([A-Za-z0-9_-]{11})\/?$/);if(match)return 'https://www.youtube.com/shorts/'+match[1];
   }
   if(host==='youtu.be'){const match=u.pathname.match(/^\/([A-Za-z0-9_-]{11})\/?$/);if(match)return 'https://www.youtube.com/watch?v='+match[1];}
  }
  if((!platform||platform==='x')&&['x.com','www.x.com','twitter.com','www.twitter.com','mobile.twitter.com'].includes(host)){
   const match=u.pathname.match(/^\/([A-Za-z0-9_]{1,15})\/status\/([1-9]\d{0,24})\/?$/);if(match)return 'https://x.com/'+match[1].toLowerCase()+'/status/'+match[2];
  }
  if((!platform||platform==='reddit')&&['reddit.com','www.reddit.com','old.reddit.com'].includes(host)){
   const match=u.pathname.match(/^\/r\/([A-Za-z0-9_]{2,21})\/comments\/([a-z\d]{3,12})(?:\/([A-Za-z0-9_-]{1,180}))?\/?$/i);if(match)return 'https://www.reddit.com/r/'+match[1].toLowerCase()+'/comments/'+match[2].toLowerCase()+'/'+(match[3]?match[3]+'/':'');
  }
 }catch{}return null;
}
function validateAcquisitionSources(value){
 if(!Array.isArray(value)||value.length>6)throw Error('Invalid social acquisition sources');const seen=new Set();
 return value.map(row=>{const sourceUrl=canonicalSocialUrl(row?.sourceUrl,row?.platform),firstSeenAt=iso(row?.firstSeenAt),lastSeenAt=iso(row?.lastSeenAt);
  if(!platformById(row?.platform)||!sourceUrl||sourceUrl!==row.sourceUrl||row.method!=='public_search_index'||row.authorVerified!==false||!firstSeenAt||!lastSeenAt||Date.parse(firstSeenAt)>Date.parse(lastSeenAt)||seen.has(row.platform+':'+sourceUrl))throw Error('Invalid unverified social acquisition source');seen.add(row.platform+':'+sourceUrl);return {platform:row.platform,sourceUrl,method:'public_search_index',firstSeenAt,lastSeenAt,authorVerified:false};
 });
}
function references(value){
 const found=[];const ignored=new Set(['mrdoob/three.js','pmndrs/react-three-fiber','blender/blender','remotion-dev/remotion','n8n-io/n8n','vercel/next.js','facebook/react','microsoft/playwright','ffmpeg/ffmpeg','anthropics/claude-code','openai/codex']);
 const pattern=/(?<![a-z\d_./-])(?:https?:\/\/)?(?:www\.)?github\.com\/([a-z\d](?:[a-z\d-]{0,38}))\/([a-z\d_.-]{1,100})(?![a-z\d_.-])/gi;
 for(const match of value.matchAll(pattern)){let name=match[1]+'/'+match[2].replace(/[.,;:]+$/,'');if(!repositoryName(name)||ignored.has(name.toLowerCase())||/\b(?:awesome|starter|framework|template|skills?)\b/i.test(name.split('/')[1])||['orgs','topics','settings','marketplace','users','login','sponsors','features'].includes(match[1].toLowerCase()))continue;if(!found.some(row=>row.toLowerCase()===name.toLowerCase()))found.push(name);if(found.length===2)break;}return found;
}
function retainedCandidate(row,now){
 if(!row||!platformById(row.platform)||canonicalSocialUrl(row.sourceUrl,row.platform)!==row.sourceUrl||row.id!=='social-'+hash(row.platform+':'+row.sourceUrl).slice(0,24)||!PRODUCTS.some(p=>p.id===row.focusId)||!DOMAINS.some(d=>d.labelZh===row.categoryZh)||!PRODUCTS.some(p=>DOMAINS.some(d=>row.queryId===p.id+'-'+d.id)))return null;
 const firstSeenAt=iso(row.firstSeenAt),lastSeenAt=iso(row.lastSeenAt);if(!firstSeenAt||!lastSeenAt||Date.parse(firstSeenAt)>Date.parse(lastSeenAt)||Date.parse(lastSeenAt)>Date.parse(now)+300000)return null;const expiresAt=plus(lastSeenAt,TTL);if(Date.parse(expiresAt)<=Date.parse(now))return null;
 const repository=repositoryName(row.repository),platform=platformById(row.platform);return {id:row.id,platform:row.platform,sourceUrl:row.sourceUrl,titleZh:platform.labelZh+'：'+PRODUCTS.find(p=>p.id===row.focusId).name+' '+row.categoryZh+'线索',focusId:row.focusId,categoryZh:row.categoryZh,repository,repoUrl:repository?'https://github.com/'+repository:null,method:'public_search_index',status:repository?'queued_repo':'needs_evidence',firstSeenAt,lastSeenAt,expiresAt,noteZh:'公开搜索索引线索，尚未直接读取或核实平台原文；未证明社交账号与源码作者为同一人。',missingZh:repository?['尚未核实原帖作者与源码作者身份','等待本人 README 的明确 AI 制作声明','等待核对真实演示和制作过程']:['尚未找到可核实的公开源码仓库','尚未核实原帖作者与源码作者身份','等待核对真实演示和制作过程'],queryId:row.queryId};
}
class SearchFailure extends Error{constructor(kind,retryAt=null){super('Public social search unavailable');this.kind=kind;this.retryAt=retryAt;}}
function retryDeadline(response,now){const raw=response?.headers?.get?.('retry-after'),seconds=/^\d+$/.test(raw||'')?Number(raw):null,date=iso(raw);return new Date(Math.min(Date.parse(now)+TTL,Math.max(Date.parse(now)+INTERVAL,seconds!==null?Date.parse(now)+seconds*1000:date?Date.parse(date):0))).toISOString();}
function toolObject(body){
 let messages=[];const trimmed=body.trim();
 if(trimmed.startsWith('{')){try{messages=[JSON.parse(trimmed)];}catch{throw new SearchFailure('unavailable');}}
 else{const blocks=body.split(/\r?\n\r?\n/);if(blocks.length>64)throw new SearchFailure('unavailable');for(const block of blocks){const data=block.split(/\r?\n/).filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trimStart()).join('\n');if(!data||data==='[DONE]')continue;try{messages.push(JSON.parse(data));}catch{throw new SearchFailure('unavailable');}}}
 const message=messages.find(row=>row?.jsonrpc==='2.0'&&row.id===1);if(!message)throw new SearchFailure('unavailable');
 if(message.error){const error=JSON.stringify(message.error).slice(0,2000);throw new SearchFailure(/quota|rate.?limit|credit|payment|resource.?exhaust|too many/i.test(error)?'rate_limited':'unavailable');}
 const result=message.result;if(!result||!Array.isArray(result.content)||result.content.length>8)throw new SearchFailure('unavailable');
 const first=result.content.find(row=>row?.type==='text'&&typeof row.text==='string');if(!first)throw new SearchFailure('unavailable');
 if(result.isError===true)throw new SearchFailure(/quota|rate.?limit|credit|payment|resource.?exhaust|too many/i.test(first.text.slice(0,2000))?'rate_limited':'unavailable');
 let value;try{value=JSON.parse(first.text);}catch{throw new SearchFailure('unavailable');}
 if(!value||typeof value!=='object'||Array.isArray(value))throw new SearchFailure('unavailable');
 if(Object.prototype.hasOwnProperty.call(value,'error')||value.isError===true){const error=JSON.stringify(value.error||value.message||'').slice(0,2000);throw new SearchFailure(/quota|rate.?limit|credit|payment|resource.?exhaust|too many/i.test(error)?'rate_limited':'unavailable');}
 const requestId=typeof value.requestId==='string'&&/^[A-Za-z\d_-]{1,100}$/.test(value.requestId)?value.requestId:null;
 // Exa returns a receipt without `results` for some empty index searches.
 if(!Array.isArray(value.results)){if(value.results!==undefined||!requestId||!Number.isFinite(value.searchTime)||value.searchTime<0)throw new SearchFailure('unavailable');value.results=[];}
 return {results:value.results.slice(0,5),requestId};
}
async function request(task,{fetchImpl,now,timeoutMs=15000}={}){
 const timeout=Math.min(15000,Math.max(10,Number(timeoutMs)||15000)),controller=new AbortController();let timer;
 const operation=async()=>{const platform=platformById(task.platform),response=await fetchImpl(ENDPOINT,{method:'POST',redirect:'error',signal:controller.signal,headers:{Accept:'application/json, text/event-stream','Content-Type':'application/json','User-Agent':'Simon-AINews-Social-Discovery/1.0'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'web_search_advanced_exa',arguments:{query:task.query,numResults:5,type:'auto',includeDomains:[platform.domain],startPublishedDate:plus(now,-30*86400000),textMaxCharacters:1800,enableHighlights:true,highlightsMaxCharacters:500,enableSummary:false}}})});
  if(response.url&&response.url!==ENDPOINT)throw new SearchFailure('unavailable');if(response.status===403||response.status===429){await response.body?.cancel?.();throw new SearchFailure('rate_limited',retryDeadline(response,now));}if(!response.ok){await response.body?.cancel?.();throw new SearchFailure('unavailable');}
  if(Number(response.headers?.get?.('content-length'))>MAX_BYTES){await response.body?.cancel?.();throw new SearchFailure('unavailable');}
  let text;if(response.body?.getReader){const reader=response.body.getReader(),chunks=[];let size=0;try{for(;;){const value=await reader.read();if(value.done)break;size+=value.value.byteLength;if(size>MAX_BYTES)throw new SearchFailure('unavailable');chunks.push(Buffer.from(value.value));}text=Buffer.concat(chunks).toString('utf8');}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}}
  else{text=await response.text();if(Buffer.byteLength(text)>MAX_BYTES)throw new SearchFailure('unavailable');}return toolObject(text);
 };
 try{return await Promise.race([operation(),new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new SearchFailure('unavailable'));},timeout);})]);}catch(error){if(error instanceof SearchFailure){if(error.kind==='rate_limited'&&!error.retryAt)error.retryAt=plus(now,INTERVAL);throw error;}throw new SearchFailure('unavailable');}finally{clearTimeout(timer);controller.abort();}
}
function incomingQueue(queue,candidates){
 const byUrl=new Map(candidates.map(row=>[row.sourceUrl,row])),groups=new Map();
 for(const item of queue.slice(0,4)){const candidate=byUrl.get(item.sourceUrl);if(!candidate)continue;const key=item.repository.toLowerCase(),source={platform:candidate.platform,sourceUrl:candidate.sourceUrl,method:'public_search_index',firstSeenAt:candidate.firstSeenAt,lastSeenAt:candidate.lastSeenAt,authorVerified:false};let row=groups.get(key);if(!row){row={repository:item.repository,queryId:item.queryId,firstSeenAt:item.firstSeenAt,acquisitionSources:[]};groups.set(key,row);}if(!row.acquisitionSources.some(old=>old.platform===source.platform&&old.sourceUrl===source.sourceUrl))row.acquisitionSources.push(source);}
 // Preserve all available platform attributions even when the same repo occupies one slot.
 for(const row of groups.values())for(const item of queue){if(item.repository.toLowerCase()!==row.repository.toLowerCase())continue;const candidate=byUrl.get(item.sourceUrl);if(candidate&&!row.acquisitionSources.some(old=>old.sourceUrl===candidate.sourceUrl)&&row.acquisitionSources.length<6)row.acquisitionSources.push({platform:candidate.platform,sourceUrl:candidate.sourceUrl,method:'public_search_index',firstSeenAt:candidate.firstSeenAt,lastSeenAt:candidate.lastSeenAt,authorVerified:false});}
 return [...groups.values()].map(row=>({...row,acquisitionSources:validateAcquisitionSources(row.acquisitionSources)}));
}
async function collectSocialDiscovery({previous=null,now=new Date().toISOString(),fetchImpl=globalThis.fetch,config={}}={}){
 now=iso(typeof now==='function'?now():now);if(!now)throw Error('Invalid social discovery date');if(typeof fetchImpl!=='function')throw Error('Invalid social discovery fetch');
 const prior=previous?.state||{},candidateMap=new Map((Array.isArray(previous?.candidates)?previous.candidates:[]).slice(-60).map(row=>retainedCandidate(row,now)).filter(Boolean).map(row=>[row.id,row]));
 const validQueries=new Set(PRODUCTS.flatMap(p=>DOMAINS.map(d=>p.id+'-'+d.id))),bySource=new Set([...candidateMap.values()].map(row=>row.sourceUrl));
 const repoQueue=(Array.isArray(prior.repoQueue)?prior.repoQueue:[]).filter(row=>repositoryName(row?.repository)&&validQueries.has(row.queryId)&&bySource.has(row.sourceUrl)&&iso(row.firstSeenAt)).slice(0,120).map(row=>({repository:row.repository,queryId:row.queryId,firstSeenAt:iso(row.firstSeenAt),sourceUrl:row.sourceUrl}));
 for(const row of candidateMap.values())if(row.repository&&!repoQueue.some(item=>item.repository.toLowerCase()===row.repository.toLowerCase()&&item.sourceUrl===row.sourceUrl))repoQueue.push({repository:row.repository,queryId:row.queryId,firstSeenAt:row.firstSeenAt,sourceUrl:row.sourceUrl});
 const state={cursor:Number.isInteger(prior.cursor)?Math.abs(prior.cursor)%SOCIAL_TASKS.length:0,lastAttemptAt:iso(prior.lastAttemptAt||previous?.lastAttemptAt),lastSuccessAt:iso(prior.lastSuccessAt||previous?.lastSuccessAt),nextRetryAt:iso(prior.nextRetryAt),repoQueue:repoQueue.slice(0,120)};
 const platforms=PLATFORMS.map(platform=>{const old=(Array.isArray(previous?.platforms)?previous.platforms:[]).find(row=>row?.id===platform.id);return {id:platform.id,labelZh:platform.labelZh,mode:'public_search_index',status:'not_checked',lastAttemptAt:iso(old?.lastAttemptAt),lastSuccessAt:iso(old?.lastSuccessAt),nextRetryAt:iso(old?.nextRetryAt),queriesExecuted:0,sourceUrl:SOURCE_URL,noteZh:'本轮尚未查询此平台；保留最近实际搜索时间。搜索索引不代表平台全量或即时覆盖。'};});
 let status='ok',queriesExecuted=0,successes=0;
 const result=()=>{const candidates=[...candidateMap.values()].sort((a,b)=>a.lastSeenAt.localeCompare(b.lastSeenAt)).slice(-60),sources=new Set(candidates.map(row=>row.sourceUrl));state.repoQueue=state.repoQueue.filter(row=>sources.has(row.sourceUrl)).slice(0,120);const nextCheckAt=new Date(Math.max(state.lastAttemptAt?Date.parse(state.lastAttemptAt)+INTERVAL:Date.parse(now),Date.parse(state.nextRetryAt)||0)).toISOString();return {schemaVersion:1,status,checkedAt:now,lastAttemptAt:state.lastAttemptAt,lastSuccessAt:state.lastSuccessAt,nextCheckAt,queriesExecuted,platforms,candidates,incoming:incomingQueue(state.repoQueue,candidates),state,coverageZh:'通过免费公开搜索索引轮换发现 YouTube、X、Reddit 上 Codex、Claude 与 Muse Code 的三维、视频和办公线索。未直接抓取平台、登录、播放或核实作者身份；结果不是全量、即时或完整覆盖。',policyZh:'每6小时轮换一个用途，依次查询三个平台，每次最多5条结果；线索保留7天，最多60条。公开 GitHub 引用只排队接受原有身份、README 制作声明、演示和制作过程规则，不直接当成已收录成品。限流后停止本轮并退避，不绕过访问限制。',costNoteZh:'仅使用无需账号或 API Key 的公开 Exa MCP 搜索入口，受免费额度、可用性与索引时效限制；未启用付费 API 或自动充值。没有稳定性或完整性保证，免费入口失效时保留历史并显示状态。',sourceUrl:SOURCE_URL};};
 if(state.nextRetryAt&&Date.parse(state.nextRetryAt)>Date.parse(now)||state.lastAttemptAt&&Date.parse(now)-Date.parse(state.lastAttemptAt)<INTERVAL){status='idle';return result();}
 state.lastAttemptAt=now;state.nextRetryAt=null;
 for(let index=0;index<3;index++){
  const task=SOCIAL_TASKS[state.cursor],platform=platforms.find(row=>row.id===task.platform);platform.lastAttemptAt=now;platform.queriesExecuted++;queriesExecuted++;
  try{const response=await request(task,{fetchImpl,now,timeoutMs:config.timeoutMs});platform.status='ok';platform.lastSuccessAt=now;platform.nextRetryAt=null;platform.noteZh='已完成此用途的公开搜索索引查询；未直接读取平台原文，未验证作者身份或运行作品。';if(response.requestId)platform.requestId=response.requestId;successes++;
   for(const value of response.results){const sourceUrl=canonicalSocialUrl(value?.url,task.platform);if(!sourceUrl)continue;const text=boundedText(value?.title,500)+'\n'+boundedText(value?.text,6000)+'\n'+(Array.isArray(value?.highlights)?value.highlights.slice(0,3).map(row=>boundedText(row,1500)).join('\n'):'');const product=PRODUCTS.find(row=>row.match.test(text)),domain=DOMAINS.find(row=>row.id===task.domainId&&row.match.test(text))||DOMAINS.find(row=>row.match.test(text));if(!product||!domain)continue;
    const names=references(text),id='social-'+hash(task.platform+':'+sourceUrl).slice(0,24),old=candidateMap.get(id),row=retainedCandidate({id,platform:task.platform,sourceUrl,focusId:product.id,categoryZh:domain.labelZh,repository:names[0]||old?.repository||null,firstSeenAt:old?.firstSeenAt||now,lastSeenAt:now,queryId:product.id+'-'+domain.id},now);candidateMap.set(id,row);
    for(const repository of names)if(!state.repoQueue.some(item=>item.repository.toLowerCase()===repository.toLowerCase()&&item.sourceUrl===sourceUrl))state.repoQueue.push({repository,queryId:row.queryId,firstSeenAt:row.firstSeenAt,sourceUrl});
   }
   state.cursor=(state.cursor+1)%SOCIAL_TASKS.length;
  }catch(error){platform.status=error.kind==='rate_limited'?'rate_limited':'unavailable';platform.noteZh=error.kind==='rate_limited'?'公开搜索入口限流、额度用尽或拒绝访问；已停止本轮并等待退避，未切换付费服务或绕过限制。':'本轮搜索索引未能读取或格式无法核实；保留未过期线索和最近成功时间，不视作没有新作品。';if(error.kind==='rate_limited'){state.nextRetryAt=error.retryAt||plus(now,INTERVAL);platform.nextRetryAt=state.nextRetryAt;status='rate_limited';break;}status='partial';state.cursor=(state.cursor+1)%SOCIAL_TASKS.length;}
 }
 if(successes===3){state.lastSuccessAt=now;status='ok';}else if(!successes&&status!=='rate_limited')status='unavailable';
 const output=result();if(successes>0&&output.state.repoQueue.length>4)output.state.repoQueue=[...output.state.repoQueue.slice(4),...output.state.repoQueue.slice(0,4)];return output;
}
module.exports={collectSocialDiscovery,validateAcquisitionSources,canonicalSocialUrl,SOCIAL_TASKS,SOURCE_URL,requestPublicSearch:request};
