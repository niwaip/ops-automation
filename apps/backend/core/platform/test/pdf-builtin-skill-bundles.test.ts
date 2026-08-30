import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { BuiltinSkillProvisioningService } from '../src/modules/builtin-skill/provisioning/builtin-skill-provisioning.service';

describe('PDF built-in skill bundles', () => {
  const builtinRoot = path.resolve(__dirname, '../../../../../builtin-skills');
  const service = new BuiltinSkillProvisioningService({} as any, {} as any);
  const capabilities = [
    {
      key: 'platform.document.pdf-merge',
      handlerKey: 'document.pdf.merge',
      operation: 'merge',
    },
    {
      key: 'platform.document.pdf-split',
      handlerKey: 'document.pdf.split',
      operation: 'split',
    },
    {
      key: 'platform.document.pdf-create',
      handlerKey: 'document.pdf.create',
      operation: 'create',
    },
  ];

  it.each(capabilities)('ships a locked, planner-visible bundle for $key', (capability) => {
    const bundleDir = path.join(builtinRoot, capability.key);
    const manifestContent = fs.readFileSync(path.join(bundleDir, 'manifest.yaml'), 'utf8');
    const manifest = service.validateManifest(yaml.load(manifestContent));
    const workflow = JSON.parse(fs.readFileSync(path.join(bundleDir, 'workflow.json'), 'utf8'));
    const fixture = JSON.parse(
      fs.readFileSync(path.join(bundleDir, 'fixtures', 'smoke-input.json'), 'utf8')
    );
    const lock = JSON.parse(fs.readFileSync(path.join(bundleDir, 'bundle-lock.json'), 'utf8'));

    expect(manifest.metadata.key).toBe(capability.key);
    expect(manifest.spec.lifecycle).toBe('stable');
    expect(manifest.spec.planner).toMatchObject({ enabled: true, supportsArtifact: true });
    expect(manifest.spec.runtime).toMatchObject({
      adapterRoute: 'builtin:workflow',
      handlerKey: capability.handlerKey,
      idempotency: 'required',
    });
    expect(manifest.spec.contracts.output.schema).toMatchObject({
      'x-primary-output': 'artifact',
      properties: {
        operation: { type: 'string', const: capability.operation },
      },
    });
    expect(workflow).toMatchObject({
      engine: 'domain-handler',
      handlerKey: capability.handlerKey,
    });

    const required = manifest.spec.contracts.input.schema.required as string[];
    for (const field of required) expect(fixture[field]).toBeDefined();
    expect(lock).toMatchObject({
      capabilityKey: capability.key,
      definitionVersion: '1.0.0',
      definitionDigest: service.computeDigest(manifestContent, bundleDir),
    });
    for (const relativePath of [
      'manifest.yaml',
      'workflow.json',
      'fixtures/smoke-input.json',
    ]) {
      const expected =
        'sha256:' +
        crypto
          .createHash('sha256')
          .update(fs.readFileSync(path.join(bundleDir, relativePath), 'utf8'))
          .digest('hex');
      expect(lock.fileHashes[relativePath]).toBe(expected);
    }
  });
});
