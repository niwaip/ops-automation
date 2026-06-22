import { BrowserCommandFieldFillService } from './browser-command-field-fill.service';

describe('BrowserCommandFieldFillService', () => {
  const service = new BrowserCommandFieldFillService();

  it('parses default field fill from input candidates', () => {
    const result = service.parseFieldFillCommandDetailed(
      '填写企业编码 ABC123',
      {
        availableInputs: ['企业编码'],
      },
      {
        getAvailableCandidates: () => [],
        getAvailableInputs: () => ['企业编码'],
      }
    );

    expect(result).toEqual({
      status: 'success',
      response: {
        success: true,
        commands: [
          {
            tool: 'fill',
            params: {
              selector: 'role=textbox[name="企业编码"]',
              value: 'ABC123',
            },
            description: '填写企业编码',
            locator: {
              strategy: 'role',
              value: 'role=textbox[name="企业编码"]',
              generatedBy: 'candidate-first',
              confidence: 0.9,
              matchedCandidateId: 'available_input_1',
              resolutionMode: 'preferred-locator',
            },
          },
        ],
        explanation: '将填写企业编码',
        parserMetadata: {
          fieldFill: {
            status: 'success',
            reason: 'field-fill-default-candidate',
            resolvedField: '企业编码',
            resolvedCanonicalField: '企业编码',
            resolvedRegion: undefined,
            selector: 'role=textbox[name="企业编码"]',
            value: 'ABC123',
            usedRuntimeProfile: false,
            matchedRuntimeRuleIds: [],
          },
        },
      },
    });
  });

  it('parses runtime field fill profile with region hint', () => {
    const result = service.parseFieldFillCommandDetailed(
      '在审批区域填写备注 通过',
      {},
      {
        getAvailableCandidates: () => [
          {
            candidateId: 'input_1',
            kind: 'input',
            label: '备注',
            summary:
              'candidateId=input_1 | kind=input | region=审批区域 | field=comment | label=备注',
            source: 'region',
            field: 'comment',
            region: { name: '审批区域' },
            preferredLocator: {
              type: 'css',
              value: '[data-ai-region="审批区域"] [data-ai-field="comment"]',
            },
          },
        ],
        getAvailableInputs: () => [],
      },
      {
        runtimeRules: [
          {
            id: 'field-fill-runtime-comment',
            category: 'FIELD_FILL',
            outputs: {
              profile_type: 'field_fill_terms',
              field_terms: ['备注', '审批备注'],
              canonical_field: 'comment',
              region_terms: ['审批区域'],
              intent_terms: ['填写'],
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
            tool: 'fill',
            params: {
              selector: '[data-ai-region="审批区域"] [data-ai-field="comment"]',
              value: '通过',
            },
            description: '填写备注',
            locator: {
              strategy: 'css',
              value: '[data-ai-region="审批区域"] [data-ai-field="comment"]',
              generatedBy: 'candidate-first',
              confidence: 0.96,
              matchedCandidateId: 'input_1',
              resolutionMode: 'preferred-locator',
            },
          },
        ],
        explanation: '将填写备注',
        parserMetadata: {
          fieldFill: {
            status: 'success',
            reason: 'field-fill-runtime-field-region',
            resolvedField: '备注',
            resolvedCanonicalField: 'comment',
            resolvedRegion: '审批区域',
            selector: '[data-ai-region="审批区域"] [data-ai-field="comment"]',
            value: '通过',
            usedRuntimeProfile: true,
            matchedRuntimeRuleIds: ['field-fill-runtime-comment'],
          },
        },
      },
    });
  });

  it('parses default field fill when input label keeps a trailing colon but user omits it', () => {
    const result = service.parseFieldFillCommandDetailed(
      '填写 Customer name AliceCN988',
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
            preferredLocator: {
              type: 'role',
              value: 'textbox[name="Customer name:"]',
            },
          },
        ],
        getAvailableInputs: () => [],
      }
    );

    expect(result).toEqual({
      status: 'success',
      response: {
        success: true,
        commands: [
          {
            tool: 'fill',
            params: {
              selector: 'role=textbox[name="Customer name:"]',
              value: 'AliceCN988',
            },
            description: '填写Customer name',
            locator: {
              strategy: 'role',
              value: 'role=textbox[name="Customer name:"]',
              generatedBy: 'candidate-first',
              confidence: 0.95,
              matchedCandidateId: 'input_1',
              resolutionMode: 'preferred-locator',
            },
          },
        ],
        explanation: '将填写Customer name',
        parserMetadata: {
          fieldFill: {
            status: 'success',
            reason: 'field-fill-default-candidate',
            resolvedField: 'Customer name:',
            resolvedCanonicalField: 'Customer name',
            resolvedRegion: undefined,
            selector: 'role=textbox[name="Customer name:"]',
            value: 'AliceCN988',
            usedRuntimeProfile: false,
            matchedRuntimeRuleIds: [],
          },
        },
      },
    });
  });
});
