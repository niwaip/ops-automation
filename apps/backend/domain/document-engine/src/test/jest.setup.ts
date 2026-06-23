/**
 * Jest Setup for Unit Tests
 */

import * as fs from 'fs';
import * as path from 'path';

// 创建测试模板目录
const testTemplatesDir = path.join(__dirname, '../test_templates');
const testOutputsDir = path.join(__dirname, '../test_outputs');

beforeAll(() => {
  if (!fs.existsSync(testTemplatesDir)) {
    fs.mkdirSync(testTemplatesDir, { recursive: true });
  }
  if (!fs.existsSync(testOutputsDir)) {
    fs.mkdirSync(testOutputsDir, { recursive: true });
  }
});

afterAll(() => {
  // 清理测试输出目录
  if (fs.existsSync(testOutputsDir)) {
    const files = fs.readdirSync(testOutputsDir);
    for (const file of files) {
      fs.unlinkSync(path.join(testOutputsDir, file));
    }
  }
});
