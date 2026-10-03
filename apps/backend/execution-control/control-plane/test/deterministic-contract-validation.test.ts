import { projectLlmOperationInput, validateInputContract } from '../src/modules/execution/plan-runtime/deterministic-contract-validation';

describe('LLM operation input projection', () => {
  it('sends only declared inputs to a closed operation schema', () => {
    const step = {
      inputSchemaJson: {
        type: 'object',
        additionalProperties: false,
        required: ['content', 'instruction'],
        properties: { content: { type: 'string' }, instruction: { type: 'string' } },
      },
    };
    const projected = projectLlmOperationInput(step, {
      content: 'Source text',
      instruction: 'Summarize it',
      taskContext: { references: [] },
      fileBase64: 'image bytes',
    });
    expect(projected).toEqual({ content: 'Source text', instruction: 'Summarize it' });
    expect(() => validateInputContract(step, projected, 'execution-1')).not.toThrow();
  });

  it('preserves extension fields when the operation schema allows them', () => {
    const input = { content: 'Source text', extra: 'allowed' };
    expect(projectLlmOperationInput({ inputSchemaJson: { additionalProperties: true } }, input)).toEqual(input);
  });
});

describe('validateInputContract error humanization', () => {
  it('generates friendly message from schema metadata without hardcoding', () => {
    const step = {
      planNodeId: 'n1_live-export-replay-1790872547',
      name: '1. 页面打开与登录',
      inputSchemaJson: {
        type: 'object',
        properties: {
          loginCredential: {
            type: 'string',
            title: '登录密码',
            description: '系统登录账号密码',
          },
        },
        required: ['loginCredential'],
      },
    };

    try {
      validateInputContract(step, {}, 'exec-123');
      fail('Should have thrown ContractViolationError');
    } catch (err: any) {
      expect(err.name).toBe('ContractViolationError');
      expect(err.code).toBe('INPUT_SCHEMA_VIOLATION');
      // Technical message preserved for logs and tooling
      expect(err.message).toContain("INPUT_SCHEMA_VIOLATION for node 'n1_live-export-replay-1790872547'");
      expect(err.message).toContain("must have required property 'loginCredential'");
      // Friendly message dynamically extracted from title and step name
      expect(err.friendlyMessage).toBe(
        '步骤「1. 页面打开与登录」输入参数校验未通过：缺少必填参数【登录密码 (loginCredential)】（说明：系统登录账号密码）。'
      );
      expect(err.context.friendlyMessage).toBe(err.friendlyMessage);
      expect(err.context.violations).toEqual([
        {
          field: 'loginCredential',
          fieldLabel: '登录密码 (loginCredential)',
          description: '系统登录账号密码',
          message: '缺少必填参数【登录密码 (loginCredential)】（说明：系统登录账号密码）',
          keyword: 'required',
        },
      ]);
    }
  });

  it('gracefully handles missing title and description by using field key', () => {
    const step = {
      planNodeId: 'node_custom',
      inputSchemaJson: {
        type: 'object',
        properties: {
          arbitraryDynamicField: {
            type: 'number',
          },
        },
        required: ['arbitraryDynamicField'],
      },
    };

    try {
      validateInputContract(step, {}, 'exec-456');
      fail('Should have thrown ContractViolationError');
    } catch (err: any) {
      expect(err.friendlyMessage).toBe(
        '节点「node_custom」输入参数校验未通过：缺少必填参数【arbitraryDynamicField】。'
      );
    }
  });
});

