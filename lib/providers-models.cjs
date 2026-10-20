'use strict';

// Public, read-only sources. This module never calls inference or reads keys.
const { createHash } = require('node:crypto');
const modelGuide = require('./model-guide.cjs');

const SOURCES = Object.freeze({
  models: 'https://openrouter.ai/api/v1/models',
  leaderboard: 'https://livebench.ai/table_2026_09_02.csv',
  categories: 'https://livebench.ai/categories_2026_09_02.json',
  resets: 'https://learn.chatgpt.com/docs/changelog/rss.xml',
  freeLimits: modelGuide.LIMITS_DATA_URL,
  benchmarkHome: 'https://livebench.ai/',
});
const ALLOWED_URLS = new Set(Object.values(SOURCES));
const BENCHMARK = Object.freeze({
  name: 'LiveBench 2.0 Overall',
  sourceUrl: 'https://livebench.ai/',
  methodologyUrl: 'https://livebench.ai/#/methodology',
  datasetId: '2026-09-02',
  // The official board labels this dataset 14 October 2026, despite its filename.
  asOf: '2026-10-14',
  method: 'Mean of available suite scores (0–100), each suite equally weighted; blank/n/a excluded.',
  effortNote: 'Highest supported effort setting unless the official expanded row states otherwise.',
  attribution: 'Source: LiveBench (livebench.ai). Overall calculated from the published numeric suite results using its stated methodology.',
  licenseStatus: 'No explicit license for the 2.0 leaderboard dataset was found; no claim of a redistribution grant is made.',
});
// Leaves headroom inside the caller's 12-second aggregate refresh budget.
const LIMITS = Object.freeze({ timeoutMs: 8000, maxBytes: 2 * 1024 * 1024, maxModels: 1500, maxRows: 500, maxEvents: 200 });
const VERIFIED_BENCHMARKS = new WeakMap();

function benchmarkUrlAllowed(url) {
  try { const value = new URL(url); return value.origin === 'https://livebench.ai' && !value.username && !value.password && !value.search && !value.hash
    && (/^\/static\/js\/main\.[a-f0-9]{8,32}\.js$/.test(value.pathname) || /^\/(?:table_\d{4}_\d{2}_\d{2}\.csv|categories_\d{4}_\d{2}_\d{2}\.json)$/.test(value.pathname)); }
  catch { return false; }
}
function benchmarkDate(value, checkedAt) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00.000Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value && date.getTime() <= Date.parse(checkedAt);
}
function parseBenchmarkHome(html) {
  if (Buffer.byteLength(html) > 65536 || !/<title>LiveBench 2\.0\b/.test(html)) throw Error('Official benchmark homepage format changed');
  const scripts = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)];
  if (scripts.length !== 1) throw Error('Benchmark entry module is not unique');
  const url = new URL(scripts[0][1], SOURCES.benchmarkHome).href;
  if (!benchmarkUrlAllowed(url) || !url.includes('/static/js/')) throw Error('Benchmark entry module is not allowed');
  return url;
}
function parseBenchmarkModule(script, checkedAt) {
  if (Buffer.byteLength(script) > 512 * 1024) throw Error('Benchmark entry module exceeds limit');
  const candidates = [...script.matchAll(/([A-Za-z_$][\w$]*)=(\["\d{4}-\d{2}-\d{2}"(?:,"\d{4}-\d{2}-\d{2}"){0,63}\]),([A-Za-z_$][\w$]*)=(\{"\d{4}-\d{2}-\d{2}":"\d{4}-\d{2}-\d{2}"(?:,"\d{4}-\d{2}-\d{2}":"\d{4}-\d{2}-\d{2}"){0,63}\})/g)];
  if (candidates.length !== 1) throw Error('Benchmark release metadata is not unique');
  const match = candidates[0], releases = JSON.parse(match[2]), labels = JSON.parse(match[4]);
  if (new Set(releases).size !== releases.length || releases.some((value, index) => !benchmarkDate(value, checkedAt) || index && value <= releases[index - 1])
    || Object.entries(labels).some(([key, value]) => !releases.includes(key) || !benchmarkDate(value, checkedAt))) throw Error('Benchmark release dates are invalid or future dated');
  const tail = script.slice(match.index + match[0].length, match.index + match[0].length + 2500);
  const declaration = tail.match(/^,([A-Za-z_$][\w$]*)=([A-Za-z_$][\w$]*)=>([A-Za-z_$][\w$]*)\[\2\]\|\|\2,([A-Za-z_$][\w$]*)="(\d{1,2} [A-Za-z]+ \d{4})",([A-Za-z_$][\w$]*)=\[/);
  if (!declaration || declaration[3] !== match[3]) throw Error('Benchmark displayed date mapping changed');
  const escaped = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const releaseVar = escaped(match[1]), labelFn = escaped(declaration[1]), timeline = escaped(declaration[6]);
  const v2Timeline = new RegExp('\\.\\.\\.' + releaseVar + '\\.map\\(\\(([A-Za-z_$][\\w$]*)=>\\(\\{id:\\1,label:' + labelFn + '\\(\\1\\),gen:"v2"\\}\\)\\)\\)\\]');
  const defaultRelease = script.match(new RegExp('([A-Za-z_$][\\w$]*)=' + timeline + '\\[' + timeline + '\\.length-1\\]'));
  if (!v2Timeline.test(tail) || !defaultRelease || !script.includes('decodeURIComponent(') || !script.includes('||' + defaultRelease[1] + ',')) throw Error('Official default release selection changed');
  const loader = script.match(/([A-Za-z_$][\w$]*)=\(([A-Za-z_$][\w$]*)=>\2\.replaceAll\("-","_"\)\)\(([A-Za-z_$][\w$]*)\),([A-Za-z_$][\w$]*)="\.",([A-Za-z_$][\w$]*)="\?v=\d+";return/);
  if (!loader) throw Error('Benchmark data loader pattern changed');
  const loaderText = script.slice(loader.index, loader.index + 1800);
  if (!loaderText.includes('fetch(`${' + loader[4] + '}/table_${' + loader[1] + '}.csv${' + loader[5] + '}`)')
    || !loaderText.includes('fetch(`${' + loader[4] + '}/categories_${' + loader[1] + '}.json${' + loader[5] + '}`)')) throw Error('Benchmark same-origin data templates changed');
  const method = 'The mean of the suites that have a score for that model, each suite counting equally.';
  const effort = "Models run at their highest supported effort setting. Where a different setting was used, the model's expanded row shows it.";
  if (!script.includes(method) || !script.includes(effort) || !script.includes('Each suite is one run per model.')) throw Error('Benchmark scoring or test configuration changed');
  const datasetId = releases.at(-1), asOf = labels[datasetId] || datasetId;
  const parts = declaration[5].split(' '), months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const displayDate = `${parts[2]}-${String(months.indexOf(parts[1]) + 1).padStart(2,'0')}-${parts[0].padStart(2,'0')}`;
  if (!benchmarkDate(displayDate, checkedAt) || displayDate !== asOf) throw Error('Benchmark default date and last-updated label disagree');
  const tag = datasetId.replaceAll('-', '_');
  return { ...BENCHMARK, datasetId, asOf, dataUrl: `https://livebench.ai/table_${tag}.csv`, categoriesUrl: `https://livebench.ai/categories_${tag}.json`,
    testConfigurationZh: '来源默认版本；各测试组每模型一次运行，使用最高支持推理强度，展开行注明例外；有成绩维度等权平均。' };
}

async function collectBenchmark(options, checkedAt) {
  const sources = []; let discovery;
  try {
    const home = await fetchPublicText(SOURCES.benchmarkHome, { ...options, maxBytes: 65536, timeoutMs: 2000 });
    sources.push(health(SOURCES.benchmarkHome, checkedAt, home));
    const moduleUrl = parseBenchmarkHome(home.body), module = await fetchPublicText(moduleUrl, { ...options, maxBytes: 512 * 1024, timeoutMs: 3000 });
    sources.push(health(moduleUrl, checkedAt, module));
    const release = parseBenchmarkModule(module.body, checkedAt);
    const [result, categories] = await Promise.all([fetchPublicText(release.dataUrl, options), fetchPublicText(release.categoriesUrl, options)]);
    const categoryData = JSON.parse(categories.body);
    if (Object.keys(categoryData).length !== Object.keys(modelGuide.DIMENSIONS).length || Object.keys(categoryData).some(key => !Object.hasOwn(modelGuide.DIMENSIONS,key))) throw Error('Benchmark suite definitions changed');
    const rows = parseLeaderboard(result.body, categoryData, release);
    discovery = { status: 'current_verified', checkedAt, sourceUrl: SOURCES.benchmarkHome, moduleUrl, moduleSha256: module.sha256,
      labelZh: '已核对官网当前默认榜单版本', noteZh: '只读取官网主页及其唯一入口脚本文本，不执行 JavaScript；版本、日期、数据文件和测试口径一起验证。' };
    const verified = { rows, release, verifiedAt: checkedAt, result, categories };
    VERIFIED_BENCHMARKS.set(options.fetchImpl, structuredClone(verified));
    return { ...verified, sources, discovery };
  } catch (error) {
    discovery = { status: 'fallback_release', checkedAt, sourceUrl: SOURCES.benchmarkHome, labelZh: '新版发现待核对 · 保留已核实版本', error: safeError(error),
      noteZh: '官网入口、日期、测试口径或数据格式未通过当前识别规则；没有据此声称已取得最新版。' };
    sources.push({ sourceUrl: SOURCES.benchmarkHome, checkedAt, status: 'unavailable', error: safeError(error) });
    const previous = VERIFIED_BENCHMARKS.get(options.fetchImpl);
    if (previous) return { ...structuredClone(previous), sources, discovery, cachedRelease: true };
    const release = { ...BENCHMARK, dataUrl: SOURCES.leaderboard, categoriesUrl: SOURCES.categories };
    const [result, categories] = await Promise.all([fetchPublicText(release.dataUrl, options), fetchPublicText(release.categoriesUrl, options)]);
    return { rows: parseLeaderboard(result.body, categories.body, release), release, result, categories, sources, discovery, verifiedAt: checkedAt };
  }
}

function isoNow(now) {
  const value = typeof now === 'function' ? now() : (now == null ? new Date() : now);
  const result = new Date(value);
  if (!Number.isFinite(result.getTime())) throw new TypeError('Invalid collection time');
  return result.toISOString();
}

function cleanText(value, limit = 200) {
  return String(value == null ? '' : value).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, limit);
}

function finiteNumber(value, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (value == null || typeof value === 'boolean' || String(value).trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}

function safeError(error) {
  return cleanText(error && error.message || 'Source unavailable', 160);
}

async function fetchPublicText(url, { fetchImpl = globalThis.fetch, signal, timeoutMs = LIMITS.timeoutMs, maxBytes = LIMITS.maxBytes } = {}) {
  if (!ALLOWED_URLS.has(url) && !benchmarkUrlAllowed(url)) throw new Error('Source URL is not allowlisted');
  if (typeof fetchImpl !== 'function') throw new Error('Fetch is unavailable');
  const controller = new AbortController();
  const abort = () => controller.abort(signal && signal.reason);
  if (signal && signal.aborted) abort();
  else if (signal) signal.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => controller.abort(new Error('Public source request timed out')), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      method: 'GET', redirect: 'error', signal: controller.signal,
      headers: { Accept: 'application/json, application/xml, text/csv, text/xml;q=0.9', 'User-Agent': 'Simon-AINews/1.0 (public read-only source monitor)' },
    });
    if (!response || !response.ok) throw new Error(`Public source HTTP ${response && response.status || 'unavailable'}`);
    // Do not follow a custom fetch implementation's redirect to another host.
    if (response.url && response.url !== url) throw new Error('Unexpected public source redirect');
    const length = Number(response.headers && response.headers.get('content-length'));
    if (Number.isFinite(length) && length > maxBytes) throw new Error('Public source exceeds byte limit');
    let bytes = 0;
    let body;
    if (response.body && typeof response.body.getReader === 'function') {
      const reader = response.body.getReader();
      const chunks = [];
      try {
        while (true) {
          const result = await reader.read();
          if (result.done) break;
          bytes += result.value.byteLength;
          if (bytes > maxBytes) throw new Error('Public source exceeds byte limit');
          chunks.push(Buffer.from(result.value));
        }
      } finally {
        if (bytes > maxBytes) await reader.cancel().catch(() => {});
        reader.releaseLock();
      }
      body = Buffer.concat(chunks).toString('utf8');
    } else {
      body = await response.text();
      bytes = Buffer.byteLength(body);
      if (bytes > maxBytes) throw new Error('Public source exceeds byte limit');
    }
    return { body, bytes, sha256: createHash('sha256').update(body).digest('hex'), httpStatus: response.status };
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', abort);
  }
}

// Bounded RFC 4180 CSV reader, including escaped quotes and quoted newlines.
function parseCsv(input) {
  const text = String(input).replace(/^\uFEFF/, '');
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { field += '"'; i++; }
      else if (quoted || field === '') quoted = !quoted;
      else throw new Error('Invalid CSV quotation');
    } else if (char === ',' && !quoted) {
      row.push(field); field = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some(cell => cell.trim())) rows.push(row);
      row = [];
      if (rows.length > LIMITS.maxRows + 1) throw new Error('CSV row limit exceeded');
    } else field += char;
  }
  if (quoted) throw new Error('Unclosed CSV field');
  if (field || row.length) { row.push(field); rows.push(row); }
  if (rows.length < 2 || rows[0][0] !== 'model') throw new Error('Leaderboard CSV schema changed');
  const headers = rows.shift();
  if (new Set(headers).size !== headers.length || headers.length > 100) throw new Error('Invalid leaderboard columns');
  return rows.map(cells => {
    if (cells.length !== headers.length) throw new Error('Leaderboard CSV column mismatch');
    return Object.fromEntries(headers.map((key, i) => [key, cells[i]]));
  });
}

function parseLeaderboard(csv, categoryJson, release = BENCHMARK) {
  const categories = typeof categoryJson === 'string' ? JSON.parse(categoryJson) : categoryJson;
  if (!categories || Array.isArray(categories) || typeof categories !== 'object') throw new Error('Invalid benchmark categories');
  const entries = Object.entries(categories);
  if (entries.length < 2 || entries.length > 20 || entries.some(([name, columns]) => !name || !Array.isArray(columns) || !columns.length || columns.length > 50 || columns.some(x => typeof x !== 'string'))) throw new Error('Benchmark category schema changed');
  const seen = new Set();
  const rows = parseCsv(csv).map(row => {
    const id = cleanText(row.model, 180);
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._:+-]{0,179}$/.test(id) || seen.has(id)) throw new Error('Invalid or duplicate benchmark model');
    seen.add(id);
    const categoryScores = Object.fromEntries(entries.map(([name, columns]) => {
      if (columns.some(column => !Object.hasOwn(row, column))) throw new Error('Benchmark category column missing');
      const values = columns.map(column => {
        const raw = String(row[column]).trim();
        if (!raw || /^(?:n\/a|-)$/i.test(raw)) return null;
        const value = finiteNumber(raw, { max: 100 });
        if (value == null) throw new Error('Invalid benchmark score');
        return value;
      }).filter(v => v != null);
      return [name, values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null];
    }));
    const scores = Object.values(categoryScores).filter(v => v != null);
    if (!scores.length) return null;
    return {
      id: `livebench:${id}`, benchmarkModelId: id, name: id,
      score: Number((scores.reduce((sum, value) => sum + value, 0) / scores.length).toFixed(2)),
      categoryScores, completedSuites: scores.length, totalSuites: entries.length,
      benchmark: release.name, benchmarkSourceUrl: release.sourceUrl,
      benchmarkDataUrl: release.dataUrl || SOURCES.leaderboard, benchmarkAsOf: release.asOf,
      benchmarkDatasetId: release.datasetId, benchmarkEffortNote: release.effortNote,
    };
  }).filter(Boolean).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  if (rows.length < 3) throw new Error('Benchmark contains too few scored rows');
  let previousScore = null, rank = 0;
  rows.forEach((row, index) => { if (row.score !== previousScore) rank = index + 1; row.rank = rank; previousScore = row.score; });
  return rows;
}

function normalizeCatalog(payload, checkedAt) {
  if (!payload || !Array.isArray(payload.data) || !payload.data.length || payload.data.length > LIMITS.maxModels) throw new Error('Models API schema or size changed');
  const seen = new Set();
  const models = payload.data.flatMap(model => {
    const id = cleanText(model.id, 200);
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._:/+-]{0,199}$/.test(id) || !id.includes('/') || seen.has(id)) return [];
    seen.add(id);
    const input = finiteNumber(model.pricing && model.pricing.prompt, { max: 10 });
    const output = finiteNumber(model.pricing && model.pricing.completion, { max: 10 });
    return [{
      id, name: cleanText(model.name || id, 200), provider: id.split('/')[0],
      contextTokens: finiteNumber(model.context_length, { max: 1000000000 }),
      inputUsdPerMillion: input == null ? null : Number((input * 1000000).toFixed(8)),
      outputUsdPerMillion: output == null ? null : Number((output * 1000000).toFixed(8)),
      pricingSource: 'OpenRouter marketplace listing (top provider quote)',
      pricingSourceUrl: `https://openrouter.ai/${id}`, pricingDataUrl: SOURCES.models,
      pricingCheckedAt: checkedAt, pricingCurrency: 'USD', pricingUnit: '1M tokens',
      pricingHasConditionalOverrides: !!(model.pricing && Array.isArray(model.pricing.overrides) && model.pricing.overrides.length),
      ...modelGuide.normalizeMetadata(model),
      pricingNote: '平台默认条件报价；缓存、长上下文、工具、图片及请求费用可能另计。不是厂商直连 API 或 Codex 订阅价格。',
      rank: null, score: null, benchmark: null, benchmarkSourceUrl: null, benchmarkAsOf: null,
    }];
  });
  if (!models.length) throw new Error('Models API has no valid model records');
  return models;
}

function health(source, checkedAt, result, itemCount) {
  return { sourceUrl: source, checkedAt, status: 'ok', httpStatus: result.httpStatus, bytes: result.bytes, sha256: result.sha256, ...(itemCount == null ? {} : { itemCount }) };
}

async function collectModels({ fetchImpl = globalThis.fetch, now, signal } = {}) {
  const checkedAt = isoNow(now);
  const options = { fetchImpl, signal };
  const [catalogResult, leaderboardResult, policyResult] = await Promise.allSettled([
    fetchPublicText(SOURCES.models, options).then(result => { const payload = JSON.parse(result.body); return { result, models: normalizeCatalog(payload, checkedAt), reportedCount: payload.data.length }; }),
    collectBenchmark(options, checkedAt),
    fetchPublicText(SOURCES.freeLimits, options),
  ]);
  const freePolicy = modelGuide.quotaPolicy(policyResult.status === 'fulfilled' ? policyResult.value.body : null, checkedAt);
  const models = catalogResult.status === 'fulfilled' ? catalogResult.value.models : [];
  const leaderboard = leaderboardResult.status === 'fulfilled' ? leaderboardResult.value.rows : [];
  const benchmarkResult = leaderboardResult.status === 'fulfilled' ? leaderboardResult.value : null;
  const release = benchmarkResult?.release || { ...BENCHMARK, dataUrl: SOURCES.leaderboard, categoriesUrl: SOURCES.categories };
  const discovery = benchmarkResult?.discovery || { status: 'unavailable', checkedAt, labelZh: '榜单来源暂不可核实', noteZh: '当前没有通过验证的榜单数据，不能声称已更新。' };
  for (const row of leaderboard) { row.benchmarkDiscoveryStatus = discovery.status; row.benchmarkCheckedAt = benchmarkResult.verifiedAt; }
  const benchmarkByModel = new Map(leaderboard.map(row => [row.benchmarkModelId, row]));
  // Exact model identifiers only; variants such as ':free' are not silently merged.
  const catalogByBase = new Map();
  for (const model of models) {
    const base = model.id.split('/').slice(1).join('/');
    const matches = catalogByBase.get(base) || [];
    matches.push(model); catalogByBase.set(base, matches);
  }
  for (const model of models) {
    const base = model.id.split('/').slice(1).join('/');
    const benchmark = benchmarkByModel.get(base);
    if (benchmark && catalogByBase.get(base).length === 1) Object.assign(model, {
      rank: benchmark.rank, score: benchmark.score, benchmark: release.name,
      benchmarkSourceUrl: release.sourceUrl, benchmarkDataUrl: release.dataUrl,
      benchmarkAsOf: release.asOf, benchmarkDatasetId: release.datasetId,
      benchmarkModelId: benchmark.benchmarkModelId, benchmarkEffortNote: release.effortNote,
      benchmarkDiscoveryStatus: discovery.status, benchmarkCheckedAt: benchmarkResult.verifiedAt,
      categoryScores: benchmark.categoryScores,
    });
  }
  for (const row of leaderboard) {
    const matches = catalogByBase.get(row.benchmarkModelId) || [];
    const quote = matches.length === 1 ? matches[0] : null;
    Object.assign(row, {
      catalogModelId: quote && quote.id || null, provider: quote && quote.provider || null,
      catalogModelName: quote && quote.name || null,
      contextTokens: quote && quote.contextTokens || null,
      inputUsdPerMillion: quote ? quote.inputUsdPerMillion : null,
      outputUsdPerMillion: quote ? quote.outputUsdPerMillion : null,
      pricingSourceUrl: quote && quote.pricingSourceUrl || null,
      pricingCheckedAt: quote && quote.pricingCheckedAt || null,
      pricingSource: quote && quote.pricingSource || null,
      matchStatus: quote ? 'exact_identifier' : 'no_unambiguous_catalog_match',
      inputModalities: quote ? quote.inputModalities : [], outputModalities: quote ? quote.outputModalities : [],
      supportedParameters: quote ? quote.supportedParameters : [],
      pricingRatesUsdPerUnit: quote ? quote.pricingRatesUsdPerUnit : {},
      pricingOverrides: quote ? quote.pricingOverrides : [],
      pricingHasUnparsedRate: quote ? quote.pricingHasUnparsedRate : false,
      pricingHasConditionalOverrides: quote ? quote.pricingHasConditionalOverrides : false,
    });
    Object.assign(row, modelGuide.modelFocus(row, checkedAt));
    row.nameZh = modelGuide.aliasZh(row.name, row.catalogModelId);
    row.guidance = modelGuide.createGuidance(row, freePolicy, checkedAt, { catalogAvailable: !!quote });
  }
  for (const model of models) {
    Object.assign(model, modelGuide.modelFocus(model, checkedAt));
    model.nameZh = modelGuide.aliasZh(model.name, model.id);
    model.guidance = modelGuide.createGuidance(model, freePolicy, checkedAt);
  }
  const sources = [];
  if (catalogResult.status === 'fulfilled') sources.push(health(SOURCES.models, checkedAt, catalogResult.value.result, models.length));
  else sources.push({ sourceUrl: SOURCES.models, checkedAt, status: 'unavailable', error: safeError(catalogResult.reason) });
  if (leaderboardResult.status === 'fulfilled') {
    sources.push(...benchmarkResult.sources);
    sources.push({ ...health(release.dataUrl, benchmarkResult.verifiedAt, benchmarkResult.result, leaderboard.length), ...(benchmarkResult.cachedRelease ? { status: 'stale', retainedAt: checkedAt } : {}) });
    sources.push({ ...health(release.categoriesUrl, benchmarkResult.verifiedAt, benchmarkResult.categories), ...(benchmarkResult.cachedRelease ? { status: 'stale', retainedAt: checkedAt } : {}) });
  } else sources.push({ sourceUrl: SOURCES.leaderboard, checkedAt, status: 'unavailable', error: safeError(leaderboardResult.reason) });
  if (policyResult.status === 'fulfilled') sources.push({ ...health(SOURCES.freeLimits, checkedAt, policyResult.value), policyStatus: freePolicy.status });
  else sources.push({ sourceUrl: SOURCES.freeLimits, checkedAt, status: 'unavailable', error: safeError(policyResult.reason) });
  return {
    models, leaderboard, checkedAt,
    catalogReportedCount: catalogResult.status === 'fulfilled' ? catalogResult.value.reportedCount : null,
    catalogValidCount: models.length,
    catalogScopeZh: '仅收录通过现有格式校验的具体模型标识；~ 开头的动态别名不当作固定型号报价。目录默认以文本输出模型为主，不声称完整覆盖所有图像、视频、音频或嵌入模型。',
    status: models.length && leaderboard.length ? 'ok' : models.length || leaderboard.length ? 'partial' : 'unavailable',
    catalogStatus: models.length ? 'ok' : 'unavailable', benchmarkStatus: leaderboard.length ? discovery.status : 'unavailable',
    benchmark: { ...release, nameZh: 'LiveBench 2.0 综合能力', checkedAt, status: discovery.status, discovery,
      lastVerifiedRelease: leaderboard.length ? { datasetId: release.datasetId, asOf: release.asOf, dataUrl: release.dataUrl, categoriesUrl: release.categoriesUrl, verifiedAt: benchmarkResult.verifiedAt } : null,
      coverage: discovery.status === 'current_verified' ? 'Official homepage default release, display date, data templates and test configuration verified together; checkedAt remains retrieval time.' : 'Latest-release discovery needs review; retaining a verified release, without claiming this is the latest default.',
      methodZh: '综合分为已完成测试维度的等权平均（0–100）；空项不计。同分同名次。完成维度不足时不能直接等同比较；榜单不单独验证中文、价格、隐私、三维拓扑或视频成品质量。',
      dimensionsZh: Object.fromEntries(Object.entries(modelGuide.DIMENSIONS).map(([key, value]) => [key, value.labelZh])),
      dimensionDetailsZh: modelGuide.DIMENSIONS },
    selectionGuidesZh: modelGuide.selectionGuides(models), pricingPolicyZh: modelGuide.pricingPolicy(freePolicy), focusGroups: modelGuide.focusGroups(),
    sources,
    coverageNote: `报价来自 OpenRouter 公开目录，USD/百万 token；${leaderboard.length ? `能力榜${discovery.status === 'current_verified' ? '已核对官网当前默认版本' : '新版发现待核对，保留已核实版本'}：${release.asOf}（数据集 ${release.datasetId}）` : '能力榜来源暂不可核实，未展示未经验证的成绩'}。抓取时间不等于数据日；二者仅按完全相同模型标识连接，空值表示未核实。不同测试设置和产品订阅额度不能直接混用。`,
  };
}

function decodeEntities(text) {
  return String(text).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (_, code) => {
      const value = code[0].toLowerCase() === 'x' ? parseInt(code.slice(1), 16) : Number(code);
      return value > 0 && value <= 0x10ffff ? String.fromCodePoint(value) : '';
    }).replace(/&(lt|gt|amp|quot|apos|nbsp);/g, (_, key) => ({ lt: '<', gt: '>', amp: '&', quot: '"', apos: "'", nbsp: ' ' })[key]);
}

function xmlField(item, name) {
  return decodeEntities((item.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i')) || [])[1] || '');
}

function plainContent(content) {
  return content.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function parseResetFeed(xml, checkedAt) {
  // No DTD, external entities, entity expansion, remote schema or XML execution.
  if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(xml)) throw new Error('DTD and entity declarations are not allowed');
  if (!/<rss\b/i.test(xml) || !/<channel\b/i.test(xml)) throw new Error('Official changelog is not a valid RSS feed');
  const items = xml.match(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>/gi) || [];
  if (!items.length || items.length > LIMITS.maxEvents) throw new Error('Official changelog item count changed');
  const seen = new Set();
  const events = [];
  let newestItemAt = null;
  let rejectedFutureItems = 0;
  for (const item of items) {
    const title = cleanText(xmlField(item, 'title'), 240);
    const sourceUrl = xmlField(item, 'link').trim();
    const date = new Date(xmlField(item, 'pubDate'));
    if (!title || !Number.isFinite(date.getTime())) continue;
    if (date.getTime() > Date.parse(checkedAt)) { rejectedFutureItems++; continue; }
    const publishedAt = date.toISOString();
    if (!newestItemAt || publishedAt > newestItemAt) newestItemAt = publishedAt;
    let url;
    try { url = new URL(sourceUrl); } catch { continue; }
    if (url.protocol !== 'https:' || !['developers.openai.com', 'learn.chatgpt.com'].includes(url.hostname)) continue;
    const body = plainContent(xmlField(item, 'content:encoded') || xmlField(item, 'description'));
    const text = `${title} ${body}`;
    let scope, titleChinese, status;
    const globalResetStatement = body.split(/[.!?]\s+/).some(sentence =>
      !/\b(?:no|not|never|without|if|whether|example|could|would)\b/i.test(sentence) &&
      /\bwe (?:have |(?:'|’)ve )?reset all (?:codex )?(?:usage |rate )?limits\b|\b(?:all |everyone.s )(?:codex )?(?:usage|rate)[ -]limits? (?:have been|were|are being|will be) reset\b/i.test(sentence));
    if (/\b(?:added|introduced|introducing|launched)\b.{0,40}rate[ -]limit reset banking|\bone free reset at launch\b/i.test(text)) {
      scope = 'public_reset_program'; status = 'historical_announcement'; titleChinese = 'Codex 重置额度储备与邀请奖励（历史公告）';
    } else if (/\bplans? (?:get|receive)\b.{0,30}double rate limits|\brate limits (?:were |are |have been )doubled\b/i.test(text)) {
      scope = 'public_limit_promotion'; status = 'historical_announcement'; titleChinese = 'Codex 公开额度加倍活动（历史公告）';
    } else if (globalResetStatement) {
      scope = 'public_reset_announcement'; status = 'confirmed_announcement'; titleChinese = 'Codex 公开重置公告';
    } else continue; // UI reset timers, runtime resets and git reset are not quota events.
    if (seen.has(sourceUrl)) continue;
    seen.add(sourceUrl);
    events.push({
      id: createHash('sha256').update(sourceUrl).digest('hex').slice(0, 20),
      title, titleOriginal: title, titleChinese, publishedAt, sourceUrl, scope, status,
      summaryChinese: scope === 'public_reset_program'
        ? '官方当时公布 Plus/Pro 重置额度储备及邀请奖励；公告不证明现在活动仍有效，也不证明你的账户已重置。'
        : scope === 'public_limit_promotion'
          ? '官方当时公布限时提高额度；仅保留历史记录，当前适用资格与期限须查看官方说明。'
          : '官方来源提及公开额度重置；具体对象、时间及适用范围以原公告为准。',
      originalExcerpt: title,
      checkedAt,
    });
  }
  if (!newestItemAt) throw new Error('Official changelog contains no dated entries');
  return { events: events.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)), feedItemCount: items.length, newestItemAt, rejectedFutureItems };
}

async function collectResets({ fetchImpl = globalThis.fetch, now, signal } = {}) {
  const checkedAt = isoNow(now);
  const coverageNote = '仅监测 OpenAI 官方公开 changelog RSS 的已读取条目。未接入个人账户额度、未登录 X/Twitter；Tibo 等个人公告不在自动覆盖范围。未发现可核实公告不代表没有发生重置，也无法推断任何人的下次重置时间。';
  try {
    const result = await fetchPublicText(SOURCES.resets, { fetchImpl, signal });
    const parsed = parseResetFeed(result.body, checkedAt);
    const threshold = Date.parse(checkedAt) - 30 * 86400000;
    const recentEvents = parsed.events.filter(event => event.scope === 'public_reset_announcement' && Date.parse(event.publishedAt) >= threshold && Date.parse(event.publishedAt) <= Date.parse(checkedAt));
    return {
      ...parsed, checkedAt, status: recentEvents.length ? 'confirmed_public_announcement' : 'unknown',
      feedStatus: 'ok', currentResetStatus: recentEvents.length ? 'confirmed_public_announcement' : 'unknown',
      recentWindowDays: 30, recentConfirmedCount: recentEvents.length,
      statusLabel: recentEvents.length ? '近期有可核实公开公告' : '未核实近期公开重置公告',
      coverageNote, sources: [health(SOURCES.resets, checkedAt, result, parsed.feedItemCount)],
    };
  } catch (error) {
    return { events: [], checkedAt, status: 'unknown', feedStatus: 'unavailable', currentResetStatus: 'unknown',
      statusLabel: '公开来源暂不可核实', coverageNote,
      sources: [{ sourceUrl: SOURCES.resets, checkedAt, status: 'unavailable', error: safeError(error) }] };
  }
}

module.exports = { collectModels, collectResets, SOURCES, BENCHMARK, LIMITS,
  _test: { fetchPublicText, parseCsv, parseLeaderboard, normalizeCatalog, parseResetFeed, finiteNumber, decodeEntities, benchmarkUrlAllowed, parseBenchmarkHome, parseBenchmarkModule, collectBenchmark } };
