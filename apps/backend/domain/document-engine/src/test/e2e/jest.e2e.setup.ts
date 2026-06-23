/**
 * Jest Setup for E2E Tests
 */

import * as fs from 'fs';
import * as path from 'path';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../../app.module';
import { NestApplication } from '@nestjs/core';

let app: NestApplication;
let templatesDir: string;
let outputsDir: string;

export async function setupTestApp(): Promise<NestApplication> {
  templatesDir = path.join(__dirname, '../test_templates_e2e');
  outputsDir = path.join(__dirname, '../test_outputs_e2e');

  // 创建测试目录
  if (!fs.existsSync(templatesDir)) {
    fs.mkdirSync(templatesDir, { recursive: true });
  }
  if (!fs.existsSync(outputsDir)) {
    fs.mkdirSync(outputsDir, { recursive: true });
  }

  // 设置环境变量
  process.env.TEMPLATES_DIR = templatesDir;
  process.env.OUTPUTS_DIR = outputsDir;
  process.env.PORT = '3010';

  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  app = moduleFixture.createNestApplication();
  await app.init();

  return app;
}

export async function teardownTestApp(): Promise<void> {
  if (app) {
    await app.close();
  }

  // 清理测试目录
  if (fs.existsSync(templatesDir)) {
    const files = fs.readdirSync(templatesDir);
    for (const file of files) {
      fs.unlinkSync(path.join(templatesDir, file));
    }
  }
  if (fs.existsSync(outputsDir)) {
    const files = fs.readdirSync(outputsDir);
    for (const file of files) {
      fs.unlinkSync(path.join(outputsDir, file));
    }
  }
}

export function getTemplatesDir(): string {
  return templatesDir;
}

export function getOutputsDir(): string {
  return outputsDir;
}
