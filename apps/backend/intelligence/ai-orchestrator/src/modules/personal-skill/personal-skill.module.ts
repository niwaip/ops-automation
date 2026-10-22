import { Module } from '@nestjs/common';
import { RedisModule } from '../redis/redis.module';
import { PersonalSkillCaptureService } from './personal-skill-capture.service';
import { PersonalSkillController } from './personal-skill.controller';
import { PersonalSkillGeneratorService } from './personal-skill-generator.service';
import { PersonalSkillSourceAdapter } from './personal-skill-source.adapter';
import { PersonalSkillStoreService } from './personal-skill-store.service';
import { PersonalSkillValidatorService } from './personal-skill-validator.service';

@Module({
  imports: [RedisModule],
  controllers: [PersonalSkillController],
  providers: [
    PersonalSkillSourceAdapter,
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
