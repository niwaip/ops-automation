const fs = require('fs');
const path = require('path');
const { createCanvas } = require('@napi-rs/canvas');
const PDFDocument = require('pdfkit');

const TARGET_DIR = path.resolve(__dirname, '../tests/contract');

if (!fs.existsSync(TARGET_DIR)) {
  fs.mkdirSync(TARGET_DIR, { recursive: true });
}

function wrapText(ctx, text, x, startY, maxWidth, lineHeight) {
  const words = text.split('');
  let line = '';
  let y = startY;

  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n];
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && n > 0) {
      ctx.fillText(line, x, y);
      line = words[n];
      y += lineHeight;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line, x, y);
  return y;
}

function renderContractPage(title, paragraphs, width = 850, height = 1200) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Page background with slight paper tint
  ctx.fillStyle = '#fcfcfc';
  ctx.fillRect(0, 0, width, height);

  // Decorative border simulating paper scan boundary
  ctx.strokeStyle = '#e5e7eb';
  ctx.lineWidth = 1;
  ctx.strokeRect(30, 30, width - 60, height - 60);

  // Title
  ctx.fillStyle = '#111827';
  ctx.font = 'bold 26px "Hiragino Sans GB", "Heiti TC", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(title, width / 2, 85);

  ctx.textAlign = 'left';
  let y = 140;
  const lineHeight = 26;

  for (const item of paragraphs) {
    if (item.isHeader) {
      y += 12;
      ctx.font = 'bold 18px "Hiragino Sans GB", "Heiti TC", sans-serif';
      ctx.fillStyle = '#1f2937';
      y = wrapText(ctx, item.text, 60, y, width - 120, lineHeight);
      y += 4;
    } else if (item.isSubHeader) {
      y += 6;
      ctx.font = 'bold 16px "Hiragino Sans GB", "Heiti TC", sans-serif';
      ctx.fillStyle = '#374151';
      y = wrapText(ctx, item.text, 75, y, width - 135, lineHeight);
    } else {
      ctx.font = '15px "Hiragino Sans GB", "Heiti TC", sans-serif';
      ctx.fillStyle = '#4b5563';
      y = wrapText(ctx, item.text, 80, y, width - 140, lineHeight);
      y += 6;
    }
  }

  return canvas.toBuffer('image/png');
}

function createPdfFromPngBuffer(pngBuffer, outputPath) {
  return new Promise((resolve, reject) => {
    // Standard A4 size in points: 595.28 x 841.89
    const doc = new PDFDocument({ size: 'A4', margin: 0 });
    const writeStream = fs.createWriteStream(outputPath);

    doc.pipe(writeStream);
    doc.image(pngBuffer, 0, 0, { width: 595.28, height: 841.89 });
    doc.end();

    writeStream.on('finish', () => resolve());
    writeStream.on('error', reject);
  });
}

const v1Paragraphs = [
  { text: '甲方（委托方）：北京天润未来科技有限公司', isHeader: true },
  { text: '乙方（受托方）：极客智能自动化软件工程有限公司', isHeader: true },
  { text: '第一条 服务内容与研发范围', isHeader: true },
  { text: '乙方根据甲方的业务需求，为甲方定制开发“企业级智能运维与自动化审查平台”系统软件，包含主编排器、多模型路由引擎、文档解析与合规诊断模块。交付形态为Docker容器镜像及完整源代码。', isHeader: false },
  { text: '第二条 交付进度与验收标准', isHeader: true },
  { text: '1. 乙方应在合同签订之日起90个工作日内完成全部功能开发并交付甲方进行系统部署及联合测试。', isSubHeader: true },
  { text: '2. 甲方在收到交付物后10个工作日内组织专业技术人员完成验收测试；符合双方约定的技术指标的，由甲方出具书面验收合格报告。', isSubHeader: true },
  { text: '第三条 费用金额与结算方式', isHeader: true },
  { text: '1. 本项目技术服务与定制研发费用总额为人民币500,000元整（大写：人民币伍拾万元整，含税）。', isSubHeader: true },
  { text: '2. 款项分三期支付：', isSubHeader: true },
  { text: '(1) 预付款：合同签订并生效后5个工作日内，甲方向乙方支付总金额的30%（计人民币150,000元）；', isHeader: false },
  { text: '(2) 中期款：系统核心功能交付部署并经初步验收后，甲方支付总金额的40%（计人民币200,000元）；', isHeader: false },
  { text: '(3) 尾款：系统终验合格后10个工作日内，甲方向乙方结清剩余30%（计人民币150,000元）。', isHeader: false },
  { text: '第四条 知识产权与成果归属', isHeader: true },
  { text: '乙方为履行本合同所产生的所有软件源代码、技术文档、设计图纸及相关衍生成果的全部知识产权（包括但不限于著作权、专利申请权、商业秘密等），自产生之日起均排他性地归甲方单独所有。乙方不得向任何第三方泄露或转让。', isHeader: false },
  { text: '第五条 违约责任与赔偿限额', isHeader: true },
  { text: '任何一方违反本合同约定的，应当承担继续履行、采取补救措施或者赔偿损失等违约责任。若乙方延迟交付或甲方延迟付款，每日应按合同总额万分之五支付违约金。违约方所承担的累计总赔偿限额不超过本合同总金额。', isHeader: false },
  { text: '第六条 争议解决方式', isHeader: true },
  { text: '凡因本合同引起的或与本合同有关的任何争议，双方应友好协商解决；协商不成的，任何一方均有权将争议提交北京仲裁委员会，按照其现行有效的仲裁规则在北京进行仲裁裁决。', isHeader: false },
];

const v2Paragraphs = [
  { text: '甲方（委托方）：北京天润未来科技有限公司', isHeader: true },
  { text: '乙方（受托方）：极客智能自动化软件工程有限公司', isHeader: true },
  { text: '第一条 服务内容与研发范围', isHeader: true },
  { text: '乙方根据甲方的业务需求，为甲方定制开发“企业级智能运维与自动化审查平台”系统软件，包含主编排器与文档解析模块。第三方开源组件与大模型服务乙方不提供任何商用稳定性担保及安全漏洞修复。', isHeader: false },
  { text: '第二条 交付进度与验收标准', isHeader: true },
  { text: '1. 乙方应在合同签订之日起60个工作日内完成系统交付。', isSubHeader: true },
  { text: '2. 甲方在收到交付物后5个工作日内完成验收。逾期未提出明确书面异议的，视为甲方自动验收合格并认可交付质量。', isSubHeader: true },
  { text: '第三条 费用金额与结算方式', isHeader: true },
  { text: '1. 本项目技术服务与定制研发费用总额调整为人民币450,000元整（大写：人民币肆拾伍万元整，含税）。', isSubHeader: true },
  { text: '2. 款项调整为两期支付：', isSubHeader: true },
  { text: '(1) 预付款：合同签订并生效后3个工作日内，甲方向乙方支付总额的50%（计人民币225,000元）；', isHeader: false },
  { text: '(2) 尾款：系统初验后3个工作日内，甲方向乙方支付剩余50%（计人民币225,000元）。', isHeader: false },
  { text: '第四条 知识产权与成果归属', isHeader: true },
  { text: '乙方为履行本合同所产生的基础架构框架与核心算法组件知识产权归乙方所有，甲方仅享有非排他的普通商用许可权；仅定制业务逻辑代码版权归甲方所有。', isHeader: false },
  { text: '第五条 违约责任与赔偿限额', isHeader: true },
  { text: '若甲方迟延付款，每日应按应付未付金额的1%支付违约金；乙方延期交付免除迟延违约金。乙方对任何间接损失、附带损失或预期利润损失均不承担责任，且乙方最高赔偿责任不超过已收取的首期款金额。', isHeader: false },
  { text: '第六条 争议解决方式', isHeader: true },
  { text: '凡因本合同引起的或与本合同有关的任何争议，双方应友好协商解决；协商不成的，任何一方均应向乙方所在地人民法院提起诉讼管辖。', isHeader: false },
];

async function generateAll() {
  console.log('Generating scanned PDFs for test contracts in tests/contract ...');

  const v1Png = renderContractPage('技术服务与开发合同', v1Paragraphs);
  const v2Png = renderContractPage('技术服务与开发合同（修改版）', v2Paragraphs);

  const file1 = path.join(TARGET_DIR, '技术服务与开发合同.pdf');
  const file1v1 = path.join(TARGET_DIR, '技术服务与开发合同_v1_扫描版.pdf');
  const file2v2 = path.join(TARGET_DIR, '技术服务与开发合同_v2_修改版.pdf');

  await createPdfFromPngBuffer(v1Png, file1);
  await createPdfFromPngBuffer(v1Png, file1v1);
  await createPdfFromPngBuffer(v2Png, file2v2);

  console.log(`Generated: ${file1} (${fs.statSync(file1).size} bytes)`);
  console.log(`Generated: ${file1v1} (${fs.statSync(file1v1).size} bytes)`);
  console.log(`Generated: ${file2v2} (${fs.statSync(file2v2).size} bytes)`);
}

generateAll().catch((err) => {
  console.error('Failed to generate test contract PDFs:', err);
  process.exit(1);
});
