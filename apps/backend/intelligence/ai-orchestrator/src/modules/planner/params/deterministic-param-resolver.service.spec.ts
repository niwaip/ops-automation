import { DeterministicParamResolverService } from './deterministic-param-resolver.service';

describe('DeterministicParamResolverService', () => {
  it('resolves a contract alias to its canonical enum value', () => {
    const result = new DeterministicParamResolverService().resolve('请处理华东区', {
      properties: {
        region: {
          type: 'string',
          description: '区域',
          required: true,
          enum: ['east', 'north'],
          'x-enum-aliases': { east: ['华东区'], north: ['华北区'] },
        },
      },
      required: ['region'],
    });

    expect(result.params).toEqual({ region: 'east' });
    expect(result.field_confidences).toEqual({ region: 1 });
  });

  it('ignores system context metadata blocks when resolving parameters', () => {
    const inputWithSystemContext =
      '请审查附件中的这份协议\n\n[系统上下文：已完成用户附件文档轻量元数据探测]\n- 附件文档：CT01-ja.docx\n  - 识别类型：通用办公文档 (document.general)';

    const result = new DeterministicParamResolverService().resolve(inputWithSystemContext, {
      properties: {
        category: {
          type: 'string',
          enum: ['procurement', 'general'],
        },
      },
    });

    // The user did not specify "general"; only the system context metadata had "document.general"
    expect(result.params.category).toBeUndefined();
  });

  it('resolves myPosition and contractType deterministically from user input in Chinese and Japanese', () => {
    const properties = {
      contractType: {
        type: 'string',
        enum: ['nda', 'software_development', 'procurement', 'employment', 'lease', 'general'],
        'x-enum-aliases': {
          nda: ['保密协议', '保密合同', '秘密保持契約', '守秘義務契約', '秘密保持', '守秘義務', 'NDA', 'nda'],
          software_development: ['软件开发合同', '技术开发合同', '系统开发合同', 'ソフトウェア開発委託契約', '開発委託契約'],
          procurement: ['采购合同', '买卖合同', '売買契約', '調達契約'],
        },
      },
      myPosition: {
        type: 'string',
        enum: ['buyer', 'seller', 'neutral'],
        'x-enum-aliases': {
          buyer: ['甲方', '买方', '采购方', '買主', '発注者', '甲側', '我方为甲', '我方为甲方', '我方买方', '我为甲方'],
          seller: ['乙方', '卖方', '销售方', '売主', '受注者', '乙側', '我方为乙', '我方为乙方', '我方卖方', '我为乙方'],
          neutral: ['中立', '双方', '对等'],
        },
      },
    };

    const resolver = new DeterministicParamResolverService();

    // Chinese buyer
    const resZh = resolver.resolve('我方为甲方（买方），请审查这份采购合同', { properties: properties as any });
    expect(resZh.params.myPosition).toBe('buyer');
    expect(resZh.params.contractType).toBe('procurement');
    expect(resZh.field_confidences?.myPosition).toBe(1);

    // Japanese buyer + NDA
    const resJa = resolver.resolve('当事者は買主（甲側）として秘密保持契約書をレビューして', { properties: properties as any });
    expect(resJa.params.myPosition).toBe('buyer');
    expect(resJa.params.contractType).toBe('nda');
    expect(resJa.field_confidences?.myPosition).toBe(1);

    // Chinese seller + software dev
    const resSeller = resolver.resolve('我方为乙方，请审查技术开发合同', { properties: properties as any });
    expect(resSeller.params.myPosition).toBe('seller');
    expect(resSeller.params.contractType).toBe('software_development');
  });
});
