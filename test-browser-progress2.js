const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  await page.goto('http://localhost:5173');
  
  try {
    await page.waitForSelector('input[type="text"], input[name="username"]', { timeout: 5000 });
    const inputs = await page.$$('input');
    if (inputs.length >= 2) {
      await inputs[0].fill('admin');
      await inputs[1].fill('admin123');
      await page.keyboard.press('Enter');
    }
    await page.waitForNavigation({ timeout: 5000 }).catch(() => {});
  } catch (e) {}

  await page.waitForTimeout(2000);
  
  const chatButton = await page.$('.chat-widget-trigger');
  if (chatButton) {
    await chatButton.click();
    await page.waitForTimeout(1000);
  }
  
  const textarea = await page.$('textarea.chat-input-textarea');
  if (textarea) {
    console.log('Typing message...');
    await textarea.fill('查询 商谈号 S63432');
    await textarea.press('Enter');
    console.log('Pressed Enter, waiting for stream...');
    
    for (let i = 0; i < 20; i++) {
        await page.waitForTimeout(1000);
        const progressCard = await page.$('.chat-progress-current-text');
        if (progressCard) {
            const text = await progressCard.textContent();
            console.log(`[Tick ${i}] Progress text found:`, text.substring(0, 100));
        } else {
            console.log(`[Tick ${i}] No progress card yet...`);
        }
    }
  } else {
    console.log('No chat textarea found.');
  }
  await browser.close();
})();