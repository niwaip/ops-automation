const { chromium } = require('playwright');

async function runScenario(browser, scenario) {
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(scenario.url, { waitUntil: 'domcontentloaded' });

  const credentialsVisible = await page
    .locator('#login-credentials-screen')
    .isVisible()
    .catch(() => false);
  if (credentialsVisible) {
    await page.fill('#login-username', 'admin');
    await page.fill('#login-password', 'admin');
    await page.click('#btn-submit-login');
    await page.waitForTimeout(300);
  }

  const result = {
    scenario: scenario.name,
    credentialsVisible,
    authStageAfterLoginSubmit: await page.locator('body').getAttribute('data-auth-stage'),
    mfaVisible: await page.locator('[data-testid="mfa-screen"]').isVisible().catch(() => false),
    appVisible: await page.locator('#main-app-container').isVisible().catch(() => false),
    mfaSignalCount: await page.locator('[data-ai-signal="mfa-required"]').count(),
    mfaVisibleAttr: await page.locator('[data-testid="mfa-screen"]').getAttribute('data-mfa-visible'),
    mfaIconVisible: await page.locator('[data-testid="mfa-icon"]').isVisible().catch(() => false),
    mfaCodeVisible: await page
      .locator('[data-testid="mfa-code-display"]')
      .isVisible()
      .catch(() => false),
  };

  if (scenario.expectMfa && result.mfaVisible) {
    await page.fill('#login-mfa-code', '123456');
    await page.click('#btn-submit-mfa');
    await page.waitForTimeout(300);
  }

  result.loggedInAfterFlow = await page
    .locator('#main-app-container')
    .isVisible()
    .catch(() => false);
  result.authStageAfterFlow = await page.locator('body').getAttribute('data-auth-stage');

  await context.close();
  return result;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    const baseUrl = process.env.MOCK_ERP_URL || 'http://127.0.0.1/';
    const scenarios = [
      { name: 'force_mfa', url: `${baseUrl}?force_mfa=true`, expectMfa: true },
      { name: 'skip_mfa', url: `${baseUrl}?skip_mfa=true`, expectMfa: false },
    ];

    const results = [];
    for (const scenario of scenarios) {
      results.push(await runScenario(browser, scenario));
    }

    console.log(JSON.stringify(results, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
