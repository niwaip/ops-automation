import { ChatResultNormalizerService } from './chat-result-normalizer.service';

describe('ChatResultNormalizerService', () => {
  const service = new ChatResultNormalizerService();

  it('normalizes standard workflow result envelope', () => {
    const normalized = service.normalize(
      {
        execution: {
          status: 'success',
          executionId: 'exec-1',
        },
        result: {
          resultType: 'report',
          title: '销售日报',
          summary: '日报已生成并发送。',
          businessData: {
            orderCount: 12,
          },
        },
        artifacts: [
          {
            type: 'file',
            name: 'report.pdf',
            downloadUrl: 'https://example.com/report.pdf',
          },
        ],
        presentation: {
          preferAiSummary: true,
          summaryFormat: 'markdown',
          detailText: '## 销售日报\n\n- 订单数: 12',
          detailFormat: 'markdown',
        },
      },
      {
        executionId: 'exec-1',
        status: 'success',
      }
    );

    expect(normalized.resultType).toBe('report');
    expect(normalized.title).toBe('销售日报');
    expect(normalized.summary).toBe('日报已生成并发送。');
    expect(normalized.summaryFormat).toBe('markdown');
    expect(normalized.detailText).toBe('## 销售日报\n\n- 订单数: 12');
    expect(normalized.detailFormat).toBe('markdown');
    expect(normalized.structuredData).toEqual({ orderCount: 12 });
    expect(normalized.downloadUrl).toBe('https://example.com/report.pdf');
    expect(normalized.hasBusinessResult).toBe(true);
  });

  it('falls back to legacy result fields', () => {
    const normalized = service.normalize(
      {
        summary: '同步完成，共处理 18 条记录。',
        output: {
          processedCount: 18,
        },
        temporalLink: 'https://temporal.local/executions/exec-2',
      },
      {
        executionId: 'exec-2',
        status: 'success',
      }
    );

    expect(normalized.summary).toBe('同步完成，共处理 18 条记录。');
    expect(normalized.structuredData).toEqual({ processedCount: 18 });
    expect(normalized.temporalLink).toBe('https://temporal.local/executions/exec-2');
    expect(service.formatForChat(normalized, 'exec-2')).toBe('同步完成，共处理 18 条记录。');
  });

  it('treats string result field as user-readable summary instead of structured json', () => {
    const normalized = service.normalize(
      {
        result: 'Beijing 天气报告\n\n【今天概览】\n当前天气：Mist',
        temporalLink: 'https://temporal.local/executions/exec-3',
      },
      {
        executionId: 'exec-3',
        status: 'success',
      }
    );

    expect(normalized.summary).toBe('Beijing 天气报告\n\n【今天概览】\n当前天气：Mist');
    expect(normalized.body).toBe('Beijing 天气报告\n\n【今天概览】\n当前天气：Mist');
    expect(normalized.structuredData).toBeUndefined();
    expect(service.formatForChat(normalized, 'exec-3')).toBe(
      'Beijing 天气报告\n\n【今天概览】\n当前天气：Mist'
    );
  });

  it('summarizes rendered document result instead of dumping raw json', () => {
    const normalized = service.normalize(
      {
        format: 'docx',
        status: 'rendered',
        skillId: 'skill-1',
        fileName: '保密合同_202606151327.docx',
        templateId: 'template-1',
        downloadUrl: 'https://example.com/generated.docx',
      },
      {
        executionId: 'exec-4',
        status: 'success',
      }
    );

    expect(normalized.downloadUrl).toBe('https://example.com/generated.docx');
    expect(service.formatForChat(normalized, 'exec-4')).toBe(
      '文档已生成。\n- 文件名：保密合同_202606151327.docx\n- 格式：DOCX\n- 可直接下载查看。'
    );
  });
});
