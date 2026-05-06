#!/usr/bin/env node
/**
 * Browser Actions Executor
 * Uses Playwright (already installed in container) to execute browser actions
 * Browser runs on Xvfb :99 which is visible via noVNC
 */

// Use system-installed playwright
const { chromium } = require('/usr/lib/node_modules/playwright');
const { execSync } = require('child_process');

// Ensure browser displays on Xvfb (visible via noVNC)
process.env.DISPLAY = ':99';

async function executeActions(actions, sessionId) {
  const results = [];

  try {
    console.error('[EXECUTE] Launching browser on Xvfb :99 (visible via noVNC)...');

    // Don't kill existing browsers - they might be visible via noVNC
    // Just launch a new browser instance

    const browser = await chromium.launch({
      headless: false,
      args: [
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--window-size=1920,1080',
        '--window-position=0,0',
        '--start-maximized',
      ],
    });

    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
    });

    const page = await context.newPage();

    // Execute each action
    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];
      const actionType = action.action || action.type || 'unknown';
      const stepNum = action.step_number || i + 1;

      // Log to stderr (not stdout) to avoid mixing with JSON output
      console.error(`[EXECUTE] Step ${stepNum}: ${actionType}`);

      const result = {
        step: stepNum,
        action: actionType,
        success: false,
        message: '',
      };

      try {
        if (actionType === 'navigate') {
          const url = action.url || action.value || 'https://example.com';
          await page.goto(url, { timeout: 30000 });
          result.success = true;
          result.message = `Navigated to ${url}`;
        } else if (actionType === 'click') {
          const selector = action.selector || action.target || '';
          if (selector) {
            await page.click(selector, { timeout: 10000 });
            result.success = true;
            result.message = `Clicked ${selector}`;
          } else {
            result.message = 'No selector provided';
          }
        } else if (actionType === 'fill' || actionType === 'type') {
          const selector = action.selector || action.target || '';
          const value = action.value || action.text || '';
          if (selector && value) {
            await page.fill(selector, value, { timeout: 10000 });
            result.success = true;
            result.message = `Filled ${selector} with "${value}"`;
          } else {
            result.message = 'Missing selector or value';
          }
        } else if (actionType === 'press') {
          const key = action.key || action.value || 'Enter';
          await page.keyboard.press(key);
          result.success = true;
          result.message = `Pressed ${key}`;
        } else if (actionType === 'wait') {
          const duration = action.duration || action.value || 1000;
          await new Promise(r => setTimeout(r, duration));
          result.success = true;
          result.message = `Waited ${duration}ms`;
        } else if (actionType === 'scroll') {
          const direction = action.direction || 'down';
          const amount = action.amount || 500;
          await page.mouse.wheel(0, direction === 'down' ? amount : -amount);
          result.success = true;
          result.message = `Scrolled ${direction} ${amount}px`;
        } else if (actionType === 'screenshot') {
          const path = `/tmp/codegen/${sessionId}_step${stepNum}.${action.format || 'png'}`;
          // 支持压缩参数：format (png/jpeg), quality (0-100, 仅jpeg有效), scale (0.1-1.0)
          const screenshotOptions = {
            path,
            type: action.format || 'png',
            fullPage: action.full_page !== true, // 默认只截可视区域
          };
          // JPEG 格式可以设置质量参数来压缩
          if (screenshotOptions.type === 'jpeg' && action.quality) {
            screenshotOptions.quality = Math.min(100, Math.max(0, parseInt(action.quality) || 80));
          }
          // 如果指定了 scale，通过调整视窗大小来间接控制分辨率
          if (action.scale && parseFloat(action.scale) < 1) {
            const scale = parseFloat(action.scale);
            const originalViewport = page.viewportSize();
            await page.setViewportSize({
              width: Math.round(originalViewport.width * scale),
              height: Math.round(originalViewport.height * scale)
            });
          }
          const screenshotBuffer = await page.screenshot(screenshotOptions);
          result.success = true;
          result.message = `Screenshot saved to ${path}`;
          result.screenshot = screenshotBuffer.toString('base64');
          // 恢复原始视窗大小
          if (action.scale && parseFloat(action.scale) < 1) {
            await page.setViewportSize({ width: 1920, height: 1080 });
          }
        } else if (actionType === 'get_text' || actionType === 'getText') {
          const selector = action.selector || action.target || 'body';
          const text = await page.locator(selector).textContent({ timeout: 10000 });
          result.success = true;
          result.message = `Got text from ${selector}`;
          result.text = text || '';
        } else if (actionType === 'get_html' || actionType === 'getHtml') {
          const selector = action.selector || action.target || 'body';
          const html = await page.locator(selector).innerHTML({ timeout: 10000 });
          result.success = true;
          result.message = `Got HTML from ${selector}`;
          result.html = html || '';
        } else if (actionType === 'search' || actionType === 'smart_search') {
          const searchText = action.value || action.text || action.search || '';
          const selector = action.selector || `[placeholder*="search"], input[type="search"], [role="searchbox"]`;
          if (searchText) {
            try {
              await page.fill(selector, searchText, { timeout: 10000 });
              await page.keyboard.press('Enter');
              result.success = true;
              result.message = `Searched for: ${searchText}`;
              result.text = searchText;
            } catch (e) {
              result.message = `Search failed: ${e.message}`;
            }
          } else {
            result.message = 'No search text provided';
          }
        } else if (actionType === 'snapshot') {
          // Take screenshot and get page content
          const format = action.format || 'png';
          const path = `/tmp/codegen/${sessionId}_step${stepNum}.${format}`;
          // 支持压缩参数
          const screenshotOptions = {
            path,
            type: format,
            fullPage: action.full_page !== true,
          };
          if (screenshotOptions.type === 'jpeg' && action.quality) {
            screenshotOptions.quality = Math.min(100, Math.max(0, parseInt(action.quality) || 80));
          }
          if (action.scale && parseFloat(action.scale) < 1) {
            const scale = parseFloat(action.scale);
            const originalViewport = page.viewportSize();
            await page.setViewportSize({
              width: Math.round(originalViewport.width * scale),
              height: Math.round(originalViewport.height * scale)
            });
          }
          const screenshotBuffer = await page.screenshot(screenshotOptions);
          const html = await page.content();
          result.success = true;
          result.message = `Snapshot taken`;
          result.screenshot = screenshotBuffer.toString('base64');
          result.html = html;
          // 恢复原始视窗大小
          if (action.scale && parseFloat(action.scale) < 1) {
            await page.setViewportSize({ width: 1920, height: 1080 });
          }
        } else {
          result.message = `Unknown action type: ${actionType}`;
        }
      } catch (e) {
        result.message = e.message;
        console.error(`[ERROR] Step ${stepNum} failed:`, e.message);

        const onFail = action.on_fail || 'stop';
        if (onFail === 'stop') {
          results.push(result);
          break;
        }
      }

      results.push(result);

      // Small delay between actions
      await new Promise(r => setTimeout(r, 500));
    }

    // Keep browser open so user can see the result via noVNC
    // Browser will be cleaned up when container restarts or new session starts
    console.error('[EXECUTE] Execution completed. Browser left open for viewing via noVNC.');

    // Don't close the browser - let user see the result
    // await browser.close();

    return { status: 'completed', results };
  } catch (e) {
    console.error('[ERROR] Execution failed:', e.message);
    return { error: e.message, results };
  }
}

// Parse input from stdin or command line (file path)
async function main() {
  let input;
  if (process.argv.length > 2) {
    // Argument is a file path
    const fs = require('fs');
    const filePath = process.argv[2];
    const content = fs.readFileSync(filePath, 'utf8');
    input = JSON.parse(content);
  } else {
    // Read from stdin
    const chunks = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk);
    }
    input = JSON.parse(Buffer.concat(chunks).toString());
  }

  const actions = input.actions || input.steps || [];
  const sessionId = input.session || 'default';

  const result = await executeActions(actions, sessionId);
  console.log(JSON.stringify(result));
}

main().catch(e => {
  console.error('[FATAL]', e.message);
  process.exit(1);
});
