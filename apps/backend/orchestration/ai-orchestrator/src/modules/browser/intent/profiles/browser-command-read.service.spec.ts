import { BrowserCommandReadService } from './browser-command-read.service';

describe('BrowserCommandReadService', () => {
  const service = new BrowserCommandReadService();

  it('parses default read intent from field candidates', () => {
    const result = service.parseReadCommandDetailed(
      '读取当前案件毛利率',
      {},
      {
        getAvailableCandidates: () => [
          {
            candidateId: 'field_1',
            kind: 'field',
            label: '案件粗利率（毛利率）',
            summary:
              'candidateId=field_1 | kind=field | testid=gross-margin-value | region=gross-margin-panel | field=grossMargin | label=案件粗利率（毛利率） | text=25.5%',
            source: 'region',
            dataTestId: 'gross-margin-value',
            field: 'grossMargin',
            text: '25.5%',
            region: { name: 'gross-margin-panel' },
            preferredLocator: { type: 'testid', value: 'gross-margin-value' },
          },
        ],
      }
    );

    expect(result).toEqual({
      status: 'success',
      response: {
        success: true,
        commands: [
          {
            tool: 'get_text',
            params: {
              selector: '[data-testid="gross-margin-value"]',
              max_length: 1000,
            },
            description: '读取当前案件毛利率',
            locator: {
              strategy: 'css',
              value: '[data-testid="gross-margin-value"]',
              generatedBy: 'context',
              confidence: 0.9,
            },
          },
        ],
        explanation: '将读取当前案件毛利率',
        parserMetadata: {
          read: {
            status: 'success',
            reason: 'read-default-candidate',
            resolvedTarget: '毛利率',
            resolvedField: 'grossMargin',
            resolvedRegion: 'gross-margin-panel',
            selector: '[data-testid="gross-margin-value"]',
            usedRuntimeProfile: false,
            matchedRuntimeRuleIds: [],
          },
        },
      },
    });
  });

  it('parses runtime read profile using field and region hints', () => {
    const result = service.parseReadCommandDetailed(
      '读取当前案件毛利率',
      {},
      {
        getAvailableCandidates: () => [
          {
            candidateId: 'field_1',
            kind: 'field',
            label: '25.5%',
            summary:
              'candidateId=field_1 | kind=field | testid=gross-margin-value | region=gross-margin-panel | field=grossMargin | label=25.5%',
            source: 'region',
            dataTestId: 'gross-margin-value',
            field: 'grossMargin',
            region: { name: 'gross-margin-panel' },
            preferredLocator: { type: 'testid', value: 'gross-margin-value' },
          },
          {
            candidateId: 'field_2',
            kind: 'field',
            label: '25.5%',
            summary:
              'candidateId=field_2 | kind=field | testid=other-margin-value | region=other-panel | field=margin | label=25.5%',
            source: 'region',
            dataTestId: 'other-margin-value',
            field: 'margin',
            region: { name: 'other-panel' },
            preferredLocator: { type: 'testid', value: 'other-margin-value' },
          },
        ],
      },
      {
        runtimeRules: [
          {
            id: 'read-runtime-margin',
            category: 'READ_VALUE',
            outputs: {
              profile_type: 'read_target',
              target_terms: ['毛利率', '粗利率'],
              field_terms: ['grossMargin'],
              region_terms: ['gross-margin-panel'],
              intent_terms: ['读取'],
            },
          } as any,
        ],
      }
    );

    expect(result).toEqual({
      status: 'success',
      response: {
        success: true,
        commands: [
          {
            tool: 'get_text',
            params: {
              selector: '[data-testid="gross-margin-value"]',
              max_length: 1000,
            },
            description: '读取当前案件毛利率',
            locator: {
              strategy: 'css',
              value: '[data-testid="gross-margin-value"]',
              generatedBy: 'context',
              confidence: 0.9,
            },
          },
        ],
        explanation: '将读取当前案件毛利率',
        parserMetadata: {
          read: {
            status: 'success',
            reason: 'read-runtime-field-region',
            resolvedTarget: '毛利率',
            resolvedField: 'grossMargin',
            resolvedRegion: 'gross-margin-panel',
            selector: '[data-testid="gross-margin-value"]',
            usedRuntimeProfile: true,
            matchedRuntimeRuleIds: ['read-runtime-margin'],
          },
        },
      },
    });
  });

  it('parses default read intent from input candidates using role selector fallback', () => {
    const result = service.parseReadCommandDetailed(
      '读取 Customer name:',
      {},
      {
        getAvailableCandidates: () => [
          {
            candidateId: 'input_1',
            kind: 'input',
            label: 'Customer name:',
            summary:
              'candidateId=input_1 | kind=input | ref=e5 | role=textbox | label=Customer name:',
            source: 'probe',
            ref: 'e5',
            role: 'textbox',
            preferredLocator: { type: 'ref', value: 'e5' },
          },
        ],
      }
    );

    expect(result).toEqual({
      status: 'success',
      response: {
        success: true,
        commands: [
          {
            tool: 'get_text',
            params: {
              selector: 'role=textbox[name="Customer name:"]',
              max_length: 1000,
              method: 'value',
            },
            description: '读取Customer name:',
            locator: {
              strategy: 'role',
              value: 'role=textbox[name="Customer name:"]',
              generatedBy: 'context',
              confidence: 0.9,
            },
          },
        ],
        explanation: '将读取Customer name:',
        parserMetadata: {
          read: {
            status: 'success',
            reason: 'read-default-candidate',
            resolvedTarget: 'customer name',
            resolvedField: undefined,
            resolvedRegion: undefined,
            selector: 'role=textbox[name="Customer name:"]',
            usedRuntimeProfile: false,
            matchedRuntimeRuleIds: [],
          },
        },
      },
    });
  });
});
