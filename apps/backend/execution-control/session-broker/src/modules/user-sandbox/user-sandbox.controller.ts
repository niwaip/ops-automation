import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Query,
  Param,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { UserSandboxService } from './user-sandbox.service';
import {
  LaunchUserSandboxDto,
  FreezeUserSandboxDto,
  StopUserSandboxDto,
  ExecUserSandboxDto,
  RunHarnessDto,
  UpdateUserSandboxQuotaDto,
} from './user-sandbox.dto';
import {
  UserSandboxStatus,
  UserSandboxExecResult,
  UserSandboxHarnessResult,
} from './user-sandbox.interface';

@ApiTags('User Sandboxes')
@Controller('user-sandboxes')
export class UserSandboxController {
  constructor(private readonly userSandboxService: UserSandboxService) {}

  @Post('launch')
  @ApiOperation({ summary: '启动或恢复用户的个人沙箱容器' })
  @ApiResponse({ status: 200, description: '沙箱已就绪' })
  async launchSandbox(@Body() dto: LaunchUserSandboxDto): Promise<UserSandboxStatus> {
    if (!dto.userId) {
      throw new BadRequestException('userId 不能为空');
    }
    return this.userSandboxService.ensureUserSandbox(dto.userId, {
      modelApiKey: dto.modelApiKey,
      cpuLimit: dto.cpuLimit,
      memoryLimitMb: dto.memoryLimitMb,
      customEnv: dto.customEnv,
    });
  }

  @Post('freeze')
  @ApiOperation({ summary: '冻结/挂起用户的个人沙箱（释放 CPU 与内存）' })
  @ApiResponse({ status: 200, description: '沙箱已冻结' })
  async freezeSandbox(@Body() dto: FreezeUserSandboxDto): Promise<UserSandboxStatus> {
    if (!dto.userId) {
      throw new BadRequestException('userId 不能为空');
    }
    return this.userSandboxService.freezeUserSandbox(dto.userId);
  }

  @Post('stop')
  @ApiOperation({ summary: '停止用户的个人沙箱容器' })
  @ApiResponse({ status: 200, description: '沙箱已停止' })
  async stopSandbox(@Body() dto: StopUserSandboxDto): Promise<UserSandboxStatus> {
    if (!dto.userId) {
      throw new BadRequestException('userId 不能为空');
    }
    return this.userSandboxService.stopUserSandbox(dto.userId);
  }

  @Get()
  @ApiOperation({ summary: '查询所有用户的个人沙箱容器列表' })
  @ApiResponse({ status: 200, description: '返回沙箱列表' })
  async listSandboxes(): Promise<{ sandboxes: UserSandboxStatus[] }> {
    const sandboxes = await this.userSandboxService.listAllUserSandboxes();
    return { sandboxes };
  }

  @Post('quota')
  @ApiOperation({ summary: '调整或分配用户的个人沙箱配额（实时生效）' })
  @ApiResponse({ status: 200, description: '配额更新成功' })
  async updateQuota(@Body() dto: UpdateUserSandboxQuotaDto): Promise<UserSandboxStatus> {
    if (!dto.userId) {
      throw new BadRequestException('userId 不能为空');
    }
    return this.userSandboxService.setUserQuota(dto.userId, {
      cpuLimit: dto.cpuLimit,
      memoryLimitMb: dto.memoryLimitMb,
    });
  }

  @Get('quota')
  @ApiOperation({ summary: '查询指定用户的个人沙箱配额' })
  @ApiResponse({ status: 200, description: '返回配额配置' })
  async getQuota(@Query('userId') userId: string) {
    if (!userId) {
      throw new BadRequestException('userId 不能为空');
    }
    return this.userSandboxService.getUserQuota(userId);
  }

  @Post('recreate')
  @ApiOperation({ summary: '使用最新镜像重建用户沙箱容器（保留磁盘数据）' })
  @ApiResponse({ status: 200, description: '已使用最新镜像重建' })
  async recreateSandbox(@Body() dto: LaunchUserSandboxDto): Promise<UserSandboxStatus> {
    if (!dto.userId) {
      throw new BadRequestException('userId 不能为空');
    }
    return this.userSandboxService.recreateUserSandbox(dto.userId, {
      modelApiKey: dto.modelApiKey,
      cpuLimit: dto.cpuLimit,
      memoryLimitMb: dto.memoryLimitMb,
      customEnv: dto.customEnv,
    });
  }

  @Get('status')
  @ApiOperation({ summary: '查询指定用户的个人沙箱状态' })
  @ApiResponse({ status: 200, description: '返回沙箱状态' })
  async getStatus(@Query('userId') userId: string): Promise<UserSandboxStatus> {
    if (!userId) {
      throw new BadRequestException('userId 不能为空');
    }
    return this.userSandboxService.getUserSandboxStatus(userId);
  }

  @Post('exec')
  @ApiOperation({ summary: '在指定用户的个人沙箱中执行命令' })
  @ApiResponse({ status: 200, description: '命令执行结果' })
  async executeCommand(@Body() dto: ExecUserSandboxDto): Promise<UserSandboxExecResult> {
    if (!dto.userId) {
      throw new BadRequestException('userId 不能为空');
    }
    if (!dto.command) {
      throw new BadRequestException('command 不能为空');
    }
    return this.userSandboxService.executeInSandbox(dto.userId, dto.command, {
      timeoutMs: dto.timeoutMs,
      workDir: dto.workDir,
    });
  }

  @Post('run-harness')
  @ApiOperation({ summary: '在用户的沙箱中调用 DeepSeek Harness 执行提示词' })
  @ApiResponse({ status: 200, description: 'Harness 智能分析结果' })
  async runHarness(@Body() dto: RunHarnessDto): Promise<UserSandboxHarnessResult> {
    if (!dto.userId) {
      throw new BadRequestException('userId 不能为空');
    }
    if (!dto.prompt) {
      throw new BadRequestException('prompt 不能为空');
    }
    return this.userSandboxService.runHarness(dto.userId, dto.prompt, {
      webSearch: dto.webSearch,
      model: dto.model,
      sessionId: dto.sessionId,
      history: dto.history,
      timeoutMs: dto.timeoutMs,
    });
  }

  @Post(':userId/stop-exec')
  @ApiOperation({ summary: '强制停止用户沙箱中正在执行的任务进程' })
  @ApiResponse({ status: 200, description: '已停止' })
  async stopRunningExecution(@Param('userId') userId: string): Promise<{ success: boolean }> {
    if (!userId) {
      throw new BadRequestException('userId 不能为空');
    }
    const success = await this.userSandboxService.stopSandboxExecution(userId);
    return { success };
  }

  @Delete(':userId')
  @ApiOperation({ summary: '销毁用户的个人沙箱容器（保留磁盘数据）' })
  @ApiResponse({ status: 200, description: '已销毁' })
  async destroySandbox(@Param('userId') userId: string): Promise<{ success: boolean }> {
    if (!userId) {
      throw new BadRequestException('userId 不能为空');
    }
    const success = await this.userSandboxService.destroyUserSandbox(userId);
    return { success };
  }
}
