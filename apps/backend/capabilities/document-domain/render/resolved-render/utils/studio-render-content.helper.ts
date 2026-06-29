import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

type PreviewContentEngine = {
  render: (templateBuffer: Buffer, data: any, fileName: string) => Promise<Buffer>;
};

export function validateStudioTemplateContent(body: { template: string }): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  try {
    const config = JSON.parse(body.template || '{}');
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!config.templateType) {
      warnings.push('未指定模板类型');
    }

    if (config.variableMappings) {
      for (const [key, value] of Object.entries(config.variableMappings)) {
        if (!value || typeof value !== 'string') {
          errors.push(`变量映射 "${key}" 的值无效`);
        } else if (!value.startsWith('{d.')) {
          warnings.push(`变量映射 "${key}" 的值 "${value}" 建议使用 {d.xxx} 格式`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      valid: false,
      errors: [message],
      warnings: [],
    };
  }
}

export async function previewStudioTemplateContent(input: {
  body: { documentContent: string; templateConfig?: any; format?: string };
  templatesDir: string;
  outputsDir: string;
  engine: PreviewContentEngine;
}): Promise<{
  success: boolean;
  previewUrl?: string;
  sampleData?: any;
  error?: string;
}> {
  try {
    const config = input.body.templateConfig || {};
    const sampleData: Record<string, string> = {};

    if (config.variableMappings) {
      for (const [, pathValue] of Object.entries(config.variableMappings)) {
        if (typeof pathValue === 'string' && pathValue.startsWith('{d.')) {
          const pathMatch = pathValue.match(/\{d\.(\w+)\}/);
          if (pathMatch) {
            sampleData[pathMatch[1]] = `示例_${pathMatch[1]}`;
          }
        }
      }
    }

    const tempId = uuidv4();
    const format = input.body.format || 'docx';
    const tempPath = path.join(input.templatesDir, `${tempId}.${format}`);

    let templateBuffer: Buffer;
    if (input.body.documentContent.startsWith('base64:')) {
      templateBuffer = Buffer.from(input.body.documentContent.substring(7), 'base64');
    } else {
      templateBuffer = Buffer.from(input.body.documentContent, 'utf-8');
    }

    fs.writeFileSync(tempPath, templateBuffer);

    const metaPath = path.join(input.templatesDir, `${tempId}.json`);
    fs.writeFileSync(
      metaPath,
      JSON.stringify({
        id: tempId,
        format,
        fileName: `preview_${tempId}.${format}`,
        config,
        isTemp: true,
        createdAt: new Date().toISOString(),
      })
    );

    const fileName = `preview_${tempId}.${format}`;
    const result = await input.engine.render(templateBuffer, sampleData, fileName);

    const outputId = uuidv4();
    const outputPath = path.join(input.outputsDir, `${outputId}.${format}`);
    fs.writeFileSync(outputPath, Buffer.from(result));

    return {
      success: true,
      previewUrl: `/studio/preview-file/${outputId}`,
      sampleData,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      error: message,
    };
  }
}
