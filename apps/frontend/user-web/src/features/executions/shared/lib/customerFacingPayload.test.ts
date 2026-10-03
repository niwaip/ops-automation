import { describe, expect, it } from 'vitest';
import { parseCustomerFacingPayload } from './customerFacingPayload';

describe('customerFacingPayload', () => {
  it('parses real contract review input from user screenshot into business models without raw JSON', () => {
    const rawInput = {
      url: '/api/workbench-coordination/attachments/att_8a315602-9327-4c1e-982c-24c754dc618d/download?fileName=%E4%BF%9D%E5%AF%86%E5%90%88%E5%90%8C_%E6%B5%8B%E8%AF%95%E9%AA%8C%E8%AF%81_1790841727728_v1_%E6%B3%95%E5%8A%A1%E6%89%B9%E6%B3%A8%E7%89%88.docx',
      fileUrl: '/api/workbench-coordination/attachments/att_8a315602-9327-4c1e-982c-24c754dc618d/download?fileName=%E4%BF%9D%E5%AF%86%E5%90%88%E5%90%8C_%E6%B5%8B%E8%AF%95%E9%AA%8C%E8%AF%81_1790841727728_v1_%E6%B3%95%E5%8A%A1%E6%89%B9%E6%B3%A8%E7%89%88.docx',
      fileName: '保密合同_测试验证_1790841727728_v1_法务批注版.docx',
      myPosition: 'buyer',
      downloadUrl: '/api/workbench-coordination/attachments/att_8a315602-9327-4c1e-982c-24c754dc618d/download?fileName=%E4%BF%9D%E5%AF%86%E5%90%88%E5%90%8C_%E6%B5%8B%E8%AF%95%E9%AA%8C%E8%AF%81_1790841727728_v1_%E6%B3%95%E5%8A%A1%E6%89%B9%E6%B3%A8%E7%89%88.docx',
      executionId: 'exec_nda_1790841727739',
      reviewDraft: {
        stagedComments: [
          {
            text: '【法务修改意见】 返还范围仅限定为有形载体，未明确包含电子数据、衍生多份的彻底删除及书面销毁证明。',
          },
        ],
      },
    };

    const parsed = parseCustomerFacingPayload(rawInput);
    expect(parsed.hasBusinessContent).toBe(true);

    // Document is cleanly extracted
    expect(parsed.documents).toHaveLength(1);
    expect(parsed.documents[0].name).toBe('保密合同_测试验证_1790841727728_v1_法务批注版.docx');
    expect(parsed.documents[0].url).toContain('/api/workbench-coordination/attachments/');

    // Position & settings are formatted
    expect(parsed.settings.find((s) => s.label === '审查立场')?.value).toContain('买方 / 披露方');
    expect(parsed.settings.find((s) => s.label === '关联单号')?.value).toBe('#nda_1790841727739');

    // Review comments are extracted
    expect(parsed.reviewComments).toHaveLength(1);
    expect(parsed.reviewComments[0].text).toContain('【法务修改意见】 返还范围仅限定为有形载体');

    // Raw duplicated URL keys are consumed and not leaked
    expect(parsed.remainingEntries).toHaveLength(0);
  });

  it('parses comparison inputs with基准版 A and 修订版 B', () => {
    const rawInput = {
      fileNameA: '保密合同_v1.docx',
      fileNameB: '保密合同_v2.docx',
      fileUrlA: '/api/renders/v1.docx',
      fileUrlB: '/api/renders/v2.docx',
      compareMode: 'strict',
    };

    const parsed = parseCustomerFacingPayload(rawInput);
    expect(parsed.documents).toHaveLength(2);
    expect(parsed.documents[0].name).toBe('保密合同_v1.docx');
    expect(parsed.documents[0].role).toBe('比对基准版 (A)');
    expect(parsed.documents[1].name).toBe('保密合同_v2.docx');
    expect(parsed.documents[1].role).toBe('比对修订版 (B)');
    expect(parsed.settings.find((s) => s.label === '比对模式')?.value).toBe('严格逐字红线比对');
    expect(parsed.remainingEntries).toHaveLength(0);
  });

  it('filters out internal orchestration metadata, taskContext, sourceDocxSha256 and AST content from screenshots', () => {
    const rawArchiveInput = {
      title: '测试验证_1790841727728 - 商业保密协议 (NDA)',
      content: [
        { text: '【法务电子存证归档与合规审计凭单】', type: 'heading' },
        { text: '一、归档合同基本信息', type: 'h2' },
      ],
      pageNumbers: true,
      taskContext: {
        taskId: 'coord_f7411e85-6732-4220-a386-f815a77cc759',
        stageId: 'auto_archiving',
        stageName: '电子归档与版本存证',
        workflowId: 'legal.nda.generation_and_review_flow',
        attachments: [
          {
            id: '174e8e7b76c0631a515c0cef5fcba8ef',
            url: 'http://192.168.100.143:3009/renders/174e8e7b76c0631a515c0cef5fcba8ef.pdf',
            name: '保密合同_测试验证_1790841727728_v1_法务批注版.pdf',
          },
        ],
      },
      sourceDocxName: '保密合同_测试验证_1790841727728_v1_法务批注版.docx',
      sourceDocxSha256: '14bb863656cd17b06690c49a02a653a4c769d22203195ac5093f05a9b165f121',
      stageId: 'final_receipt',
      workflowId: 'legal.nda.generation_and_review_flow',
      recipientId: 'd6f71c6c-b359-450d-b706-175b7c9866f2',
      message: '保密合同已终审通过并完成不可篡改 PDF 存证归档。凭证单号：LEGAL-ARC-756016',
      metadata: {
        orgId: 'e2bc525b-7b3e-499d-ba3d-e2a45ed9a71c',
        taskId: 'coord_f7411e85-6732-4220-a386-f815a77cc759',
      },
    };

    const parsed = parseCustomerFacingPayload(rawArchiveInput);
    expect(parsed.hasBusinessContent).toBe(true);

    // Files are cleanly extracted
    expect(parsed.documents).toHaveLength(2);
    expect(parsed.documents.map((d) => d.name)).toEqual([
      '保密合同_测试验证_1790841727728_v1_法务批注版.pdf',
      '保密合同_测试验证_1790841727728_v1_法务批注版.docx',
    ]);

    // Settings
    expect(parsed.settings.find((s) => s.label === '任务标题')?.value).toBe(
      '测试验证_1790841727728 - 商业保密协议 (NDA)'
    );
    expect(parsed.settings.find((s) => s.label === '包含页码')?.value).toBe('是');

    // Message is extracted
    expect(parsed.primaryText).toContain('保密合同已终审通过并完成不可篡改 PDF 存证归档');

    // All noise keys, AST arrays, and internal context are filtered out completely!
    expect(parsed.remainingEntries).toHaveLength(0);
  });
});
