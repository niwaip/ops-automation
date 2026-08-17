import { describe, expect, it } from 'vitest';
import type { BuiltinSkillInventoryDTO, SkillConfigDTO } from '@/api/skill';
import {
  isRegistryBuiltinSkill,
  mergeSkillInventory,
  toSkillConfigView,
} from './builtinSkillInventory';

const createBuiltin = (): BuiltinSkillInventoryDTO => ({
  id: 'registry-pdf-id',
  capabilityKey: 'platform.document.pdf-content-extractor',
  aliases: [],
  displayName: '内置 PDF 内容提取',
  description: '提取 PDF 文本层',
  owner: 'platform-document',
  category: 'extraction',
  defaultAccess: 'authenticated',
  lifecycle: 'experimental',
  isEnabled: true,
  activeVersionId: 'version-1',
  activeVersion: {
    id: 'version-1',
    definitionVersion: '1.0.0',
    apiVersion: 'platform.ops/v1alpha1',
    definitionDigest: 'sha256:digest',
    runtimeBuild: 'document.content-extractor.pdf',
    attestationId: 'attestation-1',
    manifest: {
      spec: {
        planner: {
          triggerKeywords: ['解析PDF', '提取PDF内容'],
          runtimeType: 'workflow',
        },
        contracts: {
          input: {
            schema: {
              required: ['fileBase64'],
              properties: {
                fileBase64: { type: 'string', description: 'PDF base64' },
                maxPages: { type: 'integer', default: 50 },
              },
            },
          },
        },
        runtime: { handlerKey: 'document.content-extractor.pdf' },
      },
    },
    deployments: [
      {
        environment: 'development',
        status: 'healthy',
        smokeTestStatus: 'passed',
        failureCode: null,
        deployedAt: '2026-08-13T00:00:00.000Z',
      },
    ],
    createdAt: '2026-08-13T00:00:00.000Z',
  },
  versions: [
    {
      id: 'version-1',
      definitionVersion: '1.0.0',
      definitionDigest: 'sha256:digest',
      attestationId: 'attestation-1',
      createdAt: '2026-08-13T00:00:00.000Z',
    },
  ],
  createdAt: '2026-08-13T00:00:00.000Z',
  updatedAt: '2026-08-13T00:00:00.000Z',
});

describe('builtin skill inventory adapter', () => {
  it('maps an active registry skill into a read-only admin list view', () => {
    const view = toSkillConfigView(createBuiltin());

    expect(view.id).toBe('platform.document.pdf-content-extractor');
    expect(view.isPublished).toBe(true);
    expect(view.publishedDeploymentStatus).toBe('healthy');
    expect(view.triggerKeywords.includes('解析PDF')).toBe(true);
    expect(JSON.stringify(view.paramsSchema.required)).toBe(JSON.stringify(['fileBase64']));
    expect(view.paramsSchema.properties.maxPages.type).toBe('number');
    expect(isRegistryBuiltinSkill(view)).toBe(true);
  });

  it('merges future registry entries without a hardcoded name list', () => {
    const duplicateConfigured = {
      id: 'platform.document.pdf-content-extractor',
      name: '旧 PDF 配置',
    } as SkillConfigDTO;
    const customConfigured = {
      id: 'custom-skill',
      name: '自定义 Skill',
    } as SkillConfigDTO;

    const merged = mergeSkillInventory(
      [duplicateConfigured, customConfigured],
      [createBuiltin()]
    );

    expect(JSON.stringify(merged.map((skill) => skill.id))).toBe(
      JSON.stringify(['custom-skill', 'platform.document.pdf-content-extractor'])
    );
    expect(merged[1].name).toBe('内置 PDF 内容提取');
  });

  it('deduplicates a configured skill by a registry-provided legacy alias', () => {
    const builtin = {
      ...createBuiltin(),
      aliases: ['legacy_pdf_extractor'],
    };
    const legacyConfigured = {
      id: 'legacy-config-id',
      name: 'legacy_pdf_extractor',
    } as SkillConfigDTO;

    const merged = mergeSkillInventory([legacyConfigured], [builtin]);

    expect(merged.length).toBe(1);
    expect(merged[0].id).toBe('platform.document.pdf-content-extractor');
  });
});
