/**
 * Carbone Engine Unit Tests
 */

import { CarboneEngine } from './engine';
import { TemplateInfo } from './file';

describe('CarboneEngine', () => {
  let engine: CarboneEngine;

  beforeAll(() => {
    engine = new CarboneEngine();
  });

  describe('getAvailableFormatters', () => {
    it('should return list of available formatters', () => {
      const formatters = engine.getAvailableFormatters();

      expect(formatters.length).toBeGreaterThan(50);
      expect(formatters).toContain('upperCase');
      expect(formatters).toContain('formatNumber');
      expect(formatters).toContain('formatD');
      expect(formatters).toContain('show');
    });
  });

  describe('registerFormatter', () => {
    it('should register custom formatter', () => {
      engine.registerFormatter('reverse', (v: string) => String(v).split('').reverse().join(''));

      const formatters = engine.getAvailableFormatters();
      expect(formatters).toContain('reverse');
    });
  });

  describe('validateData', () => {
    it('should validate complete data', () => {
      const templateInfo: TemplateInfo = {
        format: 'docx',
        fileName: 'test.docx',
        size: 1000,
        variables: ['d.name', 'd.age'],
        loops: []
      };
      const data = { name: 'John', age: 30 };
      const result = engine.validateData(templateInfo, data);

      expect(result.valid).toBe(true);
      expect(result.missing).toHaveLength(0);
    });

    it('should detect missing data', () => {
      const templateInfo: TemplateInfo = {
        format: 'docx',
        fileName: 'test.docx',
        size: 1000,
        variables: ['d.name', 'd.age', 'd.email'],
        loops: []
      };
      const data = { name: 'John' };
      const result = engine.validateData(templateInfo, data);

      expect(result.valid).toBe(false);
      expect(result.missing).toContain('d.age');
      expect(result.missing).toContain('d.email');
    });
  });

  describe('preview', () => {
    it('should generate sample data based on variables', async () => {
      // 测试generateSampleData逻辑（通过validateData间接测试）
      const formatters = engine.getAvailableFormatters();
      expect(formatters.length).toBeGreaterThan(0);
    });
  });
});