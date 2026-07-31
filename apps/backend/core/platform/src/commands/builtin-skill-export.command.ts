import { NestFactory } from '@nestjs/core';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { AppModule } from '../app.module';
import { BuiltinSkillRegistryService } from '../modules/builtin-skill/registry/builtin-skill-registry.service';
import { computeCanonicalDigest } from '@ops/backend-builtin-skill-contract';

async function bootstrap() {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.error('Usage: ts-node builtin-skill-export.command.ts <capabilityKey> [outputDir]');
    process.exit(1);
  }

  const capabilityKey = args[0];
  const outputDir = args[1] || path.join(process.cwd(), 'exported-skills', capabilityKey);

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn', 'log'] });
  const registryService = app.get(BuiltinSkillRegistryService);

  const skill = await registryService.findSkillByKey(capabilityKey);
  if (!skill || !skill.activeVersionId) {
    console.error(`Skill '${capabilityKey}' or active version not found`);
    await app.close();
    process.exit(1);
  }

  const activeVersion = skill.versions.find(v => v.id === skill.activeVersionId);
  if (!activeVersion) {
    console.error(`Active version not found for skill '${capabilityKey}'`);
    await app.close();
    process.exit(1);
  }

  fs.mkdirSync(outputDir, { recursive: true });

  const manifest = activeVersion.manifestJson as any;
  const manifestYaml = yaml.dump(manifest);
  fs.writeFileSync(path.join(outputDir, 'manifest.yaml'), manifestYaml, 'utf8');

  if (activeVersion.workflowJson && Object.keys(activeVersion.workflowJson as object).length > 0) {
    fs.writeFileSync(path.join(outputDir, 'workflow.json'), JSON.stringify(activeVersion.workflowJson, null, 2), 'utf8');
  }

  const digest = computeCanonicalDigest(manifest);
  const lock = {
    capabilityKey: skill.capabilityKey,
    definitionVersion: activeVersion.definitionVersion,
    definitionDigest: digest,
    exportedAt: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(outputDir, 'bundle-lock.json'), JSON.stringify(lock, null, 2), 'utf8');

  console.log(`Successfully exported Built-in Skill '${capabilityKey}' v${activeVersion.definitionVersion} to '${outputDir}'`);
  await app.close();
}

bootstrap().catch(err => {
  console.error('Export failed:', err);
  process.exit(1);
});
