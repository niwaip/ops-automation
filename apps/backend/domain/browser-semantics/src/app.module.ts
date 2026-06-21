import { Module } from '@nestjs/common';
import { BootstrapModule } from './bootstrap/bootstrap.module';
import { SemanticRuleErrorLogModule } from './modules/error-log/semantic-rule-error-log.module';
import { SemanticRuleGenerationModule } from './modules/generation/semantic-rule-generation.module';
import { SemanticRuleHitLogModule } from './modules/hit-log/semantic-rule-hit-log.module';
import { SemanticRuleReleaseModule } from './modules/release/semantic-rule-release.module';
import { SemanticRuleRuntimeModule } from './modules/runtime/semantic-rule-runtime.module';
import { SemanticRuleSetModule } from './modules/rule-set/semantic-rule-set.module';
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
