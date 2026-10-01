import { describe, expect, it } from 'vitest';
import type { ExecutionDto } from '@/api/execution';
import {
  extractRecordBusinessTitle,
  extractRecordDeliverables,
  formatCustomerFacingResult,
  formatExecutionTimeDisplay,
} from './executionListHelpers';

describe('executionListHelpers', () => {
  describe('extractRecordBusinessTitle', () => {
    it('extracts contractTitle from input when available', () => {
      const record = {
        id: 'exec-1',
        skillId: 'contract-review',
        status: 'succeeded',
        createdAt: '2026-10-01T10:00:00Z',
        updatedAt: '2026-10-01T10:00:00Z',
        input: {
          contractTitle: '测试验证_1790841727728 - 商业保密协议 (NDA)',
        },
      } as unknown as ExecutionDto;

      expect(extractRecordBusinessTitle(record, '合同审查')).toBe(
        '测试验证_1790841727728 - 商业保密协议 (NDA)'
      );
    });

    it('extracts fileName when contractTitle is absent', () => {
      const record = {
        id: 'exec-2',
        skillId: 'contract-review',
        status: 'succeeded',
        createdAt: '2026-10-01T10:00:00Z',
        updatedAt: '2026-10-01T10:00:00Z',
        input: {
          fileName: '保密合同_豆包有限公司_v1.docx',
        },
      } as unknown as ExecutionDto;

      expect(extractRecordBusinessTitle(record, '合同审查')).toBe(
        '保密合同_豆包有限公司_v1.docx'
      );
    });

    it('extracts encoded fileName from url parameter', () => {
      const record = {
        id: 'exec-3',
        skillId: 'contract-review',
        status: 'succeeded',
        createdAt: '2026-10-01T10:00:00Z',
        updatedAt: '2026-10-01T10:00:00Z',
        input: {
          url: '/api/attachments/download?fileName=%E4%BF%9D%E5%AF%86%E5%8D%8F%E8%AE%AE.docx',
        },
      } as unknown as ExecutionDto;

      expect(extractRecordBusinessTitle(record, '合同审查')).toBe('保密协议.docx');
    });

    it('falls back to skill name if no business title is found', () => {
      const record = {
        id: 'exec-4',
        skillId: 'pdf-create',
        status: 'succeeded',
        createdAt: '2026-10-01T10:00:00Z',
        updatedAt: '2026-10-01T10:00:00Z',
        input: {},
      } as unknown as ExecutionDto;

      expect(extractRecordBusinessTitle(record, '电子归档与存证')).toBe('电子归档与存证');
    });
  });

  describe('extractRecordDeliverables', () => {
    it('extracts deliverables from normalizedResult.artifacts', () => {
      const record = {
        id: 'exec-5',
        skillId: 'pdf-create',
        status: 'succeeded',
        createdAt: '2026-10-01T10:00:00Z',
        updatedAt: '2026-10-01T10:00:00Z',
        normalizedResult: {
          artifacts: [
            {
              name: '归档报告.pdf',
              downloadUrl: '/public/renders/abc123.pdf',
              mimeType: 'application/pdf',
            },
          ],
        },
      } as unknown as ExecutionDto;

      const deliverables = extractRecordDeliverables(record);
      expect(deliverables).toHaveLength(1);
      expect(deliverables[0].name).toBe('归档报告.pdf');
      expect(deliverables[0].url).toBe('/api/renders/abc123.pdf');
      expect(deliverables[0].extension).toBe('pdf');
    });

    it('extracts deliverables from resultJson.artifacts', () => {
      const record = {
        id: 'exec-6',
        skillId: 'contract-review',
        status: 'succeeded',
        createdAt: '2026-10-01T10:00:00Z',
        updatedAt: '2026-10-01T10:00:00Z',
        resultJson: {
          artifacts: [
            {
              id: 'art-1',
              name: '合规审查报告.html',
              url: 'http://localhost:3009/renders/report.html',
              mimeType: 'text/html',
            },
          ],
        },
      } as unknown as ExecutionDto;

      const deliverables = extractRecordDeliverables(record);
      expect(deliverables).toHaveLength(1);
      expect(deliverables[0].name).toBe('合规审查报告.html');
      expect(deliverables[0].extension).toBe('html');
    });

    it('returns empty array when no artifacts or deliverables exist', () => {
      const record = {
        id: 'exec-7',
        skillId: 'notify',
        status: 'succeeded',
        createdAt: '2026-10-01T10:00:00Z',
        updatedAt: '2026-10-01T10:00:00Z',
        resultJson: {
          result: {
            summary: 'message sent',
          },
        },
      } as unknown as ExecutionDto;

      expect(extractRecordDeliverables(record)).toHaveLength(0);
    });
  });

  describe('formatCustomerFacingResult', () => {
    it('cleans markdown and extracts contract review highlights', () => {
      const record = {
        id: 'exec-8',
        skillId: 'contract-review',
        status: 'succeeded',
        createdAt: '2026-10-01T10:00:00Z',
        updatedAt: '2026-10-01T10:00:00Z',
        resultJson: {
          result: {
            summary: `### ⚖️ 合同智能合规审查完成

#### 📊 合规审查概览
- **综合合规评分**：**51 分 / 100 分**（🚨 存在重大高危漏洞）
- **条款风控统计**：共 **6** 项条款（🔴 高危 0 项，⚡ 缺失必备 2 项，🟡 中风险 4 项）

🔗 **[👉 点击查看全屏报告](http://test)**`,
          },
        },
      } as unknown as ExecutionDto;

      const res = formatCustomerFacingResult(record);
      expect(res.status).toBe('succeeded');
      expect(res.headline).toContain('合规审查完成');
      expect(res.headline).toContain('综合评分: 51 分 / 100 分（🚨 存在重大高危漏洞）');
      expect(res.headline).toContain('风控统计: 共 6 项条款');
      expect(res.headline).not.toContain('###');
      expect(res.headline).not.toContain('**');
    });

    it('formats failed executions cleanly', () => {
      const record = {
        id: 'exec-9',
        skillId: 'contract-review',
        status: 'failed',
        failureReason: '合同源文档内容哈希校验失败，文档可能已被篡改',
        createdAt: '2026-10-01T10:00:00Z',
        updatedAt: '2026-10-01T10:00:00Z',
      } as unknown as ExecutionDto;

      const res = formatCustomerFacingResult(record);
      expect(res.status).toBe('failed');
      expect(res.headline).toBe('合同源文档内容哈希校验失败，文档可能已被篡改');
    });

    it('handles raw UUID summary cleanly', () => {
      const record = {
        id: 'exec-10',
        skillId: 'notify',
        status: 'succeeded',
        resultJson: {
          result: {
            title: '协同回执办结',
            summary: 'a49b70a9-35df-4a0c-9c2e-0406af10d3ca',
          },
        },
        createdAt: '2026-10-01T10:00:00Z',
        updatedAt: '2026-10-01T10:00:00Z',
      } as unknown as ExecutionDto;

      const res = formatCustomerFacingResult(record);
      expect(res.status).toBe('succeeded');
      expect(res.headline).toBe('协同回执办结已完成');
      expect(res.subline).toBe('单号: a49b70a9');
    });
  });

  describe('formatExecutionTimeDisplay', () => {
    it('formats start time and duration correctly', () => {
      const record = {
        id: 'exec-11',
        skillId: 'test',
        status: 'succeeded',
        startedAt: '2026-10-01T08:02:33.000Z',
        endedAt: '2026-10-01T08:02:34.800Z',
        createdAt: '2026-10-01T08:02:33.000Z',
        updatedAt: '2026-10-01T08:02:34.800Z',
      } as unknown as ExecutionDto;

      const time = formatExecutionTimeDisplay(record);
      expect(time.compactTime).toMatch(/\d{2}-\d{2} \d{2}:\d{2}:\d{2}/);
      expect(time.durationLabel).toBe('耗时 1.8s');
      expect(time.isRunning).toBe(false);
    });
  });
});
