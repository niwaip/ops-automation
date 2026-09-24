import { NestFactory } from '@nestjs/core';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { AppModule } from '../app.module';
import { BuiltinSkillProvisioningService, BuiltinSkillRegistryService } from '@ops/skill-registry/builtin';

async function bootstrap() {
  const args = process.argv.slice(2);
  if (args.length < 1 || args.length > 3) {
    console.error('Usage: ts-node builtin-skill-export.command.ts <capabilityKey> [outputDir] [sourceBundleDir]');
    process.exit(1);
  }

  const capabilityKey = args[0];
  const outputDir = path.resolve(args[1] || path.join(process.cwd(), 'exported-skills', capabilityKey));

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn', 'log'] });
  const registryService = app.get(BuiltinSkillRegistryService);
  const provisioningService = app.get(BuiltinSkillProvisioningService);

  const skill = await registryService.findSkillByKey(capabilityKey);
  if (!skill || !skill.activeVersionId) {
    console.error(`Skill '${capabilityKey}' or active version not found`);
    await app.close();
    process.exit(1);
  }

  const activeVersion = skill.versions.find((v: any) => v.id === skill.activeVersionId);
  if (!activeVersion) {
    console.error(`Active version not found for skill '${capabilityKey}'`);
    await app.close();
    process.exit(1);
  }

  const sourceDir = args[2]
    ? path.resolve(args[2])
    : provisioningService.resolveTargetBundles(skill.capabilityKey)[0];
  const manifestContent = fs.readFileSync(path.join(sourceDir, 'manifest.yaml'), 'utf8');
  const manifest = provisioningService.validateManifest(yaml.load(manifestContent));
  const digest = provisioningService.computeDigest(manifestContent, sourceDir);
  const lock = JSON.parse(fs.readFileSync(path.join(sourceDir, 'bundle-lock.json'), 'utf8'));
  if (manifest.metadata.key !== skill.capabilityKey ||
      manifest.spec.definitionVersion !== activeVersion.definitionVersion ||
      digest !== activeVersion.definitionDigest ||
      lock.capabilityKey !== skill.capabilityKey ||
      lock.definitionVersion !== activeVersion.definitionVersion ||
      lock.definitionDigest !== digest) {
    throw new Error(`Source bundle does not match active version ${skill.capabilityKey}@${activeVersion.definitionVersion}`);
  }
  if (outputDir === sourceDir || outputDir.startsWith(`${sourceDir}${path.sep}`)) {
    throw new Error('Output directory must be outside the source bundle');
  }
  if (fs.existsSync(outputDir) && fs.readdirSync(outputDir).length > 0) {
    throw new Error(`Output directory must be empty: ${outputDir}`);
  }
  fs.mkdirSync(outputDir, { recursive: true });
  for (const name of ['manifest.yaml', 'workflow.json', 'bundle-lock.json']) {
    const source = path.join(sourceDir, name);
    if (fs.existsSync(source)) fs.copyFileSync(source, path.join(outputDir, name));
  }
  const fixtures = path.join(sourceDir, 'fixtures');
  if (fs.existsSync(fixtures)) {
    fs.cpSync(fixtures, path.join(outputDir, 'fixtures'), { recursive: true, force: true });
  }
  const exportedDigest = provisioningService.computeDigest(
    fs.readFileSync(path.join(outputDir, 'manifest.yaml'), 'utf8'), outputDir
  );
  if (exportedDigest !== activeVersion.definitionDigest) {
    throw new Error(`Export digest mismatch: ${exportedDigest}`);
  }

  console.log(`Successfully exported Built-in Skill '${capabilityKey}' v${activeVersion.definitionVersion} to '${outputDir}'`);
  await app.close();
}

bootstrap().catch(err => {
  console.error('Export failed:', err);
  process.exit(1);
});
