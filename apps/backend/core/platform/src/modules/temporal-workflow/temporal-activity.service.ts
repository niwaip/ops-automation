import { Injectable } from '@nestjs/common';
import { Activity } from '../../prisma/client';
import {
  ActivityFormData,
  ActivityValidationResult,
  GenerateCodeResult,
  BuiltinActivityDTO,
} from './temporal-activity.types';
import { ActivityCrudService } from './temporal-activity-crud.service';
import { TemporalActivityValidationFacadeService } from './temporal-activity-validation-facade.service';
import { ActivityCodegenService } from './temporal-activity-codegen.service';

@Injectable()
export class ActivityService {
  constructor(
    private readonly crud: ActivityCrudService,
    private readonly validationFacade: TemporalActivityValidationFacadeService,
    private readonly codegen: ActivityCodegenService
  ) {}

  listBuiltin(): BuiltinActivityDTO[] {
    return this.crud.listBuiltin();
  }

  getBuiltin(key: string): BuiltinActivityDTO | null {
    return this.crud.getBuiltin(key);
  }

  async findAll(): Promise<Activity[]> {
    return this.crud.findAll();
  }

  async findOne(id: string): Promise<Activity | null> {
    return this.crud.findOne(id);
  }

  async findByName(name: string): Promise<Activity | null> {
    return this.crud.findByName(name);
  }

  async create(data: ActivityFormData): Promise<Activity> {
    return this.crud.create(data);
  }

  async update(id: string, data: Partial<ActivityFormData>): Promise<Activity> {
    return this.crud.update(id, data);
  }

  async delete(id: string): Promise<{ success: boolean }> {
    return this.crud.delete(id);
  }

  async validate(config: ActivityFormData): Promise<ActivityValidationResult> {
    return this.validationFacade.validate(config);
  }

  async generateCode(config: ActivityFormData, errorContext?: string): Promise<GenerateCodeResult> {
    return this.codegen.generateCode(config, errorContext);
  }
}
