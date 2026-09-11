import { Inject, Injectable } from '@nestjs/common';
import { WORKFLOW_REGISTRY_PRISMA, type WorkflowRegistryPrismaPort } from '../flow-template';
import { Activity } from './temporal-workflow.types';
import { BuiltinActivityRegistry } from './builtin-activity.registry';
import { ActivityFormData, BuiltinActivityDTO } from './temporal-activity.types';

@Injectable()
export class ActivityCrudService {
  constructor(
    @Inject(WORKFLOW_REGISTRY_PRISMA) private readonly prisma: WorkflowRegistryPrismaPort,
    private readonly builtinActivityRegistry: BuiltinActivityRegistry
  ) {}

  listBuiltin(): BuiltinActivityDTO[] {
    return this.builtinActivityRegistry.list();
  }

  getBuiltin(key: string): BuiltinActivityDTO | null {
    return this.builtinActivityRegistry.getByKey(key);
  }

  async findAll(): Promise<Activity[]> {
    return this.prisma.activity.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string): Promise<Activity | null> {
    return this.prisma.activity.findUnique({ where: { id } });
  }

  async findByName(name: string): Promise<Activity | null> {
    return this.prisma.activity.findUnique({ where: { name } });
  }

  async create(data: ActivityFormData): Promise<Activity> {
    return this.prisma.activity.create({
      data: {
        name: data.name,
        fn: data.fn,
        timeout: data.timeout || '30s',
        retryPolicy: (data.retryPolicy || null) as any,
        handler: data.handler,
        config: data.config as any,
        generatedCode: data.generatedCode || null,
        isActive: data.isActive ?? true,
      },
    });
  }

  async update(id: string, data: Partial<ActivityFormData>): Promise<Activity> {
    return this.prisma.activity.update({
      where: { id },
      data: {
        ...(data.name && { name: data.name }),
        ...(data.fn && { fn: data.fn }),
        ...(data.timeout && { timeout: data.timeout }),
        ...(data.retryPolicy !== undefined && { retryPolicy: data.retryPolicy as any }),
        ...(data.handler && { handler: data.handler }),
        ...(data.config && { config: data.config as any }),
        ...(data.generatedCode !== undefined && { generatedCode: data.generatedCode }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
      },
    });
  }

  async delete(id: string): Promise<{ success: boolean }> {
    await this.prisma.activity.delete({ where: { id } });
    return { success: true };
  }
}
