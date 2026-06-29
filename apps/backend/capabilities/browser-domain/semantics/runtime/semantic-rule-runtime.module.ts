import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SemanticRuleRuntimeController } from './semantic-rule-runtime.controller';
import { SemanticRuleRuntimeService } from './semantic-rule-runtime.service';

@Module({
  imports: [PrismaModule],
  controllers: [SemanticRuleRuntimeController],
  providers: [SemanticRuleRuntimeService],
  exports: [SemanticRuleRuntimeService],
})
export class SemanticRuleRuntimeModule {}
