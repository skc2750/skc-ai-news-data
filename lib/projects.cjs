'use strict';
// Read-only, fixed public watchlist. No repository code is installed or executed.
// Keep this file byte-identical to automation/ainews-data/lib/projects.cjs.
const {createHash}=require('node:crypto');
const WATCHLIST=Object.freeze([
 {"id":"openai/codex","name":"OpenAI Codex","titleZh":"重点关注：Codex 编程代理","focusId":"codex","descriptionZh":"OpenAI 官方本地编程代理仓库，提供终端工具及相关集成；可用于读代码、修改项目与开发流程。","categoryZh":"重点AI产品","fitZh":["网站维护与功能开发","把需求落实成可运行项目并验证"],"useCasesZh":["项目修改、代码解释和检查","通过官方工具接入开发流程"],"difficultyZh":"入门至中等","requirementsZh":"官方提供 Windows 安装方式；需要适用的登录计划或 API 配置，操作代码前应保留版本和审核改动。","costZh":"仓库代码 Apache-2.0 不等于模型推理免费。可按官方说明使用适用 ChatGPT 计划或 API 登录；额度、额外用量和 API 费用以账号及官方方案为准，本监控不读取个人额度，也不自动付费。","expectedSpdx":"Apache-2.0","approvedLicenseSha256":"d17f227e4df5da1600391338865ce0f3055211760a36688f816941d58232d8dc"},
 {"id":"anthropics/claude-code","name":"Anthropic Claude Code","titleZh":"重点关注：Claude Code 编程工具","focusId":"claude","descriptionZh":"Anthropic 官方 Claude Code 发布与问题跟踪仓库；用自然语言处理代码库、开发任务及 Git 工作流。","categoryZh":"重点AI产品","fitZh":["网站和代码库开发","希望观察代理编程的官方发布变化"],"useCasesZh":["代码修改、解释和审核","通过终端/IDE处理开发工作"],"difficultyZh":"入门至中等","requirementsZh":"官方列出 Windows 原生安装方式。实际使用需要适用 Claude 账户方案或模型服务；代码操作应进行版本控制和审核。","costZh":"不是“下载公开仓库即可免费推理”。Claude Code 产品、订阅及 API 按 Anthropic 官方方案计费；免费/试用资格未从仓库确认，不能假定有固定免费额度。本监控只读公开发布，不购买计划。","expectedSpdx":null,"customLicense":"Anthropic Commercial Terms / All rights reserved","licenseNeedles":["All rights reserved","Commercial Terms of Service"],"licenseNoteZh":"仓库 LICENSE.md 明确保留权利并适用 Anthropic 商业服务条款，不是标准 OSI 开源许可证；产品访问权限与模型服务费用另行核查。","approvedLicenseSha256":"728158fd1037143fad6907e8fa34804177e598b7326519503fe83cafdef849e6"},
 {"id":"Tencent-Hunyuan/Hunyuan3D-2","name":"Hunyuan3D-2","titleZh":"照片到带纹理三维模型","descriptionZh":"腾讯官方图像到三维与纹理生成项目，输出网格可保存为 GLB/OBJ；成品通常仍需 Blender 修整后接入 Three.js。","categoryZh":"三维到交互成品","fitZh":["照片生成三维初稿的优先研究候选","可衔接 Blender 修面、减面、分件与网页装配"],"useCasesZh":["图片到可编辑三维初稿","纹理生成与 GLB 输出实验"],"difficultyZh":"进阶","requirementsZh":"官方列出 Windows/macOS/Linux；README 标注形状生成约 6 GB 显存、形状加纹理约 16 GB。具体模型与低显存模式不同，运行前需检查自己的设备。","costZh":"本地按社区许可证使用，无统一免费生成次数；需要硬件、电费和模型权重。托管 API 或租 GPU 可能收费；不保证一句话直接生成可用交互成品。","expectedSpdx":"NOASSERTION","customLicense":"Tencent Hunyuan 3D 2.0 Community License","licenseNeedles":["TENCENT HUNYUAN 3D 2.0 COMMUNITY LICENSE AGREEMENT","1 million monthly active users"],"licenseNoteZh":"非标准 OSI 开源，含地域及额外商业条件；原文排除欧盟、英国、韩国，且百万月活条件可能要求单独授权。模型、输出及发布用途须核对原文。",approvedLicenseSha256:'94259df223918a5733677965c1bfe1774a2dba25042d9c3b47a3418ea6c1f324'},
 {"id":"microsoft/TRELLIS","name":"TRELLIS","titleZh":"图像与文字到三维资产","descriptionZh":"微软官方三维生成研究项目，可抽取带纹理网格为 GLB；官方更推荐先用文字生成图片，再用图像模型生成三维。","categoryZh":"三维到交互成品","fitZh":["用于比较图片到三维的生成路线","生成后仍通过 Blender 清理并在网页验证"],"useCasesZh":["图像到三维候选资产","GLB 导出与纹理实验"],"difficultyZh":"进阶","requirementsZh":"官方目前只测试 Linux；Windows 未充分测试。需要至少 16 GB 显存的 NVIDIA GPU 和 CUDA，不能把代码可下载当作当前电脑可稳定运行。","costZh":"主体代码和模型官方说明为 MIT，但部分子模块另有许可；本地无统一生成额度。GPU 云租赁、图像前置 API、托管服务可能收费。","expectedSpdx":"MIT","licenseNoteZh":"官方说明主体代码与模型为 MIT，但 diffoctreerast、修改版 Flexicubes 等子模块许可证不同，整条生产流程需分别核查。",approvedLicenseSha256:'c2cfccb812fe482101a8f04597dfc5a9991a6b2748266c47ac91b6a5aae15383'},
 {"id":"donmccurdy/glTF-Transform","name":"glTF Transform","titleZh":"GLB 压缩与网页资产整理","descriptionZh":"以 JavaScript/CLI 检查、优化和转换 glTF/GLB，帮助控制网页模型与纹理体积。","categoryZh":"三维到交互成品","fitZh":["把建模成果整理成浏览器更易承载的资产","需要压缩纹理而保留可交互节点"],"useCasesZh":["GLB 优化与压缩","模型结构和纹理检查"],"difficultyZh":"中等","requirementsZh":"Node.js；需保留原模型，变换后检查材质、坐标和独立运动节点，部分压缩方式要求网页解码器。","costZh":"工具免费，无统一处理文件次数额度；本地 CPU、电费与网站流量由自己承担。","expectedSpdx":"MIT",approvedLicenseSha256:'2c4f111d00dbf22b10d31a14813c5f5de6a828640f7311f26b9dda89b3fce165'},
 {"id":"GoogleChrome/lighthouse","name":"Lighthouse","titleZh":"网站性能与可访问性检测","descriptionZh":"Google 官方网页审计工具，用实验室测试检查性能、可访问性与网页实践等。","categoryZh":"网站优化","fitZh":["持续检查网站速度和手机阅读体验","找出模型、图片或脚本导致的性能负担"],"useCasesZh":["发布前网页审计","性能变化回归检查"],"difficultyZh":"入门至中等","requirementsZh":"Chrome 或 Node.js 环境；分数会受设备、网络与测试环境影响，需要结合实际用户体验判断。","costZh":"本地工具免费，无统一审计次数额度；云监测平台和额外托管服务另有收费方案。","expectedSpdx":"Apache-2.0",approvedLicenseSha256:'cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30'},
 {id:'n8n-io/n8n',name:'n8n',titleZh:'工作流自动化平台',descriptionZh:'用可视化流程连接网站、表格、通知与数据服务，也可加入代码步骤。',categoryZh:'办公自动化',fitZh:['需要把重复采集、整理与归档串成流程','希望先做内部业务自动化'],useCasesZh:['公开资讯采集与归档','CRM 内部流程与人工审核衔接'],difficultyZh:'中等',requirementsZh:'Windows 可经 Docker/WSL2 自托管；长期任务需要常开主机或服务器及备份。',costZh:'社区自托管可用于条款允许的内部业务/个人用途，没有统一执行次数免费配额；主机、外部 API、官方云版及企业功能可能收费。',expectedSpdx:'NOASSERTION',customLicense:'Sustainable Use License + Enterprise exceptions',licenseNeedles:['Sustainable Use License','internal business purposes'],licenseNoteZh:'源码可用，含用途限制和企业功能例外；不是标准 OSI 开源。向客户提供收费托管或多租户服务需另核查授权。',approvedLicenseSha256:'d2f621f59aa4c10eab79b6333e59d9d3d5b53307dcfd16dbd75e40e679e84965'},
 {id:'langgenius/dify',name:'Dify',titleZh:'AI 应用与知识库工作流',descriptionZh:'提供知识库检索、提示词编排、智能体和应用接口管理。',categoryZh:'办公自动化',fitZh:['希望把知识库做成可操作的小应用','需要集中管理 AI 应用流程'],useCasesZh:['资料问答原型','带检索与审核步骤的 AI 工作流'],difficultyZh:'中等至进阶',requirementsZh:'一般采用 Docker/WSL2 部署，需数据库、向量检索及模型服务；运维负担较高。',costZh:'可按许可证条件自托管，软件不提供统一免费推理额度；模型 API、云托管与商业授权可能收费。',expectedSpdx:'NOASSERTION',customLicense:'Dify modified Apache 2.0',licenseNeedles:['modified version of the Apache License 2.0','Multi-tenant service'],licenseNoteZh:'修改版 Apache 2.0，含多租户与品牌附加条件；不应视为标准 Apache-2.0 或无限制 OSI 开源。',approvedLicenseSha256:'232cf91474932d5110ed304e53b6b742a58463857c571fae803fdf2ac36d7bb3'},
 {id:'SYSTRAN/faster-whisper',name:'faster-whisper',titleZh:'本地语音转文字',descriptionZh:'以 CTranslate2 运行 Whisper，支持本地音频识别与时间戳。',categoryZh:'脚本到视频',fitZh:['需要为中文或多语视频制作文字稿','希望音频转写在本地完成'],useCasesZh:['口播转写与字幕底稿','会议或学习录音整理'],difficultyZh:'中等',requirementsZh:'Python；支持 CPU 和兼容 NVIDIA GPU，模型越大越耗内存/显存。中文/马来语等结果需人工校对。',costZh:'代码可免费本地运行，无统一分钟额度；硬件、电费、模型下载由自己承担。GPU 云租赁若使用会另外收费。',expectedSpdx:'MIT',approvedLicenseSha256:'af6798135e729f8aa6c853936d037dfdea449734d26b8ea6a89805fca758c0d5'},
 {id:'QwenLM/Qwen3-TTS',name:'Qwen3-TTS',titleZh:'本地多语语音生成',descriptionZh:'Qwen 官方语音生成工具与示例，可用于研究多语朗读及声音控制。',categoryZh:'脚本到视频',fitZh:['希望试验中文配音与本地语音','需要先测试短样本再制作长视频'],useCasesZh:['旁白样本','多语语音生成实验'],difficultyZh:'进阶',requirementsZh:'Python 与对应模型权重；GPU 更实用，显存和速度取决于模型/长度。不同语言与声音效果需实际试听。',costZh:'代码与适用模型可本地试验，没有统一免费字符额度；权重条款单独核对。云 GPU 与托管 API 可能收费。',expectedSpdx:'Apache-2.0',approvedLicenseSha256:'a44a6081c73ad75f0255bb2bb5cab74ef1829565a895a24e53a4f11290ab7655'},
 {id:'Comfy-Org/ComfyUI',name:'ComfyUI',titleZh:'节点式图像与视频工作流',descriptionZh:'以节点串联本地图像、视频等生成模型及后处理步骤。',categoryZh:'脚本到视频',fitZh:['希望重复使用可保存的生成流程','需要精细控制素材和后处理'],useCasesZh:['图像与视频素材实验','保存可复现的节点工作流'],difficultyZh:'中等至进阶',requirementsZh:'Windows 可用；生成模型通常需要较多显存。自定义节点会执行代码，安装前要审查来源和依赖。',costZh:'核心软件免费，无统一生成次数额度；模型权重、部分节点、云 GPU 或 API 有独立条款/费用。',expectedSpdx:'GPL-3.0',approvedLicenseSha256:'3972dc9744f6499f0f9b2dbf76696f2ae7ad8af9b23dde66d6af86c9dfb36986'},
 {id:'ahujasid/mcp-for-blender',name:'Blender MCP',titleZh:'AI 与 Blender 控制桥接',descriptionZh:'通过 MCP 将 AI 客户端与 Blender 场景控制连接起来。',categoryZh:'三维到交互成品',fitZh:['希望让 AI 辅助编辑现有三维场景','仍需在 Blender 中精修曲面与结构'],useCasesZh:['场景检查与批量操作','辅助导入、调整和导出模型'],difficultyZh:'中等至进阶',requirementsZh:'Blender、Python 与兼容 MCP 客户端；权限仅开放给信任的客户端，复杂曲面仍需建模验证。',costZh:'桥接代码免费，无统一生成模型额度；AI 客户端、模型 API、第三方三维生成服务可能收费。',expectedSpdx:'MIT',approvedLicenseSha256:'049501fd54d27852507853a5b88094ca1c6ff97404418a5032f3310eecc9cde6'},
 {id:'mrdoob/three.js',name:'Three.js',titleZh:'网页三维渲染库',descriptionZh:'在浏览器中渲染和交互三维模型、材质、灯光及动画。',categoryZh:'三维到交互成品',fitZh:['已有网页三维模型需要继续维护','需要滚动动画、拆解和交互展示'],useCasesZh:['GLB 模型网页展示','视差滚动与分件交互'],difficultyZh:'中等',requirementsZh:'JavaScript 与支持 WebGL 的浏览器；应按手机性能控制模型、纹理与绘制负担。',costZh:'库免费，无统一浏览次数额度；素材授权、网站托管和流量仍可能收费。',expectedSpdx:'MIT',approvedLicenseSha256:'8b378ebe60e2fe500158cb0ac71cb5e8b7d92953c2abcc63a0eb90499653b5bc'},
 {id:'remotion-dev/remotion',name:'Remotion',titleZh:'代码生成视频与动态图形',descriptionZh:'用 React 组件和时间线制作可批量渲染的视频。',categoryZh:'脚本到视频',fitZh:['偏好通过代码制作字幕与动态图形','需要统一模板批量制作视频'],useCasesZh:['知识视频图表与字幕','网站演示短片模板'],difficultyZh:'中等',requirementsZh:'Node.js、React 与 Chromium；长片和高分辨率渲染会消耗 CPU/内存。',costZh:'当前许可证对个人、最多 3 名雇员的营利组织等列明范围允许免费制作视频；其他公司需公司授权。云渲染/托管另计费，条款变化需复核。',expectedSpdx:'NOASSERTION',customLicense:'Remotion License',licenseNeedles:['Remotion License','up to 3 employees'],licenseNoteZh:'源码可用的分层商业许可证，不是标准 OSI 开源。免费资格和禁止转售软件衍生物等条件见原文。',approvedLicenseSha256:'bd65083b940f61904f6ef298aade918a7cad72a3e35bc406e36fab365844b673'},
]);
const CATEGORY_ORDER=['重点AI产品','三维到交互成品','网站优化','脚本到视频','办公自动化'];
const IDS=new Set(WATCHLIST.map(x=>x.id));
const ENDPOINTS=new Set(WATCHLIST.flatMap(x=>['','/releases/latest','/license'].map(s=>'https://api.github.com/repos/'+x.id+s)));
const LIMITS=Object.freeze({timeoutMs:6500,maxBytes:2*1024*1024,concurrency:4,history:120});
function text(v,n=600){return String(v??'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').trim().slice(0,n);}
function iso(v){if(typeof v!=='string'||!v)return null;const d=new Date(v);return Number.isFinite(d.getTime())?d.toISOString():null;}
function number(v){return Number.isInteger(v)&&v>=0?v:null;}
function plain(body){return text(body,10000).replace(/<[^>]*>/g,' ').replace(/!?(\[[^\]]*\])\([^)]*\)/g,'$1').replace(/[`#*_>]/g,'').replace(/\s+/g,' ').trim();}
function releaseSummary(row){
 const body=plain(row.body),mentions=[];
 for(const [re,label] of [[/secur|vulnerab|CVE-/i,'安全相关内容'],[/fix|bug|patch/i,'问题修复'],[/perform|speed|memory|optim/i,'性能或资源占用'],[/window/i,'Windows 支持'],[/breaking|migration|deprecat/i,'兼容性或迁移'],[/feature|support|added|new /i,'功能变化']])if(re.test(body))mentions.push(label);
 return `正式版本 ${text(row.tag_name,100)}。${mentions.length?'原文提及'+mentions.join('、')+'；':'中文未逐条翻译更新说明；'}具体变更请查看官方原文。`;
}
async function getJson(url,{fetchImpl=globalThis.fetch,signal}={}){
 if(!ENDPOINTS.has(url))throw Error('GitHub endpoint outside fixed watchlist');
 const controller=new AbortController(),abort=()=>controller.abort();if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});
 const timer=setTimeout(abort,LIMITS.timeoutMs);
 try{
  const headers={Accept:'application/vnd.github+json','User-Agent':'Simon-AINews-Public-Projects/1.0','X-GitHub-Api-Version':'2022-11-28'};
  // Built-in job token is read only inside Actions, never persisted or returned.
  if(process.env.GITHUB_ACTIONS==='true'&&process.env.GITHUB_TOKEN)headers.Authorization='Bearer '+process.env.GITHUB_TOKEN;
  const r=await fetchImpl(url,{method:'GET',redirect:'error',signal:controller.signal,headers});
  if(r.url&&r.url!==url)throw Error('Unexpected GitHub redirect');
  if(r.status===404)return {missing:true,data:null};
  if(!r.ok)throw Error('GitHub public source HTTP '+r.status);
  if(Number(r.headers?.get('content-length'))>LIMITS.maxBytes)throw Error('GitHub response exceeds limit');
  let body;
  if(r.body?.getReader){const reader=r.body.getReader(),chunks=[];let size=0;try{for(;;){const value=await reader.read();if(value.done)break;size+=value.value.byteLength;if(size>LIMITS.maxBytes)throw Error('GitHub response exceeds limit');chunks.push(Buffer.from(value.value));}body=Buffer.concat(chunks).toString('utf8');}catch(e){await reader.cancel().catch(()=>{});throw e;}finally{reader.releaseLock();}}
  else{body=await r.text();if(Buffer.byteLength(body)>LIMITS.maxBytes)throw Error('GitHub response exceeds limit');}
  return {data:JSON.parse(body),missing:false};
 }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
function licenseFor(config,repo,license){
 const spdx=text(repo.license?.spdx_id,80)||null,sourceUrl='https://github.com/'+config.id+'/blob/'+encodeURIComponent(repo.default_branch||'main')+'/'+encodeURIComponent(license?.path||'LICENSE');
 let source='';if(license?.encoding==='base64'&&typeof license.content==='string'&&license.content.length<700000)source=Buffer.from(license.content,'base64').toString('utf8');
 const digest=source?createHash('sha256').update(source).digest('hex'):null;
 const same=spdx===config.expectedSpdx&&digest===config.approvedLicenseSha256,customKnown=!!config.customLicense&&same&&config.licenseNeedles.every(s=>source.includes(s));
 const isOpenSource=!same?null:config.customLicense?(customKnown?false:null):true;
 return {spdx,name:customKnown?config.customLicense:text(repo.license?.name,140)||'许可证未确认',sourceUrl,isOpenSource,reviewedAt:'2026-10-17',reviewedSha256:config.approvedLicenseSha256,sha256:digest,
 noteZh:!same||config.customLicense&&!customKnown?'许可证识别结果或正文已变化，需人工复核；不自动认定为开源或免费商用。':config.licenseNoteZh||'标准开源许可证；分发义务见原文。下载模型、插件、素材或连接第三方服务仍有各自条款。'};
}
function activity(date,now){if(!date)return '上次推送时间未知';const days=Math.max(0,Math.floor((Date.parse(now)-Date.parse(date))/86400000));return days<2?'近两天有仓库推送（可能包含非主分支）':days<31?'近一个月有仓库推送':'近期较少仓库推送；活跃度不等于稳定性或质量';}
function sourceRow(id,status,at,last){return {id,sourceUrl:'https://api.github.com/repos/'+id,status,checkedAt:at,lastSuccessAt:last||null};}
function changesFor(row,old,now){if(!old)return [];
 const out=[];
 if(row.latestRelease?.tag&&row.latestRelease.tag!==old.latestRelease?.tag)out.push({type:'release',projectId:row.id,at:now,titleZh:`${row.name} 发布 ${row.latestRelease.tag}`,url:row.latestRelease.url});
 if(row.archived!==old.archived)out.push({type:'archived',projectId:row.id,at:now,titleZh:row.name+(row.archived?' 仓库已归档':' 仓库恢复活动'),url:row.url});
 if(row.license?.sha256&&old.license?.sha256&&row.license.sha256!==old.license.sha256)out.push({type:'license',projectId:row.id,at:now,titleZh:row.name+' 许可证正文有变化，使用前需要复核',url:row.license.sourceUrl});
 if(row.lastPushAt&&old.lastPushAt&&row.lastPushAt!==old.lastPushAt)out.push({type:'push',projectId:row.id,at:now,titleZh:row.name+' 有仓库推送；不等于新正式版',url:row.url});
 return out;
}
function safePrevious(previous){return previous&&Array.isArray(previous.projects)?previous:null;}
async function collectProjects({fetchImpl=globalThis.fetch,now=new Date().toISOString(),signal,previous=null}={}){
 now=iso(typeof now==='function'?now():now);if(!now)throw Error('Invalid project collection time');
 previous=safePrevious(previous);const oldRows=new Map((previous?.projects||[]).map(p=>[p.id,p]));let next=0;
 const rows=new Array(WATCHLIST.length),sources=new Array(WATCHLIST.length);
 await Promise.all(Array.from({length:LIMITS.concurrency},async()=>{for(;;){const index=next++;if(index>=WATCHLIST.length)return;const config=WATCHLIST[index],old=oldRows.get(config.id);
  try{
   const [repoRes,releaseRes,licenseRes]=await Promise.all([getJson('https://api.github.com/repos/'+config.id,{fetchImpl,signal}),getJson('https://api.github.com/repos/'+config.id+'/releases/latest',{fetchImpl,signal}),getJson('https://api.github.com/repos/'+config.id+'/license',{fetchImpl,signal})]);
   const repo=repoRes.data;if(repoRes.missing||!repo||String(repo.full_name).toLowerCase()!==config.id.toLowerCase()||repo.html_url?.toLowerCase()!==('https://github.com/'+config.id).toLowerCase())throw Error('Repository identity changed');
   const rel=releaseRes.data;if(rel&&(!String(rel.html_url).startsWith(repo.html_url+'/releases/tag/')||rel.draft||rel.prerelease))throw Error('Unexpected formal release');
   const latestRelease=rel?{tag:text(rel.tag_name,100),name:text(rel.name,180),publishedAt:iso(rel.published_at),url:rel.html_url,summaryZh:releaseSummary(rel),bodyExcerpt:plain(rel.body).slice(0,420)}:null;
   const {expectedSpdx,customLicense,licenseNeedles,licenseNoteZh,approvedLicenseSha256,...publicConfig}=config;
   const row={...publicConfig,url:repo.html_url,sourceUrl:'https://api.github.com/repos/'+config.id,checkedAt:now,lastSuccessAt:now,status:'ok',stars:number(repo.stargazers_count),forks:number(repo.forks_count),archived:repo.archived===true,lastPushAt:iso(repo.pushed_at),latestRelease,
    license:licenseFor(config,repo,licenseRes.data),activityZh:activity(iso(repo.pushed_at),now),changes:[]};
   row.changes=changesFor(row,old,now);rows[index]=row;sources[index]=sourceRow(config.id,'ok',now,now);
  }catch{
   const {expectedSpdx,customLicense,licenseNeedles,licenseNoteZh,approvedLicenseSha256,...publicConfig}=config;
   rows[index]=old?{...old,status:'stale',checkedAt:now,changes:[]}:{...publicConfig,url:'https://github.com/'+config.id,sourceUrl:'https://api.github.com/repos/'+config.id,checkedAt:now,lastSuccessAt:null,status:'unavailable',stars:null,forks:null,archived:null,lastPushAt:null,latestRelease:null,activityZh:'本次无法读取，稍后自动重试',license:{spdx:null,name:'未确认',sourceUrl:'https://github.com/'+config.id,isOpenSource:null,noteZh:'读取失败；不可据此认定许可或费用。'},changes:[]};
   sources[index]=sourceRow(config.id,old?'stale':'unavailable',now,old?.lastSuccessAt);
  }
 }}));
 const ok=rows.filter(r=>r.status==='ok').length,changes=[...rows.flatMap(r=>r.changes),...(previous?.changes||[])].filter((r,i,a)=>a.findIndex(x=>x.projectId===r.projectId&&x.type===r.type&&x.titleZh===r.titleZh&&x.at===r.at)===i).sort((a,b)=>b.at.localeCompare(a.at)).slice(0,LIMITS.history);
 return {schemaVersion:1,generatedAt:now,lastSuccessAt:ok===WATCHLIST.length?now:previous?.lastSuccessAt||null,status:ok===WATCHLIST.length?'ok':ok?'partial':previous?'stale':'unavailable',coverageZh:`精选 ${WATCHLIST.length} 个固定官方仓库，优先追踪 Codex 与 Claude Code；Meta Muse 未确认官方公开仓库，不捏造 GitHub 项目。不是全网排行榜，也不自动安装或更新本地软件。`,updatePolicyZh:'后台每小时检查正式版本、仓库推送、归档状态和许可证；GitHub 调度与网页缓存可能延迟，不是秒级实时。',recommendationNoteZh:'适配说明依据项目公开功能与网站、知识库、本地 AI、影音及三维等用途作出的编辑判断；星数只作参考，不等于质量、安全或实测兼容性。',costNoteZh:'追踪仅调用 GitHub 公开资料，不触发模型推理、云 GPU 或付费订阅。软件免费不代表外部 API、主机、模型权重与商业授权免费。',projects:rows.sort((a,b)=>CATEGORY_ORDER.indexOf(a.categoryZh)-CATEGORY_ORDER.indexOf(b.categoryZh)),changes,sources};
}
function validateProjects(value){
 if(!value||value.schemaVersion!==1||!iso(value.generatedAt)||!Array.isArray(value.projects)||value.projects.length!==WATCHLIST.length)throw Error('Invalid projects snapshot');
 const ids=new Set();for(const r of value.projects){
  if(!IDS.has(r.id)||ids.has(r.id)||r.url?.toLowerCase()!==('https://github.com/'+r.id).toLowerCase()||!['ok','stale','unavailable'].includes(r.status))throw Error('Invalid watched project');ids.add(r.id);
  for(const key of ['name','titleZh','descriptionZh','categoryZh','difficultyZh','requirementsZh','costZh','activityZh'])if(typeof r[key]!=='string'||r[key].length>2000)throw Error('Invalid project description');
  if(!Array.isArray(r.fitZh)||!Array.isArray(r.useCasesZh)||!r.license||![true,false,null].includes(r.license.isOpenSource))throw Error('Invalid project guidance');
  if(r.lastSuccessAt&&!iso(r.lastSuccessAt))throw Error('Invalid project success date');
  if(r.latestRelease&&(!String(r.latestRelease.url).startsWith(r.url+'/releases/tag/')||typeof r.latestRelease.summaryZh!=='string'))throw Error('Invalid project release');
 }
 if(!Array.isArray(value.changes)||value.changes.length>LIMITS.history||value.changes.some(c=>!IDS.has(c.projectId)||!iso(c.at)||typeof c.titleZh!=='string'||!String(c.url).startsWith('https://github.com/'+c.projectId)))throw Error('Invalid project change history');
 return value;
}
module.exports={WATCHLIST,LIMITS,collectProjects,validateProjects,releaseSummary,getJson,licenseFor};
