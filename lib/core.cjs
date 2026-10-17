'use strict';
const {createHash}=require('node:crypto');
const {XMLParser,XMLValidator}=require('fast-xml-parser');
const SOURCES=Object.freeze([
 {id:'openai',name:'OpenAI',url:'https://openai.com/news/',feedUrl:'https://openai.com/news/rss.xml',hosts:['openai.com'],kind:'官方发布'},
 {id:'google',name:'Google AI',url:'https://blog.google/innovation-and-ai/',feedUrl:'https://blog.google/innovation-and-ai/technology/ai/rss/',hosts:['blog.google'],kind:'官方发布'},
 {id:'deepmind',name:'Google DeepMind',url:'https://deepmind.google/blog/',feedUrl:'https://deepmind.google/blog/rss.xml',hosts:['deepmind.google','deepmind.google.com','blog.google'],kind:'官方研究'},
 {id:'huggingface',name:'Hugging Face 生态',url:'https://huggingface.co/blog',feedUrl:'https://huggingface.co/blog/feed.xml',hosts:['huggingface.co'],kind:'平台及社区作者'},
 {id:'microsoft',name:'Microsoft Research',url:'https://www.microsoft.com/en-us/research/',feedUrl:'https://www.microsoft.com/en-us/research/feed/',hosts:['www.microsoft.com','microsoft.com'],kind:'官方研究'},
 {id:'aws',name:'AWS Machine Learning',url:'https://aws.amazon.com/blogs/machine-learning/',feedUrl:'https://aws.amazon.com/blogs/machine-learning/feed/',hosts:['aws.amazon.com'],kind:'官方工程'},
 {id:'nvidia',name:'NVIDIA AI',url:'https://blogs.nvidia.com/',feedUrl:'https://blogs.nvidia.com/blog/category/generative-ai/feed/',hosts:['blogs.nvidia.com'],kind:'官方发布'},
]);
const LIMITS=Object.freeze({sourceBytes:2*1024*1024,timeoutMs:5500,overallMs:14000,articlesPerSource:50,articles:300,maxArchive:4000,concurrency:3,excerpt:420});
const digest=x=>createHash('sha256').update(x).digest('hex');
function field(x) { return typeof x==='string'||typeof x==='number'?String(x):x&&typeof x==='object'?field(x['#text']):''; }
function text(x,max=300){return field(x).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]*>/g,' ').replace(/&(?:nbsp|#160);/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);}
function safeUrl(value,hosts) {
 try { const u=new URL(field(value));if(u.protocol!=='https:'||u.username||u.password||u.port||/^(?:localhost|127\.|0\.|\[)/i.test(u.hostname))return null;
  if(hosts&&!hosts.includes(u.hostname))return null;u.hash='';for(const key of [...u.searchParams.keys()])if(/^utm_|^(?:fbclid|gclid)$/i.test(key))u.searchParams.delete(key);return u.href;
 } catch{return null;}
}
const asArray=x=>x==null?[]:Array.isArray(x)?x:[x];
function categoryFor(title,summary) {
 const s=`${title} ${summary}`;
 if(/\b(?:agent|codex|coding|developer|sdk|tool|api|mcp)\b/i.test(s))return '开发工具';
 if(/\b(?:research|paper|benchmark|reasoning|science|scientific|study)\b/i.test(s))return '研究';
 if(/\b(?:model|gpt|gemini|llama|claude|diffusion|llm|release)\b/i.test(s))return '模型';
 if(/\b(?:image|video|music|audio|speech|creative)\b/i.test(s))return '多模态';
 return '应用与生态';
}
function parseFeed(xml,source,now=new Date().toISOString()) {
 if(typeof xml!=='string'||Buffer.byteLength(xml)>LIMITS.sourceBytes)throw Error('Feed exceeds byte budget');
 if(/<!DOCTYPE|<!ENTITY/i.test(xml))throw Error('DTD and entity declarations are not accepted');
 const validation=XMLValidator.validate(xml);if(validation!==true)throw Error('Invalid XML');
 const parser=new XMLParser({ignoreAttributes:false,attributeNamePrefix:'@_',parseTagValue:false,processEntities:true,trimValues:true,htmlEntities:true});
 const tree=parser.parse(xml);let rows;
 if(tree.rss?.channel)rows=asArray(tree.rss.channel.item);
 else if(tree.feed)rows=asArray(tree.feed.entry);
 else throw Error('Not RSS or Atom');
 if(!rows.length||rows.length>5000)throw Error('Feed empty or unexpected item count');
 const ids=new Set();const invalid={undated:0,future:0,url:0};
 const articles=rows.flatMap(row=>{
  const title=text(row.title);let link=field(row.link);
  if(!link)link=asArray(row.link).find(v=>!v['@_rel']||v['@_rel']==='alternate')?.['@_href'];
  const url=safeUrl(link,source.hosts);if(!title||!url){invalid.url++;return [];}
  const rawDate=field(row.pubDate||row.published||row['dc:date']||row.updated),millis=rawDate?Date.parse(rawDate):NaN;
  if(Number.isFinite(millis)&&millis>Date.parse(now)+5*60*1000){invalid.future++;return [];}
  const publishedAt=Number.isFinite(millis)?new Date(millis).toISOString():null;if(!publishedAt)invalid.undated++;
  const summary=text(row.description||row.summary||row['content:encoded']||row.content,LIMITS.excerpt);
  const id=digest(`${source.id}:${url}`).slice(0,24);if(ids.has(id))return [];ids.add(id);
  const author=text(row['dc:creator']||row.author?.name||row.author,160)||null;
  return [{id,title,summary,url,source:{id:source.id,name:source.name,url:source.url,kind:source.kind},author,publishedAt,category:categoryFor(title,summary),categoryMethod:'keyword_rules',tags:asArray(row.category).map(x=>text(x,50)).filter(Boolean).slice(0,6),language:/[\u3400-\u9fff]/.test(title)?'zh':'original',ingestedAt:now,contentHash:digest(title+'\n'+summary)}];
 }).sort((a,b)=>(b.publishedAt||'').localeCompare(a.publishedAt||''));
 if(!articles.length)throw Error('Feed contains no valid articles');
 return {articles:articles.slice(0,LIMITS.articlesPerSource),feedItemCount:rows.length,invalid};
}
async function fetchFeed(source,{fetchImpl=globalThis.fetch,signal,now=new Date().toISOString()}={}) {
 if(!SOURCES.some(s=>s.id===source.id&&s.feedUrl===source.feedUrl))throw Error('Feed is not in fixed registry');
 const controller=new AbortController(),abort=()=>controller.abort(signal?.reason);
 if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});
 const timer=setTimeout(()=>controller.abort(),LIMITS.timeoutMs);let reader;
 try {
  const response=await fetchImpl(source.feedUrl,{signal:controller.signal,redirect:'error',headers:{Accept:'application/rss+xml, application/atom+xml, application/xml, text/xml','User-Agent':'SKC-AINews/1.0 (+https://simonseow.com/news/)'}});
  if(!response.ok)throw Error(`HTTP ${response.status}`);if(response.url&&response.url!==source.feedUrl)throw Error('Unexpected redirect');
  if(Number(response.headers.get('content-length'))>LIMITS.sourceBytes)throw Error('Source exceeds byte budget');
  reader=response.body.getReader();const chunks=[];let bytes=0;
  while(true){const next=await reader.read();if(next.done)break;bytes+=next.value.byteLength;if(bytes>LIMITS.sourceBytes)throw Error('Source exceeds byte budget');chunks.push(Buffer.from(next.value));}
  const body=Buffer.concat(chunks).toString('utf8'),parsed=parseFeed(body,source,now);
  return {...parsed,bytes,sha256:digest(body),httpStatus:response.status};
 } finally {clearTimeout(timer);signal?.removeEventListener('abort',abort);if(reader){await reader.cancel().catch(()=>{});reader.releaseLock();}}
}
async function mapLimit(list,limit,worker){let cursor=0;const out=[];await Promise.all(Array.from({length:Math.min(limit,list.length)},async()=>{while(cursor<list.length){const index=cursor++;try{out[index]={status:'fulfilled',value:await worker(list[index])};}catch(reason){out[index]={status:'rejected',reason};}}}));return out;}
const TOPICS=[['codex','Codex',/\bcodex\b/i],['gpt','GPT 系列',/\bgpt(?:[- ]\d|\b)/i],['gemini','Gemini',/\bgemini\b/i],['claude','Claude',/\bclaude\b/i],['agents','AI Agents',/\bagent(?:s|ic)?\b/i],['video','视频生成',/\bvideo\b/i],['open-models','开放模型',/\b(?:open[- ](?:weight|source)|llama|qwen)\b/i]];
function buildStories(articles,now) {
 const cutoff=Date.parse(now)-7*86400000;
 return TOPICS.flatMap(([id,title,regex])=>{
  const matches=articles.filter(a=>a.publishedAt&&Date.parse(a.publishedAt)>=cutoff&&regex.test(a.title+' '+a.summary));
  if(matches.length<2)return [];
  const dates=matches.map(a=>a.publishedAt).sort();return [{id,title,articleIds:matches.map(a=>a.id),sourceCount:new Set(matches.map(a=>a.source.id)).size,firstSeenAt:dates[0],lastSeenAt:dates.at(-1),method:'keyword_rules',note:'近 7 日关键词分组；不是热度排名或独立事实核查。'}];
 }).sort((a,b)=>b.articleIds.length-a.articleIds.length);
}
function mergeArticles(...lists){const merged=new Map();for(const list of lists)for(const item of list||[])if(item?.id&&safeUrl(item.url))merged.set(item.id,item);return [...merged.values()].sort((a,b)=>(b.publishedAt||'').localeCompare(a.publishedAt||''));}

module.exports={SOURCES,LIMITS,text,safeUrl,parseFeed,fetchFeed,mapLimit,buildStories,mergeArticles,digest};
