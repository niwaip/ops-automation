import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isNonContractReportFile,
  resolveContractDocVersions,
  getContractComparisonPair,
  triggerContractComparisonInAi,
} from './contractComparisonHelper';
import { useChatStore } from '../../chat/chatStore';

describe('contractComparisonHelper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('isNonContractReportFile', () => {
    it('should identify html review reports as non-contract report files', () => {
      expect(isNonContractReportFile({ name: '合同合规审查报告_v1.html' })).toBe(true);
      expect(isNonContractReportFile({ name: 'report.htm' })).toBe(true);
      expect(isNonContractReportFile({ name: 'doc.docx', url: 'http://example.com/report.html?token=123' })).toBe(true);
      expect(isNonContractReportFile({ name: 'doc.docx', mimeType: 'text/html' })).toBe(true);
    });

    it('should identify docx and pdf contracts as valid contract files', () => {
      expect(isNonContractReportFile({ name: '保密协议_v1.docx' })).toBe(false);
      expect(isNonContractReportFile({ name: '采购合同_修订版.pdf' })).toBe(false);
      expect(isNonContractReportFile({ name: '合同草案.doc' })).toBe(false);
    });
  });

  describe('resolveContractDocVersions', () => {
    it('should filter out html reports and order originals in chronological order [V1, V2]', () => {
      // In CoordinationFileReplacer, validOriginals is descending (index 0 is V2, index 1 is V1)
      const originals = [
        { name: '保密合同_v2.docx', url: 'http://example.com/v2.docx' },
        { name: '保密合同_v1.docx', url: 'http://example.com/v1.docx' },
        { name: '合同合规审查报告_v1.html', url: 'http://example.com/v1.html' },
      ];

      const result = resolveContractDocVersions(originals);
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('保密合同_v1.docx');
      expect(result[1].name).toBe('保密合同_v2.docx');
    });

    it('should append newly uploaded files to the end of the version sequence', () => {
      const originals = [
        { name: '保密合同_v1.docx', url: 'http://example.com/v1.docx' },
      ];
      const appended = [
        { name: '保密合同_v2_修订版.docx', url: 'http://example.com/v2.docx' },
      ];

      const result = resolveContractDocVersions(originals, appended);
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('保密合同_v1.docx');
      expect(result[1].name).toBe('保密合同_v2_修订版.docx');
    });
  });

  describe('getContractComparisonPair', () => {
    it('should return null when there is only 1 version', () => {
      const originals = [
        { name: '保密合同_v1.docx', url: 'http://example.com/v1.docx' },
      ];
      const pair = getContractComparisonPair(originals);
      expect(pair).toBeNull();
    });

    it('should return baseDoc and latestDoc when versions >= 2', () => {
      const originals = [
        { name: '保密合同_v2.docx', url: 'http://example.com/v2.docx' },
        { name: '保密合同_v1.docx', url: 'http://example.com/v1.docx' },
      ];
      const pair = getContractComparisonPair(originals);
      expect(pair).not.toBeNull();
      expect(pair?.baseDoc.name).toBe('保密合同_v1.docx');
      expect(pair?.latestDoc.name).toBe('保密合同_v2.docx');
      expect(pair?.totalVersions).toBe(2);
    });
  });

  describe('triggerContractComparisonInAi', () => {
    it('should invoke openWithTaskContext with platform.document.contract-comparator and prefill 比较合同', () => {
      const openSpy = vi.spyOn(useChatStore.getState(), 'openWithTaskContext');

      const baseDoc = { name: '保密合同_v1.docx', url: 'http://example.com/v1.docx' };
      const latestDoc = { name: '保密合同_v2.docx', url: 'http://example.com/v2.docx' };

      triggerContractComparisonInAi({
        taskId: 'task-123',
        taskTitle: '保密协议审批',
        baseDoc,
        latestDoc,
        parameters: { durationYears: '5年' },
      });

      expect(openSpy).toHaveBeenCalledTimes(1);
      const callArgs = openSpy.mock.calls[0];
      const context = callArgs[0];
      const defaultDraft = callArgs[1];

      expect(defaultDraft).toBe('比较合同');
      expect(context.workflowId).toBe('platform.document.contract-comparator');
      expect(context.taskId).toBe('task-123');
      expect(context.attachments).toEqual([baseDoc, latestDoc]);
      expect(context.parameters?.fileNameA).toBe('保密合同_v1.docx');
      expect(context.parameters?.fileUrlA).toBe('http://example.com/v1.docx');
      expect(context.parameters?.fileNameB).toBe('保密合同_v2.docx');
      expect(context.parameters?.fileUrlB).toBe('http://example.com/v2.docx');
    });
  });
});
