import { Test, TestingModule } from '@nestjs/testing';
import { UserSandboxService } from '../src/modules/user-sandbox/user-sandbox.service';
import * as fs from 'fs';
import * as path from 'path';

describe('UserSandboxService', () => {
  let service: UserSandboxService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [UserSandboxService],
    }).compile();

    service = module.get<UserSandboxService>(UserSandboxService);
  });

  describe('User Identifier Sanitization and Container Naming', () => {
    it('should sanitize user ID and generate deterministic container name', () => {
      expect(service.getContainerName('User_123')).toBe('ops-user-sandbox-user_123');
      expect(service.getContainerName('alice-bob')).toBe('ops-user-sandbox-alice-bob');
      expect(service.getContainerName('charlie.smith@domain')).toBe('ops-user-sandbox-charlie_smith_domain');
    });

    it('should reject empty or whitespace user ID', () => {
      expect(() => service.getContainerName('')).toThrow();
      expect(() => service.getContainerName('   ')).toThrow();
    });
  });

  describe('Workspace & Knowledge Path Initialization', () => {
    it('should create and return valid workspace, knowledge, and shared plugin/skill paths', () => {
      const paths = service.getUserWorkspacePaths('test_user_unit');
      expect(paths.workspace).toContain(path.join('data', 'users', 'test_user_unit', 'workspace'));
      expect(paths.knowledge).toContain(path.join('data', 'users', 'test_user_unit', 'knowledge'));
      expect(paths.sharedPlugins).toContain(path.join('data', 'shared', 'dsh-plugins'));
      expect(paths.sharedSkills).toContain(path.join('data', 'shared', 'dsh-skills'));
      expect(fs.existsSync(paths.workspace)).toBe(true);
      expect(fs.existsSync(paths.knowledge)).toBe(true);
      expect(fs.existsSync(paths.sharedPlugins)).toBe(true);
      expect(fs.existsSync(paths.sharedSkills)).toBe(true);
    });
  });

  describe('Environment Security Sanitization (Zero-Trust Guard & AI Proxy)', () => {
    it('should inject central AI proxy URL and virtual user token without leaking real keys', () => {
      const sanitized = (service as any).sanitizeEnvironment('test_user_unit', {
        customEnv: {
          SAFE_CUSTOM_VAR: 'hello',
          WORKFLOW_ENGINE_TOKEN: 'leaked_workflow_token',
          DATABASE_URL: 'postgres://production_db',
          TEMPORAL_HOST: 'temporal:7233',
          DEEPSEEK_API_KEY: 'attempt_bypass_real_key',
        },
      });

      expect(sanitized).toContain('USER_MODE=personal');
      expect(sanitized).toContain('DEEPSEEK_API_KEY=sandbox-user-token-test_user_unit');
      expect(sanitized.some((e: string) => e.startsWith('DEEPSEEK_BASE_URL='))).toBe(true);
      expect(sanitized).toContain('SAFE_CUSTOM_VAR=hello');

      // 绝不包含用户私自覆盖的真实 Key 与生产工作流凭据
      expect(sanitized).not.toContain('DEEPSEEK_API_KEY=attempt_bypass_real_key');
      expect(sanitized.some((e: string) => e.startsWith('WORKFLOW_'))).toBe(false);
      expect(sanitized.some((e: string) => e.startsWith('DATABASE_'))).toBe(false);
      expect(sanitized.some((e: string) => e.startsWith('TEMPORAL_'))).toBe(false);
    });
  });

  describe('Container Inspection & Mapping', () => {
    it('should map running container inspect to status correctly', () => {
      const mockInspect = {
        Id: 'cont_1234567890',
        Created: '2026-09-04T12:00:00Z',
        State: { Running: true, Paused: false, ExitCode: 0 },
        HostConfig: { CpuQuota: 200000, Memory: 4294967296 },
        NetworkSettings: {
          Networks: {
            'ops-sandbox-network': { IPAddress: '172.28.0.5' },
          },
        },
      };

      const status = (service as any).mapInspectToStatus(
        'user_1',
        'ops-user-sandbox-user_1',
        { workspace: '/tmp/ws', knowledge: '/tmp/kn' },
        mockInspect
      );

      expect(status.userId).toBe('user_1');
      expect(status.status).toBe('running');
      expect(status.cpuLimit).toBe(2);
      expect(status.memoryLimitMb).toBe(4096);
      expect(status.endpoints?.internalIp).toBe('172.28.0.5');
    });

    it('should map stopped container inspect to stopped status', () => {
      const mockInspect = {
        Id: 'cont_stopped',
        Created: '2026-09-04T12:00:00Z',
        State: { Running: false, Paused: false, ExitCode: 0 },
      };

      const status = (service as any).mapInspectToStatus(
        'user_2',
        'ops-user-sandbox-user_2',
        { workspace: '/tmp/ws', knowledge: '/tmp/kn' },
        mockInspect
      );

      expect(status.status).toBe('stopped');
    });
  });

  describe('Sandbox Execution and Harness Runner', () => {
    it('should delegate runHarness to executeInSandbox with dsh CLI command', async () => {
      const execSpy = jest.spyOn(service, 'executeInSandbox').mockResolvedValueOnce({
        exitCode: 0,
        stdout: '⚡ [DeepSeek Harness v1.2.0 | Sandbox: test | Mode: Personal]\nQuery result content',
        stderr: '',
        durationMs: 120,
        containerName: 'ops-user-sandbox-user_1',
      });

      const result = await service.runHarness('user_1', '搜索 deepseek harness新闻', {
        webSearch: true,
      });

      expect(execSpy).toHaveBeenCalledWith(
        'user_1',
        ['dsh', 'run', '搜索 deepseek harness新闻', '--session-id', 'default', '--web-search'],
        expect.any(Object)
      );
      expect(result.success).toBe(true);
      expect(result.output).toContain('DeepSeek Harness');
      expect(result.containerName).toBe('ops-user-sandbox-user_1');
    });

    it('should automatically freeze sandboxes idle for longer than threshold', async () => {
      const freezeSpy = jest.spyOn(service, 'freezeUserSandbox').mockResolvedValueOnce({
        userId: 'idle_user',
        containerName: 'ops-user-sandbox-idle_user',
        status: 'stopped',
        workspacePath: '/tmp',
        knowledgePath: '/tmp',
      });
      jest.spyOn(service, 'listAllUserSandboxes').mockResolvedValueOnce([
        {
          userId: 'idle_user',
          containerName: 'ops-user-sandbox-idle_user',
          status: 'running',
          workspacePath: '/tmp',
          knowledgePath: '/tmp',
        },
      ]);

      // Simulate last activity 35 minutes ago
      (service as any).lastActiveMap.set('idle_user', Date.now() - 35 * 60 * 1000);

      await service.checkAndFreezeIdleSandboxes();

      expect(freezeSpy).toHaveBeenCalledWith('idle_user');
      expect((service as any).lastActiveMap.has('idle_user')).toBe(false);
    });
  });
});
