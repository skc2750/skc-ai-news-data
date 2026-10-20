'use strict';

// These are deterministic reading aids, not individual model reviews or inference.
const RULES = require('./model-guide-rules.json');
const LIMITS_URL = 'https://openrouter.ai/docs/api-reference/limits';
// Canonical underscore route avoids a redirect rejected by the public fetch guard.
const LIMITS_DATA_URL = 'https://openrouter.ai/docs/api_reference/limits.md';
const MODELS_DOCS_URL = 'https://openrouter.ai/docs/guides/overview/models';
const PRICE_URL = 'https://openrouter.ai/pricing';
const DIMENSIONS = Object.freeze({
  'Long-Horizon': { labelZh: '长任务执行', meaningZh: '多步、长流程任务的测试表现', useCaseZh: '持续多步的软件任务候选；仍需检查实际执行与恢复能力' },
  Reasoning: { labelZh: '推理', meaningZh: '需要逻辑与推导的测试表现', useCaseZh: '复杂问题拆解与方案比较候选' },
  Coding: { labelZh: '编程', meaningZh: '代码任务的测试表现', useCaseZh: '网站开发、代码修正与脚本编写候选' },
  Browser: { labelZh: '浏览器任务', meaningZh: '浏览器操作任务的测试表现', useCaseZh: '网页操作智能体候选；实际运行还需要浏览器工具' },
  'Data Analysis': { labelZh: '数据分析', meaningZh: '数据处理与分析任务的测试表现', useCaseZh: 'CRM 数据整理、报表与表格分析候选' },
  Research: { labelZh: '研究', meaningZh: '信息研究任务的测试表现', useCaseZh: '带来源的知识库研究与资料整合候选' },
  Design: { labelZh: '界面设计', meaningZh: '设计与页面布局任务的测试表现', useCaseZh: '网站界面方案与布局代码候选；不代表三维建模精度' },
});

function quotaPolicy(body, checkedAt) {
  const names = ['FREE_MODEL_RATE_LIMIT_RPM', 'FREE_MODEL_NO_CREDITS_RPD', 'FREE_MODEL_HAS_CREDITS_RPD', 'FREE_MODEL_CREDITS_THRESHOLD'];
  const values = names.map(name => {
    const match = String(body || '').match(new RegExp(`export const ${name} = (\\d+);`));
    return match ? Number(match[1]) : null;
  });
  const table = /\| Less than \{FREE_MODEL_CREDITS_THRESHOLD\} \| \{FREE_MODEL_RATE_LIMIT_RPM\} \| \{FREE_MODEL_NO_CREDITS_RPD\} \|/.test(body || '')
    && /\| At least \{FREE_MODEL_CREDITS_THRESHOLD\} \| \{FREE_MODEL_RATE_LIMIT_RPM\} \| \{FREE_MODEL_HAS_CREDITS_RPD\} \|/.test(body || '');
  const expected = [20, 50, 1000, 10];
  const matched = table && values.every((value, i) => value === expected[i])
    && /one credit below the table.s threshold/.test(body || '')
    && /negative credit balance/.test(body || '');
  return {
    status: matched ? 'verified_current' : body ? 'changed_needs_review' : 'unavailable',
    sourceUrl: LIMITS_URL, dataUrl: LIMITS_DATA_URL, checkedAt,
    policyVerifiedAt: RULES.policyVerifiedAt,
    liveVerifiedAt: matched ? checkedAt : null,
    requestsPerMinute: matched ? 20 : null, baselineRequestsPerDay: matched ? 50 : null,
    purchasedCreditsRequestsPerDay: matched ? 1000 : null, creditThresholdUsd: matched ? 10 : null,
    labelZh: matched ? '官方免费限额已自动核对' : body ? '官方免费条款发生变化，待核对' : '免费限额来源暂不可核实',
    detailZh: matched
      ? '仅适用 :free 变体，共享账户层面的限额，并非每个模型各享一份：20 次/分钟；累计购入不足 10 美元 credits 通常为 50 次/日，达到 10 美元为 1000 次/日。官方另说明约 9 credits 起有充值手续费容差，实际以账户 /key 为准；失败尝试也可能占日限额，负余额会阻止免费调用。本站不读取你的额度，也不自动充值。'
      : '仅显示模型目录的当前报价；暂不声明当前免费次数。上次人工核对日期单独列出，请打开官方限额页确认。',
  };
}

function normalizeMetadata(model) {
  const strings = value => Array.isArray(value) ? [...new Set(value.filter(x => typeof x === 'string' && /^[a-zA-Z0-9_+-]{1,60}$/.test(x)))].slice(0, 80) : [];
  const number = value => value !== null && value !== undefined && typeof value !== 'boolean' && String(value).trim() !== '' && Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 1e9 ? Number(value) : null;
  const pricing = model.pricing && typeof model.pricing === 'object' ? model.pricing : {};
  const priceFields = Object.entries(pricing).filter(([key]) => key !== 'overrides').slice(0, 40);
  // Keep unrecognized units visible. Do not silently treat a missing or -1 quote as zero.
  const rates = Object.fromEntries(priceFields.map(([key, value]) => [key.slice(0, 80), number(value)]));
  const overrides = Array.isArray(pricing.overrides) ? pricing.overrides.slice(0, 64).map(entry => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return {};
    return Object.fromEntries(Object.entries(entry).slice(0, 40).map(([key, value]) => [key.slice(0, 80), Array.isArray(value) ? value.filter(x => typeof x === 'string').slice(0, 7).map(x => x.slice(0, 20)) : typeof value === 'string' ? value.slice(0, 100) : typeof value === 'number' && Number.isFinite(value) ? value : null]));
  }) : [];
  return { inputModalities: strings(model.architecture && model.architecture.input_modalities),
    outputModalities: strings(model.architecture && model.architecture.output_modalities), supportedParameters: strings(model.supported_parameters),
    pricingRatesUsdPerUnit: rates, pricingOverrides: overrides,
    pricingHasUnparsedRate: priceFields.some(([, value]) => number(value) === null),
    maxCompletionTokens: number(model.top_provider && model.top_provider.max_completion_tokens),
    expirationDate: typeof model.expiration_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(model.expiration_date) ? model.expiration_date : null,
  };
}

function aliasZh(name, id) {
  const prefix = String(id || '').split('/')[0];
  const alias = RULES.providerAliasesZh[prefix];
  return alias ? `${alias} · ${name}` : String(name);
}

function modelFocus(model, checkedAt) {
  const identities = Object.entries(RULES.focusModelIdentities || {}).flatMap(([focusId, rows]) => rows.map(row => ({ ...row, focusId })));
  const catalogId = model.catalogModelId || (!String(model.id || '').startsWith('livebench:') ? model.id : null);
  const rawId = String(catalogId || ''), match = rawId.match(/^([^:]+)(?::(batch|free))?$/);
  const baseId = match && match[1], variant = match && match[2];
  const identity = catalogId ? identities.find(row => row.id === baseId && model.provider === row.id.split('/')[0] && (model.catalogModelName || model.name) === row.name + (variant ? ` (${variant})` : ''))
    : identities.find(row => row.id.split('/').slice(1).join('/') === model.benchmarkModelId && model.name === model.benchmarkModelId);
  const focusId = identity?.focusId || 'other', group = RULES.focusGroups.find(row => row.id === focusId);
  const recordSourceUrl = model.pricingDataUrl || model.benchmarkDataUrl || 'https://openrouter.ai/api/v1/models';
  const recordCheckedAt = model.pricingCheckedAt || model.benchmarkCheckedAt || checkedAt;
  const focusSourceUrl = identity?.sourceUrl || (identity ? group.sources[0].sourceUrl : recordSourceUrl);
  const note = identity?.relation === 'historical_codex_model'
    ? '此型号与 Codex 有历史关系；当前 ChatGPT 登录的 Codex 已退役或弃用该型号，不代表 API 目录同时退役。'
    : identity?.relation === 'named_codex_api_model' ? '这是官方命名的 Codex API 型号；目录报价不能证明当前 Codex 客户端或订阅可用。'
      : variant ? '这是该型号的渠道变体；不表示 Codex、Claude Code 或 Muse Code 支持此渠道变体。' : '';
  return { focusId, focusIds: [focusId], focusLabelZh: group.labelZh, focusSourceUrl,
    focusMatchBasisZh: identity ? catalogId ? '准确目录 ID、正式名称与已核实产品关系映射' : '基准准确型号标识与已核实官方型号对应；不据此生成渠道价格' : '未通过三项重点的已核实身份映射，保留在其他模型',
    focusRelation: identity?.relation || (identity ? 'verified_model_family' : 'not_mapped'), focusNoteZh: note,
    focusPolicyVerifiedAt: RULES.focusVerifiedAt,
    focusEvidenceSources: [{ labelZh: '本条型号身份来源', sourceUrl: recordSourceUrl, checkedAt: recordCheckedAt },
      ...(identity ? [{ labelZh: '官方产品/型号关系', sourceUrl: focusSourceUrl, checkedAt: RULES.focusVerifiedAt }] : [])],
    ...(identity?.modelCardUrl ? { officialModelCardUrl: identity.modelCardUrl } : {}),
  };
}
function focusGroups() { return RULES.focusGroups.map(group => ({ ...group, policyVerifiedAt: RULES.focusVerifiedAt })); }

function createGuidance(model, policy, checkedAt, { catalogAvailable = true } = {}) {
  const strengthsZh = [], useCasesZh = [], limitationsZh = [];
  const input = model.inputModalities || [], output = model.outputModalities || [], params = model.supportedParameters || [];
  const evidence = [];
  if (catalogAvailable) {
    const capabilities = [
      [input.includes('image'), '目录支持图片输入', '截图、扫描件与视觉参考资料解读；不能据此保证三维重建精度'],
      [input.includes('audio'), '目录支持音频输入', '录音内容理解候选；需另测中文及马来语识别效果'],
      [input.includes('video'), '目录支持视频输入', '视频内容理解候选；检查实际接口的时长限制'],
      [output.includes('image'), '目录支持图像输出', '生成图像素材；输出是平面图像，不能当作可拆解三维模型'],
      [output.includes('audio') || output.includes('speech'), '目录支持音频输出', '语音内容生成候选；声音与语言效果需试听'],
      [output.includes('embeddings'), '目录支持嵌入向量', '知识库语义检索候选；中文召回效果需要评测'],
      [params.includes('tools'), '目录声明工具调用', 'CRM 与网站工具集成候选；权限校验和实际工具由应用实现'],
      [params.includes('structured_outputs'), '目录声明结构化输出', 'CRM 字段提取与表格整理候选；应用仍需验证 JSON 与业务规则'],
      [params.includes('reasoning'), '目录声明推理参数', '多步骤问题拆解候选；这不等于推理质量已验证'],
    ];
    for (const [supported, label, use] of capabilities) if (supported) { strengthsZh.push(label); useCasesZh.push(use); }
    if (model.contextTokens >= 128000) { strengthsZh.push('目录标注较长上下文'); useCasesZh.push('长文档与资料整合候选；窗口大不保证所有位置都能准确检索'); }
    if (!strengthsZh.length && output.includes('text')) { strengthsZh.push('目录支持文本输出'); useCasesZh.push('一般文字草稿与摘要候选；专业用途需实际样例评估'); }
    evidence.push({ labelZh: 'OpenRouter 官方目录元数据', sourceUrl: model.pricingDataUrl || 'https://openrouter.ai/api/v1/models', checkedAt });
  }
  const scored = Object.entries(model.categoryScores || {}).filter(([key, value]) => DIMENSIONS[key] && Number.isFinite(value)).sort((a, b) => b[1] - a[1]);
  for (const [key, value] of scored.slice(0, 2)) {
    strengthsZh.push(`该模型已测维度中的相对高项：${DIMENSIONS[key].labelZh} ${value.toFixed(1)}/100`);
    useCasesZh.push(DIMENSIONS[key].useCaseZh);
  }
  if (scored.length) {
    evidence.push({ labelZh: model.benchmarkDiscoveryStatus === 'current_verified' ? 'LiveBench 官网当前默认版本（读取时已核对）' : 'LiveBench 已核实版本；新版发现待核对', sourceUrl: model.benchmarkDataUrl || 'https://livebench.ai/', checkedAt: model.benchmarkCheckedAt || checkedAt, benchmarkAsOf: model.benchmarkAsOf || null });
    limitationsZh.push('相对高项仅比较此模型已测维度；综合排名不等于每种用途更好，测试配置、日期与完成维度必须一起看');
  }
  if (!strengthsZh.length) { strengthsZh.push('可用能力证据不足'); useCasesZh.push('用途尚未核实；先查看官方模型说明与真实任务样例'); }
  limitationsZh.push('未逐一实测中文质量、事实准确率、延迟或本地硬件表现');
  if (model.focusId === 'codex') limitationsZh.push('此处是具体 API 型号的渠道报价，不是 Codex 订阅或你的 Codex 额度；型号关系不保证当前客户端可用。' + (model.focusNoteZh || ''));
  if (model.focusId === 'claude') limitationsZh.push('Claude API、Claude 网页产品和 Claude Code 订阅分别计费；本表 API 单价不表示订阅包含等额免费 API。');
  if (model.focusId === 'muse') limitationsZh.push('Muse API、Muse Code 订阅与开放权重自托管分别计算成本；开放权重不代表托管推理免费，也不代表所有 Muse 模型适用同一许可证。');
  if (model.focusId === 'muse' && /-contributor(?:$|:)/.test(model.catalogModelId || model.id || '')) {
    limitationsZh.push('Meta 官方直连 Contributor 模式以内容可用于训练换取折扣，涉及提示、代码、文件和回复；本渠道实际数据政策需另核对，不能只比较价格。');
    evidence.push({ labelZh: 'Meta Contributor 模式与数据使用条款', sourceUrl: 'https://dev.meta.ai/docs/pricing-rate-limits#contributor-mode', checkedAt: RULES.focusVerifiedAt });
  }
  if (input.includes('image')) limitationsZh.push('能看图不代表能导出 GLB、保留分件或准确生成曲面；三维仍需专用工具与 Blender 验收');
  if (model.expirationDate) limitationsZh.push(`目录标注端点到期日：${model.expirationDate}`);
  const rates = model.pricingRatesUsdPerUnit || {};
  const hasBoth = Number.isFinite(model.inputUsdPerMillion) && Number.isFinite(model.outputUsdPerMillion);
  const hasExtras = Object.entries(rates).some(([key, value]) => !['prompt', 'completion'].includes(key) && value > 0);
  const overrides = model.pricingHasConditionalOverrides || (model.pricingOverrides || []).length > 0;
  const zero = hasBoth && model.inputUsdPerMillion === 0 && model.outputUsdPerMillion === 0;
  const cleanFree = zero && !hasExtras && !overrides && !model.pricingHasUnparsedRate;
  const isFreeVariant = /:free$/.test(model.catalogModelId || model.id || '');
  let freeTier;
  if (!catalogAvailable || !hasBoth) freeTier = { labelZh: '免费额度未知', detailZh: '没有可确认的完整输入/输出报价，不能当作免费。', status: 'unknown' };
  else if (cleanFree && isFreeVariant) freeTier = {
    labelZh: policy.status === 'verified_current' ? '免费变体 · 受限额约束' : '目录零价 · 免费限额待核对',
    detailZh: policy.detailZh, status: policy.status === 'verified_current' ? 'verified_limited' : 'policy_unverified',
  };
  else if (zero) freeTier = { labelZh: cleanFree ? '目录输入/输出零价 · 额度未核实' : '基础 token 零价 · 可能有其他费用', detailZh: '未确认适用 :free 额度；工具、图片、请求与条件报价需另查，不能据此认为完全免费。', status: cleanFree ? 'zero_quote_unverified_quota' : 'conditional_or_extra_charges' };
  else freeTier = { labelZh: '此渠道按量收费 · 未核实免费额度', detailZh: '本条是 OpenRouter 渠道报价，未确认赠送额度；厂商直连的免费试用、ChatGPT/Codex 等产品订阅不适用于此报价。', status: 'not_verified_for_this_channel' };
  Object.assign(freeTier, { sourceUrl: LIMITS_URL, checkedAt: policy.checkedAt || null, policyVerifiedAt: policy.policyVerifiedAt, liveVerifiedAt: policy.liveVerifiedAt || null });
  let billingDetail = hasBoth ? '输入与输出分别按实际 token 扣费，页面单价为美元/百万 token。' : '缺失报价显示未知，不能估为 0；请先查看该模型的渠道报价。';
  if (hasExtras) billingDetail += '目录含缓存、图片、音频、搜索等额外计费项，基础 token 价格不代表全部费用。';
  if (overrides) billingDetail += '存在长上下文、时段或其他条件价格；这里只展示默认条件，不计算未知条件，实际请求可能更贵。';
  billingDetail += '充值手续费、税费及外部工具费用可能另计；本站只读取公开目录，不执行推理、充值或自动付费切换。';
  return { strengthsZh, useCasesZh, limitationsZh,
    evidenceLabelZh: scored.length ? (catalogAvailable ? '目录元数据＋已核实版本测试结果；用途为规则建议' : '已核实版本测试结果；用途为规则建议') : catalogAvailable ? '目录元数据推导，未经逐模型任务实测' : '尚无足够证据',
    freeTier, billing: { labelZh: hasBoth ? cleanFree ? '基础 token 目录零价' : 'OpenRouter API 按量计费' : '收费方式/单价待核实', detailZh: billingDetail,
      sourceUrl: model.pricingSourceUrl || PRICE_URL, checkedAt: model.pricingCheckedAt || null,
      policySourceUrl: PRICE_URL, policyVerifiedAt: RULES.policyVerifiedAt, channel: 'openrouter_api', currency: 'USD', unitZh: '美元/百万 token（仅输入/输出）',
      extraRatesUsdPerUnit: rates, hasConditionalOverrides: !!overrides },
    recommendationZh: useCasesZh[0], capabilityBasis: scored.length ? 'benchmark' : catalogAvailable && strengthsZh[0] !== '可用能力证据不足' ? 'official_metadata' : 'unknown',
    capabilityBasisZh: scored.length ? '已核实版本基准测试＋用途规则建议' : catalogAvailable && strengthsZh[0] !== '可用能力证据不足' ? '官方目录元数据＋用途规则建议' : '证据不足',
    supportsChinese: 'unknown', chineseNoteZh: '未逐模型实测中文；正式名称和 API 标识保留原文，中文别名只帮助识别。',
    evidence, rulesVerifiedAt: RULES.policyVerifiedAt,
  };
}

function selectionGuides(models = []) {
  return RULES.selectionGuidesZh.map(row => {
    const candidates = models.filter(model => row.id === '3d' ? (model.inputModalities || []).includes('image')
      : row.id === 'web-development' ? (model.supportedParameters || []).includes('tools')
        : row.id === 'office-n8n' ? (model.supportedParameters || []).includes('tools') && (model.supportedParameters || []).includes('structured_outputs')
          : row.id === 'video-script' ? (model.outputModalities || []).includes('text') : false)
      .sort((a, b) => Number(b.guidance?.freeTier.status === 'verified_limited') - Number(a.guidance?.freeTier.status === 'verified_limited')
        || (b.categoryScores?.Coding || 0) - (a.categoryScores?.Coding || 0)
        || (a.outputUsdPerMillion ?? Infinity) - (b.outputUsdPerMillion ?? Infinity) || a.id.localeCompare(b.id));
    return { ...row, descriptionZh: row.detailZh, modelIds: candidates.slice(0, 3).map(model => model.id),
      noteZh: `${row.evidenceLabelZh}。候选仅按当前元数据、免费标记、已有测试与默认输出价筛选；未经逐任务比较，不是质量排名。`,
      sources: [{ sourceUrl: row.sourceUrl, checkedAt: row.checkedAt }] };
  });
}
function pricingPolicy(policy) { return { ...RULES.pricingPolicyZh, freePolicy: policy, policyVerifiedAt: RULES.policyVerifiedAt, sourceUrl: PRICE_URL, metadataSourceUrl: MODELS_DOCS_URL }; }
module.exports = { quotaPolicy, normalizeMetadata, createGuidance, aliasZh, selectionGuides, pricingPolicy, modelFocus, focusGroups, DIMENSIONS, LIMITS_DATA_URL, RULES };
