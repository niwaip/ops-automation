import { Module } from '@nestjs/common';
import { BootstrapModule } from './bootstrap/bootstrap.module';
import { SemanticRuleErrorLogModule } from './error-log/semantic-rule-error-log.module';
import { SemanticRuleGenerationModule } from './generation/semantic-rule-generation.module';
import { SemanticRuleHitLogModule } from './hit-log/semantic-rule-hit-log.module';
import { SemanticRuleReleaseModule } from './release/semantic-rule-release.module';
import { SemanticRuleRuntimeModule } from './runtime/semantic-rule-runtime.module';
import { SemanticRuleSetModule } from './rule-set/semantic-rule-set.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    PrismaModule,
    BootstrapModule,
    SemanticRuleSetModule,
    SemanticRuleReleaseModule,
    SemanticRuleRuntimeModule,
    SemanticRuleHitLogModule,
    SemanticRuleErrorLogModule,
    SemanticRuleGenerationModule,
  ],
})
export class AppModule {}
