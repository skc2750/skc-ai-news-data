'use strict';
const {SOURCES,LIMITS,text,fetchFeed,mapLimit,mergeArticles,digest,sourceUrl}=require('./core.cjs');

function normalizeArticle(input, now) {
  const source=SOURCES.find(s=>s.id===input?.source?.id);
  if(!source)throw Error('Article source is not in the fixed feed registry');
  const url=sourceUrl(input.url,source),title=text(input.title,300),summary=text(input.summary,LIMITS.excerpt);
  if(!url||!title)throw Error('Article has invalid title or source URL');
  const id=digest(`${source.id}:${url}`).slice(0,24);
  if(input.id&&input.id!==id)throw Error('Article ID does not match its source URL');
  const publishedAt=input.publishedAt==null?null:new Date(input.publishedAt).toISOString();
  if(publishedAt&&Date.parse(publishedAt)>Date.parse(now)+300000)throw Error('Future publication date');
  return {id,title,...(source.titlePrefix&&input.sourceTitle?{sourceTitle:text(input.sourceTitle,300),titleTransform:'产品名前缀＋来源发布标题；非逐字原始标题'}:{}),summary,url,source:{id:source.id,name:source.name,url:source.url,kind:source.kind},
    author:text(input.author,160)||null,publishedAt,category:text(input.category,50)||'应用与生态',
    categoryMethod:'keyword_rules',tags:Array.isArray(input.tags)?input.tags.map(v=>text(v,50)).slice(0,6):[],
    language:/[\u3400-\u9fff]/.test(title)?'zh':'original',ingestedAt:input.ingestedAt&&Number.isFinite(Date.parse(input.ingestedAt))?new Date(input.ingestedAt).toISOString():now,
    contentHash:digest(title+'\n'+summary)};
}

async function collectNews(previous,{fetchImpl=globalThis.fetch,now=new Date().toISOString()}={}) {
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),LIMITS.overallMs);
  try {
    const results=await mapLimit(SOURCES,LIMITS.concurrency,s=>fetchFeed(s,{fetchImpl,signal:controller.signal,now}));
    const articles=[],sources=[];
    for(let i=0;i<results.length;i++){
      const result=results[i],source=SOURCES[i],old=previous?.sources?.find(x=>x.id===source.id);
      let rows;
      if(result.status==='fulfilled'){
        rows=result.value.articles.map(a=>normalizeArticle(a,now));
        sources.push({...source,hosts:undefined,type:'rss',status:'ok',lastCheckedAt:now,lastSuccessAt:now,
          articleCount:rows.length,articleIds:rows.map(a=>a.id),feedItemCount:result.value.feedItemCount,
          bytes:result.value.bytes,sha256:result.value.sha256,invalid:result.value.invalid});
      }else{
        const ids=new Set(old?.articleIds||[]);
        rows=(previous?.articles||[]).filter(a=>a.source.id===source.id&&(!ids.size||ids.has(a.id))).slice(0,LIMITS.articlesPerSource);
        sources.push({...source,hosts:undefined,type:'rss',status:rows.length?'stale':'unavailable',lastCheckedAt:now,
          lastSuccessAt:old?.lastSuccessAt||null,articleCount:rows.length,articleIds:rows.map(a=>a.id),
          error:text(result.reason?.message||'Source unavailable',140)});
      }
      articles.push(...rows);
    }
    const live=sources.filter(s=>s.status==='ok').length;
    // Preserve the entire previous published generation when all upstreams fail.
    if(live===0)throw Error('All news sources failed; keep previous generation');
    const merged=mergeArticles(articles);
    if(!merged.length)throw Error('No valid news articles; keep previous generation');
    return {articles:merged,sources,status:live===SOURCES.length?'ok':'partial',lastSuccessAt:now};
  }finally{clearTimeout(timer);}
}

function seedNews(snapshot,now){
  if(!Array.isArray(snapshot?.articles)||!snapshot.articles.length)throw Error('Seed has no articles');
  const articles=snapshot.articles.map(a=>normalizeArticle(a,now));
  const sources=SOURCES.map(source=>{
    const old=snapshot.sources?.find(s=>s.id===source.id),rows=articles.filter(a=>a.source.id===source.id).slice(0,LIMITS.articlesPerSource);
    return {...source,hosts:undefined,type:'rss',status:'seeded',lastCheckedAt:old?.lastCheckedAt||null,
      lastSuccessAt:old?.lastSuccessAt||null,articleCount:rows.length,articleIds:rows.map(a=>a.id),
      feedItemCount:old?.feedItemCount||rows.length};
  });
  const known=sources.map(s=>s.lastSuccessAt).filter(value=>value&&Number.isFinite(Date.parse(value))).map(value=>new Date(value).toISOString()).sort();
  const lastSuccessAt=Object.prototype.hasOwnProperty.call(snapshot,'lastSuccessAt')?snapshot.lastSuccessAt:known.at(-1)||null;
  return {articles,sources,status:'seeded',lastSuccessAt};
}
module.exports={normalizeArticle,collectNews,seedNews};
