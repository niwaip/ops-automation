import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { StudioAiController } from './studio-ai.controller';
import { StudioController } from './studio.controller';
import { StudioRenderController } from './studio-render.controller';
import { StudioTemplateController } from './studio-template.controller';
import { TemplateRenderDataDto, TemplateSaveDto } from './studio.dto';
import { DEFAULT_RENDER_PLAN_VERSION, TEMPLATE_ASSET_MANIFEST_VERSION } from './studio.types';
import { TemplateWorkflowService } from './template-workflow.service';

describe('StudioController template workflow', () => {
  let workflowController: StudioController;
  let renderController: StudioRenderController;
  let templateController: StudioTemplateController;
  let aiController: StudioAiController;
  let aiIdentifierService: {
    normalizeTemplateConfig: jest.Mock;
    generateAISkillGuide: jest.Mock;
  };
  let documentStructureService: {
    applyConfigToDocx: jest.Mock;
  };
  let templateRepository: {
    findById: jest.Mock;
    upsertFromMeta: jest.Mock;
    updateConfig: jest.Mock;
  };
  let skillRepository: any;
  let tempRootDir: string;
  let templatesDir: string;
  let outputsDir: string;

  beforeEach(() => {
    tempRootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-workflow-'));
    templatesDir = path.join(tempRootDir, 'templates');
    outputsDir = path.join(tempRootDir, 'outputs');
    fs.mkdirSync(templatesDir, { recursive: true });
    fs.mkdirSync(outputsDir, { recursive: true });

    templateRepository = {
      findById: jest.fn().mockResolvedValue(undefined),
      upsertFromMeta: jest.fn().mockResolvedValue(undefined),
      updateConfig: jest.fn().mockResolvedValue(undefined),
    };

    aiIdentifierService = {
      normalizeTemplateConfig: jest.fn((config) => config),
      generateAISkillGuide: jest.fn().mockResolvedValue({
        id: 'skill-test-1',
        parameters: [],
      }),
    };
    documentStructureService = {
      applyConfigToDocx: jest.fn(async (buffer) => buffer),
    };

    const previewService = {} as any;
    skillRepository = {
      findById: jest.fn().mockResolvedValue(null),
      upsertFromDocument: jest.fn().mockResolvedValue(undefined),
    } as any;
    const renderOutputRepository = {
      createFromMeta: jest.fn().mockResolvedValue(undefined),
    } as any;
    const templateWorkflowService = new TemplateWorkflowService();

    workflowController = new StudioController(
      previewService,
      aiIdentifierService as any,
      documentStructureService as any,
      templateRepository as any,
      skillRepository,
      renderOutputRepository,
      templateWorkflowService
    );
    renderController = new StudioRenderController(
      previewService,
      aiIdentifierService as any,
      documentStructureService as any,
      templateRepository as any,
      skillRepository,
      renderOutputRepository,
      templateWorkflowService
    );
    templateController = new StudioTemplateController(
      previewService,
      aiIdentifierService as any,
      documentStructureService as any,
      templateRepository as any,
      skillRepository,
      renderOutputRepository,
      templateWorkflowService
    );
    aiController = new StudioAiController(
      previewService,
      aiIdentifierService as any,
      documentStructureService as any,
      templateRepository as any,
      skillRepository,
      renderOutputRepository,
      templateWorkflowService
    );

    for (const controller of [
      workflowController,
      renderController,
      templateController,
      aiController,
    ]) {
      (controller as any).templatesDir = templatesDir;
      (controller as any).outputsDir = outputsDir;
    }
  });

  afterEach(() => {
    fs.rmSync(tempRootDir, { recursive: true, force: true });
  });

  it('saves workflow field specs into template metadata', async () => {
    const dto: TemplateSaveDto = {
      templateMeta: {
        templateName: 'workflow-contract.docx',
        sourceLanguage: 'zh',
        targetLanguages: ['ja'],
        documentMode: 'single_or_bilingual',
      },
      templateDocumentIr: {
        host: 'word',
        elements: [
          {
            id: 'p-1',
            type: 'paragraph',
            text: '委托方：______________',
          },
        ],
      },
      templateFieldSpecs: [
        {
          fieldId: 'partyAName',
          type: 'legal_entity_name',
          sourceLanguage: 'zh',
          targetLanguages: ['ja'],
          policy: 'dictionary_first',
          required: true,
          riskLevel: 'high',
          sourceBindings: [
            {
              blockId: 'p-1',
              lang: 'zh',
              anchor: {
                prefix: '委托方：',
              },
            },
          ],
        },
      ],
      saveMode: 'draft',
    };

    const result = await workflowController.saveTemplateWorkflow(dto);

    const metaPath = path.join(templatesDir, `${result.templateId}.json`);
    expect(fs.existsSync(metaPath)).toBe(true);

    const savedMeta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
    expect(savedMeta.templateConfig.templateWorkflow.templateFieldSpecs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fieldId: 'partyAName',
          policy: 'dictionary_first',
        }),
      ])
    );
    expect(savedMeta.templateConfig.templateWorkflow.carboneBindingPlan.bindings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          variablePath: 'partyAName_zh',
          valueSelector: 'partyAName.zh',
        }),
        expect.objectContaining({
          variablePath: 'partyAName_ja',
          valueSelector: 'partyAName.ja',
        }),
      ])
    );
    expect(result.templateAssetManifest).toEqual(
      expect.objectContaining({
        assetVersion: TEMPLATE_ASSET_MANIFEST_VERSION,
        fieldCount: 1,
        renderPlanVersion: DEFAULT_RENDER_PLAN_VERSION,
      })
    );
    expect(savedMeta.templateConfig.templateAssetManifest).toEqual(
      expect.objectContaining({
        assetVersion: TEMPLATE_ASSET_MANIFEST_VERSION,
        fieldCount: 1,
      })
    );
    expect(templateRepository.upsertFromMeta).toHaveBeenCalled();
  });

  it('exports and imports template asset payloads', async () => {
    const templateId = 'tpl-asset-roundtrip';
    const binaryContent = Buffer.from('template-binary-demo');
    fs.writeFileSync(path.join(templatesDir, `${templateId}.docx`), binaryContent);

    const saveResult = await workflowController.saveTemplateWorkflow({
      templateId,
      templateMeta: {
        templateName: 'asset-roundtrip.docx',
        sourceLanguage: 'zh',
        targetLanguages: ['ja'],
        documentMode: 'single_or_bilingual',
      },
      templateDocumentIr: {
        host: 'word',
        elements: [
          {
            id: 'p-1',
            type: 'paragraph',
            text: '委托方：______________',
          },
        ],
      },
      templateFieldSpecs: [
        {
          fieldId: 'partyAName',
          type: 'legal_entity_name',
          sourceLanguage: 'zh',
          targetLanguages: ['ja'],
          policy: 'dictionary_first',
          required: true,
        },
      ],
      saveMode: 'publish',
    });

    const exported = await workflowController.exportTemplateAsset({
      templateId: saveResult.templateId,
      includeBinary: true,
    });

    expect(exported.manifest).toEqual(
      expect.objectContaining({
        templateId,
        assetVersion: TEMPLATE_ASSET_MANIFEST_VERSION,
      })
    );
    expect(exported.templateBinary).toBe(binaryContent.toString('base64'));

    const imported = await workflowController.importTemplateAsset({
      manifest: {
        ...exported.manifest,
        templateId: 'tpl-imported-roundtrip',
        fileName: 'imported-roundtrip.docx',
      },
      templateBinary: exported.templateBinary,
    });

    expect(imported.templateAssetManifest).toEqual(
      expect.objectContaining({
        templateId: 'tpl-imported-roundtrip',
        assetVersion: TEMPLATE_ASSET_MANIFEST_VERSION,
      })
    );
    expect(fs.existsSync(path.join(templatesDir, 'tpl-imported-roundtrip.docx'))).toBe(true);
  });

  it('persists template asset manifest when saveTemplateFull receives field specs', async () => {
    const result = await templateController.saveTemplateFull({
      documentContent: Buffer.from('template-binary-demo').toString('base64'),
      format: 'docx',
      templateName: 'published-asset-template',
      templateMeta: {
        templateName: 'published-asset-template',
        sourceLanguage: 'zh',
        targetLanguages: ['ja'],
        documentMode: 'single_or_bilingual',
      },
      templateDocumentIr: {
        host: 'word',
        elements: [
          {
            id: 'p-1',
            type: 'paragraph',
            text: '委托方：______________',
          },
        ],
      },
      templateFieldSpecs: [
        {
          fieldId: 'partyAName',
          type: 'legal_entity_name',
          sourceLanguage: 'zh',
          targetLanguages: ['ja'],
          policy: 'dictionary_first',
          required: true,
        },
      ],
      suggestions: [
        {
          suggestedName: '{d.partyAName_zh}',
          originalText: '委托方：',
          applied: true,
        },
      ],
      skill: {
        version: '1.0',
        parameters: [],
      },
    });

    expect(result.success).toBe(true);
    expect(result.templateId).toBeTruthy();

    const metaPath = path.join(templatesDir, `${result.templateId}.json`);
    const savedMeta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
    expect(savedMeta.templateConfig.templateAssetManifest).toEqual(
      expect.objectContaining({
        assetVersion: TEMPLATE_ASSET_MANIFEST_VERSION,
        fieldCount: 1,
        fileName: 'published-asset-template.docx',
      })
    );
    expect(savedMeta.templateConfig.templateWorkflow.renderPlan).toEqual(
      expect.objectContaining({
        version: DEFAULT_RENDER_PLAN_VERSION,
      })
    );
    expect(savedMeta.skillId).toBeTruthy();
  });

  it('returns compare candidates from compare endpoint', async () => {
    const result = await workflowController.compareTemplateWorkflow({
      templateDocumentIr: {
        host: 'word',
        elements: [
          {
            id: 'p-1',
            type: 'paragraph',
            text: '委托方：______________',
          },
        ],
        anchors: [
          {
            id: 'a-1',
            type: 'word-range',
            text: '______________',
            ref: {
              paragraphText: '委托方：______________',
            },
          },
        ],
      },
      sourceLanguage: 'zh',
      targetLanguages: ['ja'],
    });

    expect(result.workflowId).toMatch(/^wf_/);
    expect(result.compareId).toMatch(/^cmp_/);
    expect(result.candidateFields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          anchorText: '委托方：',
          fieldIdHint: 'partyAName',
        }),
      ])
    );
    expect(result.compareSummary).toEqual(
      expect.objectContaining({
        candidateCount: 1,
        sectionCount: 1,
        sections: expect.arrayContaining([
          expect.objectContaining({
            candidateCount: 1,
          }),
        ]),
      })
    );
  });

  it('renders workflow data using template-scoped term assets from saved metadata', async () => {
    const saveDto: TemplateSaveDto = {
      templateMeta: {
        templateName: 'workflow-project.docx',
        sourceLanguage: 'zh',
        targetLanguages: ['ja'],
        documentMode: 'single_or_bilingual',
        termAssets: {
          termbase: [
            {
              termId: 'tb_tpl_2001',
              applicableFieldIds: ['projectName'],
              sourceLanguage: 'zh',
              sourceValue: '无线网络设备更新',
              normalizedSourceValue: '无线网络设备更新',
              translations: {
                zh: '无线网络设备更新',
                ja: 'テンプレート専用設備更新',
              },
              scope: 'template',
              status: 'approved',
              version: 2,
            },
          ],
        },
      },
      templateDocumentIr: {
        host: 'word',
        elements: [
          {
            id: 'p-2',
            type: 'paragraph',
            text: '项目名称：______________',
          },
        ],
      },
      templateFieldSpecs: [
        {
          fieldId: 'projectName',
          type: 'project_name',
          sourceLanguage: 'zh',
          targetLanguages: ['ja'],
          policy: 'dictionary_first',
          required: true,
          riskLevel: 'medium',
          sourceBindings: [
            {
              blockId: 'p-2',
              lang: 'zh',
              anchor: {
                prefix: '项目名称：',
              },
            },
          ],
        },
      ],
      saveMode: 'draft',
    };

    const saveResult = await workflowController.saveTemplateWorkflow(saveDto);
    const renderDto: TemplateRenderDataDto = {
      templateId: saveResult.templateId,
      userInput: '项目是无线网络设备更新。',
      sourceLanguage: 'zh',
      targetLanguages: ['ja'],
    };

    const result = await workflowController.renderTemplateData(renderDto);

    expect(result.data).toEqual(
      expect.objectContaining({
        projectName_zh: '无线网络设备更新',
        projectName_ja: 'テンプレート専用設備更新',
      })
    );
    expect(result.sourceTrace.projectName).toEqual(
      expect.objectContaining({
        resolution: 'dictionary_hit',
        scope: 'template',
        termId: 'tb_tpl_2001',
      })
    );
    expect(result.needsReviewFields).toHaveLength(0);
  });

  it('prepares localized render data before render when requested', async () => {
    const templateId = 'tpl-render-before-translate';
    fs.writeFileSync(
      path.join(templatesDir, `${templateId}.docx`),
      Buffer.from('template-binary-demo')
    );

    await workflowController.saveTemplateWorkflow({
      templateId,
      templateMeta: {
        templateName: 'render-before-translate.docx',
        sourceLanguage: 'zh',
        targetLanguages: ['ja'],
        documentMode: 'single_or_bilingual',
      },
      templateDocumentIr: {
        host: 'word',
        elements: [
          {
            id: 'p-1',
            type: 'paragraph',
            text: '委托方：______________',
          },
        ],
      },
      templateFieldSpecs: [
        {
          fieldId: 'partyAName',
          type: 'legal_entity_name',
          sourceLanguage: 'zh',
          targetLanguages: ['ja'],
          policy: 'llm_translate',
          required: true,
        },
      ],
      saveMode: 'draft',
    });

    const renderSpy = jest
      .spyOn((renderController as any).engine, 'render')
      .mockResolvedValue(Buffer.from('rendered-output'));

    const result = await renderController.renderResolved({
      templateId,
      data: {
        partyAName: '上海云章科技有限公司',
      },
      sourceLanguage: 'zh',
      targetLanguages: ['ja'],
      prepareLocalizedRenderData: true,
    });

    expect(renderSpy).toHaveBeenCalledWith(
      expect.any(Buffer),
      expect.objectContaining({
        partyAName: '上海云章科技有限公司',
      }),
      'render-before-translate.docx'
    );
    expect(result.downloadUrl).toMatch(/^\/studio\/download\//);
    expect(result.artifacts).toEqual([
      expect.objectContaining({
        type: 'document',
        url: result.downloadUrl,
        metadata: expect.objectContaining({
          format: 'docx',
          templateId,
        }),
      }),
    ]);
  });

  it('uses outputName and localized render data in render-resolved', async () => {
    const templateId = 'tpl-render-resolved-runtime';
    fs.writeFileSync(
      path.join(templatesDir, `${templateId}.docx`),
      Buffer.from('template-binary-demo')
    );

    await workflowController.saveTemplateWorkflow({
      templateId,
      templateMeta: {
        templateName: 'resolved-runtime.docx',
        sourceLanguage: 'zh',
        targetLanguages: ['ja'],
        documentMode: 'single_or_bilingual',
      },
      templateDocumentIr: {
        host: 'word',
        elements: [
          {
            id: 'p-1',
            type: 'paragraph',
            text: '委托方：______________',
          },
        ],
      },
      templateFieldSpecs: [
        {
          fieldId: 'partyAName',
          type: 'legal_entity_name',
          sourceLanguage: 'zh',
          targetLanguages: ['ja'],
          policy: 'llm_translate',
          required: true,
        },
      ],
      saveMode: 'draft',
    });

    const renderSpy = jest
      .spyOn((renderController as any).engine, 'render')
      .mockResolvedValue(Buffer.from('rendered-output'));

    const result = await renderController.renderResolved({
      templateId,
      publishedSkillId: 'published-skill-1',
      data: {
        partyAName: '上海云章科技有限公司',
      },
      outputFormat: 'docx',
      outputName: '统一入口合同',
      sourceLanguage: 'zh',
      targetLanguages: ['ja'],
      prepareLocalizedRenderData: true,
    });

    expect(renderSpy).toHaveBeenCalledWith(
      expect.any(Buffer),
      expect.objectContaining({
        partyAName: '上海云章科技有限公司',
      }),
      'resolved-runtime.docx'
    );
    expect(result.fileName).toMatch(/^统一入口合同_\d{12}\.docx$/);
    expect(result.downloadUrl).toMatch(/^\/studio\/download\//);
    expect(result.artifacts).toEqual([
      expect.objectContaining({
        type: 'document',
        name: result.fileName,
        url: result.downloadUrl,
        metadata: expect.objectContaining({
          format: 'docx',
          templateId,
          publishedSkillId: 'published-skill-1',
        }),
      }),
    ]);
  });

  it('falls back to templateId when embedded carbone skillId is stale in render-resolved', async () => {
    const templateId = 'tpl-render-resolved-stale-skill';
    fs.writeFileSync(
      path.join(templatesDir, `${templateId}.docx`),
      Buffer.from('template-binary-demo')
    );

    await workflowController.saveTemplateWorkflow({
      templateId,
      templateMeta: {
        templateName: 'stale-skill-fallback.docx',
      },
      templateDocumentIr: {
        host: 'word',
        elements: [
          {
            id: 'p-1',
            type: 'paragraph',
            text: '客户名称：______________',
          },
        ],
      },
      templateFieldSpecs: [
        {
          fieldId: 'customerName',
          type: 'string',
          required: false,
        },
      ],
      saveMode: 'draft',
    });

    skillRepository.findById.mockResolvedValueOnce(null);
    const renderSpy = jest
      .spyOn((renderController as any).engine, 'render')
      .mockResolvedValue(Buffer.from('rendered-output'));

    const result = await renderController.renderResolved({
      templateId,
      skillId: 'deleted-carbone-skill',
      publishedSkillId: 'published-skill-current',
      data: {
        customerName: 'Alice',
      },
      outputFormat: 'docx',
    });

    expect(renderSpy).toHaveBeenCalledWith(
      expect.any(Buffer),
      expect.objectContaining({
        customerName: 'Alice',
      }),
      'stale-skill-fallback.docx'
    );
    expect(result.fileName).toMatch(/^stale-skill-fallback_\d{12}\.docx$/);
    expect(result.downloadUrl).toMatch(/^\/studio\/download\//);
  });

  it('prefers workflow input mappings in render-resolved when template field specs are missing', async () => {
    const templateId = 'tpl-render-workflow-mapping-first';
    fs.writeFileSync(
      path.join(templatesDir, `${templateId}.docx`),
      Buffer.from('template-binary-demo')
    );

    await workflowController.saveTemplateWorkflow({
      templateId,
      templateMeta: {
        templateName: 'workflow-mapping-first.docx',
        sourceLanguage: 'zh',
        targetLanguages: ['ja'],
        documentMode: 'single_or_bilingual',
      },
      templateDocumentIr: {
        host: 'word',
        elements: [
          {
            id: 'p-1',
            type: 'paragraph',
            text: '委托方：______________',
          },
        ],
      },
      templateFieldSpecs: [
        {
          fieldId: 'contract.partyA.name',
          type: 'legal_entity_name',
          sourceLanguage: 'zh',
          targetLanguages: ['ja'],
          policy: 'llm_translate',
          required: true,
        },
      ],
      saveMode: 'draft',
    });

    const metaPath = path.join(templatesDir, `${templateId}.json`);
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
    meta.templateConfig.templateWorkflow.templateFieldSpecs = [];
    meta.templateConfig.templateWorkflow.carboneBindingPlan = undefined;
    meta.templateConfig.templateAssetManifest.templateFieldSpecs = [];
    meta.templateConfig.templateAssetManifest.fieldCount = 0;
    meta.templateConfig.templateAssetManifest.renderPlan = {
      templateId,
      version: 1,
      bindings: [],
    };
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));

    const renderSpy = jest
      .spyOn((renderController as any).engine, 'render')
      .mockResolvedValue(Buffer.from('rendered-output'));

    const result = await renderController.renderResolved({
      templateId,
      data: {
        'contract.partyA.name': '测试甲方',
      },
      workflowInputParams: {
        'contract.partyA.name': {
          type: 'string',
          required: true,
          renderPath: ['contract.partyA.name_cn', 'contract.partyA.name_jp'],
          localizedVariants: ['cn', 'jp'],
        },
      },
      sourceLanguage: 'zh',
      targetLanguages: ['ja'],
      prepareLocalizedRenderData: true,
    });

    expect(renderSpy).toHaveBeenCalledWith(
      expect.any(Buffer),
      expect.objectContaining({
        contract: {
          partyA: {
            name_cn: '测试甲方',
            name_jp: '测试甲方',
          },
        },
      }),
      'workflow-mapping-first.docx'
    );
    expect(result.downloadUrl).toMatch(/^\/studio\/download\//);
  });

  it('maps scalar loop inputs onto final renderPath rows in render-resolved', async () => {
    const templateId = 'tpl-render-direct-loop-paths';
    fs.writeFileSync(
      path.join(templatesDir, `${templateId}.docx`),
      Buffer.from('template-binary-demo')
    );

    await workflowController.saveTemplateWorkflow({
      templateId,
      templateMeta: {
        templateName: 'direct-loop-paths.docx',
      },
      templateDocumentIr: {
        host: 'word',
        elements: [
          {
            id: 'p-1',
            type: 'paragraph',
            text: '项目：______________',
          },
        ],
      },
      templateFieldSpecs: [
        {
          fieldId: 'items[].productName',
          type: 'string',
          required: false,
        },
      ],
      saveMode: 'draft',
    });

    const renderSpy = jest
      .spyOn((renderController as any).engine, 'render')
      .mockResolvedValue(Buffer.from('rendered-output'));

    await renderController.renderResolved({
      templateId,
      data: {
        'items[].productName': '品名',
        'items[].quantity': '数量',
      },
      workflowInputParams: {
        'items[].productName': {
          renderPath: ['items[].productName_cn', 'items[].productName_jp'],
        },
        'items[].quantity': {
          renderPath: ['items[].quantity_cn', 'items[].quantity_jp'],
        },
      },
      prepareLocalizedRenderData: true,
    });

    expect(renderSpy).toHaveBeenCalledWith(
      expect.any(Buffer),
      expect.objectContaining({
        items: [
          {
            productName_cn: '品名',
            productName_jp: '品名',
            quantity_cn: '数量',
            quantity_jp: '数量',
          },
        ],
      }),
      'direct-loop-paths.docx'
    );
  });

  it('returns block results and context analysis from recognize endpoint', async () => {
    const result = await workflowController.recognizeTemplateWorkflow({
      templateDocumentIr: {
        host: 'word',
        elements: [
          {
            id: 'p-1',
            type: 'paragraph',
            text: '委托方：______________',
          },
          {
            id: 'p-2',
            type: 'paragraph',
            text: '项目名称：______________',
          },
        ],
        anchors: [
          {
            id: 'a-1',
            type: 'word-range',
            text: '______________',
            ref: {
              paragraphText: '委托方：______________',
            },
          },
          {
            id: 'a-2',
            type: 'word-range',
            text: '______________',
            ref: {
              paragraphText: '项目名称：______________',
            },
          },
        ],
      },
      sourceLanguage: 'zh',
      targetLanguages: ['ja'],
    });

    expect(result.fields.map((field) => field.fieldId)).toEqual(
      expect.arrayContaining(['partyAName', 'projectName'])
    );
    expect(result.blockResults).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          blockId: 'p-1',
          fieldIds: expect.arrayContaining(['partyAName']),
        }),
        expect.objectContaining({
          blockId: 'p-2',
          fieldIds: expect.arrayContaining(['projectName']),
        }),
      ])
    );
    expect(result.contextAnalysis).toEqual(
      expect.objectContaining({
        usedAI: false,
        fallbackTrace: expect.objectContaining({
          usedFallback: true,
        }),
      })
    );
  });

  it('keeps cached suggestions when saving and reading template config', async () => {
    const templateId = 'tpl-cache-1';
    fs.writeFileSync(
      path.join(templatesDir, `${templateId}.json`),
      JSON.stringify(
        {
          id: templateId,
          fileName: 'cache-test.docx',
          format: 'docx',
          size: 128,
          variables: [],
          loops: [],
          templateConfig: {
            variableMappings: [],
          },
        },
        null,
        2
      )
    );

    await templateController.saveTemplateConfig(templateId, {
      templateId,
      templateConfig: {
        variableMappings: [{ index: 0, path: 'd.customerName' }],
      },
      suggestions: [
        {
          id: 's1',
          applied: true,
          suggestedName: 'customerName',
          originalText: '客户名称',
        },
      ],
      rawSuggestions: [
        {
          id: 'raw1',
          type: 'variable',
          originalText: '客户名称',
        },
      ],
    });

    const config = await templateController.getTemplateConfig(templateId);

    expect(config.templateConfig).toEqual(
      expect.objectContaining({
        variableMappings: [{ index: 0, path: 'd.customerName' }],
      })
    );
    expect(config.suggestions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          suggestedName: 'customerName',
        }),
      ])
    );
    expect(config.rawSuggestions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          originalText: '客户名称',
        }),
      ])
    );
  });

  it('merges cached applied suggestions when generating skill guide for a template', async () => {
    const templateId = 'tpl-skill-merge-1';
    fs.writeFileSync(
      path.join(templatesDir, `${templateId}.json`),
      JSON.stringify(
        {
          id: templateId,
          fileName: 'skill-merge.docx',
          format: 'docx',
          size: 128,
          variables: [],
          loops: [],
          suggestions: [
            {
              id: 's1',
              applied: true,
              suggestedName: 'customerName',
              originalText: '客户名称',
            },
          ],
          templateConfig: {
            variableMappings: [{ index: 0, path: 'd.customerName' }],
          },
        },
        null,
        2
      )
    );

    await aiController.generateAISkill({
      templateId,
      suggestions: [
        {
          id: 's2',
          applied: true,
          suggestedName: 'projectName',
          originalText: '项目名称',
        },
      ],
      templateType: 'contract',
      documentDescription: '合同模板',
    });

    expect(aiIdentifierService.generateAISkillGuide).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          suggestedName: 'customerName',
          applied: true,
        }),
        expect.objectContaining({
          suggestedName: 'projectName',
          applied: true,
        }),
      ]),
      expect.objectContaining({
        variableMappings: [{ index: 0, path: 'd.customerName' }],
      }),
      'contract',
      '合同模板'
    );
  });
});
