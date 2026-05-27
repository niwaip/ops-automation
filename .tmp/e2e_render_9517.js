require('/Users/chain/Documents/MyProject/ops-automation/apps/backend/domain/carbone-engine/node_modules/reflect-metadata');
require('/Users/chain/Documents/MyProject/ops-automation/apps/backend/domain/carbone-engine/node_modules/ts-node/register');

const fs = require('fs');
const path = require('path');
const request = require('/Users/chain/Documents/MyProject/ops-automation/apps/backend/domain/carbone-engine/node_modules/supertest');
const JSZip = require('/Users/chain/Documents/MyProject/ops-automation/apps/backend/domain/carbone-engine/node_modules/jszip');
const { Test } = require('/Users/chain/Documents/MyProject/ops-automation/apps/backend/domain/carbone-engine/node_modules/@nestjs/testing');
const { AppModule } = require('/Users/chain/Documents/MyProject/ops-automation/apps/backend/domain/carbone-engine/src/app.module');

async function main() {
  const root = '/Users/chain/Documents/MyProject/ops-automation';
  process.env.TEMPLATES_DIR = path.join(root, '.data/carbone-engine/templates');
  process.env.OUTPUTS_DIR = path.join(root, '.tmp/e2e_outputs_9517');
  process.env.PORT = '3011';

  fs.mkdirSync(process.env.OUTPUTS_DIR, { recursive: true });

  const payload = JSON.parse(
    fs.readFileSync(path.join(root, '.tmp/e2e_payload_9517.json'), 'utf-8')
  );

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication();
  await app.init();

  try {
    const renderRes = await request(app.getHttpServer())
      .post('/studio/render')
      .send(payload)
      .expect(200);

    const downloadId = String(renderRes.body.downloadUrl).split('/').pop();
    const outputPath = path.join(process.env.OUTPUTS_DIR, downloadId + '.docx');
    const outputBuffer = fs.readFileSync(outputPath);
    const zip = await JSZip.loadAsync(outputBuffer);
    const documentXml = await zip.file('word/document.xml').async('text');
    const rows = documentXml.match(/<w:tr\b[^>]*>[\s\S]*?<\/w:tr>/g) || [];
    const hitRows = rows.filter((row) => /人民元(?:280,000|120,000|100,000)円/.test(row));

    const previewRes = await request(app.getHttpServer())
      .get('/studio/preview-file/' + downloadId)
      .buffer(true)
      .parse((res, cb) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      })
      .expect(200);

    fs.writeFileSync(path.join(root, '.tmp/e2e_render_9517_output.docx'), outputBuffer);
    fs.writeFileSync(path.join(root, '.tmp/e2e_render_9517_document.xml'), documentXml);

    console.log(JSON.stringify({
      renderResponse: renderRes.body,
      downloadId,
      outputPath,
      previewContentType: previewRes.headers['content-type'],
      previewDisposition: previewRes.headers['content-disposition'],
      previewBytes: previewRes.body.length,
      targetRowCount: hitRows.length,
      targetRowCells: hitRows.map((row) => (row.match(/<w:tc\b/g) || []).length),
      firstTargetRowHasNextRowConcat: /人民元280,000円企业管理系统升级/.test(hitRows[0] || ''),
      snippets: hitRows.map((row) =>
        Array.from(row.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g))
          .map((match) => match[1])
          .filter(Boolean)
          .slice(0, 12)
      ),
    }, null, 2));
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
