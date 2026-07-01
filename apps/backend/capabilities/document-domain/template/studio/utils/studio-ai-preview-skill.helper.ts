import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

type PreviewWithSkillDeps = {
  templatesDir: string;
  outputsDir: string;
  verboseDebugEnabled: boolean;
  logger: {
    debug: (message: string) => void;
  };
  engine: {
    render: (templateBuffer: Buffer, data: any, fileName: string) => Promise<Buffer>;
  };
  getSkillWithDbFallback: (id: string) => Promise<any>;
  buildHydratedSkillSampleData: (skill: any) => Record<string, any> | null;
  generateSimulatedData: (skill: any) => any;
  normalizeRenderData: (data: Record<string, any>) => Record<string, any>;
  getTemplateMeta: (id: string) => Record<string, any>;
  syncRenderOutputToDb: (meta: Record<string, any>, filePath: string) => Promise<void>;
};

type PreviewWithSkillInput = {
  body: { templateId?: string; skillId?: string; skill?: any; simulatedData?: any };
};

export async function executePreviewWithSkill(
  deps: PreviewWithSkillDeps,
  input: PreviewWithSkillInput
): Promise<{
  success: boolean;
  previewUrl?: string;
  downloadUrl?: string;
  generatedData?: any;
  skillUsed?: any;
  error?: string;
  debugLogs?: string[];
}> {
  const { body } = input;
  const debugLogs: string[] = [];
  const addLog = (message: string) => {
    if (deps.verboseDebugEnabled) {
      deps.logger.debug(message);
    }
    debugLogs.push(message);
  };

  try {
    addLog('[步骤1] 开始预览验证流程');
    addLog(
      `[步骤1] 请求参数: templateId=${body.templateId}, skillId=${body.skillId}, hasSkill=${!!body.skill}`
    );

    let skill = body.skill;
    if (body.skillId && !skill) {
      skill = await deps.getSkillWithDbFallback(body.skillId);
      if (skill) {
        addLog(`[步骤2] 从存储加载skill: ${body.skillId}`);
      }
    }

    if (!skill) {
      addLog('[错误] Skill not found');
      return { success: false, error: 'Skill not found', debugLogs };
    }

    addLog(`[步骤2] Skill信息: id=${skill.id}, parameters数量=${skill.parameters?.length || 0}`);
    if (skill.parameters) {
      addLog(
        `[步骤2] Skill参数列表: ${JSON.stringify(skill.parameters.map((p: any) => ({ name: p.name, example: p.example })))}`
      );
    }

    let simulatedData = body.simulatedData;
    if (!simulatedData) {
      addLog('[步骤3] 开始生成模拟数据...');
      const seedData = deps.buildHydratedSkillSampleData(skill);
      if (seedData) {
        simulatedData = seedData;
        addLog('[步骤3] 使用 skill.dataExampleJson 作为模拟数据');
      } else {
        simulatedData = deps.generateSimulatedData(skill);
        addLog('[步骤3] skill.dataExampleJson 不可用，回退到 generateSimulatedData');
      }
      addLog(`[步骤3] 生成的数据结构: ${JSON.stringify(simulatedData, null, 2)}`);
    } else {
      addLog(`[步骤3] 使用提供的模拟数据: ${JSON.stringify(simulatedData)}`);
    }

    simulatedData = deps.normalizeRenderData(simulatedData || {});
    addLog(`[步骤3] 归一化后的数据结构: ${JSON.stringify(simulatedData, null, 2)}`);

    let templateBuffer: Buffer | undefined;
    let templateId = body.templateId || skill.templateId;
    let format = 'docx';

    addLog(`[步骤4] 查找模板: templateId=${templateId}`);

    if (templateId) {
      const meta = deps.getTemplateMeta(templateId);
      format = meta.format || 'docx';
      const templatePath = path.join(deps.templatesDir, `${templateId}.${format}`);
      addLog(`[步骤4] 模板路径: ${templatePath}`);
      if (fs.existsSync(templatePath)) {
        templateBuffer = fs.readFileSync(templatePath);
        addLog(`[步骤4] 模板加载成功, 大小: ${templateBuffer.length} bytes`);
      } else {
        addLog(`[错误] 模板文件不存在: ${templatePath}`);
      }
    }

    if (!templateBuffer) {
      addLog('[错误] Template not found');
      return { success: false, error: 'Template not found', debugLogs };
    }

    addLog('[步骤5] 开始渲染预览...');
    const outputId = uuidv4();
    const outputBuffer = await deps.engine.render(
      templateBuffer,
      simulatedData,
      `preview_${outputId}.${format}`
    );
    addLog(`[步骤5] 渲染完成, 输出大小: ${outputBuffer.length} bytes`);

    const outputPath = path.join(deps.outputsDir, `${outputId}.${format}`);
    fs.writeFileSync(outputPath, Buffer.from(outputBuffer));
    addLog(`[步骤6] 输出保存到: ${outputPath}`);

    const outputMeta = {
      id: outputId,
      templateId,
      skillId: skill.id,
      format,
      fileName: `preview_${outputId}.${format}`,
      createdAt: new Date().toISOString(),
      simulatedData,
      debugLogs,
    };
    const outputMetaPath = path.join(deps.outputsDir, `${outputId}.json`);
    fs.writeFileSync(outputMetaPath, JSON.stringify(outputMeta));
    await deps.syncRenderOutputToDb(outputMeta, outputPath);

    addLog('[完成] 预览验证成功!');

    return {
      success: true,
      previewUrl: `/studio/preview-file/${outputId}`,
      downloadUrl: `/studio/download/${outputId}`,
      generatedData: simulatedData,
      skillUsed: skill,
      debugLogs,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    addLog(`[异常] ${message}`);
    if (error instanceof Error && error.stack) {
      addLog(`[异常堆栈] ${error.stack}`);
    }
    return {
      success: false,
      error: message,
      debugLogs,
    };
  }
}
