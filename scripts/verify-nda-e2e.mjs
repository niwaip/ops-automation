// scripts/verify-nda-e2e.mjs
import assert from 'node:assert';
import crypto from 'node:crypto';
import JSZip from 'jszip';

const BASE_URL = process.env.PLATFORM_URL || 'http://127.0.0.1:3001';
const CONTROL_PLANE_URL = process.env.CONTROL_PLANE_URL || 'http://127.0.0.1:3003/api';

async function request(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: res.status, ok: res.ok, data, text, headers: res.headers };
}

async function login(username, password) {
  const res = await request(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    throw new Error(`Login failed for ${username}: ${res.status} ${res.text}`);
  }
  return res.data;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  console.log('🚀 Starting NDA Workflow End-to-End Verification against', BASE_URL);

  // 1. Authenticate users
  console.log('\n--- [Step 1] Authenticating test users ---');
  const adminAuth = await login('admin', 'admin123');
  console.log('✅ Admin login OK: admin (id: ' + adminAuth.user.id + ')');

  const testAuth = await login('test', 'test123');
  console.log('✅ Test user login OK: test (id: ' + testAuth.user.id + ')');

  const law01Auth = await login('law01', 'test123');
  console.log('✅ Law01 user login OK: law01 (id: ' + law01Auth.user.id + ')');

  const testHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${testAuth.accessToken}`,
  };
  const lawHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${law01Auth.accessToken}`,
  };
  const adminHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${adminAuth.accessToken}`,
  };

  // 2. Gate 1: Empty Document Approval Protection (400 Bad Request)
  console.log('\n--- [Gate 1] Empty Document Approval Protection (Expect 400) ---');
  const emptyTaskRes = await request(`${BASE_URL}/workbench-coordination/tasks`, {
    method: 'POST',
    headers: testHeaders,
    body: JSON.stringify({
      assigneeId: testAuth.user.id,
      assigneeName: 'test',
      title: '[待发送] 空文档测试任务',
      content: '测试无有效文档时提交应当被拦截',
      workflowId: 'legal.nda.generation_and_review_flow',
      parameters: {
        contractTitle: '空文档测试',
      },
      attachments: [],
    }),
  });
  assert.strictEqual(emptyTaskRes.status, 201, `Create empty task failed: ${emptyTaskRes.text}`);
  const emptyTaskId = emptyTaskRes.data.taskId || emptyTaskRes.data.task?.id || emptyTaskRes.data.id;
  console.log('Created empty document task:', emptyTaskId);

  const emptyApproveRes = await request(`${BASE_URL}/workbench-coordination/tasks/${emptyTaskId}/action`, {
    method: 'POST',
    headers: testHeaders,
    body: JSON.stringify({ action: 'approve', comment: '尝试在没有文档的情况下发送' }),
  });
  console.log('Empty approve status:', emptyApproveRes.status);
  console.log('Empty approve response:', emptyApproveRes.data);
  assert.strictEqual(emptyApproveRes.status, 400, 'Expected HTTP 400 when approving without document');
  assert.match(emptyApproveRes.data.message, /无法提交送审|未包含有效的合同/, 'Expected error message mentioning missing contract document');
  console.log('✅ Gate 1 PASSED: Empty document was successfully blocked with HTTP 400.');

  // 3. Gate 2: Unauthorized Operator Check (Expect 403)
  console.log('\n--- [Gate 2] Unauthorized Operator Check (Expect 403) ---');
  const uniqueCompany = `测试验证_${Date.now()}`;
  const ndaLines = [
    '商业保密协议',
    '甲方：北京智能科技有限公司',
    `乙方：${uniqueCompany}`,
    '鉴于双方正在进行业务合作洽谈，双方达成如下商业保密协议：',
    '第一条 保密信息范围与界定',
    '保密信息包括但不限于双方在商务合作过程中披露的技术方案、经营数据、财务预测及商业计划。',
    '第二条 保密期限',
    '本协议项下保密义务期限为自本协议签署之日起三（3）年。',
    '第三条 保密除外情形',
    '下列信息不属于保密信息：非因接收方过错已为公众所知悉的信息；接收方在披露前已合法持有的信息；由司法机关或政府监管机构强制要求披露的信息。',
    '第四条 违约责任',
    '如任何一方违反本协议约定擅自泄露或不当使用保密信息，违约方应向守约方支付违约金人民币 500,000 元（伍拾万元整）；违约金不足以弥补守约方损失的，应赔偿全部实际直接损失。',
    '第五条 争议解决与法律适用',
    '本协议适用中华人民共和国法律。因本协议引起的任何争议，应向甲方所在地有管辖权的人民法院提起诉讼。',
  ];

  const initialZip = new JSZip();
  initialZip.file('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  initialZip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  initialZip.file('word/_rels/document.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>');
  const escapeXmlHelper = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const pXml = ndaLines.map((line) => `<w:p><w:r><w:t>${escapeXmlHelper(line)}</w:t></w:r></w:p>`).join('');
  initialZip.file('word/document.xml', `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${pXml}</w:body></w:document>`);
  const docxBuf = await initialZip.generateAsync({ type: 'nodebuffer' });

  const formData = new FormData();
  formData.append('file', new Blob([docxBuf], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), `保密合同_${uniqueCompany}_v1.docx`);

  const uploadRes = await fetch(`${BASE_URL}/workbench-coordination/tasks/upload-attachment`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${testAuth.accessToken}`,
    },
    body: formData,
  });
  assert.ok(uploadRes.ok, `Failed to upload real docx fixture: ${uploadRes.status}`);
  const uploadedDoc = await uploadRes.json();
  console.log('✅ Real contract DOCX fixture uploaded to storage:', uploadedDoc.name, uploadedDoc.attachmentId);

  const validTaskRes = await request(`${BASE_URL}/workbench-coordination/tasks`, {
    method: 'POST',
    headers: testHeaders,
    body: JSON.stringify({
      assigneeId: testAuth.user.id,
      assigneeName: 'test',
      title: `[待发送] ${uniqueCompany} - 商业保密协议 (NDA)`,
      content: '请确认保密合同初稿并发送法务把关审查',
      workflowId: 'legal.nda.generation_and_review_flow',
      parameters: {
        contractTitle: `${uniqueCompany} - 商业保密协议 (NDA)`,
        counterpartyName: uniqueCompany,
        durationYears: 3,
        penaltyAmount: 500000,
        fileName: `保密合同_${uniqueCompany}_v1.docx`,
        executionId: `exec_nda_${Date.now()}`,
        text: ndaLines.join('\n'),
      },
      attachments: [uploadedDoc],
    }),
  });
  assert.strictEqual(validTaskRes.status, 201, `Create valid task failed: ${validTaskRes.text}`);
  const initialTaskId = validTaskRes.data.taskId || validTaskRes.data.task?.id || validTaskRes.data.id;
  console.log('Created valid task:', initialTaskId);

  // [Gate 2.1] Task Creation Idempotency Check (F7)
  console.log('\n--- [Gate 2.1] Task Creation Idempotency Check (F7) ---');
  const duplicateTaskRes = await request(`${BASE_URL}/workbench-coordination/tasks`, {
    method: 'POST',
    headers: testHeaders,
    body: JSON.stringify({
      assigneeId: testAuth.user.id,
      assigneeName: 'test',
      title: `[待发送] 重复提交任务`,
      content: '测试幂等性',
      workflowId: 'legal.nda.generation_and_review_flow',
      parameters: {
        executionId: validTaskRes.data.unifiedPayload?.parameters?.executionId,
      },
    }),
  });
  console.log('Duplicate task response status:', duplicateTaskRes.status);
  assert.strictEqual(duplicateTaskRes.data.taskId, initialTaskId, 'Expected duplicate createTask to return existing taskId');
  console.log('✅ Gate 2.1 PASSED: Idempotent createTask returned existing task without creating duplicate.');

  // [Gate 2.2] Concurrency CAS Check (F6 - Expect 409 Conflict)
  console.log('\n--- [Gate 2.2] Concurrency CAS Check (F6 - Expect 409 Conflict) ---');
  const casTaskRes = await request(`${BASE_URL}/workbench-coordination/tasks`, {
    method: 'POST',
    headers: testHeaders,
    body: JSON.stringify({
      assigneeId: testAuth.user.id,
      assigneeName: 'test',
      title: `[待发送] 并发CAS测试任务`,
      content: '测试并发点击审批冲突',
      workflowId: 'legal.nda.generation_and_review_flow',
      parameters: {
        contractTitle: '并发CAS测试',
        text: '商业保密协议条款内容',
      },
      attachments: [{ name: 'test.docx', url: 'http://test/test.docx' }],
    }),
  });
  const casTaskId = casTaskRes.data.taskId;
  const [resA, resB] = await Promise.all([
    request(`${BASE_URL}/workbench-coordination/tasks/${casTaskId}/action`, {
      method: 'POST',
      headers: testHeaders,
      body: JSON.stringify({ action: 'approve', comment: '并发请求A' }),
    }),
    request(`${BASE_URL}/workbench-coordination/tasks/${casTaskId}/action`, {
      method: 'POST',
      headers: testHeaders,
      body: JSON.stringify({ action: 'approve', comment: '并发请求B' }),
    }),
  ]);
  console.log('Concurrent request status:', resA.status, resB.status);
  const hasConflict = resA.status === 409 || resB.status === 409;
  const hasSuccess = [200, 201].includes(resA.status) || [200, 201].includes(resB.status);
  assert.ok(hasConflict, 'Expected one of the concurrent requests to receive HTTP 409 Conflict');
  assert.ok(hasSuccess, 'Expected one of the concurrent requests to succeed');
  console.log('✅ Gate 2.2 PASSED: Concurrency CAS successfully returned 409 Conflict for racing operation.');

  // law01 tries to approve a task assigned to test
  const unauthorizedRes = await request(`${BASE_URL}/workbench-coordination/tasks/${initialTaskId}/action`, {
    method: 'POST',
    headers: lawHeaders,
    body: JSON.stringify({ action: 'approve', comment: '越权审批测试' }),
  });
  console.log('Unauthorized action status:', unauthorizedRes.status);
  console.log('Unauthorized action response:', unauthorizedRes.data);
  assert.strictEqual(unauthorizedRes.status, 403, 'Expected HTTP 403 when operator is unauthorized');
  assert.match(unauthorizedRes.data.message, /无权处理当前协同任务|无权操作此协同任务/, 'Expected error message indicating unauthorized operator');
  console.log('✅ Gate 2 PASSED: Unauthorized operator action was successfully blocked with HTTP 403.');

  // 4. Initiator Approval & Transition to Legal Review
  console.log('\n--- [Step 3] Initiator Confirms and Sends (initiator_confirm -> legal_review) ---');
  const initiatorApproveRes = await request(`${BASE_URL}/workbench-coordination/tasks/${initialTaskId}/action`, {
    method: 'POST',
    headers: testHeaders,
    body: JSON.stringify({ action: 'approve', comment: '发起人确认初稿无误，流转法务把关' }),
  });
  assert.ok(initiatorApproveRes.status === 200 || initiatorApproveRes.status === 201, `Initiator approve failed: ${initiatorApproveRes.text}`);
  console.log('Initiator approve result:', initiatorApproveRes.data.message);

  // Wait for stage engine and Carbone contract-review execution to produce the legal_review task
  console.log('Waiting for stage engine automation runner (Carbone review) to generate next stage task for law01...');
  let legalTask = null;
  for (let i = 0; i < 25; i++) {
    await sleep(1500);
    const listRes = await request(`${BASE_URL}/workbench-coordination/tasks?role=assignee`, {
      headers: lawHeaders,
    });
    const tasks = Array.isArray(listRes.data) ? listRes.data : [];
    legalTask = tasks.find(
      (t) =>
        t.currentStage === 'legal_review' &&
        (t.unifiedPayload?.metadata?.parentTaskId === initialTaskId ||
          t.parameters?.contractTitle?.includes(uniqueCompany) ||
          t.title?.includes(uniqueCompany))
    );
    console.log(`Polling legal tasks (${i + 1}/25): found=${Boolean(legalTask)}, count=${tasks.length}`);
    if (legalTask) {
      break;
    }
  }

  assert.ok(legalTask, 'Stage engine should create a legal_review task for law01');
  const legalTaskId = legalTask.taskId;
  console.log('✅ Legal review task successfully created for law01:', legalTaskId);

  // Verify Legal Review Assignee (Org isolation check: must be law01)
  const assigneeUsername = legalTask.assignee?.username || legalTask.assigneeName;
  console.log('Legal review assignee:', assigneeUsername);
  assert.strictEqual(assigneeUsername, 'law01', `Assignee should be resolved to law01 within org, got: ${assigneeUsername}`);
  console.log('✅ Org-isolated department routing correctly assigned task to law01');

  // Verify Real Review Report (NOT offline fallback)
  const reviewReport = legalTask.reviewReport || legalTask.unifiedPayload?.reviewReport;
  console.log('Review Report Summary:');
  console.log('  - Title:', reviewReport?.title);
  console.log('  - Overall Risk:', reviewReport?.overallRisk);
  console.log('  - Risk Score:', reviewReport?.riskScore);
  console.log('  - Metrics:', JSON.stringify(reviewReport?.metrics));
  console.log('  - Checked Rules Count:', reviewReport?.checkedRules?.length);
  const reportUrl = reviewReport?.htmlReportUrl || reviewReport?.artifacts?.[0]?.url;
  console.log('  - HTML Report URL:', reportUrl);
  assert.ok(reviewReport, 'Review report should be present');
  assert.ok(typeof reviewReport.riskScore === 'number', 'Risk score should be a number');
  assert.ok(reportUrl, 'HTML report URL should be present');
  console.log('✅ Genuine Carbone Contract Review report verified.');

  // 5. Gate 3: Test user cannot approve legal_review stage (Expect 403)
  console.log('\n--- [Gate 3] Initiator cannot approve legal_review stage (Expect 403) ---');
  const testIllegalApproveRes = await request(`${BASE_URL}/workbench-coordination/tasks/${legalTaskId}/action`, {
    method: 'POST',
    headers: testHeaders,
    body: JSON.stringify({ action: 'approve', comment: '发起人试图代法务审批' }),
  });
  console.log('Initiator legal approve status:', testIllegalApproveRes.status);
  assert.strictEqual(testIllegalApproveRes.status, 403, 'Initiator should not be permitted to approve legal_review stage');
  console.log('✅ Gate 3 PASSED: Initiator blocked with HTTP 403 from approving legal_review.');

  // 5.5. Step 3.5: Law01 Rejects with Comments & Verifies Synchronous Annotated DOCX Generation
  console.log('\n--- [Step 3.5] Law01 Rejects with Comments (Generates Annotated Word DOCX & Rolls Back) ---');
  const rejectCommentWithDup = `【合同智能审阅结论与审批意见】
审阅概况：排查合规风险 7 项（其中高风险 1 项）。
处置进度：已确认审批意见 2 条，已采纳建议 2 项，已核实 0 项，已特批忽略 0 项；Word 批注共 1 条（本次拟定/答复 1 条）。
【法务审查处理意见与修改要求】
1. [2. 过严或不切实际的绝对化注意义务] 意见：采取不低于保护自身同等重要商业秘密的谨慎与合理注意措施（且在任何情况下不低于合理的商业安全标准）
2. [3. 过严或不切实际的绝对化注意义务] 意见：采取不低于保护自身同等重要商业秘密的谨慎与合理注意措施（且在任何情况下不低于合理的商业安全标准）
本次草拟Word批注：
1. [条款 #5] 【法务修改意见】 返还范围仅限定为有形载体，未明确包含电子数据、衍生备份的彻底删除及书面销毁证明。
【合同智能审阅结论与审批意见】
审阅概况：排查合规风险 7 项（其中高风险 1 项）。
处置进度：已确认审批意见 2 条，已采纳建议 2 项，已核实 0 项，已特批忽略 0 项；Word 批注共 1 条（本次拟定/答复 1 条）。
【法务审查处理意见与修改要求】
1. [2. 过严或不切实际的绝对化注意义务] 意见：采取不低于保护自身同等重要商业秘密的谨慎与合理注意措施（且在任何情况下不低于合理的商业安全标准）
2. [3. 过严或不切实际的绝对化注意义务] 意见：采取不低于保护自身同等重要商业秘密的谨慎与合理注意措施（且在任何情况下不低于合理的商业安全标准）
本次草拟Word批注：
1. [条款 #5] 【法务修改意见】 返还范围仅限定为有形载体，未明确包含电子数据、衍生备份的彻底删除及书面销毁证明。`;

  const legalRejectRes = await request(`${BASE_URL}/workbench-coordination/tasks/${legalTaskId}/action`, {
    method: 'POST',
    headers: lawHeaders,
    body: JSON.stringify({
      action: 'reject',
      comment: rejectCommentWithDup,
      parameters: {
        reviewDraft: {
          stagedComments: [
            {
              clauseId: '5',
              clauseTitle: '第五条',
              text: '【法务修改意见】 返还范围仅限定为有形载体，未明确包含电子数据、衍生备份的彻底删除及书面销毁证明。',
            },
          ],
          approvalOpinions: [
            {
              title: '过严或不切实际的绝对化注意义务',
              opinion: '采取不低于保护自身同等重要商业秘密的谨慎与合理注意措施',
            },
          ],
        },
      },
    }),
  });
  console.log('Legal reject status:', legalRejectRes.status);
  console.log('Legal reject data:', JSON.stringify(legalRejectRes.data, null, 2));
  assert.ok([200, 201].includes(legalRejectRes.status), `Legal reject failed: ${legalRejectRes.text}`);
  console.log('✅ Legal reject action accepted successfully.');

  // Polling initiator tasks to find the revision-required task
  console.log('Querying initiator inbox & todos for the revision_required task with annotated DOCX...');
  let revisionTask = null;
  for (let i = 0; i < 20; i++) {
    await sleep(1000);
    const initRes = await request(`${BASE_URL}/workbench-coordination/tasks?role=all`, {
      headers: testHeaders,
    });
    const tasks = Array.isArray(initRes.data) ? initRes.data : [];
    revisionTask = tasks.find(
      (t) =>
        (t.taskId === initialTaskId ||
          t.id === initialTaskId ||
          t.unifiedPayload?.metadata?.parentTaskId === initialTaskId ||
          t.title?.includes(uniqueCompany) ||
          t.parameters?.contractTitle?.includes(uniqueCompany)) &&
        (t.status === 'revision_required' ||
          t.status === 'rejected' ||
          t.title?.includes('[需重修]') ||
          t.title?.includes('已驳回'))
    );
    if (revisionTask) break;
  }
  assert.ok(revisionTask, 'Initiator should receive the revision_required task after rejection');
  console.log('✅ Revision required task found:', revisionTask.taskId || revisionTask.id, 'status:', revisionTask.status);

  // Verify Rejection Content Deduplication
  const rollbackReason =
    revisionTask.rollbackReason ||
    revisionTask.unifiedPayload?.rollbackReason ||
    revisionTask.unifiedPayload?.metadata?.rollbackReason;
  console.log('Rollback reason preview:', rollbackReason?.slice(0, 100));
  assert.ok(rollbackReason, 'Rollback reason must be present on revision task');
  const countOccurrences = (str, sub) => (str.match(new RegExp(sub, 'g')) || []).length;
  const markerCount = countOccurrences(rollbackReason, '【合同智能审阅结论与审批意见】');
  console.log('Occurrences of duplicate marker in rollbackReason:', markerCount);
  assert.strictEqual(markerCount, 1, 'Rejection reason must be deduplicated (marker appears only once)');
  console.log('✅ Rejection reason text deduplication verified.');

  // Verify Annotated DOCX Attachment
  const revAttachments = revisionTask.attachments || revisionTask.unifiedPayload?.attachments || [];
  console.log('Revision task attachments count:', revAttachments.length);
  console.log('Revision task attachments:', JSON.stringify(revAttachments, null, 2));
  const annotatedDoc = revAttachments.find(
    (a) => a.name?.includes('法务批注版') || a.name?.includes('批注')
  );
  assert.ok(annotatedDoc, 'First attachment or active attachments must contain the generated 法务批注版 DOCX');
  console.log('Found annotated doc attachment:', annotatedDoc.name, 'url:', annotatedDoc.url);
  assert.ok(annotatedDoc.url, 'Annotated doc must have a valid download URL');

  // Download and inspect OpenXML comments
  let docxDownloadUrl = annotatedDoc.url;
  if (docxDownloadUrl.startsWith('/')) {
    docxDownloadUrl = `${BASE_URL}${docxDownloadUrl}`;
  }
  const docxFetchRes = await fetch(docxDownloadUrl);
  assert.strictEqual(docxFetchRes.status, 200, 'Annotated docx download should return HTTP 200');
  const docxBuffer = Buffer.from(await docxFetchRes.arrayBuffer());
  console.log('Downloaded annotated DOCX length:', docxBuffer.length, 'bytes');
  assert.ok(docxBuffer.length > 2000, `Annotated DOCX size should be valid, got ${docxBuffer.length}`);
  assert.strictEqual(docxBuffer.subarray(0, 4).toString('hex'), '504b0304', 'File must be valid ZIP/DOCX format');

  const zip = await JSZip.loadAsync(docxBuffer);
  const commentsXmlFile = zip.file('word/comments.xml');
  assert.ok(commentsXmlFile, 'DOCX package MUST contain word/comments.xml');
  const commentsXml = await commentsXmlFile.async('string');
  console.log('word/comments.xml length:', commentsXml.length);
  assert.match(commentsXml, /<w:comment\s+[^>]*w:id="/, 'word/comments.xml must contain w:comment tags');
  assert.match(commentsXml, /返还范围仅限定为有形载体|法务修改意见/, 'word/comments.xml must contain the injected comment text');

  const docXmlFile = zip.file('word/document.xml');
  assert.ok(docXmlFile, 'DOCX package MUST contain word/document.xml');
  const docXml = await docXmlFile.async('string');
  assert.match(docXml, /<w:commentRangeStart\s+[^>]*w:id="/, 'word/document.xml must contain w:commentRangeStart');
  assert.match(docXml, /<w:commentReference\s+[^>]*w:id="/, 'word/document.xml must contain w:commentReference');

  const contentTypesXml = await zip.file('[Content_Types].xml').async('string');
  assert.ok(contentTypesXml.includes('PartName="/word/comments.xml"'), '[Content_Types].xml must declare comments.xml override');
  console.log('✅ OpenXML Word native comments injection verified 100% compliant!');

  // Now initiator resubmits the revised contract (approves initiator_confirm -> legal_review)
  console.log('\n--- [Step 3.6] Initiator Confirms Revision & Resubmits (revision_required -> legal_review) ---');
  const resubmitTaskId = revisionTask.taskId || revisionTask.id;
  const resubmitRes = await request(`${BASE_URL}/workbench-coordination/tasks/${resubmitTaskId}/action`, {
    method: 'POST',
    headers: testHeaders,
    body: JSON.stringify({
      action: 'approve',
      comment: '发起人已根据法务批注修订条款，重新提交法务核准。',
    }),
  });
  console.log('Resubmit status:', resubmitRes.status);
  assert.ok([200, 201].includes(resubmitRes.status), `Resubmit failed: ${resubmitRes.text}`);
  console.log('✅ Initiator successfully resubmitted the revised task.');

  // Polling for the new legal_review task for law01
  console.log('Waiting for stage engine to generate second legal_review task for law01...');
  let secondLegalTask = null;
  for (let i = 0; i < 25; i++) {
    await sleep(1500);
    const listRes = await request(`${BASE_URL}/workbench-coordination/tasks?role=assignee`, {
      headers: lawHeaders,
    });
    const tasks = Array.isArray(listRes.data) ? listRes.data : [];
    secondLegalTask = tasks.find(
      (t) =>
        t.currentStage === 'legal_review' &&
        t.status === 'pending' &&
        (t.unifiedPayload?.metadata?.parentTaskId === initialTaskId ||
          t.parameters?.contractTitle?.includes(uniqueCompany) ||
          t.title?.includes(uniqueCompany))
    );
    if (secondLegalTask) break;
  }
  assert.ok(secondLegalTask, 'Law01 should receive the resubmitted legal_review task');
  console.log('✅ Second legal review task received by law01:', secondLegalTask.taskId || secondLegalTask.id);
  const finalLegalTaskId = secondLegalTask.taskId || secondLegalTask.id;

  // 6. Legal Approval & Transition to PDF Archiving & Receipt
  console.log('\n--- [Step 4] Law01 Approves (legal_review -> auto_archiving -> final_receipt) ---');
  const legalApproveRes = await request(`${BASE_URL}/workbench-coordination/tasks/${finalLegalTaskId}/action`, {
    method: 'POST',
    headers: lawHeaders,
    body: JSON.stringify({
      action: 'approve',
      comment: '法务部审核通过，各项商业保密条款与管辖条款合规，准予生成 PDF 正式归档。',
    }),
  });
  assert.ok(legalApproveRes.status === 200 || legalApproveRes.status === 201, `Legal approve failed: ${legalApproveRes.text}`);
  console.log('Legal approve submitted OK.');

  // Wait for stage engine and Carbone PDF generation
  console.log('Waiting for stage engine automation runner (Carbone PDF generation & digital proof)...');
  let finalTaskDetails = null;
  for (let i = 0; i < 25; i++) {
    await sleep(1500);
    const detailRes = await request(`${BASE_URL}/workbench-coordination/tasks/${finalLegalTaskId}`, {
      headers: adminHeaders,
    });
    finalTaskDetails = detailRes.data;
    const stageId = finalTaskDetails.currentStage || finalTaskDetails.unifiedPayload?.currentStage;
    const extSync = finalTaskDetails.externalSyncResult || finalTaskDetails.unifiedPayload?.externalSyncResult;
    const currentSha256 = extSync?.sha256 || extSync?.detail?.sha256;
    console.log(`Polling task final stage (${i + 1}/25): stage=${stageId}, status=${finalTaskDetails.status}, hasSync=${Boolean(extSync)}, sha256=${Boolean(currentSha256)}`);
    if (currentSha256) {
      break;
    }
  }

  // 7. Verify Real PDF Generation & SHA-256 Hash
  console.log('\n--- [Step 5] Verifying Real PDF Generation & Digital Proof Hash ---');
  const externalSyncResult = finalTaskDetails.externalSyncResult || finalTaskDetails.unifiedPayload?.externalSyncResult;
  console.log('External Sync Result Summary:');
  console.log('  - External System:', externalSyncResult?.externalSystem);
  console.log('  - Tracking Number:', externalSyncResult?.trackingNumber);
  console.log('  - Message:', externalSyncResult?.message);

  assert.ok(externalSyncResult, 'externalSyncResult should be present on final task');
  const syncDetail = externalSyncResult.detail || {};
  const pdfSha256 = externalSyncResult.sha256 || syncDetail.sha256;
  const pdfDownloadUrl = externalSyncResult.downloadUrl || syncDetail.downloadUrl || syncDetail.pdfUrl;
  console.log('  - PDF SHA-256:', pdfSha256);
  console.log('  - PDF Download URL:', pdfDownloadUrl);
  console.log('  - PDF Size (bytes):', syncDetail.activeAttachment?.size || syncDetail.pdfArtifact?.sizeBytes || syncDetail.sizeBytes || externalSyncResult.pdfArtifact?.sizeBytes);

  assert.ok(pdfSha256, 'Real SHA-256 hash must be present');
  assert.strictEqual(pdfSha256.length, 64, 'SHA-256 hash must be 64 hexadecimal characters');
  assert.match(pdfSha256, /^[a-f0-9]{64}$/i, 'SHA-256 must be valid hex');
  assert.notStrictEqual(pdfSha256, 'MOCK_HASH', 'SHA-256 must NOT be mock hash');
  assert.ok(pdfDownloadUrl, 'PDF download URL must be present');
  console.log('✅ Real PDF generation with genuine SHA-256 digital proof verified!');

  // 7.1 Verify PDF Download, Size (> 50KB for full text), %PDF magic bytes, and exact SHA-256 match
  console.log('\n--- [Step 5.1] Downloading PDF & Verifying Full-Text Rendering & SHA-256 Match ---');
  const pdfFetchRes = await fetch(pdfDownloadUrl);
  assert.strictEqual(pdfFetchRes.status, 200, 'PDF download should return HTTP 200');
  const pdfBuffer = Buffer.from(await pdfFetchRes.arrayBuffer());
  console.log('Downloaded PDF length:', pdfBuffer.length, 'bytes');
  assert.ok(pdfBuffer.length > 50000, `PDF size must exceed 50KB for full contract content, got ${pdfBuffer.length}`);
  assert.strictEqual(pdfBuffer.subarray(0, 4).toString(), '%PDF', 'File must be valid PDF starting with %PDF');

  const computedHash = crypto.createHash('sha256').update(pdfBuffer).digest('hex');
  console.log('Computed SHA-256 from downloaded bytes:', computedHash);
  console.log('Expected SHA-256 from task record:     ', pdfSha256);
  assert.strictEqual(computedHash, pdfSha256, 'Downloaded PDF SHA-256 must match recorded proof hash');
  console.log('✅ Full PDF integrity and genuine SHA-256 verified!');

  // 8. Verify Receipt in Initiator Inbox & Notification Center
  console.log('\n--- [Step 6] Verifying Receipt GTD item & Stage 6 Execution in Initiator Inbox ---');
  const initiatorTasksRes = await request(`${BASE_URL}/workbench-coordination/tasks?role=all`, {
    headers: testHeaders,
  });
  const initiatorTasks = Array.isArray(initiatorTasksRes.data) ? initiatorTasksRes.data : [];
  const receiptTask = initiatorTasks.find(
    (t) =>
      t.title?.includes(uniqueCompany) ||
      t.parameters?.contractTitle?.includes(uniqueCompany) ||
      t.unifiedPayload?.metadata?.parentTaskId === initialTaskId
  );
  console.log('Initiator matching task found:', Boolean(receiptTask), 'status:', receiptTask?.status);
  assert.ok(receiptTask, 'Initiator should see the completed workflow task');
  assert.strictEqual(receiptTask.status, 'completed', 'Workflow should reach completed terminal status');
  const stage = receiptTask.currentStage || receiptTask.unifiedPayload?.currentStage;
  assert.strictEqual(stage, 'final_receipt', 'Current stage should be final_receipt');

  const attachments = receiptTask.attachments || receiptTask.unifiedPayload?.attachments || [];
  console.log('Receipt task attachments count:', attachments.length);
  const hasPdf = attachments.some((a) => a.mimeType?.includes('pdf') || a.name?.endsWith('.pdf') || a.url?.endsWith('.pdf'));
  const hasDocx = attachments.some((a) => a.name?.endsWith('.docx') || a.mimeType?.includes('wordprocessingml') || a.url?.endsWith('.docx'));
  console.log('  - Contains PDF attachment:', hasPdf);
  console.log('  - Contains DOCX attachment:', hasDocx);
  assert.ok(hasPdf, 'Final attachments must contain the generated PDF archive');
  assert.ok(hasDocx, 'Final attachments must contain the original DOCX contract');
  console.log('✅ Receipt task verified in initiator workbench inbox!');

  // 8.1 Verify Stage 6 Execution (platform.notification.internal-message)
  console.log('\n--- [Step 6.1] Verifying Stage 6 Execution (platform.notification.internal-message) ---');
  const receiptExecutionId = externalSyncResult?.detail?.receiptExecutionId || externalSyncResult?.receiptExecutionId;
  console.log('Stage 6 Receipt Execution ID:', receiptExecutionId);
  if (receiptExecutionId) {
    const execRes = await request(`${CONTROL_PLANE_URL}/executions/${receiptExecutionId}`, {
      headers: adminHeaders,
    });
    assert.strictEqual(execRes.status, 200, 'Stage 6 execution should exist and return HTTP 200');
    assert.strictEqual(execRes.data.status, 'succeeded', 'Stage 6 execution should be succeeded');
    console.log('✅ Stage 6 execution record verified in executions center!');
  }

  // 8.2 Verify Notification Center Reminder for Initiator
  console.log('\n--- [Step 6.2] Verifying Notification Center reminder for initiator ---');
  const notifRes = await request(`${CONTROL_PLANE_URL}/notifications?limit=20`, {
    headers: testHeaders,
  });
  assert.strictEqual(notifRes.status, 200, 'Notification API should return HTTP 200');
  const notifItems = Array.isArray(notifRes.data?.items) ? notifRes.data.items : [];
  const receiptNotif = notifItems.find(
    (n) => n.metadata?.title?.includes(uniqueCompany) || (n.metadata?.title?.includes('协同回执') && n.metadata?.taskId === initialTaskId)
  );
  console.log('Found receipt notification for initiator:', Boolean(receiptNotif));
  if (receiptNotif) {
    console.log('  - Notification Title:', receiptNotif.metadata?.title);
    console.log('  - Notification Category:', receiptNotif.category);
    console.log('  - Notification Severity:', receiptNotif.severity);
    assert.strictEqual(receiptNotif.category, 'completed', 'Receipt notification should be categorized as completed');
    assert.strictEqual(receiptNotif.severity, 'success', 'Receipt notification should have success severity');
    console.log('✅ Notification Center correctly delivers high-priority receipt reminder to initiator!');
  }

  console.log('\n======================================================');
  console.log('🎉 ALL END-TO-END VERIFICATION CHECKS PASSED SUCCESSFULLY!');
  console.log('======================================================');
}

run().catch((err) => {
  console.error('\n❌ VERIFICATION FAILED:', err);
  process.exit(1);
});
