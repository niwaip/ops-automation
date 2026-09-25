import type { CapabilityContractV2 } from '@ops/backend-runtime-capability-contract';
import type { CapabilityPackManifest } from '../manifest';
import { digestCapabilityContract } from '../manifest';

export const platformSearchWebContract: CapabilityContractV2 = {
  apiVersion: 'ops-automation/v2',
  kind: 'Capability',
  metadata: {
    id: 'platform.search.web',
    version: '1.0.4',
    sourceType: 'builtin_skill',
  },
  contracts: {
    input: {
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['query'],
        properties: {
          query: {
            type: 'string',
            minLength: 1,
            maxLength: 1000,
          },
          maxResults: {
            type: 'integer',
            minimum: 1,
            maximum: 10,
            default: 5,
          },
          topic: {
            type: 'string',
            enum: ['general', 'news'],
            default: 'general',
          },
          searchDepth: {
            type: 'string',
            enum: ['basic', 'advanced'],
            default: 'basic',
          },
          days: {
            type: 'integer',
            minimum: 1,
            maximum: 30,
          },
          includeDomains: {
            type: 'array',
            maxItems: 20,
            items: {
              type: 'string',
              maxLength: 253,
            },
          },
          excludeDomains: {
            type: 'array',
            maxItems: 20,
            items: {
              type: 'string',
              maxLength: 253,
            },
          },
        },
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['query', 'provider', 'results', 'resultCount', 'searchedAt', 'warnings'],
        properties: {
          query: { type: 'string' },
          provider: { type: 'string' },
          answer: { type: 'string' },
          results: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['title', 'url', 'snippet', 'score'],
              properties: {
                title: { type: 'string' },
                url: { type: 'string', format: 'uri' },
                snippet: { type: 'string' },
                score: { type: 'number' },
                publishedAt: { type: 'string' },
              },
            },
          },
          resultCount: { type: 'integer', minimum: 0 },
          searchedAt: { type: 'string', format: 'date-time' },
          warnings: {
            type: 'array',
            items: { type: 'string' },
          },
        },
      },
    },
  },
  runtime: {
    type: 'builtin_handler',
    handlerKey: 'search.web',
    timeoutSeconds: 20,
  },
  compatibility: {
    policy: 'backward',
  },
};

export const platformSearchWebCapabilityPack: CapabilityPackManifest = {
  apiVersion: 'ops-automation/capability-pack/v1',
  kind: 'CapabilityPack',
  metadata: {
    id: 'platform.search.web',
    version: '1.0.4',
    owner: 'platform-search',
    lifecycle: 'production',
    contractDigest: digestCapabilityContract(platformSearchWebContract),
  },
  contract: platformSearchWebContract,
  routing: {
    displayName: '内置联网搜索',
    summary: '检索公开互联网中的最新网页与新闻信息，并返回可引用的结构化来源',
    aliases: [
      '联网搜索',
      '搜索网页',
      '查询最新信息',
      '查一下',
      '搜一下',
      '搜一搜',
      '新闻',
      '最新新闻',
      '新闻搜索',
      '查新闻',
      '搜新闻',
      '找新闻',
      '检索',
      '搜索',
      '查找',
      '查询',
      '查找资料',
      '搜索资料',
      '最新消息',
      '最新动态',
      '实时资讯',
      '网络搜索',
      '网页搜索',
      '行情',
      '股市',
      '股市行情',
      '大盘',
      '股价',
      '汇率',
      '金价',
      '股票',
    ],
    goals: [
      '检索公开互联网获取最新实时资讯与权威信息',
      '根据关键词查询新闻、财经行情、股票与宏观动态',
    ],
    positiveExamples: [
      '搜索 2026 年最新大模型技术架构',
      '查一下今日科技新闻与大盘走势',
    ],
    negativeExamples: [
      '发送通知邮件给运维组',
      '合并两个本地 PDF 报表',
    ],
  },
  runtime: {
    routeKey: 'builtin:workflow',
    adapterVersion: '1.0.4',
    protocolVersion: '1',
    probe: '/health',
  },
  governance: {
    riskLevel: 'L0',
    sideEffectClass: 'read',
    idempotency: 'naturally_idempotent',
    permissions: [],
    runbook: 'docs/runbook/platform.search.web.md',
  },
  production: {
    slo: 'P95 < 2500ms, SuccessRate >= 99.9%',
    resourceBudget: 'Memory 128MB, Concurrency 50',
    canaryEvidence: 'verified-20260902-1.0.4',
    rollbackVersion: '1.0.3',
  },
};
