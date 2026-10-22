import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { resolvePersonalSkillProjectRoot } from './personal-skill-root.util';

describe('personal skill data root', () => {
  const originalRoot = process.env.PROJECT_ROOT;
  const originalDocker = process.env.DOCKER_ENV;
  afterEach(() => {
    if (originalRoot === undefined) delete process.env.PROJECT_ROOT;
    else process.env.PROJECT_ROOT = originalRoot;
    if (originalDocker === undefined) delete process.env.DOCKER_ENV;
    else process.env.DOCKER_ENV = originalDocker;
    jest.restoreAllMocks();
  });

  it('honors an explicit root independently of package cwd', () => {
    process.env.PROJECT_ROOT = '/tmp/skill-test-root';
    expect(resolvePersonalSkillProjectRoot()).toBe('/tmp/skill-test-root');
  });
  it('uses the sandbox repository mount for Docker service processes', () => {
    delete process.env.PROJECT_ROOT;
    process.env.DOCKER_ENV = 'true';
    jest.spyOn(require('fs'), 'existsSync').mockImplementation((p) => p === '/workspace');
    jest.spyOn(process, 'cwd').mockReturnValue('/workspace/apps/backend/intelligence/ai-orchestrator');
    expect(resolvePersonalSkillProjectRoot()).toBe('/workspace');
  });
  it('locates a native checkout from a nested package directory', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-root-'));
    try {
      fs.mkdirSync(path.join(root, 'docker'));
      fs.writeFileSync(path.join(root, 'docker/start-smart.sh'), '');
      fs.writeFileSync(path.join(root, 'pnpm-workspace.yaml'), '');
      delete process.env.PROJECT_ROOT;
      delete process.env.DOCKER_ENV;
      jest.spyOn(process, 'cwd').mockReturnValue(path.join(root, 'apps/backend/intelligence/ai-orchestrator'));
      expect(resolvePersonalSkillProjectRoot()).toBe(root);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });
});
