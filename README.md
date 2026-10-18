# SKC AI news data

Seven public platform feeds, Codex and Claude Code official GitHub release streams, Meta corporate news, original titles and bounded excerpts, offline CPU Chinese translation, and durable daily/weekly/monthly source reports for [Simon Seow's AI news space](https://simonseow.com/news/). These ten selected feeds are not whole-web or complete Meta AI research coverage. This is a separate public data publisher. Website code, media assets, personal records and credentials do not belong in this repository.

The collector does not call a paid inference API. Standard Ubuntu GitHub Actions publish one validated Git commit per update; the website can read that commit without redeploying its assets. The workflow is scheduled hourly at minute 17 UTC. GitHub may delay or drop scheduled runs, and may disable a public schedule after 60 days of repository inactivity. A saved workflow is not proof of a completed run. Inspect `data/receipt.json` and the Actions run history.

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

The normal translation limit is 20 newly seen or changed articles per run; a local bootstrap can queue up to 500 and repeat bounded batches. Each title is bounded at 300 characters and each feed excerpt at 420. The translator checkpoints every completed record, stops starting new records after a default 720-second budget, and keeps the remainder pending for the next run. `--translation-seconds` can select 30–900 seconds; the Node wrapper allows a 90-second grace, capped at 16.5 minutes, and retains verified checkpoints after a deadline. A missing/failed translator retains originals and records pending/failed status. It never silently switches to a paid service. To check storage without loading any model, use `--skip-translation --output .work/check-data --work .work/check-lock`.

The Actions workflow first prepares a bounded collection in `.work/`, installs Python/model dependencies only when translation is needed, finishes the publication, and runs verification. It uses only the repository-scoped built-in `GITHUB_TOKEN` for the final Git push; it needs no Vercel, Supabase or Hugging Face key. It does not initialize, create, or configure a GitHub account/repository itself. The repository owner must allow Actions and the workflow's `contents: write` permission.

For an initial upload through the already authenticated repository owner's browser, the workflow optionally unpacks `bootstrap.zip` before Node setup. The owner must first replace `ROOT_BOOTSTRAP_SHA256` in the workflow with the exact curated ZIP's SHA-256, upload that ZIP, then create this final workflow outside the ZIP. Pushes touching either file trigger the initial run; ordinary data-only commits are outside the push path filter. The ZIP must contain only regular file entries at this repository's public root filenames or allowed `lib/`, `scripts/`, `test/`, and generated `data/` paths, with no containing top-level folder. `.github` is deliberately excluded because the built-in token cannot install or modify workflows.

The inline bootstrap guard validates the entire archive before writing anything: exact checksum, ASCII relative paths, public file allowlist, no traversal, symlinks, encryption, duplicate/case-alias paths or file/directory collisions. Bounds are 20 MB compressed, 50 MB expanded, 8 MB per file and 1000 files. Node/Python tests, collection, translation fallback and manifest verification must succeed before the ZIP is removed. The final commit explicitly stages public program files and data plus the ZIP deletion; the token is passed only to Git's temporary askpass helper. A failed run leaves the previously committed ZIP available for diagnosis/retry.

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

Reports use MYT UTC+8 dates, Monday week starts and calendar months. Open periods are labelled open. Earlier periods derived from a seed remain labelled retrospective; every report retains a limited-source/partial-coverage notice. A closed period means its calendar window ended, not proof of continuous complete monitoring. Unchanged historical report bytes and `compiledAt` remain unchanged across hourly runs; changed source text/translations can create a traceable Git revision.

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

`data/projects.json` 追踪 14 个固定官方仓库，优先追踪「重点AI产品」Codex、Claude Code，其余按「三维到交互成品、网站优化、脚本到视频、办公自动化」分组。Meta Muse 没有确认的官方公开仓库，不捏造 GitHub 项目。每小时与资讯采集同时读取仓库元数据、最新正式 Release 和许可证；更新计划可能延迟，并非全网或秒级实时。

中文适配说明是基于公开功能的编辑判断，未在本任务中安装或运行这些项目。星数不等于质量、安全或当前电脑兼容性。首次读取只建立基线，不虚构新版本提醒；后续只依据前后实际差异记录 Release、仓库推送、归档和许可证变化。无正式 Release 的项目明确显示为无版本，推送不等于发布。

免费与授权分开标注：Hunyuan、n8n、Dify 和 Remotion 含额外条件，不称为标准 OSI 开源。其他项目的模型权重、子模块、生成 API、云 GPU 与商业授权仍需分别核对。监控不会自动升级本地软件、上传图片或触发付费生成。

GitHub Actions 仅在采集步骤临时使用内置仓库 Token 获取公共数据额度，Token 不保存到文件、日志或 URL。单项失败保留该项旧数据和上次成功时间；页面展示失败状态，稍后自动重试。

## AI 作品与工作流编辑精选

`data/showcases.json` 收录有作者原文证明 AI 用法的精选，清楚区分个人作品、社区应用、官方示例和工作流。每项包含作者、原作链接、AI 证据链接、适配判断、可借鉴做法及潜在费用。不是人气或“大神”认证；各项人工核查范围分别记录，自动监测不等于运行和验收作品。

后台检查来源可读性、仓库活跃状态及 README 哈希；`reviewedAt` 和已审查哈希固定，原文变化时标记 `needs_review`，中文选注等待人工复核，不把新抓取时间当作新人工审查。来源失败保留旧数据和上次成功时间。

Codex 与 Claude Code 的代码/仓库许可不等于订阅、模型 API 或推理免费。Codex 代码为 Apache-2.0；Claude Code 的 LICENSE.md 保留权利并适用商业服务条款。监控本身不调用这些模型或开通付费服务。

官方 GitHub 发布流可能包含 alpha/beta 等预览版本。为便于理解，处理标题加入产品名前缀，同时用 `sourceTitle` 保留来源的逐字发布标题，并用 `titleTransform` 明示处理方式；来源日期仍用发布流提供的日期。
# 个人开发作品追踪（2026-10-18）

收录 11 项经人工核对作者制作证据的个人作品，另保留 7 项社区应用、官方示例和工作流。每项提供作者、演示、源码、实现过程、AI 实际参与范围及费用边界。可玩网页、已发布视频、Unity VR 原型与办公概念验证分别标识，不把“兼容某模型”当作“由该模型开发”的证据。

每小时计划对固定清单中的源码说明、仓库活跃情况、演示和过程链接进行核查；GitHub 调度可能延迟，网站显示实际检查时间。链接仅做 HTTP HEAD 可达性检查，未播放视频或自动验收交互；失败保留原链接和上次成功时间。仓库说明哈希改变时标待人工复核，不自动刷新编辑核查日期。外部作者文章仍保留独立出处；新增作品须人工核实，不声称全网自动发现。

固定注册表为 `lib/personal-showcases.json`，禁止运行作品代码或向演示提交生成任务。本站采集和检查不接付费模型；作品自身可能需要 AI 用量、第三方 API、商业授权或硬件，详见每项中文费用说明。不会自动购买、充值或订阅。

