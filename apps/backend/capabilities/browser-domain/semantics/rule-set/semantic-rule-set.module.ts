import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SemanticRuleSetController } from './semantic-rule-set.controller';
import { SemanticRuleSetService } from './semantic-rule-set.service';

@Module({
  imports: [PrismaModule],
  controllers: [SemanticRuleSetController],
  providers: [SemanticRuleSetService],
  exports: [SemanticRuleSetService],
})
export class SemanticRuleSetModule {}
