import axios from 'axios';
import { BuiltinWorkflowRuntimeAdapter } from '../src/modules/execution/adapters/builtin-workflow-runtime.adapter';
import {
  BuiltinHandlerRegistryService,
  formatDocumentDomainError,
} from '../src/modules/execution/adapters/builtin-handler-registry.service';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('Builtin Document Domain Handler Error Translation & Resilience', () => {
  describe('formatDocumentDomainError', () => {
    it('translates ENOTFOUND error code to user-friendly diagnosis message', () => {
      const err = new Error('getaddrinfo ENOTFOUND carbone-engine');
      (err as any).code = 'ENOTFOUND';

      const formatted = formatDocumentDomainError(err, 'carbone-engine');
      expect(formatted.message).toContain('文档智能处理服务 (carbone-engine) 未就绪');
      expect(formatted.message).toContain('ENOTFOUND');
      expect(formatted.message).toContain('./docker/start-smart.sh dev up -d');
    });

    it('translates ECONNREFUSED error code to user-friendly message', () => {
      const err = new Error('connect ECONNREFUSED 127.0.0.1:3009');
      (err as any).code = 'ECONNREFUSED';

      const formatted = formatDocumentDomainError(err, 'carbone-engine');
      expect(formatted.message).toContain('拒绝连接 (ECONNREFUSED)');
      expect(formatted.message).toContain('稍后重试');
    });

    it('translates timeout errors to user-friendly message', () => {
      const err = new Error('timeout of 120000ms exceeded');
      (err as any).code = 'ECONNABORTED';

      const formatted = formatDocumentDomainError(err, 'carbone-engine');
      expect(formatted.message).toContain('请求超时');
    });

    it('preserves remote error message if provided by service', () => {
      const err: any = new Error('Request failed with status code 400');
      err.response = {
        data: {
          message: '未能从上传的文档中提取到有效的合同条款，请核对文档格式或内容。',
        },
      };

      const formatted = formatDocumentDomainError(err, 'carbone-engine');
      expect(formatted.message).toBe(
        '未能从上传的文档中提取到有效的合同条款，请核对文档格式或内容。'
      );
    });
  });

  describe('BuiltinWorkflowRuntimeAdapter with Document Handlers', () => {
    let registry: BuiltinHandlerRegistryService;
    let adapter: BuiltinWorkflowRuntimeAdapter;

    beforeEach(() => {
      jest.clearAllMocks();
      registry = new BuiltinHandlerRegistryService({} as any);
      registry.onModuleInit();
      adapter = new BuiltinWorkflowRuntimeAdapter(registry);
    });

    it('translates ENOTFOUND when invoking document.contract.review', async () => {
      const enotfoundError: any = new Error('getaddrinfo ENOTFOUND carbone-engine');
      enotfoundError.code = 'ENOTFOUND';
      mockedAxios.post.mockRejectedValueOnce(enotfoundError);

      const result = await adapter.invokeStep({
        requestId: 'req-contract-review',
        executionId: 'e6d99577-7249-4ea4-bebf-fae7aeb4d71b',
        stepId: 'n1_合同文档智能审查与合规诊断',
        runtimeType: 'workflow',
        capabilityType: 'builtin',
        action: 'execute',
        skillId: 'platform.document.contract-reviewer',
        metadata: {
          definitionVersion: '1.0.1',
          handlerKey: 'document.contract.review',
        },
        input: {
          fileName: 'test.docx',
        },
      });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('BUILTIN_SKILL_EXECUTION_ERROR');
      expect(result.errorMessage).toContain('文档智能处理服务 (carbone-engine) 未就绪');
      expect(result.errorMessage).toContain('./docker/start-smart.sh dev up -d');
    });

    it('translates ECONNREFUSED when invoking document.markdown-artifact-writer', async () => {
      const connRefusedError: any = new Error('connect ECONNREFUSED 127.0.0.1:3009');
      connRefusedError.code = 'ECONNREFUSED';
      mockedAxios.post.mockRejectedValueOnce(connRefusedError);

      const result = await adapter.invokeStep({
        requestId: 'req-markdown-writer',
        executionId: 'exec-md-1',
        stepId: 'step-md',
        runtimeType: 'workflow',
        capabilityType: 'builtin',
        action: 'write',
        skillId: 'platform.document.markdown-artifact-writer',
        metadata: {
          definitionVersion: '1.0.0',
          handlerKey: 'document.markdown-artifact-writer',
        },
        input: {
          content: '# Test',
          fileName: 'test.md',
        },
      });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('BUILTIN_SKILL_EXECUTION_ERROR');
      expect(result.errorMessage).toContain('拒绝连接 (ECONNREFUSED)');
    });
  });
});
