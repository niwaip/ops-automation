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

  it('correctly classifies a technical service contract containing confidentiality clauses as software_development', async () => {
    const file: ChatUploadedFileDTO = {
      fileId: 'f6',
      fileName: '中日双语技术服务合同_202606030853.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      size: 4096,
      extractedText: `
        《技术服务合同》
        甲方：某某数字科技有限公司
        乙方：富士通（中国）信息系统有限公司
        第一条 技术服务内容、方式
        第十条 保密条款与商业秘密保护
        双方对在履行本合同过程中知悉的对方商业秘密及保密信息负有严格保密义务...
      `,
    };

    const result = await service.probeSingleFile(file);
    expect(result?.docCategory).toBe('contract');
    expect(result?.docType).toBe('contract.software_development');
    expect(result?.docTypeName).toBe('软件技术开发合同');
    expect(result?.docTitle).toBe('技术服务合同');
    expect(result?.parties?.partyA).toBe('某某数字科技有限公司');
    expect(result?.parties?.partyB).toBe('富士通（中国）信息系统有限公司');
    expect(result?.matchedEntity?.party).toBe('party_b');
    expect(result?.matchedEntity?.inferredPosition).toBe('seller');
  });

  it('correctly classifies a Japanese development contract with Japanese party markers', async () => {
    const file: ChatUploadedFileDTO = {
      fileId: 'f7',
      fileName: '業務委託契約書_ソフトウェア開発.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      size: 4096,
      extractedText: `
        ソフトウェア開発委託契約書
        委託者：株式会社ABC
        受託者：富士通株式会社
        第1条 開発委託業務の内容
        第8条 秘密保持義務
      `,
    };

    const result = await service.probeSingleFile(file);
    expect(result?.docCategory).toBe('contract');
    expect(result?.docType).toBe('contract.software_development');
    expect(result?.parties?.partyA).toBe('株式会社ABC');
    expect(result?.parties?.partyB).toBe('富士通株式会社');
    expect(result?.matchedEntity?.party).toBe('party_b');
    expect(result?.matchedEntity?.inferredPosition).toBe('seller');
  });

  it('correctly filters pagination marker [第 1 页] and identifies NDA despite procurement disclaimer', async () => {
    const file: ChatUploadedFileDTO = {
      fileId: 'f8',
      fileName: 'CT03-zh.pdf',
      mimeType: 'application/pdf',
      size: 4096,
      extractedText: `
        [第 1 页]
        保密协议
        甲方：北京某某科技有限公司
        乙方：上海某某信息有限公司
        第一条 保密信息范围与定义
        双方确认，本协议的签署不构成双方进行采购、投资、合资或知识产权转让的任何承诺或约束。
        第二条 保密义务期限
      `,
    };

    const result = await service.probeSingleFile(file);
    expect(result?.docCategory).toBe('contract');
    expect(result?.docType).toBe('contract.nda');
    expect(result?.docTypeName).toBe('保密协议');
    expect(result?.docTitle).toBe('保密协议');
    expect(result?.confidence).toBeGreaterThanOrEqual(0.9);
    expect(result?.source).toBe('document_probe');
  });

  it('correctly filters Japanese Page 1 marker and handles procurement disclaimer in Japanese NDA', async () => {
    const file: ChatUploadedFileDTO = {
      fileId: 'f9',
      fileName: '98765_random.pdf',
      mimeType: 'application/pdf',
      size: 4096,
      extractedText: `
        Page 1
        秘密保持契約書
        当事者甲：ABC商事株式会社
        当事者乙：XYZテクノロジー株式会社
        第1条 秘密情報の定義
        本契約の締結は、両者間における調達、売買又は投資等の取引を義務付けるものではない。
        第2条 守秘義務
      `,
    };

    const result = await service.probeSingleFile(file);
    expect(result?.docCategory).toBe('contract');
    expect(result?.docType).toBe('contract.nda');
    expect(result?.docTypeName).toBe('保密协议');
    expect(result?.docTitle).toBe('秘密保持契約書');
    expect(result?.confidence).toBeGreaterThanOrEqual(0.9);
    expect(result?.source).toBe('document_probe');
  });
});
