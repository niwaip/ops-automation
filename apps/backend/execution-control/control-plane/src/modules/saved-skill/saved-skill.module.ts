import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ExecutionSavedSkillController, SavedSkillController } from './saved-skill.controller';
import { SavedSkillResolverService } from './saved-skill-resolver.service';
import { SavedSkillReviewClient } from './saved-skill-review.client';
import { SavedSkillService } from './saved-skill.service';

@Module({
  imports: [PrismaModule],
  controllers: [SavedSkillController, ExecutionSavedSkillController],
  providers: [SavedSkillService, SavedSkillResolverService, SavedSkillReviewClient],
  exports: [SavedSkillService, SavedSkillResolverService],
})
export class SavedSkillModule {}
