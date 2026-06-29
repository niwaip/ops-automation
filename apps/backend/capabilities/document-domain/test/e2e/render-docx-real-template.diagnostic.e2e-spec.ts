import * as fs from 'fs';
import JSZip from 'jszip';
import { FileHandler } from '../../../../../capabilities/document-domain/template/lib/file';

describe('Render real DOCX template diagnostic', () => {
  it('renders template 9517d1eb without concatenating adjacent loop rows', async () => {
    const templatePath =
      '/Users/chain/Documents/MyProject/ops-automation/.data/carbone-engine/templates/9517d1eb-ee64-442a-ba67-c0dbe2a5ecf6.docx';
    const templateBuffer = fs.readFileSync(templatePath);
    const handler = new FileHandler();

    const renderedBuffer = await handler.renderTemplate(
      templateBuffer,
      {
        items: [
          {
            productName_cn: '系统开发服务',
            productName_jp: 'システム開発サービス',
            quantity_cn: '1项',
            quantity_jp: '1式',
            projectName_cn: '企业管理系统升级',
            projectName_jp: '企業管理システムアップグレード',
            maintenanceFee_cn: '人民币280,000元',
            maintenanceFee_jp: '人民元280,000円',
          },
          {
            productName_cn: '系统集成与部署',
            productName_jp: 'システムインテグレーション・導入',
            quantity_cn: '1项',
            quantity_jp: '1式',
            projectName_cn: '企业管理系统升级',
            projectName_jp: '企業管理システムアップグレード',
            maintenanceFee_cn: '人民币120,000元',
            maintenanceFee_jp: '人民元120,000円',
          },
          {
            productName_cn: '培训与技术支持',
            productName_jp: 'トレーニング・技術サポート',
            quantity_cn: '3个月',
            quantity_jp: '3ヶ月',
            projectName_cn: '企业管理系统升级',
            projectName_jp: '企業管理システムアップグレード',
            maintenanceFee_cn: '人民币100,000元',
            maintenanceFee_jp: '人民元100,000円',
          },
        ],
      },
      'draft-1779807306833.docx'
    );

    const outputZip = await JSZip.loadAsync(renderedBuffer);
    const documentXml = await outputZip.file('word/document.xml')!.async('text');
    const rows = documentXml.match(/<w:tr\b[^>]*>[\s\S]*?<\/w:tr>/g) || [];
    const targetRows = rows.filter(
      (row) =>
        row.includes('人民元280,000円') ||
        row.includes('人民元120,000円') ||
        row.includes('人民元100,000円')
    );
    const targetCells = targetRows.flatMap((row) => row.match(/<w:tc\b[\s\S]*?<\/w:tc>/g) || []);

    expect(documentXml).not.toContain('人民元280,000円企业管理系统升级');
    expect(documentXml).not.toContain('人民元120,000円企业管理系统升级');
    expect(targetRows).toHaveLength(3);
    expect(targetRows.every((row) => (row.match(/<w:tc\b/g) || []).length === 4)).toBe(true);
    expect(targetCells).toHaveLength(12);
    expect(targetCells.every((cell) => (cell.match(/<w:p\b/g) || []).length === 2)).toBe(true);
  });
});
