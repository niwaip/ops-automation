import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { BackfillController } from './backfill.controller';
import { CandidateSchemaGeneratorService } from './candidate-schema-generator.service';

@Module({
  imports: [PrismaModule],
  controllers: [BackfillController],
  providers: [CandidateSchemaGeneratorService],
  exports: [CandidateSchemaGeneratorService],
})
export class BackfillModule {}
