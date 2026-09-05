import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { PrismaService } from '../../prisma/prisma.service';
import { getControlPlaneApiUrl } from '../../config/service-endpoints';
import { TodoStatus } from './dto/workbench-todo.dto';

export interface TaskExecutionResult {
  todoId: string;
  executionId: string;
  boundWorkflowId: string;
  status: TodoStatus;
  startedAt: string;
}

@Injectable()
export class WorkbenchTodoExecutorService {
  private readonly logger = new Logger(WorkbenchTodoExecutorService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 触发执行绑定了工作流的待办任务
   */
  async executeTask(
    userId: string,
    todoId: string,
    overrideInput?: Record<string, any>,
    authToken?: string
  ): Promise<TaskExecutionResult> {
    const todo = await this.prisma.workbenchTodo.findUnique({
      where: { id: todoId },
    });

    if (!todo) {
      throw new BadRequestException(`待办任务不存在: ${todoId}`);
    }

    if (todo.userId !== userId) {
      throw new BadRequestException('无权执行他人的待办任务');
    }

    if (!todo.boundWorkflowId) {
      throw new BadRequestException('该待办任务尚未绑定自动化工作流或执行技能');
    }

    const controlPlaneUrl = getControlPlaneApiUrl();
    const inputPayload: Record<string, any> = {
      ...(typeof todo.contextData === 'object' && todo.contextData !== null
        ? (todo.contextData as Record<string, any>)
        : {}),
      ...(overrideInput || {}),
      todoId: todo.id,
      todoTitle: todo.title,
      todoPriority: todo.priority,
      userId,
    };

    this.logger.log(
      `Executing task todoId=${todo.id} boundWorkflowId=${todo.boundWorkflowId} via Control Plane at ${controlPlaneUrl}`
    );

    let executionId: string;
    try {
      const response = await axios.post<{ id: string }>(
        `${controlPlaneUrl}/executions`,
        {
          skillId: todo.boundWorkflowId,
          capabilityId: todo.boundWorkflowId,
          input: inputPayload,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            ...(authToken ? { Authorization: authToken } : {}),
            'X-User-Id': userId,
          },
          timeout: 10000,
        }
      );

      executionId = response.data?.id;
      if (!executionId) {
        throw new Error('Control Plane 未返回有效的 executionId');
      }
    } catch (err: any) {
      const detail = err.response?.data?.message || err.message;
      this.logger.error(`Failed to invoke Control Plane execution: ${detail}`);
      throw new BadRequestException(`触发任务执行失败: ${detail}`);
    }

    // 更新任务状态为进行中，记录 executionId
    await this.prisma.workbenchTodo.update({
      where: { id: todo.id },
      data: {
        status: TodoStatus.in_progress,
        executionId: executionId,
        updatedAt: new Date(),
      },
    });

    return {
      todoId: todo.id,
      executionId,
      boundWorkflowId: todo.boundWorkflowId,
      status: TodoStatus.in_progress,
      startedAt: new Date().toISOString(),
    };
  }
}
