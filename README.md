# SKC AI news data

Seven public platform feeds, Codex and Claude Code official GitHub release streams, Meta corporate news, original titles and bounded excerpts, offline CPU Chinese translation, and durable daily/weekly/monthly source reports for [Simon Seow's AI news space](https://simonseow.com/news/). These ten selected feeds are not whole-web or complete Meta AI research coverage. This is a separate public data publisher. Website code, media assets, personal records and credentials do not belong in this repository.

The collector does not call a paid inference API. Standard Ubuntu GitHub Actions publish one validated Git commit per update; the website can read that commit without redeploying its assets. The workflow is scheduled daily at 09:00 Asia/Kuala_Lumpur (01:00 UTC). GitHub may delay or drop scheduled runs, and may disable a public schedule after 60 days of repository inactivity. A saved workflow is not proof of a completed run. Inspect `data/receipt.json` and the Actions run history.

## Run locally

Use Node 22 and Python 3.11. Install the Node dependencies with scripts disabled, then install the pinned CPU translation stack in a dedicated Python environment:

```sh
npm ci --ignore-scripts
python -m venv .venv
# Linux/macOS Python executable: .venv/bin/python
# Windows Python executable: .venv/Scripts/python.exe
.venv/bin/python -m pip install -r requirements.translation.txt
npm test
.venv/bin/python -m unittest discover -s test -p '*_test.py'
node scripts/update.cjs --python .venv/bin/python
npm run verify
```

To bootstrap an existing public news snapshot, pass its local file path; only the whitelisted news fields are imported. Models, prices, benchmark tables, reset notices and arbitrary metadata are ignored:

```sh
node scripts/update.cjs --seed /path/to/public-news-snapshot.json --translate-limit 500 --python .venv/bin/python
npm run verify
```

The normal daily translation limit is 80 newly seen or changed articles per run; a local bootstrap can queue up to 500 and repeat bounded batches. Each title is bounded at 300 characters and each feed excerpt at 420. The translator checkpoints every completed record, stops starting new records after a default 720-second budget, and keeps the remainder pending for the next run. `--translation-seconds` can select 30–900 seconds; the Node wrapper allows a 90-second grace, capped at 16.5 minutes, and retains verified checkpoints after a deadline. A missing/failed translator retains originals and records pending/failed status. It never silently switches to a paid service. To check storage without loading any model, use `--skip-translation --output .work/check-data --work .work/check-lock`.

The Actions workflow first prepares a bounded collection in `.work/`, installs Python/model dependencies only when translation is needed, finishes the publication, and runs verification. It uses only the repository-scoped built-in `GITHUB_TOKEN` for public GitHub metadata requests and the final Git push; metadata authorization is sent only to `api.github.com`, never to external demonstration sites. It needs no Vercel, Supabase or Hugging Face key. It does not initialize, create, or configure a GitHub account/repository itself. The repository owner must allow Actions and the workflow's `contents: write` permission.

Initial bootstrap uploads are historical, not the normal update mechanism. The current workflow rejects retired `bootstrap.zip`, `projects-bootstrap.zip` and `focus-bootstrap.zip` transports. Do not replay an older archive against current news, translations, reports or source state. An owner-authorized maintenance patch must use its own exact SHA-256 and source-file allowlist in the reviewed workflow; do not infer authorization from an old patch's filename or digest. The owner installs the workflow separately, since the built-in publishing token cannot install or modify workflows. Ordinary generated data-only commits remain outside the push path filter.

For an explicitly enabled maintenance transport, the inline guard validates the complete archive before any source writes: exact checksum and file set, bounded regular entries, and rejection of traversal, symlinks, encryption, duplicate/case-alias names and unsafe destinations. The actual enabled transport and its size limits are defined by the current workflow, not by historical bootstrap instructions. Source-only patches must not carry stale generated data, caches or manifests. Node/Python tests, fresh collection, translation fallback and manifest verification must succeed before transport deletion is staged in the final commit. A failed run preserves the committed transport for diagnosis; normal scheduled updates do not require an archive or manual publication.

## Public files and reader contract

| Path | Contract |
| --- | --- |
| `data/manifest.json` | `schemaVersion:1`, `generationId`, `generatedAt`, `lastSuccessAt`, status, counts, and `files` map keyed by complete `data/...` path, each with SHA-256 and bytes. Manifest excludes itself from that map. |
| `data/current.json` | News-only schema 1 snapshot, newest 300 articles, source health, last successful collection, source coverage, translation counts and receipt. No `models` or `resets`. |
| `data/archive.json` | Frontend compatibility shape: `articles`, `editions`, `totalArticles`, `windowed`, `archiveIndexUrl`. Its display window is newest 4000 articles; this does not delete anything from the durable monthly archive. |
| `data/archive/index.json` | Total durable count, monitoring start and every monthly partition's relative path, count, SHA-256 and bytes. |
| `data/archive/YYYY-MM.json` | All retained articles with that original UTC publication month, originals and Chinese. `undated.json` retains unknown publication dates. Partitions have no 4000-item limit. |
| `data/reports/index.json` | All daily, weekly and monthly report paths, period state, count and file hashes. |
| `data/reports/{daily,weekly,monthly}/PERIOD.json` | Source-linked display items with original title, Chinese when valid, source, publication time and IDs. Weekly key is its Monday MYT date. |
| `data/feed.xml` | Chinese RSS where translation succeeded, explicit original-text fallback otherwise. |
| `data/translation-cache.json` | Translation and original-text revisions keyed by `articleId:contentHash`; original hashes are not interchangeable. |
| `data/receipt.json` | Actual attempt/last successful collection, source states, archive/new/changed/translation counts, actual engines applied this run, separately labelled configured future model, workflow run ID and event. A local seed is labelled `seeded`. |

An article's `title` and `summary` always remain original text. Display Chinese only if `translation.status === 'ok'`, `translation.sourceHash === contentHash`, and the top-level `titleZh` / `summaryZh` values are present. The collector additionally requires `pipelineVersion: qwen2_5_1_5b_whole_text_v1` before reusing output, so rejected older translation pipelines cannot survive a model upgrade. Translation metadata includes model ID, revision, engine, precision and timestamp. Reviewed seed entries can carry `engine: editorial_seed` and their actual review model; they must satisfy the same exact original-hash/current-version contract and are not described as fresh unattended model output. `publishedAt: null` stays unknown; no report period is invented for undated material.

Readers must resolve the manifest and its requested files at the **same Git commit**, validate expected bytes and SHA-256, then replace their last valid cached data. Do not read a mutable branch once per file and assume those files belong to one generation. A reader may cache for about 4–5 minutes and keep a bundled snapshot on errors. `generationId` identifies the manifest's sorted file-hash map, not a self-referencing Git commit SHA. Git provides the commit identity externally.

Reports use MYT UTC+8 dates, Monday week starts and calendar months. Open periods are labelled open. Earlier periods derived from a seed remain labelled retrospective; every report retains a limited-source/partial-coverage notice. A closed period means its calendar window ended, not proof of continuous complete monitoring. Unchanged historical report bytes and `compiledAt` remain unchanged across daily runs; changed source text/translations can create a traceable Git revision.

Keep monthly partitions indefinitely within the repository's practical limits. The compatibility 4000 window is only for initial page loading; older UI views should lazily fetch partition files via the archive index. Monitor repository size and make downloadable backups. Do not claim unlimited free storage. Never upload model binaries, node_modules, virtual environments, raw feed captures, browser state, `.env`/`auth.env`, website ZIPs, QA folders or private customer records.

## Translation and source rights

The configured public model is [Qwen/Qwen2.5-1.5B-Instruct](https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct), Apache-2.0, pinned to `989aa7980e4cf806f80c7fef2b1adb7bc71aa306`. It uses Transformers' built-in model code, `trust_remote_code=False`, explicitly on CPU float32. Whole titles and whole excerpts retain sentence context. A simple translation instruction and brief glossary specify faithful Chinese; known company aliases are restored only when present in the source, and recognized product names/numbers must survive validation. One narrow colon-headline grammar rule preserves a stated model-description relationship; summaries use their original complete text. Instruction echoes, repeated sentences, token-limit truncation and detected unsupported training claims are rejected. It is an AI translation of the feed excerpt, not a translation of the article's full body or an independent factual analysis. A previous small Marian candidate and all-Linear dynamic int8 were rejected after real samples failed quality checks; their outputs are not valid cached translations. Three real news samples succeeded after refinement, which is a bounded quality check rather than a guarantee for future articles.

`current.translation.method` is `machine_translation_with_provenance`, with aggregate engine counts. Actual per-article provenance takes priority over the configured future model. Initial reviewed translations can come from the existing Codex session (`editorial_seed`); they are not claimed to have been generated by local Qwen. Receipts distinguish engines applied during that run from `configuredModel` for subsequent automation.

The model weights require several GB for the first public download. The workflow caches only its Hugging Face download directory with an immutable model key, under GitHub's default cache allowance; inactive caches can be evicted. It does not increase a cache billing limit or retain Actions artifacts. CPU speed varies; deferred counts and last successful receipts expose progress without claiming full translation coverage. Dependencies are pinned in `package-lock.json` and `requirements.translation.txt`; official actions are pinned to verified commit SHAs. The Node source parser is `fast-xml-parser` 5.11.2, MIT.

News publishers retain rights to their original titles and excerpts. Preserve names, original URLs, dates and source labels. Do not label upstream material as MIT, fetch full article bodies, imply complete platform coverage, or duplicate separately licensed benchmark datasets here. This repository's own code is MIT; see `LICENSE`.

Fixed sources are OpenAI, Google AI, Google DeepMind, Hugging Face platform/community authors, Microsoft Research, AWS Machine Learning and NVIDIA generative AI. See `lib/core.cjs` for the exact immutable request registry and URL host restrictions. The collector rejects redirects, oversized streams, XML DTD/entities, unsupported hosts and publication dates beyond a small clock-skew allowance. All-source failure keeps the previous generation untouched; per-source failure keeps that source's previous records and exposes stale health.

## Cost and operations

As verified on 2026-10-17, [GitHub standard runners for public repositories are free](https://docs.github.com/en/billing/concepts/product-billing/github-actions); larger/GPU runners and some excess storage are chargeable. Keep this repository public, use only the workflow's standard `ubuntu-latest` runner, stay within ordinary cache allowance and do not enable paid storage or runners. This does not make the existing website host free or guarantee future provider terms. Inform the owner before selecting any paid plan, service, API, extra quota or resource.

The workflow is a bounded publication job for this software project, not a server/CDN or an always-running service. Its root schedule, permissions, timeout and concurrency can be reviewed in `.github/workflows/update.yml`. See [schedule limitations](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule) and [GitHub's Actions terms](https://docs.github.com/en/site-policy/github-terms/github-terms-for-additional-products-and-features#actions).

Verification covers content hashes, every manifest file, durable item counts, report references and exact-hash Chinese reuse. Unit tests additionally exercise all-source failure, partial fallback, real MYT boundaries, report idempotence, storage beyond 4000 and collector lock collisions. A green fixture test alone does not verify translation quality, a cloud run, or continuous scheduling.
# GitHub 项目追踪

`data/projects.json` 追踪 14 个固定官方仓库，优先追踪「重点AI产品」Codex、Claude Code，其余按「三维到交互成品、网站优化、脚本到视频、办公自动化」分组。Meta Muse 没有确认的官方公开仓库，不捏造 GitHub 项目。每天马来西亚时间早上 9 点与资讯采集同时读取仓库元数据、最新正式 Release 和许可证；更新计划可能延迟，并非全网或秒级实时。

中文适配说明是基于公开功能的编辑判断，未在本任务中安装或运行这些项目。星数不等于质量、安全或当前电脑兼容性。首次读取只建立基线，不虚构新版本提醒；后续只依据前后实际差异记录 Release、仓库推送、归档和许可证变化。无正式 Release 的项目明确显示为无版本，推送不等于发布。

免费与授权分开标注：Hunyuan、n8n、Dify 和 Remotion 含额外条件，不称为标准 OSI 开源。其他项目的模型权重、子模块、生成 API、云 GPU 与商业授权仍需分别核对。监控不会自动升级本地软件、上传图片或触发付费生成。

GitHub Actions 仅在采集步骤临时使用内置仓库 Token 获取公共数据额度，Token 不保存到文件、日志或 URL。单项失败保留该项旧数据和上次成功时间；页面展示失败状态，稍后自动重试。

## AI 作品与工作流编辑精选

`data/showcases.json` 同时保存人工精选和规则自动收录。本节描述其中的人工精选，动态发现机制见下节。精选清楚区分个人作品、社区应用、官方示例和工作流；每项包含作者、原作链接、AI 证据链接、适配判断、可借鉴做法及潜在费用。不是人气或“大神”认证；各项人工核查范围分别记录，自动监测不等于运行和验收作品。

后台检查人工精选的来源可读性、仓库活跃状态及 README 哈希；`reviewedAt` 和已审查哈希固定，原文变化时标记 `needs_review`，中文选注等待人工复核，不把新抓取时间当作新人工审查。来源失败保留旧数据和上次成功时间。

Codex 与 Claude Code 的代码/仓库许可不等于订阅、模型 API 或推理免费。Codex 代码为 Apache-2.0；Claude Code 的 LICENSE.md 保留权利并适用商业服务条款。监控本身不调用这些模型或开通付费服务。

官方 GitHub 发布流可能包含 alpha/beta 等预览版本。为便于理解，处理标题加入产品名前缀，同时用 `sourceTitle` 保留来源的逐字发布标题，并用 `titleTransform` 明示处理方式；来源日期仍用发布流提供的日期。
## YouTube、X、Reddit 作品线索（2026-10-18）

`lib/social-discovery.cjs` 使用 [Exa 官方无密钥免费 MCP](https://exa.ai/docs/get-started/exa-mcp) 的公开搜索索引，调用高级搜索并限定平台域名，再自行校验原帖路径。没有平台登录、Cookie、API Key、付费账户或付费降级。免费入口有限流、可能返回空结果或不可用，没有服务等级或完整覆盖保证；遇到限流、额度或访问错误会保存状态并停止，等待下一次每日计划，按日程自动尝试，不购买额度。固定入口为 `https://mcp.exa.ai/mcp?tools=web_search_advanced_exa`；只发送公开查询，不向结果中的网站发起 GET、下载媒体或运行代码。

每天马来西亚时间早上 9 点轮换三维、视频、办公三个用途之一，并分别查询 YouTube、X、Reddit；查询同时包含 Codex、Claude Code、Muse Code。每轮最多 3 次索引搜索、每次最多 5 个结果，完整用途轮转通常需 3 天，GitHub 调度可能延迟。平台状态、实际查询次数、真实成功日期与下次计划分别保存。零结果不是完整扫描证明；索引没有发布日期时保持未知，不将发现时间冒充发布时间。

线索与成品分开：`showcases.json` 新增 `socialDiscovery` 和 `socialCandidates`，持久游标及队列在原 `discoveryState.social` 内，不增加 manifest 路径。最多保留 60 条线索，未再次被索引观察到的线索在 7 天后移出当前列表；只保留最少网址、中文分类、实际时间和未核实状态，不保存平台正文、评论、字幕或索引作者资料。提取到的 GitHub 引用每轮最多转入 4 个检查队列，仍共享原有每天最多 2 项的成品收录限制。未找到源码、未明确说明 AI 制作关系，或缺少演示和过程的线索不会成为成品。

社交链接只是发现途径，不证明社交账号与 GitHub 作者为同一人；所有 `acquisitionSources` 明确 `authorVerified:false`，网站单独展示为“搜索索引线索，未直接读取平台原文”。作者制作声明仍来自本人仓库；演示与过程仍通过原 HTTPS 安全检查。来源随去重、后续复查和滚动归档保留。一个平台失败不阻断原 GitHub 流程。GitHub 退避时，新引用先保存在社交队列，等允许访问后再检查。

未启用直接平台接口：[X 官方价格](https://docs.x.com/x-api/getting-started/pricing)涉及预付积分和按量读取；[Reddit 官方 API 说明](https://support.reddithelp.com/hc/en-us/articles/16160319875092-Reddit-Data-API-Wiki)涉及申请、OAuth 与使用限制，其 [2026-10-08 公告](https://support.reddithelp.com/hc/en-us/articles/54353370049684-Changelog-October-8-2026)也公布停止 RSS，因此不依赖它做长期采集。[YouTube 的已知频道推送](https://developers.google.com/youtube/data/guides/push_notifications)与关键词 API 是不同能力，当前未创建 Google 项目或 Key。以后需要付费服务、额外额度或账号接入时先告知用户；作品自身运行费用与免费额度仍需单项查证。

# 个人开发作品：人工精选与自动发现（2026-10-18）

人工基础清单保留 11 项经人工核对作者制作证据的个人作品，另保留 7 项社区应用、官方示例和工作流，共 18 项。`lib/personal-showcases.json` 管理个人精选；`lib/showcases.cjs` 合并精选与动态收录。每项保留作者、演示、源码、实现过程、AI 实际参与范围及费用边界。可玩网页、已发布视频、Unity VR 原型与办公概念验证分别标识，不把“兼容某模型”当作“由该模型开发”的证据。

自动发现由 `lib/creator-discovery.cjs` 执行，沿用每天马来西亚时间早上 9 点的 Actions 发布任务，不另建常驻服务。每次检查是否进入新的马来西亚 09:00 日周期、且没有仍有效的限流退避；到期才启动下一轮，实际时间可能因 GitHub 调度延迟。使用日期周期避免昨日延迟、今日准时导致不足 24 小时而跳过一整天。已收录的自动作品在每日轮次重新读取源码说明并检查链接；不在退避期内的“本轮不新搜”不等于跳过已有作品核查。退避期间不重新访问这些来源，也不伪造更新后的核查时间。

搜索分为 **9 条轮转任务**：Codex、Claude Code、Muse Code × 三维到交互成品、脚本到视频、办公自动化。这里只搜索 GitHub 公开仓库的 README（`in:readme`），按 `updated` 倒序，每轮最多 3 个查询、每个查询最多 5 个结果，并逐次轮换第 1–3 页；不是全网、秒级或完整覆盖，不保证每轮都有新作品，也不据此确认某产品一定有合格作品。每轮最多深入检查 4 个候选仓库，尚未检查的记录排队；同一仓库去重，失败和资料不足按记录的重试时间再检查。每日自动收录上限为 **2 项，按 UTC 日期重置**，与资讯简报使用的 MYT 日历不同；达到每日额度后仍可轮转搜索和排队，不继续深入收录。GitHub 403/429 会停止后续请求并保存退避时间，不换渠道或绕过限额。

自动收录须同时满足：GitHub 作者为个人账号，仓库公开、非 fork、未归档；本人仓库 README 明确自述使用目标 AI 开发本作品；提供实际演示入口、源码及制作过程链接，仓库与作者身份一致。代码块、引用、提示示例、兼容列表、单纯调用模型 API、技能/模板/框架目录不当作成品制作证据。同一 README 的过程锚点须真实存在且有过程内容。原文只保留有上限的短摘录及出处；中文说明使用确定性分类模板，不调用 LLM 补写事实。

动态演示和过程入口还须通过公开 HTTPS 安全检查及有时限的 HEAD 可达性检查。动态检查拒绝凭证 URL、非 443 端口、私网/IP 字面值、未知或混合私网 DNS、重定向等不符合条件的目标；默认将核实的公网地址固定到 TLS 请求，并保留原域名/SNI，避免再次解析造成 DNS 重绑定。外部页面不接收 GitHub Token。HEAD 成功仅表示当时入口直接可达，不证明视频内容、交互效果、代码安全、可部署性或作品质量。

通过规则的动态条目标记为 `admissionMethod: automated_rules`、`editorial: false`、`reviewStatus: automated_rules`、`reviewedAt: null`，与人工精选明确区分；每项记录规则版本、首次发现/收录时间、作者原文短摘录及来源。已有自动作品每次复查重新核对身份、制作声明和链接；证据或来源未通过时保留旧条目为 `stale`，保留上次成功时间。人工精选仍保留原人工日期及已审查哈希，来源改变时标记 `needs_review`；自动抓取不冒充人工审查或运行验收。

候选列表最多 **80 项**，显示缺项原因和重试状态；自动作品当前目录最多 **24 项滚动展示**，人工 18 项不占此容量。新自动作品加入后，把最早收录的旧自动项移入历史；页面保留最近 **200 项精简归档**，包括源码、演示、制作过程、AI 证据链接及收录/归档日期。当前与保留的归档仓库参与去重，容量达到 24 不会永久停止发现；更早的完整版本可在公开 Git 仓库历史中追溯。归档不表示作品已下线，也不等于刚做过一次可达性检查。搜索游标、分页、候选队列、退避与日额度状态随 `data/showcases.json` 的 `discoveryState` 一并进入带哈希的发布 generation，避免每次运行从头发现或重置额度。

本模块只读取有上限的公开 GitHub REST 元数据和链接 HEAD，不执行候选源码、不登录、不提交生成任务、不上传个人素材，也不接收费推理 API。采集使用现有标准 Actions 运行器并遵守其额度，不能据此承诺无限免费运行。外部作品的免费额度与实际费用通常尚未核实：AI 订阅/用量、第三方 API、商业授权、素材、渲染、托管或本地硬件可能另收费，须以作者及服务商条款为准。不会自动购买、充值、订阅或切换收费服务；涉及新增收费资源先告知所有者。

## Tibo / Codex 动态（2026-10-18）

`lib/codex-activity.cjs` 与现有 GitHub 每天马来西亚时间早上 9 点任务一起运行，读取 [Codex Limits 的 Tibo 挑战页](https://codexlimits.com/tibo-28)、[WhenReset 的 Codex 记录](https://whenreset.dev/codex)，每天马来西亚时间早上 9 点再使用现有免费 Exa 入口执行一次作者限定搜索，每次最多 5 条。挑战结束后仍会保留作者索引与重置历史来源；这些来源不是完整 X 时间线，可能延迟、无结果或停更，不能承诺实时或完整覆盖。索引失败或限流等待下一次每日计划，遵守更长的 Retry-After，不切换收费服务或购买额度。

发现 URL 严格限于 `https://x.com/thsottiaux/status/数字`。第三方摘要只是线索，再通过 X 官方公开 oEmbed 匿名读取原帖，核对作者和 URL；没有 X 账户、Cookie、付费 X API 或推理调用。可读原文不足以明确语义关联的 `Done` 等短回复仍标为待核实；只有一条 Day 13 的 `Done` 结合该账号的预告及公开跟踪记录作人工关联，其映射受精确原文匹配限制，不表示已在 X 核实父回复线程，也不推广到其它回复。重置预告、完成确认、储备重置与功能更新分开归类；否定或假设不会作为已宣布的重置，条件承诺明确标出尚待条件兑现。完成确认不表示已检查个人账户，也不会替用户使用重置。同一原帖只有一条当前解释，核实后更正分类会替换旧线索并保留首次发现时间，不产生两张卡片。

`publishedAt` 为原帖状态 ID 的 UTC 发布时间，前端显示马来西亚时间；这不是系统执行重置的时刻。未在原文明确公布的生效时间、下次重置时间、适用账户保持未知。`EOD PST` 等相对表达保留原文说明，不机械换算成确定的马来西亚执行时刻。现有 OpenAI 官方 changelog 流继续独立保留。

中文使用明确标注的短规则摘要；新功能中尚无规则的内容进入现有离线 CPU Qwen 翻译队列。失败、错误占位或缺乏中文的输出不会标为翻译成功。归档只保留有上限的原文短摘录（正文最多 420 字符、标题最多 160 字符）、内容哈希及出处，不长期复制完整长帖。来源故障时保留旧记录、上次成功时间和清楚提示；采集正常但语义待核实会单独说明。

`data/codex.json` 当前最多显示 600 条；`data/codex-archive.json` 为最多 5000 条的兼容入口，窗口超限明确标注。全部历史按月永久写入 `data/codex/archive/`，`index.json` 列出总数和哈希，旧档案不会因为当前显示窗口截断而消失。当前、兼容档案、分月档案、来源状态、搜索退避、中文译文与上次成功时间都进入同一 manifest generation。历史回溯会保留实际首次观察时间，不冒充此前已经连续监控。

