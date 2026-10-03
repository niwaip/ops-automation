import { DocumentProberService } from './document-prober.service';
import type { ChatUploadedFileDTO } from './chat.dto';

describe('DocumentProberService', () => {
  let service: DocumentProberService;

  beforeEach(() => {
    service = new DocumentProberService();
  });

  it('correctly classifies and extracts parties from an NDA contract', async () => {
    const file: ChatUploadedFileDTO = {
      fileId: 'f1',
      fileName: '1234 (1).docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      size: 1024,
      extractedText: `
        保密协议
        甲方：北京阿尔法智算科技有限公司
        乙方：上海贝塔数字技术有限公司
        鉴于双方正在就自动化运维项目展开合作，双方达成如下商业秘密保密条款...
      `,
    };

    const result = await service.probeSingleFile(file);
    expect(result).toBeDefined();
    expect(result?.docCategory).toBe('contract');
    expect(result?.docType).toBe('contract.nda');
    expect(result?.docTypeName).toBe('保密协议');
    expect(result?.docTitle).toBe('保密协议');
    expect(result?.parties?.partyA).toBe('北京阿尔法智算科技有限公司');
    expect(result?.parties?.partyB).toBe('上海贝塔数字技术有限公司');
  });

  it('correctly classifies a procurement contract', async () => {
    const file: ChatUploadedFileDTO = {
      fileId: 'f2',
      fileName: '服务器设备采购合同_2026.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      size: 2048,
      extractedText: `
        《硬件设备供货与买卖合同》
        采购方：广州某某云计算中心
        供货方：深圳某某服务器技术有限公司
        第一条 采购货物规格与数量...
      `,
    };

    const result = await service.probeSingleFile(file);
    expect(result).toBeDefined();
    expect(result?.docCategory).toBe('contract');
    expect(result?.docType).toBe('contract.procurement');
    expect(result?.docTypeName).toBe('采购合同');
    expect(result?.docTitle).toBe('硬件设备供货与买卖合同');
  });

  it('correctly classifies a general business report', async () => {
    const file: ChatUploadedFileDTO = {
      fileId: 'f3',
      fileName: '2026年第三季度运维总结汇报.pdf',
      mimeType: 'application/pdf',
      size: 4096,
      extractedText: `
        2026年第三季度自动化运维总体运行情况报告
        本季度集群可用性达到99.99%，未发生重大故障...
      `,
    };

    const result = await service.probeSingleFile(file);
    expect(result).toBeDefined();
    expect(result?.docCategory).toBe('document');
    expect(result?.docType).toBe('document.report');
    expect(result?.docTypeName).toBe('报告方案文档');
  });

  it('formats probed context into rich prompt instructions', async () => {
    const file: ChatUploadedFileDTO = {
      fileId: 'f4',
      fileName: '1234 (1).docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      size: 1024,
      extractedText: `保密协议\n甲方：北京阿尔法智算科技有限公司\n乙方：上海贝塔数字技术有限公司\n第一条 保密范围...`,
    };

    const probed = await service.probeFiles([file]);
    const formatted = service.formatProbedContext(probed);

    expect(formatted).toContain('已完成用户附件文档轻量预处理与特征分析');
    expect(formatted).toContain('1234 (1).docx');
    expect(formatted).toContain('保密协议 (contract.nda)');
    expect(formatted).toContain('甲方: 北京阿尔法智算科技有限公司');
    expect(formatted).toContain('乙方: 上海贝塔数字技术有限公司');
    expect(formatted).toContain('文档特征摘要：字符数');
    expect(formatted).toContain('正文哈希 sha256:');
    expect(formatted).not.toContain('第一条 保密范围');
  });

  it('correctly handles tab-separated party A and party B on the same line', async () => {
    const file: ChatUploadedFileDTO = {
      fileId: 'f5',
      fileName: '保密协议_测试.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      size: 1024,
      extractedText: '保密协议\n甲方：豆包网络科技有限公司\t乙方：富士通智能系统开发有限公司\n双方达成一致...',
    };

    const result = await service.probeSingleFile(file);
    expect(result?.parties?.partyA).toBe('豆包网络科技有限公司');
    expect(result?.parties?.partyB).toBe('富士通智能系统开发有限公司');
  });
});
