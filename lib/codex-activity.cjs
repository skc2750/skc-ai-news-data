'use strict';
// No X API key, cookies or paid inference. Third-party pages discover URLs;
// X's public oEmbed response is the separate evidence for original post text.
const {text,digest,mapLimit}=require('./core.cjs');
const {requestPublicSearch}=require('./social-discovery.cjs');
const DISCOVERY=Object.freeze([
 {id:'codexlimits-tibo',label:'Codex Limits · Tibo 挑战跟踪（第三方）',sourceUrl:'https://codexlimits.com/tibo-28'},
 {id:'whenreset-codex',label:'WhenReset · Codex 重置记录（第三方）',sourceUrl:'https://whenreset.dev/codex'}
]);
const ORIGINAL={id:'tibo-original',label:'Tibo 原帖 · X 官方公开嵌入',sourceUrl:'https://x.com/thsottiaux'};
const SEARCH={id:'tibo-search-index',label:'Tibo 作者限定搜索索引 · Exa（第三方）',sourceUrl:'https://exa.ai/docs/get-started/exa-mcp'};
const SEARCH_INTERVAL=6*3600000;
const COVERAGE_NOTE='每小时计划读取两个免费公开跟踪页，每6小时补充一次 Tibo 作者限定的免费搜索索引，再使用 X 官方公开嵌入核对原文。不是完整 X 时间线或实时推送，索引、跟踪页、原帖可读取性及 GitHub 排程均可能延迟。第三方线索、原文核验和个人账户到账相互独立；未公布的准确时间始终标为未知，历史回溯不表示当时已经持续监测。';
const KINDS=new Set(['feature_update','reset_announced','reset_completed','banked_reset']);
const LIMITS={bytes:1500000,timeoutMs:12000,verifyPerRun:40,recheckLatest:5,lookbackMs:45*86400000,current:600,archiveWindow:5000};
// A manual correlation combines this exact Done text, the same account's Day
// 13 announcement and public tracking records. It is not a verified X reply
// thread or personal account arrival check, and never generalizes to other Done.
const VERIFIED_REPLY={id:'2111566005684289735',exactText:'Done',announcementId:'2111492673890824348',timingId:'2111492738025959922',checkedAt:'2026-10-18T12:00:00.000Z'};
const KNOWN_URLS=[VERIFIED_REPLY.id,VERIFIED_REPLY.announcementId,VERIFIED_REPLY.timingId,'2111244596131111253'].map(id=>`https://x.com/thsottiaux/status/${id}`);
function originalUrl(value){
 try{const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.port||!['x.com','www.x.com','twitter.com','www.twitter.com'].includes(u.hostname))return null;
  const m=u.pathname.match(/^\/thsottiaux\/status\/(\d{15,22})\/?$/i);return m?`https://x.com/thsottiaux/status/${m[1]}`:null;
 }catch{return null;}
}
function postId(url){return originalUrl(url)?.split('/').at(-1)||null;}
function postTime(url,now){try{const n=Number((BigInt(postId(url))>>22n)+1288834974657n);return n>=1288834974657&&n<=Date.parse(now)+300000?new Date(n).toISOString():null;}catch{return null;}}
function plain(value,max=1400){return text(String(value||'').replace(/&#x([a-f0-9]+);/gi,(_,v)=>String.fromCodePoint(parseInt(v,16))).replace(/&#(\d+);/g,(_,v)=>String.fromCodePoint(Number(v))),max);}
function candidatesFromChallenge(html,now){
 const m=html.match(/\bdata-state="([^"]+)"/);if(!m)throw Error('挑战页结构已改变');
 let state;try{state=JSON.parse(decodeURIComponent(m[1]));}catch{throw Error('挑战页结构已改变');}
 if(!Array.isArray(state.entries)||state.entries.length>300)throw Error('挑战页记录无效');
 const rows=state.entries.flatMap(row=>{const sourceUrl=originalUrl(row.post?.url);if(!sourceUrl)return [];
  const publishedAt=postTime(sourceUrl,now);if(!publishedAt)return [];
  return [{sourceUrl,publishedAt,discoverySourceUrl:DISCOVERY[0].sourceUrl,originalText:plain(row.post.text),hint:row.outcome==='reset'?'reset_announced':'feature_update',relatedSourceUrls:[]}];});
 if(!rows.length)throw Error('挑战页没有可识别原帖');return rows;
}
function candidatesFromHistory(html,now){
 const rows=[...html.matchAll(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi)].map(m=>m[0]);
 const out=[];
 for(let i=0;i<rows.length;i++){
  const match=rows[i].match(/\bid="event-codex-(\d{15,22})"/);if(!match)continue;
  const main=rows[i],detail=rows[i+1]?.includes(`event-codex-${match[1]}-sources`)?rows[i+1]:'';
  const candidates=[...`${main}${detail}`.matchAll(/https:\/\/(?:x|twitter)\.com\/thsottiaux\/status\/\d{15,22}/gi)].map(m=>originalUrl(m[0]));
  const sourceUrls=[...new Set(candidates)];
  for(const sourceUrl of sourceUrls){const publishedAt=postTime(sourceUrl,now);if(!publishedAt||Date.parse(now)-Date.parse(publishedAt)>LIMITS.lookbackMs)continue;
   const banked=/Banked reset/i.test(main),li=[...detail.matchAll(/<li\b[^>]*>[\s\S]*?<\/li>/gi)].map(m=>m[0]).find(li=>li.includes(sourceUrl));
   const hint=banked?'banked_reset':li&&/role landed/.test(li)?'reset_completed':'reset_announced';
   out.push({sourceUrl,publishedAt,discoverySourceUrl:DISCOVERY[1].sourceUrl,originalText:'',hint,relatedSourceUrls:sourceUrls.filter(u=>u!==sourceUrl)});
  }
 }
 if(!out.length)throw Error('重置页没有可识别原帖');return out;
}
async function publicText(url,{fetchImpl=globalThis.fetch}={}){
 const allowed=[...DISCOVERY.map(s=>s.sourceUrl),'https://publish.twitter.com/oembed','https://publish.x.com/oembed'];
 if(!allowed.some(s=>url===s||s.endsWith('/oembed')&&url.startsWith(s+'?')))throw Error('未注册公开来源');
 let response,target=url;
 for(let hop=0;hop<3;hop++){
  response=await fetchImpl(target,{signal:AbortSignal.timeout(LIMITS.timeoutMs),redirect:'manual',headers:{Accept:'text/html, application/json','User-Agent':'SKC-AINews/1.1 (+https://simonseow.com/news/)'}});
  if(![301,302,303,307,308].includes(response.status))break;
  const location=response.headers?.get?.('location');await response.body?.cancel?.();
  try{target=new URL(location,target).href;}catch{throw Error('公开来源意外跳转');}
  if(!location||!allowed.some(s=>target===s||s.endsWith('/oembed')&&target.startsWith(s+'?'))||hop===2)throw Error('公开来源意外跳转');
 }
 if(!response.ok)throw Error(`公开来源 HTTP ${Number(response.status)||0}`);
 const final=response.url||target;if(!allowed.some(s=>final===s||s.endsWith('/oembed')&&final.startsWith(s+'?')))throw Error('公开来源意外跳转');
 if(Number(response.headers?.get?.('content-length'))>LIMITS.bytes)throw Error('公开来源超过读取上限');
 let body='';if(response.body?.getReader){const reader=response.body.getReader(),chunks=[];let size=0;try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>LIMITS.bytes)throw Error('公开来源超过读取上限');chunks.push(Buffer.from(part.value));}body=Buffer.concat(chunks).toString('utf8');}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}}
 else{body=await response.text();if(Buffer.byteLength(body)>LIMITS.bytes)throw Error('公开来源超过读取上限');}
 return body;
}
function parseOriginal(body,sourceUrl){
 let value;try{value=JSON.parse(body);}catch{throw Error('原帖响应无效');}
 if(originalUrl(value.url)!==sourceUrl||!/^https:\/\/(?:x|twitter)\.com\/thsottiaux\/?$/i.test(value.author_url||''))throw Error('原帖作者或地址不匹配');
 const paragraphs=[...String(value.html||'').matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)];
 const originalText=paragraphs.map(m=>plain(m[1])).join('\n').trim();
 if(!originalText)throw Error('原帖未返回可读正文');return originalText;
}
function classify(content,candidate){
 const s=plain(content),id=postId(candidate.sourceUrl);
 if(id===VERIFIED_REPLY.id&&s===VERIFIED_REPLY.exactText)return {kind:'reset_completed',verifiedMeaning:true,manualCorrelation:true};
 // Polarity is checked before keywords: "not giving banked resets" is not a
 // banked reset announcement. Negative status notes remain visibly unconfirmed.
 const negative=/\bno\s+(?:(?:usage|limits?|banked|more|new|additional|further)\s+){0,3}resets?\b|\b(?:not|never)\s+(?:(?:be|been|being|going|to|have|has|are|is|will|yet|giving|granting|getting|receiving|issuing|offering|performing|doing|out|a|any|the|today|another|new|additional|full|banked|usage|limits?)\s+){0,10}resets?\b|\b(?:won[’']t|don[’']t|doesn[’']t|didn[’']t|isn[’']t|aren[’']t|haven[’']t|hasn[’']t|wasn[’']t|weren[’']t|cannot|can[’']t)\s+(?:(?:be|have|been|now|yet|going|to|giving|give|grant|granting|receive|receiving|issue|issuing|offer|offering|perform|performing|do|doing|out|a|any|the|banked|usage|limits?)\s+){0,10}resets?\b|\bresets?\s+(?:(?:is|are|has|have|was|were|will|be|been|being|now|still|yet)\s+){0,5}(?:not|never|cancelled|canceled|won[’']t|isn[’']t|hasn[’']t)\b/i.test(s);
 const conditionalReset=/\b(?:if|unless|when|once)\b[^.!?]{0,260}\bresets?\b|\bresets?\b[^.!?]{0,180}\b(?:if|unless)\b/i.test(s);
 // A failed-to-ship condition is not a negation of the reset itself.
 if(negative)return {kind:'feature_update',verifiedMeaning:false,negativeReset:true};
 if(conditionalReset){const commitment=/\b(?:we\s+will|we[’']ll|will)\s+(?:(?:be|give|grant|perform|do|receive|get|have|a|an|the|all|full|usage|limits?|banked|everyone|you|each|users?)\s+){0,10}reset\b|\b(?:everyone|users|you)\s+(?:will\s+)?(?:gets?|receives?)\s+(?:(?:a|the|full|banked|usage)\s+)*reset\b|\bthen\s+(?:we\s+)?(?:will\s+)?reset\b/i.test(s);return {kind:commitment?'reset_announced':'feature_update',verifiedMeaning:commitment,conditionalReset:true};}
 if(/\b(?:bank(?:ed|ing)?|stash|save|reserve)\b[\s\S]{0,90}\breset|\breset[\s\S]{0,90}\b(?:bank(?:ed|ing)?|stash|save|reserve)\b/i.test(s))return {kind:'banked_reset',verifiedMeaning:true};
 if(/\bresets?\b/i.test(s)&&(/\b(?:usage|limits?|day|propagated|banked)\b/i.test(s)||candidate.hint!=='feature_update')){
  const conditional=/\b(?:if|unless|when|once|not|never|waiting|will|going to)\b/i.test(s);
  if(!conditional&&/\b(?:done|completed|all propagated|has landed|have reset|we(?:'ve| have) reset|(?:has|have)\s+(?:(?:now|already|fully)\s+)*been\s+(?:fully\s+)?reset|reset (?:is |has been )?(?:done|complete|completed|live))\b/i.test(s))return {kind:'reset_completed',verifiedMeaning:true};
  return {kind:'reset_announced',verifiedMeaning:true};
 }
 if(/\b(?:landing|roll(?:ing)? out|by eod|later today)\b/i.test(s)&&candidate.relatedSourceUrls?.some(url=>postId(url)===VERIFIED_REPLY.announcementId))return {kind:'reset_announced',verifiedMeaning:true};
 if(/^(?:done|all done|landed|it's done)\b/i.test(s)||candidate.hint!=='feature_update'&&!/\b(?:codex|context|review|app|model|API|feature)\b/i.test(s))return {kind:candidate.hint||'reset_completed',verifiedMeaning:false};
 if(/待核实/.test(s))return {kind:candidate.hint||'feature_update',verifiedMeaning:false};
 return {kind:'feature_update',verifiedMeaning:candidate.hint==='feature_update'||/\b(?:codex|work|ship|improv|context|review|app|model|API|feature)\b/i.test(s)};
}
function chineseDescription(kind,body,classification={}){
 const s=plain(body),day=s.match(/\bDay\s+(\d+(?:\.\d+)?)/i)?.[1],prefix=day?`第 ${day} 天 · `:'';
 if(classification.negativeReset)return {titleChinese:prefix+'重置状态说明（非肯定公告）',summaryChinese:'原帖包含否定或尚未发生的重置说明，不能当作新的重置预告、完成确认或储备发放；具体语境请查看原文。',method:'中文规则摘要'};
 if(classification.conditionalReset)return {titleChinese:prefix+(kind==='reset_announced'?'有条件的重置预告':'条件或假设的重置说明'),summaryChinese:kind==='reset_announced'?'原帖承诺满足特定条件时才会进行重置；条件是否兑现及实际执行尚未确认，不能当作已经完成。准确时间未知。':'原帖在条件或假设语境中讨论重置，不能当作新的肯定预告或完成确认；准确时间未知。',method:'中文规则摘要'};
 if(kind==='reset_completed')return {titleChinese:prefix+'Usage reset 完成确认',summaryChinese:'Tibo 已发布重置完成确认。这是公开公告，不表示已读取或核实你的个人账户额度到账。',method:'中文规则摘要'};
 if(kind==='reset_announced')return {titleChinese:prefix+'Usage reset 预告',summaryChinese:/\b(?:by eod|end of (?:the )?day)\b/i.test(s)?'Tibo 表示预计在原帖所称当天结束前进行重置；仅有相对时间，未公布准确时刻。':'Tibo 发布 usage reset 预告；这条公告本身不代表已经完成，准确执行时间未知。',method:'中文规则摘要'};
 if(kind==='banked_reset')return {titleChinese:prefix+'储备重置公告',summaryChinese:'Tibo 提及可留待需要时使用的储备重置。适用对象、领取条件及有效期须以原帖为准；本站不会自动替你使用重置。',method:'中文规则摘要'};
 const rules=[
  [/reusing context across subagents|keeping context cached longer/i,'提高 Codex 实际额度利用效率','复用子代理上下文、延长上下文缓存并优化请求路由，以提高缓存命中率和实际额度利用效率。'],
  [/default context length.*500k/i,'扩大 Codex 默认上下文','Tibo 表示通过 Codex 与 Work 使用 GPT-6.1 Sol 时，默认上下文由 272k 增至 500k。'],
  [/state on disk.*60%/i,'减少桌面应用磁盘占用','优化 ChatGPT 与 Codex 桌面应用保存状态的方式，原帖称磁盘占用预计减少约 60%。'],
  [/selected model is at capacity/i,'缓解模型容量不足提示','增加计算资源并调整系统，以减少“所选模型容量不足”造成的中断；发生时也应能自动继续。'],
  [/auto-review.*free|auto-review.*does not use usage/i,'Auto-review 纳入账户方案','Tibo 表示通过 ChatGPT 账户登录的用户可使用 Auto-review，原帖称其不消耗用量。'],
  [/steering.*instant/i,'提高实时调整响应速度','优化任务进行中的 steering，使模型更快响应用户调整方向的指令。'],
  [/composer predictions/i,'桌面输入预测','桌面应用增加输入预测；原帖称 Pro 方案已包含该功能且不消耗用量。'],
  [/re-shipped codex cloud/i,'更新 Codex Cloud','Tibo 表示已重新发布改进后的 Codex Cloud。'],
  [/create and text your dot.*ChatGPT mobile/i,'手机端创建与联系 Dot','现在可以直接在 ChatGPT 手机应用中创建 Dot，并通过文字与其交流。'],
  [/Decisions API is live/i,'Decisions API 发布','Tibo 宣布 Decisions API 上线，提供实时通用分类能力，并表示 OpenAI 也会用它改善产品体验。'],
  [/colleague.*context.*codex/i,'积累对话上下文后交给 Codex','Tibo 展示通过对话积累上下文，再将其交给 Codex 完成任务的用途；具体入口见原帖。'],
  [/removed some friction.*building on the API/i,'简化 API 开发流程','Tibo 表示已减少使用 API 开发时的部分操作阻碍；这条短帖未展开具体改动。'],
  [/default speed.*50% faster.*GPT-6 Astra/i,'提高订阅模型默认速度','Tibo 表示 GPT-6 Astra 与 GPT-6.1 Sol 在订阅及使用 ChatGPT 登录的合作产品中，默认速度提高约 50%，无需用户调整。'],
  [/GPT-6 Sol and Luna are out/i,'GPT-6 Sol 与 Luna 发布','Tibo 宣布 GPT-6 Sol 与 Luna 发布，提及写作和整体质量提升，并表示两者 API 价格永久降低 50%；最新价格仍以官方价格页为准。']
 ];
 const found=rules.find(([re])=>re.test(s));
 return found?{titleChinese:prefix+found[1],summaryChinese:found[2],method:'中文规则摘要'}:
 {titleChinese:prefix+'Codex 功能更新',summaryChinese:'已发现功能更新原帖，中文摘要正在等待本地离线翻译；可先查看原文。',method:'待离线翻译'};
}
function scopeChinese(body){const s=plain(body);if(/\bpaid (?:users|accounts|chatgpt plans?)\b/i.test(s))return '原帖明确提及付费账户';if(/\ball (?:codex |chatgpt )?users\b|\beveryone\b/i.test(s))return '原帖明确提及所有用户；仍以各账户实际状态为准';if(/\ball Plus,? Pro and Business users\b/i.test(s))return '原帖明确提及 Plus、Pro 与 Business 用户';if(/\bpro plans?\b/i.test(s))return '原帖提及 Pro 方案';return '未知（原帖未明确说明适用对象）';}
function eventFrom(candidate,body,{now,previous=null,verified=false}={}){
 const result=classify(body,candidate),description=chineseDescription(result.kind,body,result),isVerified=verified&&result.verifiedMeaning;
 const related=[...new Set([...(candidate.relatedSourceUrls||[]),...(result.manualCorrelation?[VERIFIED_REPLY.announcementId,VERIFIED_REPLY.timingId].map(id=>`https://x.com/thsottiaux/status/${id}`):[])])].filter(url=>originalUrl(url)&&url!==candidate.sourceUrl).slice(0,12);
 const originalExcerpt=plain(body,420),titleOriginal=plain(body,160),contentHash=digest(titleOriginal+'\n'+originalExcerpt);
 return {id:`tibo-${postId(candidate.sourceUrl)}-${result.kind}`,kind:result.kind,titleChinese:description.titleChinese,summaryChinese:description.summaryChinese,titleOriginal,originalExcerpt,
  sourceUrl:candidate.sourceUrl,discoverySourceUrl:candidate.discoverySourceUrl,publishedAt:candidate.publishedAt||null,publishedAtMethod:'X 状态 ID 时间戳；不是重置执行时间',effectiveAt:null,
  effectiveTimeText:result.kind==='reset_completed'?'公告已确认完成；实际执行时刻未知':'未知（未公布准确时间）',scopeChinese:scopeChinese(body),verification:isVerified?'original_verified':'secondary_only',
  verificationNote:!verified?'原帖本轮未成功读取；仅保留第三方发现线索，须待核实。':result.negativeReset?'已读取原文，但其中是否定或未发生说明，不作为肯定重置公告。':result.conditionalReset?'已读取原文；条件兑现、执行完成和时间均未确认。':!isVerified?'原文已读取，但单独正文不足以核实重置关联，仍待核实。':result.manualCorrelation?'Done 原文已核对；结合 Day 13 预告及公开跟踪记录人工关联，非系统到账核验。':'已通过 X 官方公开嵌入核对 Tibo 原帖正文；中文为摘要，详情以原帖为准。',
  checkedAt:now,firstSeenAt:previous?.firstSeenAt||now,lastVerifiedAt:isVerified?now:previous?.lastVerifiedAt||null,lastOriginalReadAt:verified?now:previous?.lastOriginalReadAt||null,originalReadThisAttempt:verified,relatedSourceUrls:related,contentHash,
  translation:{status:description.method==='待离线翻译'?'pending':'ok',engine:description.method==='待离线翻译'?'pending':'chinese_rules',sourceHash:contentHash},
  ...(previous?.contentHash===contentHash&&previous.translation?.engine==='offline_cpu_qwen'&&previous.translation?.status==='ok'?{titleChinese:previous.titleChinese,summaryChinese:previous.summaryChinese,translation:previous.translation}:{})};
}
function mergeEvents(previous,incoming){
 const map=new Map();
 for(const event of [...previous,...incoming]){
  const url=originalUrl(event?.sourceUrl);if(!event?.id||!url||!KINDS.has(event.kind))continue;
  const old=map.get(url),firstSeenAt=[old?.firstSeenAt,event.firstSeenAt].filter(v=>Number.isFinite(Date.parse(v))).sort()[0]||event.firstSeenAt;
  // One original post has one current collector interpretation. A successful
  // original read can correct its former classification; failed reads cannot.
  if((old?.verification==='original_verified'||old?.lastOriginalReadAt)&&event.verification!=='original_verified'&&!event.originalReadThisAttempt){map.set(url,{...old,checkedAt:event.checkedAt,originalReadThisAttempt:false,lastAttemptNote:event.verificationNote,firstSeenAt});continue;}
  map.set(url,{...event,sourceUrl:url,firstSeenAt});
 }
 return [...map.values()].sort((a,b)=>(b.publishedAt||'').localeCompare(a.publishedAt||'')||a.id.localeCompare(b.id));
}
async function collectCodexActivity({fetchImpl=globalThis.fetch,now=new Date().toISOString(),previous=null}={}){
 const oldEvents=previous?.events||[],oldSources=new Map((previous?.sources||[]).map(s=>[s.id,s]));
 const found=await Promise.all(DISCOVERY.map(async source=>{try{const html=await publicText(source.sourceUrl,{fetchImpl}),candidates=source.id==='codexlimits-tibo'?candidatesFromChallenge(html,now):candidatesFromHistory(html,now);return {source:{...source,status:'ok',checkedAt:now,lastSuccessAt:now,discovered:candidates.length},candidates};}catch(error){return {source:{...source,status:oldSources.get(source.id)?.lastSuccessAt?'stale':'unavailable',checkedAt:now,lastSuccessAt:oldSources.get(source.id)?.lastSuccessAt||null,error:String(error.message||'读取失败').slice(0,160)},candidates:[]};}}));
 const searchState={...(previous?.discoveryState?.search||{})},oldSearch=oldSources.get(SEARCH.id);let search;
 if((searchState.nextRetryAt&&Date.parse(searchState.nextRetryAt)>Date.parse(now))||(searchState.lastAttemptAt&&Date.parse(now)-Date.parse(searchState.lastAttemptAt)<SEARCH_INTERVAL)){
  search={source:{...SEARCH,status:oldSearch?.status||'unavailable',checkedAt:oldSearch?.checkedAt||now,lastSuccessAt:oldSearch?.lastSuccessAt||null,...(oldSearch?.error?{error:oldSearch.error}:{}),queriesExecuted:0,nextCheckAt:searchState.nextRetryAt||new Date(Date.parse(searchState.lastAttemptAt)+SEARCH_INTERVAL).toISOString()},candidates:[]};
 }else{
  searchState.lastAttemptAt=now;delete searchState.nextRetryAt;
  try{
   const response=await requestPublicSearch({platform:'x',query:'site:x.com/thsottiaux/status/ (Codex OR Work OR reset)'},{fetchImpl,now});
   const candidates=response.results.flatMap(row=>{const sourceUrl=originalUrl(row.url),publishedAt=postTime(sourceUrl,now);if(!sourceUrl||!publishedAt)return [];const originalText=plain(row.text||row.title||'');return [{sourceUrl,publishedAt,originalText,hint:/\bresets?\b/i.test(originalText)?'reset_announced':'feature_update',discoverySourceUrl:SEARCH.sourceUrl,relatedSourceUrls:[]}];});
   searchState.lastSuccessAt=now;search={source:{...SEARCH,status:'ok',checkedAt:now,lastSuccessAt:now,queriesExecuted:1,discovered:candidates.length},candidates};
  }catch(error){
   searchState.nextRetryAt=error.retryAt||new Date(Date.parse(now)+SEARCH_INTERVAL).toISOString();
   search={source:{...SEARCH,status:oldSearch?.lastSuccessAt?'stale':'unavailable',checkedAt:now,lastSuccessAt:oldSearch?.lastSuccessAt||null,queriesExecuted:1,nextCheckAt:searchState.nextRetryAt,error:error.kind==='rate_limited'?'免费搜索入口限流或额度不足，已停止查询并退避；未启用付费服务。':'免费搜索索引本轮读取失败；不代表没有新动态。'},candidates:[]};
  }
 }
 found.push(search);
 const candidateMap=new Map();for(const row of found.flatMap(r=>r.candidates)){
  const old=candidateMap.get(row.sourceUrl),priority={feature_update:0,reset_announced:1,reset_completed:2,banked_reset:3};candidateMap.set(row.sourceUrl,old?{...old,hint:priority[row.hint]>priority[old.hint]?row.hint:old.hint,originalText:old.originalText||row.originalText,relatedSourceUrls:[...new Set([...old.relatedSourceUrls,...row.relatedSourceUrls])]}:row);
 }
 // Known URLs are bounded, transparent backfill, not a live-feed substitute.
 for(const sourceUrl of KNOWN_URLS)if(!candidateMap.has(sourceUrl))candidateMap.set(sourceUrl,{sourceUrl,publishedAt:postTime(sourceUrl,now),originalText:'',hint:postId(sourceUrl)===VERIFIED_REPLY.id?'reset_completed':postId(sourceUrl)===VERIFIED_REPLY.announcementId||postId(sourceUrl)===VERIFIED_REPLY.timingId?'reset_announced':'feature_update',discoverySourceUrl:'https://codexlimits.com/tibo-28',relatedSourceUrls:postId(sourceUrl)===VERIFIED_REPLY.timingId?[`https://x.com/thsottiaux/status/${VERIFIED_REPLY.announcementId}`]:[]});
 const candidates=[...candidateMap.values()].filter(c=>c.publishedAt).sort((a,b)=>b.publishedAt.localeCompare(a.publishedAt));
 const previousByUrl=new Map(oldEvents.map(e=>[e.sourceUrl,e]));
 const toCheck=candidates.filter((c,i)=>i<LIMITS.recheckLatest||!previousByUrl.has(c.sourceUrl)||previousByUrl.get(c.sourceUrl).verification!=='original_verified').slice(0,LIMITS.verifyPerRun);
 const results=await mapLimit(toCheck,4,async candidate=>{try{const body=await publicText(`https://publish.twitter.com/oembed?omit_script=true&url=${encodeURIComponent(candidate.sourceUrl)}`,{fetchImpl});const original=parseOriginal(body,candidate.sourceUrl);return {event:eventFrom(candidate,original,{now,previous:previousByUrl.get(candidate.sourceUrl),verified:true}),ok:true};}catch{return {event:candidate.originalText?eventFrom(candidate,candidate.originalText,{now,previous:previousByUrl.get(candidate.sourceUrl),verified:false}):previousByUrl.has(candidate.sourceUrl)?{...previousByUrl.get(candidate.sourceUrl),checkedAt:now,originalReadThisAttempt:false,lastAttemptNote:'原帖本轮读取失败，保留上次记录。'}:eventFrom(candidate,'待核实：第三方跟踪页发现此原帖，尚未读取正文。',{now,verified:false}),ok:false};}});
 const deferred=candidates.filter(c=>!toCheck.includes(c)&&!previousByUrl.has(c.sourceUrl)).map(candidate=>eventFrom(candidate,candidate.originalText||'待核实：尚未读取原帖正文。',{now,verified:false}));
 const ok=results.filter(r=>r.status==='fulfilled'&&r.value.ok).length,failed=toCheck.length-ok;
 const originalSource={...ORIGINAL,status:failed?(oldSources.get(ORIGINAL.id)?.lastSuccessAt||ok?'stale':'unavailable'):'ok',checkedAt:now,lastSuccessAt:ok?now:oldSources.get(ORIGINAL.id)?.lastSuccessAt||null,attempted:toCheck.length,verified:ok,failed,deferred:deferred.length,...(failed?{error:'部分原帖未成功读取，待核实线索及历史核验记录均已保留。'}:{})};
 const events=mergeEvents(oldEvents,[...results.flatMap(r=>r.status==='fulfilled'?[r.value.event]:[]),...deferred]);
 const healthy=found.every(r=>r.source.status==='ok')&&failed===0&&deferred.length===0&&!events.some(e=>e.verification==='secondary_only');
 const anySuccess=found.some(r=>r.source.status==='ok'&&r.source.checkedAt===now)||ok>0,status=healthy?'ok':anySuccess?'partial':events.length?'stale':'unavailable';
 const pendingVerification=events.filter(e=>e.verification==='secondary_only').length,acquisitionFailed=found.filter(r=>r.source.status!=='ok').length+Number(failed>0);
 const statusNoteChinese=acquisitionFailed?`本轮有 ${acquisitionFailed} 个来源读取失败或仍处退避，已保留历史；${pendingVerification} 条线索待原文或语义核实。`:pendingVerification?`公开来源本轮可读；${pendingVerification} 条旧线索仍待原文或语义核实，不视为采集故障。`:'本轮公开来源可读；原帖及分类已核实。覆盖仍受公开索引和来源时效限制。';
 return validateCodexActivity({schemaVersion:1,checkedAt:now,lastSuccessAt:anySuccess?now:previous?.lastSuccessAt||null,status,statusNoteChinese,coverageNote:COVERAGE_NOTE,sources:[...found.map(r=>r.source),originalSource],events,nextResetAt:null,nextResetLabel:'未知（未公布准确时间）',discoveryState:{search:searchState},refreshPolicy:{expected:'hourly',note:'GitHub 每小时计划采集、搜索索引每6小时补充一次；免费公开源与运行排程均可能延迟，不是实时承诺。'}});
}
function translationRequests(codex,cache={},validTranslation=()=>false){return (codex?.events||[]).filter(e=>e.verification==='original_verified'&&e.kind==='feature_update'&&e.translation?.status==='pending').map(e=>({id:e.id,contentHash:e.contentHash,title:e.titleOriginal,summary:e.originalExcerpt})).filter(r=>!validTranslation(cache.entries?.[`${r.id}:${r.contentHash}`],r));}
function applyTranslations(codex,entries={},validTranslation=()=>false){
 if(!codex)return null;
 return {...codex,events:codex.events.map(e=>{if(e.kind!=='feature_update'||e.translation?.status!=='pending')return e;const record={id:e.id,contentHash:e.contentHash},value=entries[`${e.id}:${e.contentHash}`];
  if(!validTranslation(value,record)||!/[\u3400-\u9fff]/.test(value.titleZh)||!/[\u3400-\u9fff]/.test(value.summaryZh)||/翻译(?:失败|不可用)|Translation unavailable/i.test(value.titleZh+' '+value.summaryZh))return e;
  return {...e,titleChinese:value.titleZh,summaryChinese:value.summaryZh,translation:value.translation};})};
}
function validateCodexActivity(value){
 if(value?.schemaVersion!==1||!['ok','partial','unavailable','stale'].includes(value.status)||!Array.isArray(value.events)||!Array.isArray(value.sources)||value.nextResetAt!==null)throw Error('Invalid Codex activity snapshot');
 const ids=new Set();for(const e of value.events){if(!e.id||ids.has(e.id)||!KINDS.has(e.kind)||!originalUrl(e.sourceUrl)||!e.titleChinese||!e.summaryChinese||!['original_verified','secondary_only'].includes(e.verification)||e.effectiveAt!==null)throw Error('Invalid Codex event');ids.add(e.id);if(e.publishedAt&&!Number.isFinite(Date.parse(e.publishedAt)))throw Error('Invalid Codex publication date');}
 return value;
}
module.exports={DISCOVERY,ORIGINAL,COVERAGE_NOTE,LIMITS,originalUrl,postTime,candidatesFromChallenge,candidatesFromHistory,parseOriginal,classify,chineseDescription,eventFrom,mergeEvents,collectCodexActivity,translationRequests,applyTranslations,validateCodexActivity};
