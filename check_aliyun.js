const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log("Navigating to https://account.aliyun.com/ ...");
  await page.goto('https://account.aliyun.com/', { waitUntil: 'networkidle' });

  console.log("Page loaded. Checking frames...");
  const frames = page.frames();
  console.log(`Found ${frames.length} frames.`);

  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    console.log(`\nFrame ${i} URL: ${frame.url()}`);
    try {
      // Look for RAM login button or text
      const hasRAM = await frame.evaluate(() => {
        return document.body.innerText.includes('RAM登录') || document.body.innerText.includes('RAM');
      });
      console.log(`Frame ${i} contains 'RAM登录' or 'RAM': ${hasRAM}`);
      
      if (hasRAM) {
        const elements = await frame.$$('text=RAM登录');
        console.log(`Found ${elements.length} elements with text 'RAM登录' in frame ${i}`);
        for (let el of elements) {
          const tagName = await el.evaluate(e => e.tagName);
          const text = await el.innerText();
          console.log(`  - Tag: ${tagName}, Text: ${text}`);
        }
      }
    } catch (err) {
      console.log(`Error reading frame ${i}: ${err.message}`);
    }
  }

  await browser.close();
})();
