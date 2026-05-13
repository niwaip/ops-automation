import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import { FileHandler } from '../../lib/file';

describe('Render XLSX from JSON (e2e)', () => {
  it('should render scalar fields and loop tables for contract payload 868fedc2-8e9a-4202-a949-eedf0b133394', async () => {
    const data = {
      subject: '乙方向甲方提供工业机器人、伺服模组、视觉检测工站及配套自动化设备，用于甲方苏州智能产线升级项目',
      qualityStandard: '乙方提供的设备应符合国家标准GB/T 30029-2013、行业规范FANUC机器人标准及甲方技术协议要求，确保设备性能稳定、精度达标',
      deliveryLocation: '交付地点为江苏省苏州市工业园区星海智造二期厂房，甲方指定收货区域',
      installationTerms: '乙方应在设备到场后7日内完成安装与联调，并配合甲方进行系统集成测试，确保设备与甲方现有产线无缝对接',
      otherTerms: '双方确认所有往来通知均以加盖公章的书面文件或双方授权代表签字的电子文档为准',
      items: [
        {
          seq: '1',
          materialCode: 'RB-6A-001',
          deviceName: '六轴工业机器人',
          specModel: 'XR-600',
          unit: '台',
          quantity: '4',
          taxedPrice: '185000',
          taxedSubtotal: '740000',
        },
        {
          seq: '2',
          materialCode: 'SRV-5B-002',
          deviceName: '伺服模组',
          specModel: 'SM-200',
          unit: '套',
          quantity: '8',
          taxedPrice: '35000',
          taxedSubtotal: '280000',
        },
        {
          seq: '3',
          materialCode: 'VIS-3C-003',
          deviceName: '视觉检测工站',
          specModel: 'VC-500',
          unit: '套',
          quantity: '2',
          taxedPrice: '120000',
          taxedSubtotal: '240000',
        },
      ],
      deliveryItems: [
        {
          batch: '第一批',
          location: '苏州工业园区星海智造二期厂房',
          arrivalDate: '2026-06-15',
          installationDate: '2026-06-22',
          acceptanceType: '到货+安装验收',
        },
        {
          batch: '第二批',
          location: '苏州工业园区星海智造二期厂房',
          arrivalDate: '2026-07-10',
          installationDate: '2026-07-17',
          acceptanceType: '到货+安装验收',
        },
      ],
      acceptanceStandard: '设备运行稳定72小时无重大异常，核心性能指标达到技术协议要求，包括机器人重复定位精度±0.05mm，视觉检测准确率≥99.5%',
      installationCondition: '安装服务已启用，乙方需完成现场联调后再组织最终验收，甲方需提供必要的安装场地、电源及气源接口',
      contractNumber: 'PC-2026-0178',
      signingDate: '2026-05-09',
      buyerParty: '星海智造科技有限公司',
      currency: 'CNY',
      supplierParty: '华东精工设备股份有限公司',
      hasInstallationService: '是',
      projectName: '苏州智能产线升级项目',
      warrantyPeriodMonths: '24',
      contractSummary: '本合约用于苏州智能产线升级项目采购工业机器人、伺服模组、视觉检测工站等设备，总金额1160000元，含24个月质保期',
      paymentSchedule: [
        {
          node: '预付款',
          condition: '合同生效且收到预付款发票后5个工作日内',
          ratio: '0.3',
          amount: '348000',
        },
        {
          node: '到货款',
          condition: '设备到场验收合格后5个工作日内',
          ratio: '0.5',
          amount: '580000',
        },
        {
          node: '验收款',
          condition: '设备安装调试验收合格后10个工作日内',
          ratio: '0.15',
          amount: '174000',
        },
        {
          node: '质保金',
          condition: '质保期满且设备运行无质量问题后10个工作日内',
          ratio: '0.05',
          amount: '58000',
        },
      ],
      latePaymentPenaltyRatio: '每日按迟延部分货款的0.3%计收违约金',
      qualityLiability: '若设备存在重大质量缺陷，乙方应在48小时内响应，并在5个工作日内提供解决方案或更换设备',
    };

    const workbook = XLSX.utils.book_new();
    const rows: Array<Array<string>> = [
      ['字段', '值'],
      ['subject', '{d.subject}'],
      ['contractNumber', '{d.contractNumber}'],
      ['signingDate', '{d.signingDate}'],
      ['buyerParty', '{d.buyerParty}'],
      ['supplierParty', '{d.supplierParty}'],
      ['acceptanceStandard', '{d.acceptanceStandard}'],
      ['installationCondition', '{d.installationCondition}'],
      ['latePaymentPenaltyRatio', '{d.latePaymentPenaltyRatio}'],
      ['qualityLiability', '{d.qualityLiability}'],
      ['items', ''],
      ['{#d.items}{d.items[].seq}', '{d.items[].materialCode}', '{d.items[].deviceName}', '{d.items[].specModel}', '{d.items[].unit}', '{d.items[].quantity}', '{d.items[].taxedPrice}', '{d.items[].taxedSubtotal}{/d.items}'],
      ['deliveryItems', ''],
      ['{#d.deliveryItems}{d.deliveryItems[].batch}', '{d.deliveryItems[].arrivalDate}', '{d.deliveryItems[].installationDate}', '{d.deliveryItems[].acceptanceType}{/d.deliveryItems}'],
      ['paymentSchedule', ''],
      ['{#d.paymentSchedule}{d.paymentSchedule[].node}', '{d.paymentSchedule[].ratio}', '{d.paymentSchedule[].amount}', '{d.paymentSchedule[].condition}{/d.paymentSchedule}'],
    ];
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(workbook, sheet, '合同');
    const templateBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx', bookSST: true }) as Buffer;

    const templateZip = await JSZip.loadAsync(templateBuffer);
    const sharedStringsXml = await templateZip.file('xl/sharedStrings.xml')!.async('text');
    expect(sharedStringsXml).toContain('{d.latePaymentPenaltyRatio}');
    expect(sharedStringsXml).toContain('{d.qualityLiability}');
    expect(sharedStringsXml).toContain('{#d.items}');

    const handler = new FileHandler();
    const renderedBuffer = await handler.renderTemplate(templateBuffer, data, 'preview.xlsx');

    const renderedWorkbook = XLSX.read(renderedBuffer, { type: 'buffer' });
    const renderedSheet = renderedWorkbook.Sheets['合同'];
    expect(renderedSheet).toBeDefined();

    const cell = (addr: string) => {
      const v = renderedSheet[addr]?.v;
      return v == null ? '' : String(v);
    };

    expect(cell('B2')).toBe(data.subject);
    expect(cell('B3')).toBe(data.contractNumber);
    expect(cell('B7')).toBe(data.acceptanceStandard);
    expect(cell('B8')).toBe(data.installationCondition);
    expect(cell('B9')).toBe(data.latePaymentPenaltyRatio);
    expect(cell('B10')).toBe(data.qualityLiability);

    expect(cell('A12')).toBe('1');
    expect(cell('B12')).toBe('RB-6A-001');
    expect(cell('A13')).toBe('2');
    expect(cell('A14')).toBe('3');

    expect(cell('A14')).toBe(data.items[2].seq);
    expect(cell('C14')).toBe(data.items[2].deviceName);

    expect(cell('A16')).toBe(data.deliveryItems[0].batch);
    expect(cell('B16')).toBe(data.deliveryItems[0].arrivalDate);
    expect(cell('A17')).toBe(data.deliveryItems[1].batch);

    expect(cell('A19')).toBe(data.paymentSchedule[0].node);
    expect(cell('B19')).toBe(data.paymentSchedule[0].ratio);
    expect(cell('A22')).toBe(data.paymentSchedule[3].node);
    expect(cell('C22')).toBe(data.paymentSchedule[3].amount);

    const outputZip = await JSZip.loadAsync(renderedBuffer);
    const renderedSharedStringsXml = await outputZip.file('xl/sharedStrings.xml')!.async('text');
    expect(renderedSharedStringsXml).toContain('每日按迟延部分货款的0.3%计收违约金');
    expect(renderedSharedStringsXml).toContain('重大质量缺陷');
    expect(renderedSharedStringsXml).toContain('运行稳定72小时');
    expect(renderedSharedStringsXml).toContain('安装服务已启用');
    expect(renderedSharedStringsXml).not.toContain('{d.latePaymentPenaltyRatio}');
    expect(renderedSharedStringsXml).not.toContain('{d.qualityLiability}');
  });
});

