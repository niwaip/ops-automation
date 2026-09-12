import { describe, expect, it } from 'vitest';
import type { PublishedSkillCatalogItem } from '@/api/skill';
import {
  filterSkillsForDigitalEmployees,
  isBuiltinSkill,
  isSkillUserConfigurable,
} from './publishedSkillList';

const createMockSkill = (partial: Partial<PublishedSkillCatalogItem>): PublishedSkillCatalogItem => ({
  id: 'mock-id',
  name: 'mock-name',
  description: 'mock-desc',
  triggerKeywords: [],
  paramsSchema: {
    properties: {},
    required: [],
  },
  executionFlowTemplateIds: [],
  tools: [],
  isActive: true,
  isPublished: true,
  accessStatus: 'authorized',
  accessRequest: null,
  ...partial,
});

describe('publishedSkillList - Digital Employees Filtering', () => {
  const customSkillA = createMockSkill({
    id: 'skill-custom-bark',
    name: 'Bark推送服务-13d3d1d6',
    description: '自定义 Bark 推送员工',
    paramsSchema: {
      properties: {
        deviceKey: { type: 'string', description: 'Bark 密钥' },
      },
      required: [],
    },
  });

  const customSkillB = createMockSkill({
    id: 'skill-custom-nda',
    name: '保密协议生成',
    description: '自动生成 NDA 协议',
    paramsSchema: {
      properties: {
        partyA: { type: 'string', description: '甲方名称' },
      },
      required: [],
    },
  });

  const builtinContractReviewer = createMockSkill({
    id: 'platform.document.contract-reviewer',
    name: '合同文档智能审查与合规诊断',
    description: '智能合同审查数字员工',
    publishedSourceType: 'builtin',
    paramsSchema: {
      properties: {
        fileBase64: { type: 'string', description: '文件内容' },
        customChecklistRules: { type: 'json', description: '数字员工自定义审查要点' },
      },
      required: [],
    },
  });

  const builtinPdfSplit = createMockSkill({
    id: 'platform.document.pdf-split',
    name: '内置 PDF 拆页',
    description: '拆分 PDF 文档',
    publishedSourceType: 'builtin',
    paramsSchema: {
      properties: {
        fileBase64: { type: 'string', description: '文件内容' },
        pages: { type: 'string', description: '拆分页码' },
      },
      required: [],
    },
  });

  const builtinPdfMerge = createMockSkill({
    id: 'platform.document.pdf-merge',
    name: '内置 PDF 合并',
    description: '合并 PDF 文档',
    publishedSourceType: 'builtin',
    paramsSchema: {
      properties: {
        files: { type: 'json', description: '文件列表' },
      },
      required: [],
    },
  });

  const builtinWebSearch = createMockSkill({
    id: 'platform.search.web',
    name: '内置联网搜索',
    description: '公开网页检索服务',
    publishedSourceType: 'builtin',
    paramsSchema: {
      properties: {
        query: { type: 'string', description: '检索词' },
      },
      required: [],
    },
  });

  const builtinWorkspaceExplorer = createMockSkill({
    id: 'platform.workspace.explorer',
    name: '内置工作空间文档探索',
    description: '知识文档探索',
    publishedSourceType: 'builtin',
    paramsSchema: {
      properties: {
        path: { type: 'string', description: '路径' },
      },
      required: [],
    },
  });

  const builtinPdfExtractor = createMockSkill({
    id: 'platform.document.pdf-content-extractor',
    name: '内置文档内容提取',
    description: '提取 PDF 文档内容',
    publishedSourceType: 'builtin',
    paramsSchema: {
      properties: {
        fileBase64: { type: 'string', description: '文件内容' },
        password: { type: 'string', description: 'PDF 解密密码' },
      },
      required: [],
    },
  });

  const builtinCredentialSkill = createMockSkill({
    id: 'platform.custom.credential-tool',
    name: '需要凭证的内置技能',
    description: '需要用户配置密钥',
    publishedSourceType: 'builtin',
    paramsSchema: {
      properties: {
        apiKey: { type: 'string', description: '用户的 API 密钥', isSecret: true },
      },
      required: [],
    },
  });

  describe('isBuiltinSkill', () => {
    it('should correctly identify built-in skills', () => {
      expect(isBuiltinSkill(builtinContractReviewer)).toBe(true);
      expect(isBuiltinSkill(builtinPdfSplit)).toBe(true);
      expect(isBuiltinSkill(builtinWebSearch)).toBe(true);
      expect(isBuiltinSkill({ id: 'platform.test' } as any)).toBe(true);
      expect(isBuiltinSkill({ id: 'other', publishedSourceType: 'builtin' } as any)).toBe(true);
    });

    it('should return false for custom skills', () => {
      expect(isBuiltinSkill(customSkillA)).toBe(false);
      expect(isBuiltinSkill(customSkillB)).toBe(false);
    });
  });

  describe('isSkillUserConfigurable', () => {
    it('should return true for contract reviewer', () => {
      expect(isSkillUserConfigurable(builtinContractReviewer)).toBe(true);
    });

    it('should return true for builtin skill requiring credentials', () => {
      expect(isSkillUserConfigurable(builtinCredentialSkill)).toBe(true);
    });

    it('should return false for utilities without user configuration', () => {
      expect(isSkillUserConfigurable(builtinPdfSplit)).toBe(false);
      expect(isSkillUserConfigurable(builtinPdfMerge)).toBe(false);
      expect(isSkillUserConfigurable(builtinPdfExtractor)).toBe(false);
      expect(isSkillUserConfigurable(builtinWebSearch)).toBe(false);
      expect(isSkillUserConfigurable(builtinWorkspaceExplorer)).toBe(false);
    });
  });

  describe('filterSkillsForDigitalEmployees', () => {
    it('should filter out non-configurable built-in skills while preserving custom skills and configurable builtins', () => {
      const allSkills: PublishedSkillCatalogItem[] = [
        customSkillA,
        customSkillB,
        builtinContractReviewer,
        builtinPdfSplit,
        builtinPdfMerge,
        builtinPdfExtractor,
        builtinWebSearch,
        builtinWorkspaceExplorer,
        builtinCredentialSkill,
      ];

      const visible = filterSkillsForDigitalEmployees(allSkills);

      expect(visible.map((s) => s.id)).toEqual([
        customSkillA.id,
        customSkillB.id,
        builtinContractReviewer.id,
        builtinCredentialSkill.id,
      ]);

      // Utilities must NOT appear
      expect(visible.some((s) => s.id === builtinPdfSplit.id)).toBe(false);
      expect(visible.some((s) => s.id === builtinPdfMerge.id)).toBe(false);
      expect(visible.some((s) => s.id === builtinPdfExtractor.id)).toBe(false);
      expect(visible.some((s) => s.id === builtinWebSearch.id)).toBe(false);
      expect(visible.some((s) => s.id === builtinWorkspaceExplorer.id)).toBe(false);
    });
  });
});
