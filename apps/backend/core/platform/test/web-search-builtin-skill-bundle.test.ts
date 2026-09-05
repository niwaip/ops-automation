import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { BuiltinSkillProvisioningService } from '../src/modules/builtin-skill/provisioning/builtin-skill-provisioning.service';

describe('web search built-in skill bundle', () => {
  const bundleDir = path.resolve(__dirname, '../../../../../builtin-skills/platform.search.web');
  const service = new BuiltinSkillProvisioningService({} as any, {} as any);

  it('ships a locked planner-visible domain handler bundle', () => {
    const manifestContent = fs.readFileSync(path.join(bundleDir, 'manifest.yaml'), 'utf8');
    const manifest = service.validateManifest(yaml.load(manifestContent));
    const workflow = JSON.parse(fs.readFileSync(path.join(bundleDir, 'workflow.json'), 'utf8'));
    const lock = JSON.parse(fs.readFileSync(path.join(bundleDir, 'bundle-lock.json'), 'utf8'));

    expect(manifest.metadata.key).toBe('platform.search.web');
    expect(manifest.spec.planner).toMatchObject({ enabled: true, runtimeType: 'workflow' });
    expect(manifest.spec.runtime).toMatchObject({
      adapterRoute: 'builtin:workflow',
      handlerKey: 'search.web',
      idempotency: 'disabled',
    });
    expect(workflow).toMatchObject({ engine: 'domain-handler', handlerKey: 'search.web' });
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
