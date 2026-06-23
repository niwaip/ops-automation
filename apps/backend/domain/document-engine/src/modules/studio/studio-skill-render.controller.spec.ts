import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { StudioSkillRenderController } from './studio-skill-render.controller';
import { StudioSkillRenderDataService } from './studio-skill-render-data.service';

describe('StudioSkillRenderController', () => {
  let tempRootDir: string;
  let templatesDir: string;
  let originalTemplatesDir: string | undefined;
  let controller: StudioSkillRenderController;
  let templateRepository: { findById: jest.Mock };
  let skillRepository: { findById: jest.Mock };

  beforeEach(() => {
    tempRootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-skill-render-'));
    templatesDir = path.join(tempRootDir, 'templates');
    fs.mkdirSync(templatesDir, { recursive: true });

    originalTemplatesDir = process.env.TEMPLATES_DIR;
    process.env.TEMPLATES_DIR = templatesDir;

    templateRepository = {
      findById: jest.fn().mockResolvedValue(null),
    };
    skillRepository = {
      findById: jest.fn().mockResolvedValue(null),
    };

    const service = new StudioSkillRenderDataService(
      templateRepository as any,
      skillRepository as any
    );
    controller = new StudioSkillRenderController(service);
  });

  afterEach(() => {
    if (originalTemplatesDir === undefined) {
      delete process.env.TEMPLATES_DIR;
    } else {
      process.env.TEMPLATES_DIR = originalTemplatesDir;
    }
    fs.rmSync(tempRootDir, { recursive: true, force: true });
  });

  it('builds standardized render-resolved request from skill sample data', async () => {
    const skillId = 'skill-standard';
    const templateId = 'tpl-standard';

    fs.writeFileSync(
      path.join(templatesDir, `skill_${skillId}.json`),
      JSON.stringify({
        id: skillId,
        templateId,
        dataExampleJson: JSON.stringify({
          contract: {
            partyA: {
              name_cn: '上海云章科技有限公司',
            },
          },
          items: [
            {
              productName_cn: '服务A',
            },
          ],
        }),
        parameters: [],
      })
    );

    const result = await controller.generateRenderDataWithSkill({
      templateId,
      skillId,
      publishedSkillId: 'published-1',
      outputName: '标准合同',
      outputFormat: 'docx',
    });

    expect(result.success).toBe(true);
    expect(result.generatedData).toEqual({
      contract: {
        partyA: {
          name_cn: '上海云章科技有限公司',
        },
      },
      items: [
        {
          productName_cn: '服务A',
        },
      ],
    });
    expect(result.renderResolvedRequest).toEqual({
      templateId,
      skillId,
      publishedSkillId: 'published-1',
      data: {
        contract: {
          partyA: {
            name_cn: '上海云章科技有限公司',
          },
        },
        items: [
          {
            productName_cn: '服务A',
          },
        ],
      },
      outputName: '标准合同',
      outputFormat: 'docx',
    });
  });

  it('uses template-linked skill and normalizes caller simulatedData before render-resolved', async () => {
    const skillId = 'skill-linked';
    const templateId = 'tpl-linked';

    fs.writeFileSync(
      path.join(templatesDir, `${templateId}.json`),
      JSON.stringify({
        id: templateId,
        format: 'docx',
        fileName: 'linked.docx',
        skillId,
      })
    );
    fs.writeFileSync(
      path.join(templatesDir, `skill_${skillId}.json`),
      JSON.stringify({
        id: skillId,
        templateId,
        dataExampleJson: JSON.stringify({
          contract: {
            partyA: {
              name_cn: '旧值',
            },
          },
        }),
        parameters: [],
      })
    );

    const result = await controller.generateRenderDataWithSkill({
      templateId,
      simulatedData: {
        d: {
          contract: {
            partyA: {
              name_cn: '新值',
            },
          },
        },
        'items[].productName_cn': ['服务A', '服务B'],
      },
    });

    expect(result.success).toBe(true);
    expect(result.renderResolvedRequest?.skillId).toBe(skillId);
    expect(result.generatedData).toEqual({
      contract: {
        partyA: {
          name_cn: '新值',
        },
      },
      items: [{ productName_cn: '服务A' }, { productName_cn: '服务B' }],
    });
  });
});
