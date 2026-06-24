import { Injectable } from '@nestjs/common';
import { ActivityValidationService } from './temporal-activity-validation.service';
import type { ActivityFormData, ActivityValidationResult } from './temporal-activity.types';

@Injectable()
export class TemporalActivityValidationFacadeService {
  constructor(private readonly validationService: ActivityValidationService) {}

  async validate(config: ActivityFormData): Promise<ActivityValidationResult> {
    return this.validationService.validate(config);
  }
}
