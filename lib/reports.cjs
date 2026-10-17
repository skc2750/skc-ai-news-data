'use strict';
const {digest}=require('./core.cjs');
const KIND_LABEL={daily:'每日',weekly:'每周（周一起）',monthly:'每月'};
function dateMYT(iso){const t=Date.parse(iso);if(!Number.isFinite(t))throw Error('Invalid date');return new Date(t+8*3600000).toISOString().slice(0,10);}
function reportPeriod(kind,iso){
  const date=dateMYT(iso);if(kind==='daily')return date;if(kind==='monthly')return date.slice(0,7);
  if(kind!=='weekly')throw Error('Unknown report kind');
  const d=new Date(date+'T00:00:00Z');d.setUTCDate(d.getUTCDate()-((d.getUTCDay()||7)-1));return d.toISOString().slice(0,10);
}
function periodBounds(kind,period){
  const d=new Date((kind==='monthly'?period+'-01':period)+'T00:00:00Z'),end=new Date(d);
  if(kind==='daily')end.setUTCDate(end.getUTCDate()+1);else if(kind==='weekly')end.setUTCDate(end.getUTCDate()+7);else end.setUTCMonth(end.getUTCMonth()+1);
  return {startAt:new Date(d.getTime()-8*3600000).toISOString(),endAt:new Date(end.getTime()-8*3600000).toISOString()};
}
function zhTitle(a){return a.translation?.status==='ok'&&a.translation.sourceHash===a.contentHash&&a.titleZh?a.titleZh:a.title;}
function zhSummary(a){return a.translation?.status==='ok'&&a.translation.sourceHash===a.contentHash&&typeof a.summaryZh==='string'?a.summaryZh:a.summary;}
function makeReports(articles,now,previous=new Map(),monitoringSince=now){
  const reports=new Map(),editions=[];
  for(const kind of ['daily','weekly','monthly']){
    const groups=new Map();
    for(const a of articles){if(!a.publishedAt)continue;const period=reportPeriod(kind,a.publishedAt);if(!groups.has(period))groups.set(period,[]);groups.get(period).push(a);}
    for(const [period,rows] of groups){
      rows.sort((a,b)=>b.publishedAt.localeCompare(a.publishedAt)||a.id.localeCompare(b.id));
      const bounds=periodBounds(kind,period),open=Date.parse(now)<Date.parse(bounds.endAt),retroactive=Date.parse(bounds.startAt)<Date.parse(monitoringSince);
      const body={schemaVersion:1,id:`${kind}:${period}`,kind,period,title:`${period} ${KIND_LABEL[kind]}资讯汇编`,
        ...bounds,periodState:open?'open':'closed',partial:true,retroactive,
        coverageNote:open?'当前周期尚未结束；仅收录已读取的固定来源订阅条目。':retroactive?'回溯汇编；不表示这些日期曾被连续监测。':'周期已结束；有限订阅源汇编，不能证明全网或来源完整覆盖。',
        method:'source_link_roundup',articleCount:rows.length,articleIds:rows.map(a=>a.id),
        items:rows.map(a=>({id:a.id,title:zhTitle(a),summary:zhSummary(a),originalTitle:a.sourceTitle||a.title,...(a.sourceTitle?{sourceTitle:a.sourceTitle,titleTransform:a.titleTransform||null}:{}),url:a.url,source:a.source,
          publishedAt:a.publishedAt,contentHash:a.contentHash,translationStatus:a.translation?.status||'pending'}))};
      const contentHash=digest(JSON.stringify(body)),file=`reports/${kind}/${period}.json`,old=previous.get(file);
      const report=old?.contentHash===contentHash?old:{...body,contentHash,compiledAt:now};reports.set(file,report);
      editions.push({id:body.id,kind,period,title:body.title,articleIds:body.articleIds,articleCount:body.articleCount,
        compiledAt:report.compiledAt,partial:true,periodState:body.periodState,retroactive,url:`data/${file}`});
    }
  }
  editions.sort((a,b)=>b.period.localeCompare(a.period)||a.kind.localeCompare(b.kind));
  return {reports,editions};
}
function xml(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));}
function toRss(current){return '<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel><title>SKC AI 资讯空间</title><link>https://simonseow.com/news/</link><description>固定来源订阅的标题与短摘要；中文为机器翻译，保留原文链接。非全网覆盖。</description><language>zh-CN</language><lastBuildDate>'+xml(new Date(current.generatedAt).toUTCString())+'</lastBuildDate>'+current.articles.slice(0,60).map(a=>'<item><title>'+xml(zhTitle(a))+'</title><link>'+xml(a.url)+'</link><guid isPermaLink="false">'+xml(a.id)+'</guid><description>'+xml(zhSummary(a))+' — '+xml(a.source.name)+(a.translation?.status==='ok'?'（机器翻译）':'（原文；译文待补）')+'</description>'+(a.publishedAt?'<pubDate>'+xml(new Date(a.publishedAt).toUTCString())+'</pubDate>':'')+'</item>').join('')+'</channel></rss>\n';}
module.exports={dateMYT,reportPeriod,periodBounds,makeReports,toRss,zhTitle,zhSummary};
