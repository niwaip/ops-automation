import { NestFactory } from '@nestjs/core';
import * as path from 'path';
import { AppModule } from '../app.module';
import { BuiltinSkillProvisioningService } from '../modules/builtin-skill/provisioning/builtin-skill-provisioning.service';

async function bootstrap() {
  const args = process.argv.slice(2);
  const bundleArg = args[0] || 'builtin-skills/platform.document.markdown-artifact-writer';
  const envArg = args[1] || 'full';

  console.log(`Starting Built-in Skill Provisioning command...`);
  console.log(`Bundle Path: ${bundleArg}, Environment: ${envArg}`);

  const app = await NestFactory.createApplicationContext(AppModule);
  const provisioningService = app.get(BuiltinSkillProvisioningService);

  try {
    const result = await provisioningService.provisionBundle(bundleArg, envArg);
    console.log(`Successfully provisioned built-in skill:`);
    console.log(JSON.stringify(result, null, 2));
    await app.close();
    process.exit(0);
  } catch (err: any) {
    console.error(`Provisioning failed: ${err.message}`, err.stack);
    await app.close();
    process.exit(1);
  }
}

if (require.main === module) {
  bootstrap();
}
