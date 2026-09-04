import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { BuiltinSkillProvisioningService } from '../src/modules/builtin-skill/provisioning/builtin-skill-provisioning.service';

describe('email built-in skill bundles', () => {
  const service = new BuiltinSkillProvisioningService({} as any, {} as any);

  it('validates platform.email.messages bundle lock and manifest', () => {
    const bundleDir = path.resolve(__dirname, '../../../../../builtin-skills/platform.email.messages');
    const manifestContent = fs.readFileSync(path.join(bundleDir, 'manifest.yaml'), 'utf8');
    const manifest = service.validateManifest(yaml.load(manifestContent));
    const workflow = JSON.parse(fs.readFileSync(path.join(bundleDir, 'workflow.json'), 'utf8'));
    const lock = JSON.parse(fs.readFileSync(path.join(bundleDir, 'bundle-lock.json'), 'utf8'));

    expect(manifest.metadata.key).toBe('platform.email.messages');
    expect(manifest.spec.planner).toMatchObject({ enabled: true, runtimeType: 'workflow' });
    expect(manifest.spec.runtime).toMatchObject({
      adapterRoute: 'builtin:workflow',
      handlerKey: 'email.messages',
      idempotency: 'disabled',
    });
    expect(workflow).toMatchObject({ engine: 'domain-handler', handlerKey: 'email.messages' });
    expect(lock.definitionDigest).toBe(service.computeDigest(manifestContent, bundleDir));

    for (const relativePath of ['manifest.yaml', 'workflow.json', 'fixtures/smoke-input.json']) {
      const digest =
        'sha256:' +
        crypto
          .createHash('sha256')
          .update(fs.readFileSync(path.join(bundleDir, relativePath), 'utf8'))
          .digest('hex');
      expect(lock.fileHashes[relativePath]).toBe(digest);
    }
  });

  it('validates platform.email.send bundle lock and manifest', () => {
    const bundleDir = path.resolve(__dirname, '../../../../../builtin-skills/platform.email.send');
    const manifestContent = fs.readFileSync(path.join(bundleDir, 'manifest.yaml'), 'utf8');
    const manifest = service.validateManifest(yaml.load(manifestContent));
    const workflow = JSON.parse(fs.readFileSync(path.join(bundleDir, 'workflow.json'), 'utf8'));
    const lock = JSON.parse(fs.readFileSync(path.join(bundleDir, 'bundle-lock.json'), 'utf8'));

    expect(manifest.metadata.key).toBe('platform.email.send');
    expect(manifest.spec.planner).toMatchObject({ enabled: true, runtimeType: 'workflow' });
    expect(manifest.spec.runtime).toMatchObject({
      adapterRoute: 'builtin:workflow',
      handlerKey: 'email.send',
      idempotency: 'disabled',
    });
    expect(workflow).toMatchObject({ engine: 'domain-handler', handlerKey: 'email.send' });
    expect(lock.definitionDigest).toBe(service.computeDigest(manifestContent, bundleDir));

    for (const relativePath of ['manifest.yaml', 'workflow.json', 'fixtures/smoke-input.json']) {
      const digest =
        'sha256:' +
        crypto
          .createHash('sha256')
          .update(fs.readFileSync(path.join(bundleDir, relativePath), 'utf8'))
          .digest('hex');
      expect(lock.fileHashes[relativePath]).toBe(digest);
    }
  });
});
