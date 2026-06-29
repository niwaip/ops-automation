import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SemanticRuleReleaseController } from './semantic-rule-release.controller';
import { SemanticRuleReleaseQueryController } from './semantic-rule-release-query.controller';
import { SemanticRuleReleaseService } from './semantic-rule-release.service';

@Module({
  imports: [PrismaModule],
  controllers: [SemanticRuleReleaseController, SemanticRuleReleaseQueryController],
  providers: [SemanticRuleReleaseService],
  exports: [SemanticRuleReleaseService],
})
export class SemanticRuleReleaseModule {}
