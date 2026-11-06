async (page) => {
  const requests = [], responses = [];
  const listener = request => {
    if (request.url().includes('/mcp-integrations/')) {
      const url = new URL(request.url());
      requests.push({ method: request.method(), path: url.pathname, query: url.search });
    }
  };
  const responseListener = async response => {
    if (/\/mcp-integrations\/tools\?/.test(response.url())) {
      const data = await response.json().catch(() => null), url = new URL(response.url());
      responses.push({ path: url.pathname, query: url.search,
        noSchemas: Array.isArray(data) && data.every(tool => !('inputSchema' in tool) && !('outputSchema' in tool)) });
    }
  };
  const schemaRequests = () => requests.filter(r => /\/skills\/[^/]+\/tools\//.test(r.path));
  const connection = name => page.getByRole('row').filter({ hasText: name }).getByRole('button', { name: '能力与执行说明' });
  const dialog = () => page.getByRole('dialog');
  const close = () => dialog().getByRole('button', { name: /关\s*闭/ }).click();
  page.on('request', listener); page.on('response', responseListener);
  try {
    await page.goto('http://localhost:5174/settings?tab=mcp');
    await connection('amap-maps-streamableHTTP').waitFor();
    const initialSchemaRequests = schemaRequests().length;
    await connection('amap-maps-streamableHTTP').click();
    await dialog().getByText('已发布工具（5）', { exact: true }).waitFor();
    const schemasBeforeExpand = schemaRequests().length;
    await dialog().getByText('第二层：平台执行说明（读取 Skill 时加载）', { exact: true }).click();
    const geo = dialog().locator('.ant-card').filter({ has: page.getByText('maps_geo', { exact: true }) });
    await geo.getByRole('button', { name: '展开工具详情与参数' }).click();
    await geo.getByText('输入参数契约', { exact: true }).waitFor();
    const schemasAfterExpand = [...schemaRequests()];
    const geoSchema = JSON.parse(await geo.locator('pre').innerText());
    await close();
    await connection('Microsoft Learn（公开测试）').click();
    await dialog().getByText('已发布工具（2）', { exact: true }).waitFor();
    const switched = !(await dialog().innerText()).includes('maps_geo');
    await close();
    await page.getByRole('row').filter({ hasText: 'maps_geo' }).getByRole('button', { name: /调\s*用/, exact: true }).click();
    await dialog().getByRole('textbox', { name: '工具 JSON 参数' }).waitFor();
    const manualPreview = JSON.parse(await dialog().locator('pre').innerText()).required.includes('address');
    await dialog().getByRole('button', { name: /取\s*消/ }).click();
    await connection('amap-maps-streamableHTTP').click();
    await dialog().getByText('已发布工具（5）', { exact: true }).waitFor();
    const checks = {
      initialLoadHasNoToolSchemaRequests: initialSchemaRequests === 0,
      indexResponsesHaveNoSchemas: responses.length >= 2 && responses.every(r => r.noSchemas && r.query.includes('view=index')),
      overviewDidNotLoadSchemas: schemasBeforeExpand === 0,
      expansionOnlyReadsSelectedTool: schemasAfterExpand.length >= 1 && schemasAfterExpand.every(r => r.path.endsWith('/tools/maps_geo')),
      selectedSchemaVerified: geoSchema.required.includes('address'),
      switchClearsPreviousToolDetails: switched,
      manualCallDialogPreparesSelectedContract: manualPreview,
      noInvocationSent: requests.every(r => r.method === 'GET'),
    };
    const report = { testedAt: new Date().toISOString(), checks, requests, indexResponses: responses,
      externalMcpCalled: false, modelCalled: false, passed: Object.values(checks).every(Boolean) };
    if (!report.passed) throw new Error('UI checks failed: ' + JSON.stringify(checks));
    return report;
  } finally {
    page.off('request', listener); page.off('response', responseListener);
  }
}
