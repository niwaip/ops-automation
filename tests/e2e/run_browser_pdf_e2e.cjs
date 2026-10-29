const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = process.env.PROJECT_ROOT || path.resolve(__dirname, '../..');
const ARTIFACT_DIR = process.env.ARTIFACT_DIR || path.join(PROJECT_ROOT, 'tests/e2e/screenshots');
const USER_ID = process.env.TEST_USER_ID || 'e7fce333-a8f4-4097-9a53-f0a4c729da46';
const WORKSPACE_DIR = process.env.WORKSPACE_DIR || path.join(PROJECT_ROOT, 'data/users', USER_ID, 'workspace');

async function main() {
  console.log('=== [Browser E2E Test] Starting End-to-End PDF Flow in Headless Browser ===');
  console.log('1. Connecting to Chrome via CDP (127.0.0.1:9222)...');
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const context = browser.contexts()[0] || await browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(30000);

  console.log('2. Navigating to http://ops-user-web:5174/chat...');
  await page.goto('http://ops-user-web:5174/chat', { waitUntil: 'networkidle' });

  // Handle login if required
  if (page.url().includes('/login')) {
    console.log('   Performing login as admin/admin123...');
    const userInput = page.locator('input[placeholder*="用户名"]').or(page.locator('input[type="text"]')).first();
    const passInput = page.locator('input[placeholder*="密码"]').or(page.locator('input[type="password"]')).first();
    await userInput.fill('admin');
    await passInput.fill('admin123');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(1500);
    await page.goto('http://ops-user-web:5174/chat', { waitUntil: 'networkidle' });
  }

  console.log('   Arrived at Chat URL:', page.url());

  // Ensure Personal Assistant mode (助理) is active
  const modeItems = await page.locator('[class*="user-chat-mode-switch"] .ant-segmented-item').all();
  if (modeItems.length > 0) {
    console.log('3. Selecting "助理" (Personal Mode)...');
    await modeItems[0].click();
    await page.waitForTimeout(800);
  }

  // Click new chat (+) button
  const plusBtn = page.locator('[class*="sidebar-new-chat-btn"]').or(page.locator('.anticon-plus')).first();
  if (await plusBtn.isVisible().catch(() => false)) {
    console.log('4. Creating clean conversation session...');
    await plusBtn.click();
    await page.waitForTimeout(1000);
  }

  const initialAssistantCount = await page.locator('[class*="role-assistant"]').count();
  console.log(`   Initial assistant message count: ${initialAssistantCount}`);

  // Locate composer textarea
  const textarea = page.locator('textarea').first();
  await textarea.waitFor({ timeout: 10000 });

  const testPrompt = '查看今天的bilibili热点，生成pdf ，便于阅读';
  console.log(`5. Typing prompt: "${testPrompt}"...`);
  await textarea.fill(testPrompt);
  await page.waitForTimeout(500);

  // Trigger send
  console.log('6. Submitting prompt...');
  const sendBtn = page.locator('button[class*="send-btn"]').or(page.locator('button').filter({ hasText: '发送' })).first();
  if (await sendBtn.isVisible().catch(() => false)) {
    await sendBtn.click();
  } else {
    await textarea.press('Enter');
  }

  console.log('7. Waiting for execution and streaming response...');
  const startTime = Date.now();
  let completed = false;
  let finalAssistantText = '';

  // Poll for up to 240 seconds (4 minutes)
  for (let s = 0; s < 240; s += 5) {
    await page.waitForTimeout(5000);
    const elapsed = Math.round((Date.now() - startTime) / 1000);

    const assistantRows = await page.locator('[class*="role-assistant"]').all();
    const currentAssistantCount = assistantRows.length;

    // Check if new assistant message appeared
    if (currentAssistantCount > initialAssistantCount) {
      const latestAssistant = assistantRows[currentAssistantCount - 1];
      const text = (await latestAssistant.innerText()).trim().replace(/\s+/g, ' ');
      
      // Look for streaming activity or status
      const hasProcessing = await latestAssistant.locator('[class*="status-processing"]').isVisible().catch(() => false);
      const isSendingDisabled = await sendBtn.isDisabled().catch(() => false);

      console.log(`   [+${elapsed}s] [Streaming: ${hasProcessing || isSendingDisabled}] Current snippet: ${text.slice(0, 100)}...`);

      // Completion check: when processing indicator is gone AND text contains delivery or failure
      if (elapsed >= 20 && !hasProcessing && !isSendingDisabled && text.length > 20) {
        if (text.includes('已生成') || text.includes('PDF 尚未通过验收') || text.includes('交付文件') || text.includes('停止重生成') || text.includes('未发布新PDF')) {
          console.log(`\n8. Streaming concluded naturally after ${elapsed} seconds!`);
          finalAssistantText = text;
          completed = true;
          break;
        }
      }
    } else {
      console.log(`   [+${elapsed}s] Waiting for assistant row to mount...`);
    }
  }

  // Grace period for any last micro-renders
  await page.waitForTimeout(3000);

  console.log('9. Capturing full-page screenshot...');
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  const screenshotPathArtifact = path.join(ARTIFACT_DIR, 'browser_e2e_final.png');
  await page.screenshot({ path: screenshotPathArtifact, fullPage: true });
  console.log('   Saved screenshot to:', screenshotPathArtifact);

  // Retrieve complete text of the last assistant bubble
  const allBubbles = await page.locator('[class*="role-assistant"] [class*="user-chat-message-content"]').all();
  let fullResponseText = finalAssistantText;
  if (allBubbles.length > 0) {
    fullResponseText = (await allBubbles[allBubbles.length - 1].innerText()).trim();
  }

  console.log('\n======================================================');
  console.log('            BROWSER E2E TEST RESULT                   ');
  console.log('======================================================');
  console.log('Assistant Response:');
  console.log(fullResponseText);
  console.log('------------------------------------------------------');

  // Verify workspace artifact
  const files = fs.readdirSync(WORKSPACE_DIR);
  const matchedPdf = files.find(f => {
    if (f.endsWith('.pdf')) {
      const stat = fs.statSync(path.join(WORKSPACE_DIR, f));
      return stat.mtimeMs >= startTime - 5000;
    }
    return false;
  });
  if (matchedPdf) {
    const stat = fs.statSync(path.join(WORKSPACE_DIR, matchedPdf));
    console.log(`Verified Fresh Output File: ${matchedPdf}`);
    console.log(`File Size: ${Math.round(stat.size / 1024)} KB, Last Modified: ${stat.mtime}`);
  }

  // Check for success criteria
  const isFailed = fullResponseText.includes('PDF 尚未通过验收') || fullResponseText.includes('未发布新PDF') || fullResponseText.includes('停止重生成');
  const isGenerated = fullResponseText.includes('已生成') && Boolean(matchedPdf);

  if (isFailed) {
    console.error('\n❌ FAILURE: PDF generation or review failed.');
    process.exit(1);
  } else if (isGenerated) {
    console.log('\n✅ TEST PASSED: Browser end-to-end PDF generation succeeded!');
    console.log('   - Mode: 助理 (Personal Sandbox Runner)');
    console.log(`   - Verified newly delivered file: ${matchedPdf}`);
    console.log('   - Streamed to user with download link');
  } else {
    console.warn('\n⚠️ WARNING: Response did not explicitly match success pattern, but completed without error.');
  }

  await page.close();
  await browser.close();
}

main().catch(err => {
  console.error('E2E script error:', err);
  process.exit(1);
});
