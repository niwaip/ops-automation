import { Test, TestingModule } from '@nestjs/testing';
import { LlmOperationModule } from '../src/modules/llm-operation/llm-operation.module';

describe('LlmOperationModule DI Binding', () => {
  it('should compile module without DI resolution errors', async () => {
    let module: TestingModule;
    try {
      module = await Test.createTestingModule({
        imports: [LlmOperationModule],
      }).compile();
      expect(module).toBeDefined();
    } catch (error: any) {
      throw new Error(`DI resolution failed: ${error.message}`);
    }
  });
});