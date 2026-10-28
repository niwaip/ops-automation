import { resolveSandboxImage, retireStoppedOutdatedSandbox } from '../src/modules/user-sandbox/user-sandbox-runtime';
import { UserSandboxContainerService } from '../src/modules/user-sandbox/user-sandbox-container.service';

const readyImage = { Id: 'sha256:new', Config: { Labels: { 'ops.sandbox.runtime-contract': 'office-v1' } } };

describe('Verified sandbox runtime lifecycle', () => {
  const originalHash = process.env.USER_SANDBOX_REQUIREMENTS_SHA256;
  beforeEach(() => { delete process.env.USER_SANDBOX_REQUIREMENTS_SHA256; });
  afterEach(() => {
    if (originalHash === undefined) delete process.env.USER_SANDBOX_REQUIREMENTS_SHA256;
    else process.env.USER_SANDBOX_REQUIREMENTS_SHA256 = originalHash;
  });
  it('rejects an image without a passed office dependency check', async () => {
    const driver = { inspectImage: jest.fn().mockResolvedValue({ Id: 'old' }) } as any;
    await expect(resolveSandboxImage(driver, 'sandbox:local')).rejects.toThrow('办公依赖校验');
    driver.inspectImage.mockRejectedValue(new Error('missing'));
    await expect(resolveSandboxImage(driver, 'sandbox:local')).rejects.toThrow('镜像不可用');
  });

  it('resolves the actual image ID and retains same-image containers', async () => {
    const driver = { inspectImage: jest.fn().mockResolvedValue(readyImage) } as any;
    expect(await resolveSandboxImage(driver, 'sandbox:local')).toBe('sha256:new');
    const container = { remove: jest.fn() } as any;
    expect(await retireStoppedOutdatedSandbox(container, { Id: 'one', Image: 'sha256:new' }, 'sha256:new')).toBe(false);
    expect(container.remove).not.toHaveBeenCalled();
  });

  it('rejects an otherwise verified image built from an outdated dependency manifest', async () => {
    process.env.USER_SANDBOX_REQUIREMENTS_SHA256 = 'expected';
    const driver = { inspectImage: jest.fn().mockResolvedValue(readyImage) } as any;
    await expect(resolveSandboxImage(driver, 'sandbox:local')).rejects.toThrow('依赖清单已过期');
    driver.inspectImage.mockResolvedValue({ ...readyImage, Config: { Labels: {
      ...readyImage.Config.Labels, 'ops.sandbox.requirements-sha256': 'expected',
    } } });
    expect(await resolveSandboxImage(driver, 'sandbox:local')).toBe('sha256:new');
  });

  it('never force-stops outdated running or paused tasks', async () => {
    const container = { remove: jest.fn() } as any;
    for (const state of [{ Running: true }, { Paused: true }]) {
      await expect(retireStoppedOutdatedSandbox(container, { Id: 'one', Image: 'old', State: state }, 'sha256:new'))
        .rejects.toThrow('当前任务完成');
    }
    expect(container.remove).not.toHaveBeenCalled();
  });

  it('upgrades a stopped stale container and creates from the verified ID with existing mounts', async () => {
    const old = { inspect: jest.fn().mockResolvedValue({ Id: 'old', Image: 'sha256:old', State: { Running: false } }),
      remove: jest.fn().mockResolvedValue(undefined), start: jest.fn() };
    const fresh = { start: jest.fn().mockResolvedValue(undefined), inspect: jest.fn().mockResolvedValue({
      Id: 'fresh', Image: 'sha256:new', State: { Running: true }, HostConfig: {}, NetworkSettings: {},
    }) };
    const driver = { inspectImage: jest.fn().mockResolvedValue(readyImage), getContainer: jest.fn().mockReturnValue(old),
      createContainer: jest.fn().mockResolvedValue(fresh) } as any;
    const storage = { sanitizeUserId: (id: string) => id,
      getUserWorkspacePaths: () => ({ workspace: '/persistent/workspace', knowledge: '/persistent/knowledge',
        sharedPlugins: '/plugins', sharedSkills: '/skills' }),
      getUserQuota: () => ({ cpuLimit: 1, memoryLimitMb: 128 }) } as any;
    const service = new UserSandboxContainerService(storage, driver);
    expect((await service.ensureUserSandbox('test-user')).containerId).toBe('fresh');
    expect(old.remove).toHaveBeenCalledWith({ force: false });
    expect(old.start).not.toHaveBeenCalled();
    expect(driver.createContainer).toHaveBeenCalledWith(expect.objectContaining({ Image: 'sha256:new',
      HostConfig: expect.objectContaining({ Binds: expect.arrayContaining([
        '/persistent/workspace:/workspace:rw', '/persistent/knowledge:/knowledge:rw',
      ]) }) }));
  });
});
