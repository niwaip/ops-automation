import { buildWorkflowRuntimeCompatConfig } from './workflow-runtime-compat.helper';

describe('buildWorkflowRuntimeCompatConfig', () => {
  it('infers format_only policy for runtime date and numeric fields', () => {
    const config = buildWorkflowRuntimeCompatConfig({
      templateId: 'tpl-runtime-compat',
      sourceLanguage: 'zh',
      targetLanguages: ['ja'],
      inputParams: {
        'contract.signingDate': {
          type: 'date',
          required: true,
          renderPath: ['contract.signingDate_cn', 'contract.signingDate_jp'],
        },
        'payment.firstDays': {
          type: 'number',
          required: true,
          renderPath: ['payment.firstDays', 'payment.firstDays_jp'],
        },
      },
      inputPolicy: {
        params: {
          'contract.signingDate': {
            enabled: true,
            requiredMode: 'always',
          },
          'payment.firstDays': {
            enabled: true,
            requiredMode: 'always',
          },
        },
      },
    });

    expect(config).toBeTruthy();
    expect(config?.templateFieldSpecs).toEqual(expect.arrayContaining([
      expect.objectContaining({
        fieldId: 'contract.signingDate',
        type: 'date',
        policy: 'format_only',
      }),
      expect.objectContaining({
        fieldId: 'payment.firstDays',
        type: 'number',
        policy: 'format_only',
      }),
    ]));

    expect(config?.carboneBindingPlan.bindings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        fieldId: 'contract.signingDate',
        variablePath: 'contract.signingDate_cn',
        valueSelector: 'contract.signingDate.zh',
        transform: 'date_format',
      }),
      expect.objectContaining({
        fieldId: 'contract.signingDate',
        variablePath: 'contract.signingDate_jp',
        valueSelector: 'contract.signingDate.ja',
        transform: 'date_format',
      }),
      expect.objectContaining({
        fieldId: 'payment.firstDays',
        variablePath: 'payment.firstDays',
        valueSelector: 'payment.firstDays.zh',
        transform: 'identity',
      }),
      expect.objectContaining({
        fieldId: 'payment.firstDays',
        variablePath: 'payment.firstDays_jp',
        valueSelector: 'payment.firstDays.ja',
        transform: 'identity',
      }),
    ]));
  });
});
