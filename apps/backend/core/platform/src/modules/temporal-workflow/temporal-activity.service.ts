import { Injectable } from '@nestjs/common';
import { Activity } from '@prisma/client';
import { ActivityFormData, ActivityValidationResult, GenerateCodeResult, BuiltinActivityDTO } from './temporal-activity.types';
import { ActivityCrudService } from './temporal-activity-crud.service';
import { ActivityValidationService } from './temporal-activity-validation.service';
import { ActivityCodegenService } from './temporal-activity-codegen.service';
import { ActivityExecutionService } from './temporal-activity-execution.service';

@Injectable()
export class ActivityService {
  constructor(
    private readonly crud: ActivityCrudService,
    private readonly validation: ActivityValidationService,
    private readonly codegen: ActivityCodegenService,
    private readonly execution: ActivityExecutionService,
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
    return this.validation.validate(config);
  }

  async generateCode(config: ActivityFormData, errorContext?: string): Promise<GenerateCodeResult> {
    return this.codegen.generateCode(config, errorContext);
  }

  async executeCode(code: string, fn: string, taskQueue: string, input?: Record<string, any>): Promise<{
    success: boolean;
    result?: any;
    error?: string;
  }> {
    return this.execution.executeCode(code, fn, taskQueue, input);
  }

  async executeCodeInTemporalSandbox(
    code: string,
    fn: string,
    taskQueue: string,
    input?: Record<string, any>,
  ): Promise<{
    success: boolean;
    result?: any;
    error?: string;
  }> {
    return this.execution.executeCodeInTemporalSandbox(code, fn, taskQueue, input);
  }

  async executeCodeStreaming(
    code: string,
    fn: string,
    taskQueue: string,
    input: Record<string, any> | undefined,
    onLog: (log: string) => void,
    options: any = {},
  ): Promise<any> {
    return this.execution.executeCodeStreaming(code, fn, taskQueue, input, onLog, options);
  }
}
