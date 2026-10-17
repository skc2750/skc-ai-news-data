'use strict';
// Editorial selections with author-owned evidence. No showcased code is executed.
// Byte-identical copy: automation/ainews-data/lib/showcases.cjs.
const {createHash}=require('node:crypto');
const SHOWCASES=Object.freeze([
 {id:'codex-pr-bot',repository:'openai/codex-action',path:'README.md',ref:'main',focusId:'codex',kindZh:'官方工作流示例',titleZh:'Codex：搭建自己的 PR 代码审核机器人',author:'OpenAI',categoryZh:'网站优化',summaryZh:'OpenAI 官方 Action 给出在拉取请求创建时运行 Codex、审核改动并把结果回写评论的完整工作流。可借鉴到网站维护，但需要配置权限和人工审核。',aiTools:['OpenAI Codex','OpenAI Responses API'],aiEvidenceZh:'作者 README 明确写明该 Action 在 GitHub Actions 中运行 Codex，并通过 Responses API 工作；示例是自建 PR 审核机器人。',sourceUrl:'https://github.com/openai/codex-action',fitZh:['观察 Codex 怎样接入真实开发流程','网站修改前的代码审核与问题定位'],takeawaysZh:['把读取代码与写评论权限分开','固定审核范围，保留人类审核入口'],costZh:'Action 代码许可不包含模型调用；官方示例需要所选服务商的 API key，通常按模型用量计费。此网站仅展示与追踪，未启用机器人或收费 API。',verificationNoteZh:'已核实官方工作流说明，未安装或运行。它是代码审核示例，不是自动保证网站通过审计的服务。',needles:['Codex GitHub Action','Responses API'],approvedEvidenceSha256:'00083d3f3b7ab6b887e1efa198c79a3791e53c5aae534588c9eba6c7b056b741'},
 {id:'claude-code-review-action',repository:'anthropics/claude-code-action',path:'README.md',ref:'main',focusId:'claude',kindZh:'官方工作流',titleZh:'Claude Code：在 GitHub 问答、审核和处理代码任务',author:'Anthropic',categoryZh:'网站优化',summaryZh:'Anthropic 官方 GitHub Action 可响应提及、处理明确提示的任务，并提供审核、文档同步和定时维护等工作流例子。',aiTools:['Claude Code'],aiEvidenceZh:'README 直接说明该工具面向 GitHub PR 和 Issue，能够回答问题和实现代码改动，并列出 Claude Code 认证方式。',sourceUrl:'https://github.com/anthropics/claude-code-action',fitZh:['研究网站仓库维护和代码审核','借鉴定时检查与问题分类的工作流'],takeawaysZh:['触发条件、授权和允许访问的工具要明确','先只读审核，实际修改仍需测试与人类审核'],costZh:'Action 为 MIT；调用 Anthropic、Bedrock、Vertex 等模型服务通常另计费用。GitHub 运行器是否免费也取决于仓库和运行器类型。本网站未启用此工作流。',verificationNoteZh:'已核实官方来源，未运行其模型调用；自动提建议不等于问题已修复。',needles:['Claude Code','PRs and issues'],approvedEvidenceSha256:'a381c47399445c97480d025a406f485644fdd5f4f7ffd880be0567ac2f7b4640'},
 {id:'claude-autonomous-coding',repository:'anthropics/claude-quickstarts',path:'autonomous-coding/README.md',ref:'main',focusId:'claude',kindZh:'官方参考示例',titleZh:'Claude：跨多个会话逐步完成应用的双代理示例',author:'Anthropic',categoryZh:'网站优化',summaryZh:'官方示例用初始化代理和编码代理分工，把功能清单和进度保存在 Git 中，后续会话继续逐步实现应用。',aiTools:['Claude Code','Claude Agent SDK'],aiEvidenceZh:'该目录 README 明确描述 Claude Agent SDK、初始化代理与编码代理的双代理模式，以及跨会话构建应用的流程。',sourceUrl:'https://github.com/anthropics/claude-quickstarts/tree/main/autonomous-coding',fitZh:['学习如何把网站需求拆成可验证任务','理解长任务的断点续作和进度保存'],takeawaysZh:['保存功能清单、测试结果与进度','限制迭代次数，避免无人看管地持续消耗用量'],costZh:'示例需 Anthropic API key；多轮构建会产生模型用量，完整示例可能运行多小时，不能当作免费体验。此网站没有执行它。',verificationNoteZh:'仅核实官方参考实现与说明，未生成或验收示例应用，也不保证无人干预即可交付。',needles:['Claude Agent SDK','two-agent pattern'],approvedEvidenceSha256:'46886061c3558c864e6ce42d229038d220bc5dea10735f2a552ec5d50bb6ef83'},
 {id:'remotion-agent-video',repository:'remotion-dev/skills',path:'README.md',ref:'main',focusId:'other',kindZh:'官方 AI 视频工作流',titleZh:'Remotion：让 Codex 或 Claude Code 创建、预览和渲染视频',author:'Remotion',categoryZh:'脚本到视频',summaryZh:'Remotion 官方为 AI 代理整理了视频创建、动画排版、字幕、预览及渲染的技能说明。适合把脚本做成代码驱动的视频模板。',aiTools:['OpenAI Codex','Claude Code','Remotion'],aiEvidenceZh:'官方 README 明确列出 Claude Code、Codex 等代理，并提供创建视频、打开预览和渲染输出等技能与提示示例。',sourceUrl:'https://github.com/remotion-dev/skills',fitZh:['标题或脚本到动态图形视频的开发路线','重复使用字幕、版式与渲染模板'],takeawaysZh:['先做短片样本并检查字幕与时长','把素材、时间线和渲染验收分开处理'],costZh:'AI 代理订阅/API 与渲染资源各自计费；Remotion 本体有个人及小型组织等免费资格和公司授权条件。技能可读不代表整条生产流程免费。',verificationNoteZh:'这是官方技能和工作流集合，未在本次安装运行，也不是已经生成的视频成品。',needles:['Claude Code','Codex'],approvedEvidenceSha256:'6e0e9a0bf53e2c7f14b3f35a5ad6195cc07ac20c5a0bb1fd8ffe3198408cf50d'},
 {id:'llamacoder-prompt-app',repository:'Nutlope/llamacoder',path:'README.md',ref:'main',focusId:'other',kindZh:'社区应用成品',titleZh:'LlamaCoder：一句需求生成带预览的小应用',author:'Nutlope（GitHub 作者）',categoryZh:'网站优化',summaryZh:'作者公开了一个使用 Llama 模型生成小应用、在浏览器隔离预览代码的应用。可参考从需求输入到代码预览的交互设计。',aiTools:['Meta Llama 3.1 405B','Together AI'],aiEvidenceZh:'作者 README 明确写明一句提示生成小应用，技术栈列出 Meta Llama 3.1 405B、Together AI 推理及 sandboxed iframe 预览。',sourceUrl:'https://github.com/Nutlope/llamacoder',fitZh:['研究需求到网页原型的用户流程','参考生成代码的隔离预览设计'],takeawaysZh:['把生成代码与主站隔离','模型输出需要检验，不能直接当作安全生产代码'],costZh:'源码许可不包含 Together AI 推理费用；自托管还需要数据库和可选存储/观测服务。在线演示的免费额度未核实，不承诺免费。',verificationNoteZh:'核实了作者源码和应用入口，未登录、提交生成或运行其代码；README 的 Claude Artifacts 类比不表示它使用 Claude。',needles:['generate small apps with one prompt','Together'],approvedEvidenceSha256:'3faebc929a5f8f7f18469934ef48cd79459449720b064f388bdd4df5b5411eca'},
 {id:'n8n-local-ai-workflow',repository:'n8n-io/self-hosted-ai-starter-kit',path:'README.md',ref:'main',focusId:'other',kindZh:'官方 AI 工作流模板',titleZh:'n8n：本地 AI、知识库和办公流程的组合起点',author:'n8n',categoryZh:'办公自动化',summaryZh:'官方 Docker Compose 模板把 n8n、Ollama、Qdrant 和 PostgreSQL 组合，并附带可打开的 AI 聊天工作流。适合先小范围验证内部资料处理流程。',aiTools:['n8n AI Agent','Ollama','Qdrant'],aiEvidenceZh:'官方 README 明确列出自托管 AI 工作流、Ollama 本地模型与 Qdrant 检索，并提供随模板包含的聊天工作流操作说明。',sourceUrl:'https://github.com/n8n-io/self-hosted-ai-starter-kit',fitZh:['学习内部办公自动化与资料问答','优先本地模型控制外部 API 用量'],takeawaysZh:['先用非敏感测试资料确认流程','基础模板仍需权限、备份与生产加固'],costZh:'模板标示 Apache-2.0，但 n8n 平台及各组件有各自条款；本地硬件、电费与存储自付，接外部模型/API、云主机或企业功能可能收费。',verificationNoteZh:'官方明确该模板面向起步与概念验证，未完全为生产优化；本网站未启动它或导入任何工作流。',needles:['self-hosted AI workflows','Ollama'],approvedEvidenceSha256:'0e44ff17c196b8c28ff8fc130534615308baeb01a0ee6520408477b5eb911d2e'},
 {id:'hunyuan-image-glb-example',repository:'Tencent-Hunyuan/Hunyuan3D-2',path:'README.md',ref:'main',focusId:'other',kindZh:'官方三维生成示例',titleZh:'Hunyuan3D：照片到 GLB，再接 Blender 与网页',author:'Tencent Hunyuan',categoryZh:'三维到交互成品',summaryZh:'官方项目给出图像到三维形状、纹理与 GLB/OBJ 输出的示例。适合作为资产初稿路线，之后仍需 Blender 修整，再在 Three.js 中做真实交互。',aiTools:['Hunyuan3D-2'],aiEvidenceZh:'官方 README 说明图像到三维与纹理生成，给出输出网格保存为 glb/obj 的方式，以及形状/纹理显存需求。',sourceUrl:'https://github.com/Tencent-Hunyuan/Hunyuan3D-2',fitZh:['照片生成三维初稿后做网页交互','比较生成资产与精确建模的分工'],takeawaysZh:['AI 网格不保证正确分件、曲面或比例','GLB 导出后还需检查拓扑、材质、体积与浏览器性能'],costZh:'社区许可证有地域及额外商业条件，不是标准 OSI 开源；本地需足够显存和模型权重。托管 API、云 GPU 或额外授权可能收费，未启动生成。',verificationNoteZh:'核实官方示例，不把生成图片当三维成品；本次未上传参考图、生成模型或执行示例。',needles:['glb/obj','image'],approvedEvidenceSha256:'edc4d006b977c8e28a0d3135ffc22b0dcad8e8dcb31fc9152c906eb21e29a886'},
]);
const RAW=new Set(SHOWCASES.map(r=>'https://raw.githubusercontent.com/'+r.repository+'/'+r.ref+'/'+r.path));
const API=new Set(SHOWCASES.map(r=>'https://api.github.com/repos/'+r.repository));
const REVIEWED_AT='2026-10-17';
const digest=x=>createHash('sha256').update(x).digest('hex');
function reviewEvidence(config,body){const sha=digest(body);return {sha,verified:sha===config.approvedEvidenceSha256&&config.needles.every(needle=>body.toLowerCase().includes(needle.toLowerCase()))};}
function iso(value){const d=new Date(value);return value&&Number.isFinite(d.getTime())?d.toISOString():null;}
async function publicSource(url,{fetchImpl=globalThis.fetch,signal}={}){
 if(!RAW.has(url)&&!API.has(url))throw Error('Source outside editorial registry');
 const controller=new AbortController(),abort=()=>controller.abort();if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});const timer=setTimeout(abort,6500);
 try{
  const headers={'User-Agent':'Simon-AINews-Editorial-Sources/1.0',Accept:API.has(url)?'application/vnd.github+json':'text/plain'};
  if(API.has(url)&&process.env.GITHUB_ACTIONS==='true'&&process.env.GITHUB_TOKEN)headers.Authorization='Bearer '+process.env.GITHUB_TOKEN;
  const response=await fetchImpl(url,{headers,redirect:'error',signal:controller.signal});if(!response.ok)throw Error('Public editorial source unavailable');if(response.url&&response.url!==url)throw Error('Unexpected editorial source redirect');
  if(Number(response.headers?.get('content-length'))>512*1024)throw Error('Editorial source too large');
  let body;
  if(response.body?.getReader){const reader=response.body.getReader(),chunks=[];let size=0;try{for(;;){const value=await reader.read();if(value.done)break;size+=value.value.byteLength;if(size>512*1024)throw Error('Editorial source too large');chunks.push(Buffer.from(value.value));}body=Buffer.concat(chunks).toString('utf8');}catch(e){await reader.cancel().catch(()=>{});throw e;}finally{reader.releaseLock();}}
  else{body=await response.text();if(Buffer.byteLength(body)>512*1024)throw Error('Editorial source too large');}
  return body;
 }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
async function collectShowcases({fetchImpl=globalThis.fetch,now=new Date().toISOString(),signal,previous=null,projects=null}={}){
 now=iso(typeof now==='function'?now():now);if(!now)throw Error('Invalid showcase collection date');
 const before=new Map((previous?.showcases||[]).map(r=>[r.id,r])),watched=new Map((projects?.projects||[]).map(r=>[r.id,r])),rows=new Array(SHOWCASES.length),sources=new Array(SHOWCASES.length);let cursor=0;
 await Promise.all(Array.from({length:3},async()=>{for(;;){const i=cursor++;if(i>=SHOWCASES.length)return;const config=SHOWCASES[i],old=before.get(config.id),rawUrl='https://raw.githubusercontent.com/'+config.repository+'/'+config.ref+'/'+config.path,repoUrl='https://github.com/'+config.repository;
  const {repository,path,ref,needles,approvedEvidenceSha256,...copy}=config;
  try{
   const watchedRow=watched.get(config.repository);
   const [body,repo]=await Promise.all([publicSource(rawUrl,{fetchImpl,signal}),watchedRow?.status==='ok'?Promise.resolve({full_name:config.repository,html_url:watchedRow.url,pushed_at:watchedRow.lastPushAt,stargazers_count:watchedRow.stars,archived:watchedRow.archived}):publicSource('https://api.github.com/repos/'+config.repository,{fetchImpl,signal}).then(JSON.parse)]);
   if(String(repo.full_name).toLowerCase()!==config.repository.toLowerCase()||String(repo.html_url).toLowerCase()!==repoUrl.toLowerCase())throw Error('Editorial repository identity changed');
   const {sha,verified}=reviewEvidence(config,body);
   rows[i]={...copy,repoUrl,aiEvidenceSourceUrl:repoUrl+'/blob/'+config.ref+'/'+config.path,checkedAt:now,lastSuccessAt:now,status:'ok',reviewedAt:REVIEWED_AT,reviewStatus:verified?'verified_source':'needs_review',
    reviewNoteZh:verified?'作者来源与本次人工核实的版本一致；未运行作品。':'作者来源已有变化，原中文选注等待人工复核；本次仅确认来源可读取，不代表旧说明仍完全适用。',evidenceHash:sha,reviewedEvidenceHash:config.approvedEvidenceSha256,
    activity:{lastPushAt:iso(repo.pushed_at),stars:Number.isInteger(repo.stargazers_count)?repo.stargazers_count:null,archived:repo.archived===true,latestRelease:watchedRow?.latestRelease||null}};
   sources[i]={id:config.id,sourceUrl:rawUrl,repoUrl,status:'ok',checkedAt:now,lastSuccessAt:now,sha256:sha,reviewStatus:rows[i].reviewStatus};
  }catch{
   rows[i]=old?{...old,checkedAt:now,status:'stale'}:{...copy,repoUrl,aiEvidenceSourceUrl:repoUrl+'/blob/'+config.ref+'/'+config.path,checkedAt:now,lastSuccessAt:null,status:'unavailable',reviewedAt:REVIEWED_AT,reviewStatus:'unavailable',reviewNoteZh:'本次来源读取失败，不能视作已完成新核查。',evidenceHash:null,reviewedEvidenceHash:config.approvedEvidenceSha256,activity:null};
   sources[i]={id:config.id,sourceUrl:rawUrl,repoUrl,status:old?'stale':'unavailable',checkedAt:now,lastSuccessAt:old?.lastSuccessAt||null};
  }
 }}));
 const ok=rows.filter(r=>r.status==='ok').length;
 return {schemaVersion:1,generatedAt:now,lastSuccessAt:ok===SHOWCASES.length?now:previous?.lastSuccessAt||null,status:ok===SHOWCASES.length?'ok':ok?'partial':previous?'stale':'unavailable',
  coverageZh:'七项编辑精选，包含社区应用、官方示例和工作流；不是人气或“大神”认证，不表示已经替你安装、运行或验收。所有 AI 用法都有作者原文出处。',
  updatePolicyZh:'后台按小时核查固定来源是否可读、仓库活跃状态和原文哈希；中文选注为人工编辑，原文变化时标记待复核，不自动把旧说明认证为最新。',
  recommendationNoteZh:'适配说明属于编辑判断。只展示公开信息，不执行作品代码、不上传个人素材，也不调用生成或付费 API。',showcases:rows,sources};
}
function validateShowcases(value){
 if(!value||value.schemaVersion!==1||!iso(value.generatedAt)||!Array.isArray(value.showcases)||value.showcases.length!==SHOWCASES.length)throw Error('Invalid editorial showcase snapshot');
 const seen=new Set();for(const row of value.showcases){const config=SHOWCASES.find(r=>r.id===row.id);if(!config||seen.has(row.id))throw Error('Unknown or duplicate editorial showcase');seen.add(row.id);
  if(row.repoUrl!=='https://github.com/'+config.repository||row.sourceUrl!==config.sourceUrl||row.aiEvidenceSourceUrl!=='https://github.com/'+config.repository+'/blob/'+config.ref+'/'+config.path)throw Error('Editorial evidence URL differs');
  if(!['ok','stale','unavailable'].includes(row.status)||!['verified_source','needs_review','unavailable'].includes(row.reviewStatus))throw Error('Invalid editorial status');
  for(const key of ['titleZh','author','categoryZh','summaryZh','aiEvidenceZh','costZh','verificationNoteZh'])if(typeof row[key]!=='string'||!row[key]||row[key].length>2500)throw Error('Invalid editorial text');
  for(const key of ['aiTools','fitZh','takeawaysZh'])if(!Array.isArray(row[key])||row[key].length>10||row[key].some(v=>typeof v!=='string'||v.length>800))throw Error('Invalid editorial guidance');
  if(row.reviewedEvidenceHash!==config.approvedEvidenceSha256||row.evidenceHash&&!/^[a-f0-9]{64}$/.test(row.evidenceHash))throw Error('Invalid editorial source hash');
 }
 return value;
}
module.exports={SHOWCASES,collectShowcases,validateShowcases,publicSource,reviewEvidence};
