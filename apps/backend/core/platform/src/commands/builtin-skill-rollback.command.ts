import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { BuiltinSkillRegistryService } from '../modules/builtin-skill/registry/builtin-skill-registry.service';

async function bootstrap() {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.error('Usage: ts-node builtin-skill-rollback.command.ts <capabilityKey> [previousVersion]');
    process.exit(1);
  }

  const capabilityKey = args[0];
  const targetVersion = args[1];

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn', 'log'] });
  const registryService = app.get(BuiltinSkillRegistryService);

  const skill = await registryService.findSkillByKey(capabilityKey);
  if (!skill || skill.versions.length === 0) {
    console.error(`Skill '${capabilityKey}' or versions not found`);
    await app.close();
    process.exit(1);
  }

  let rollbackTo = targetVersion;
  if (!rollbackTo) {
    // Pick the previous version before activeVersionId
    const sortedVersions = [...skill.versions].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const currentIndex = sortedVersions.findIndex(v => v.id === skill.activeVersionId);
    if (currentIndex >= 0 && currentIndex + 1 < sortedVersions.length) {
      rollbackTo = sortedVersions[currentIndex + 1].definitionVersion;
    } else if (sortedVersions.length > 1) {
      rollbackTo = sortedVersions[sortedVersions.length - 1].definitionVersion;
    }
  }

  if (!rollbackTo) {
    console.error(`No previous version available to rollback for '${capabilityKey}'`);
    await app.close();
    process.exit(1);
  }

  await registryService.activateVersion(capabilityKey, rollbackTo);
  console.log(`Successfully rolled back Built-in Skill '${capabilityKey}' to version '${rollbackTo}'`);

  await app.close();
}

bootstrap().catch(err => {
  console.error('Rollback failed:', err);
  process.exit(1);
});
