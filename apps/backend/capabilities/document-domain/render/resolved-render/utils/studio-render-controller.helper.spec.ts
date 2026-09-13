import {
  extractPartyAName,
  extractDocumentVersion,
  formatCreationDate,
  generateStudioRenderOutputFileName,
} from './studio-render-controller.helper';

describe('studio-render-controller.helper - generateStudioRenderOutputFileName', () => {
  it('generates filename with partyA, default version, and current creation date', () => {
    const fileName = generateStudioRenderOutputFileName('保密合同.docx', 'docx', {
      partyA: { name: '豆包公司' },
    });
    const today = formatCreationDate(new Date());
    expect(fileName).toBe(`保密合同_豆包公司_v1_${today}.docx`);
  });

  it('supports partyA as direct string or nested dot notation', () => {
    const today = formatCreationDate(new Date());

    const fileName1 = generateStudioRenderOutputFileName('保密合同.docx', 'docx', {
      partyA: '豆包公司',
    });
    expect(fileName1).toBe(`保密合同_豆包公司_v1_${today}.docx`);

    const fileName2 = generateStudioRenderOutputFileName('保密合同.docx', 'docx', {
      'partyA.name': '阿里巴巴',
    });
    expect(fileName2).toBe(`保密合同_阿里巴巴_v1_${today}.docx`);

    const fileName3 = generateStudioRenderOutputFileName('保密合同.docx', 'docx', {
      firstParty: { name: '腾讯公司' },
    });
    expect(fileName3).toBe(`保密合同_腾讯公司_v1_${today}.docx`);

    const fileName4 = generateStudioRenderOutputFileName('保密合同.docx', 'docx', {
      甲方: '百度公司',
    });
    expect(fileName4).toBe(`保密合同_百度公司_v1_${today}.docx`);
  });

  it('sanitizes illegal filename characters in partyA name and templateName', () => {
    const today = formatCreationDate(new Date());
    const fileName = generateStudioRenderOutputFileName('保密:合同?.docx', 'docx', {
      partyA: { name: '豆/包\\公*司"<>|' },
    });
    expect(fileName).toBe(`保密合同_豆包公司_v1_${today}.docx`);
  });

  it('formats version with v prefix if provided as number or string', () => {
    const today = formatCreationDate(new Date());

    const fileName1 = generateStudioRenderOutputFileName('保密合同.docx', 'docx', {
      partyA: { name: '豆包公司' },
      version: 2,
    });
    expect(fileName1).toBe(`保密合同_豆包公司_v2_${today}.docx`);

    const fileName2 = generateStudioRenderOutputFileName('保密合同.docx', 'docx', {
      partyA: { name: '豆包公司' },
      version: 'v2.1',
    });
    expect(fileName2).toBe(`保密合同_豆包公司_v2.1_${today}.docx`);
  });

  it('gracefully handles missing partyA by omitting the partyA segment', () => {
    const today = formatCreationDate(new Date());
    const fileName = generateStudioRenderOutputFileName('保密合同.docx', 'docx', {});
    expect(fileName).toBe(`保密合同_v1_${today}.docx`);
  });
});
