import { Module } from '@nestjs/common';
import { RedisModule } from '../redis/redis.module';
import { PersonalSkillCaptureService } from './personal-skill-capture.service';
import { PersonalSkillController } from './personal-skill.controller';
import { PersonalSkillGeneratorService } from './personal-skill-generator.service';
import { PersonalSkillSourceAdapter } from './personal-skill-source.adapter';
import { PersonalSkillStoreService } from './personal-skill-store.service';
import { PersonalSkillValidatorService } from './personal-skill-validator.service';
import { ModelModule } from '../model/model.module';
import { PersonalSkillAuthoringService } from './personal-skill-authoring.service';

@Module({
  imports: [RedisModule, ModelModule],
  controllers: [PersonalSkillController],
  providers: [
    PersonalSkillSourceAdapter,
    PersonalSkillAuthoringService,
    PersonalSkillGeneratorService,
    PersonalSkillValidatorService,
    PersonalSkillStoreService,
    PersonalSkillCaptureService,
  ],
  exports: [
    PersonalSkillCaptureService,
    PersonalSkillStoreService,
    PersonalSkillGeneratorService,
  ],
})
export class PersonalSkillModule {}
