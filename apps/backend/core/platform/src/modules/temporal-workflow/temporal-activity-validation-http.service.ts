import { Injectable } from '@nestjs/common';
import { TemporalActivityValidationFacadeService } from './temporal-activity-validation-facade.service';
import type { ActivityFormData, ActivityValidationResult } from './temporal-activity.types';

@Injectable()
export class TemporalActivityValidationHttpService {
  constructor(private readonly validationFacade: TemporalActivityValidationFacadeService) {}

  async validateRequest(config: ActivityFormData): Promise<ActivityValidationResult> {
    return this.validationFacade.validate(config);
  }
}
