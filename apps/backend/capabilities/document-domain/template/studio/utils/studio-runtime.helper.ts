import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '@nestjs/common';
import { CarboneEngine } from '../../lib/engine';

export interface TemplateInfoForValidation {
  format: 'docx' | 'xlsx' | 'pptx' | 'html';
  fileName: string;
  size: number;
  variables: string[];
  loops: Array<{ arrayPath: string }>;
}

export function isStudioPlainObject(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function createStudioRuntime(): {
  engine: CarboneEngine;
  templatesDir: string;
  outputsDir: string;
} {
  const templatesDir = process.env.TEMPLATES_DIR || path.join(process.cwd(), 'templates');
  const outputsDir = process.env.OUTPUTS_DIR || path.join(process.cwd(), 'outputs');

  if (!fs.existsSync(templatesDir)) {
    fs.mkdirSync(templatesDir, { recursive: true });
  }
  if (!fs.existsSync(outputsDir)) {
    fs.mkdirSync(outputsDir, { recursive: true });
  }

  return {
    engine: new CarboneEngine(),
    templatesDir,
    outputsDir,
  };
}

export function createStudioControllerRuntime(controllerName: string): {
  logger: Logger;
  engine: CarboneEngine;
  templatesDir: string;
  outputsDir: string;
} {
  const runtime = createStudioRuntime();

  return {
    logger: new Logger(controllerName),
    engine: runtime.engine,
    templatesDir: runtime.templatesDir,
    outputsDir: runtime.outputsDir,
  };
}
