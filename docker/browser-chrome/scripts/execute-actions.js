#!/usr/bin/env node
/**
 * Browser Actions Executor
 * Uses Playwright (already installed in container) to execute browser actions
 * Reuses existing browser if available (from /start endpoint)
 */

// Use system-installed playwright
const { chromium } = require('/usr/lib/node_modules/playwright');
const { execSync } = require('child_process');

async function executeActions(actions, sessionId) {
  const results = [];

  try {
    // Check if there's already a browser running from codegen
    let browser = null;
    let shouldCloseBrowser = false;

    try {
      // Try to connect to existing browser via CDP port 9222
      // The codegen browser doesn't use CDP port, so we need to launch our own
      // But we'll launch it visible on the same display
      console.error('[EXECUTE] Launching browser on Xvfb display...');

      browser = await chromium.launch({
        headless: false,
        args: [
          '--no-sandbox',
          '--disable-dev-shm-usage',
          '--window-size=1920,1080',
          '--window-position=0,0',
          '--start-maximized',
        ],
      });
      shouldCloseBrowser = true;
    } catch (e) {
      console.error('[EXECUTE] Failed to launch browser:', e.message);
      return { error: e.message, results };
    }

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
          const path = `/tmp/codegen/${sessionId}_step${stepNum}.png`;
          await page.screenshot({ path });
          result.success = true;
          result.message = `Screenshot saved to ${path}`;
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

    // Keep browser open for 30 seconds so user can see the result
    console.error('[EXECUTE] Keeping browser open for 30 seconds...');
    await new Promise(r => setTimeout(r, 30000));

    await browser.close();

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