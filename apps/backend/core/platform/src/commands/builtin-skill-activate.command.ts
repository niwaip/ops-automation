import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { BuiltinSkillRegistryService } from '../modules/builtin-skill/registry/builtin-skill-registry.service';

async function bootstrap() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error('Usage: ts-node builtin-skill-activate.command.ts <capabilityKey> <version>');
    process.exit(1);
  }

  const capabilityKey = args[0];
  const targetVersion = args[1];

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn', 'log'] });
  const registryService = app.get(BuiltinSkillRegistryService);

  const skill = await registryService.findSkillByKey(capabilityKey);
  if (!skill) {
    console.error(`Skill '${capabilityKey}' not found`);
    await app.close();
    process.exit(1);
  }

  const version = skill.versions.find(v => v.definitionVersion === targetVersion);
  if (!version) {
    console.error(`Version '${targetVersion}' not found for skill '${capabilityKey}'`);
    await app.close();
    process.exit(1);
  }

  const targetVerObj = version as any;
  const isHealthy = targetVerObj.deployments ? targetVerObj.deployments.some((d: any) => d.status === 'healthy' || d.status === 'deployed') : true;
  if (!isHealthy) {
    console.error(`Cannot activate version '${targetVersion}': Deployment status is not healthy`);
    await app.close();
    process.exit(1);
  }

  await registryService.activateVersion(capabilityKey, targetVersion);
  console.log(`Successfully activated Built-in Skill '${capabilityKey}' version '${targetVersion}'`);

  await app.close();
}

bootstrap().catch(err => {
  console.error('Activation failed:', err);
  process.exit(1);
});
