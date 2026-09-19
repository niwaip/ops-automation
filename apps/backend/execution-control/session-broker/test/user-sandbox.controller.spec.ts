import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { EventEmitter } from 'events';
import { UserSandboxController } from '../src/modules/user-sandbox/user-sandbox.controller';
import { UserSandboxService } from '../src/modules/user-sandbox/user-sandbox.service';
import { RunHarnessDto } from '../src/modules/user-sandbox/user-sandbox.dto';

describe('UserSandboxController - SSE Stream & Disconnect Handling', () => {
  let controller: UserSandboxController;
  let mockService: Partial<UserSandboxService>;

  beforeEach(async () => {
    mockService = {
      runHarness: jest.fn(),
      stopSandboxExecution: jest.fn().mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UserSandboxController],
      providers: [
        {
          provide: UserSandboxService,
          useValue: mockService,
        },
      ],
    }).compile();

    controller = module.get<UserSandboxController>(UserSandboxController);
  });

  const createMockResponse = () => {
    const emitter = new EventEmitter() as any;
    emitter.headers = {};
    emitter.writtenData = [] as string[];
    emitter.writableEnded = false;

    emitter.setHeader = jest.fn((k: string, v: string) => {
      emitter.headers[k] = v;
    });
    emitter.write = jest.fn((data: string) => {
      emitter.writtenData.push(data);
      return true;
    });
    emitter.end = jest.fn(() => {
      emitter.writableEnded = true;
    });

    return emitter;
  };

  it('should reject when userId or prompt is missing', async () => {
    const res = createMockResponse();
    await expect(controller.runHarnessStream({ userId: '', prompt: 'hi' } as any, res)).rejects.toThrow(
      BadRequestException
    );
    await expect(controller.runHarnessStream({ userId: 'u1', prompt: '' } as any, res)).rejects.toThrow(
      BadRequestException
    );
  });

  it('should stream observation and delta events, then emit done', async () => {
    const res = createMockResponse();
    const dto: RunHarnessDto = {
      userId: 'test_user',
      prompt: 'hello world',
      modelDisplayName: 'qwen36-35b-a3b',
    };

    (mockService.runHarness as jest.Mock).mockImplementation(async (userId, prompt, options) => {
      // Simulate tool progress observation
      options.onStdoutChunk('⚡ [Harness Tool Call] 正在调用工具...\n');
      // Simulate real-time LLM delta token
      options.onStdoutChunk('<<<DSH_DELTA:"你好">>>\n<<<DSH_DELTA:"世界">>>\n');
      // Simulate tool finish
      options.onStdoutChunk('✓ 工具执行完成\n');

      return {
        success: true,
        output: '你好世界',
        containerName: 'ops-user-sandbox-test_user',
        durationMs: 120,
        exitCode: 0,
      };
    });

    await controller.runHarnessStream(dto, res);

    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-cache');

    const joinedOutput = res.writtenData.join('');
    expect(joinedOutput).toContain('event: observation\ndata: {"content":"⚡ [Harness Tool Call] 正在调用工具..."}\n\n');
    expect(joinedOutput).toContain('event: delta\ndata: {"content":"你好"}\n\n');
    expect(joinedOutput).toContain('event: delta\ndata: {"content":"世界"}\n\n');
    expect(joinedOutput).toContain('event: observation\ndata: {"content":"✓ 工具执行完成"}\n\n');
    expect(joinedOutput).toContain('event: done\ndata: {"success":true,"output":"你好世界"');
    expect(res.end).toHaveBeenCalled();
  });

  it('should emit error event when runHarness fails', async () => {
    const res = createMockResponse();
    const dto: RunHarnessDto = {
      userId: 'test_user',
      prompt: 'fail test',
    };

    (mockService.runHarness as jest.Mock).mockRejectedValue(new Error('Sandbox container failed'));

    await controller.runHarnessStream(dto, res);

    const joinedOutput = res.writtenData.join('');
    expect(joinedOutput).toContain('event: error\ndata: {"message":"Sandbox container failed"}\n\n');
    expect(res.end).toHaveBeenCalled();
  });

  it('should stop running execution when client closes connection prematurely', async () => {
    const res = createMockResponse();
    const dto: RunHarnessDto = {
      userId: 'test_user',
      prompt: 'long task',
    };

    let resolveTask: any;
    const taskPromise = new Promise((resolve) => {
      resolveTask = resolve;
    });

    (mockService.runHarness as jest.Mock).mockImplementation(() => taskPromise);

    const streamPromise = controller.runHarnessStream(dto, res);

    // Simulate client closing before execution completes
    res.emit('close');
    expect(mockService.stopSandboxExecution).toHaveBeenCalledWith('test_user');

    resolveTask({
      success: true,
      output: 'done',
      containerName: 'c1',
      durationMs: 10,
      exitCode: 0,
    });
    await streamPromise;
  });
});
