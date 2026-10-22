import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import {
  CopyPersonalSkillDto,
  CreateSkillCaptureDto,
  CreateSkillVersionDto,
  PersonalSkillDetailDto,
  PersonalSkillSummaryDto,
  SkillCaptureStatusDto,
} from './personal-skill.dto';
import { PersonalSkillCaptureService } from './personal-skill-capture.service';
import { PersonalSkillStoreService } from './personal-skill-store.service';

@ApiTags('Personal-Skills')
@Controller('ai/personal-skills')
export class PersonalSkillController {
  constructor(
    private readonly captureService: PersonalSkillCaptureService,
    private readonly storeService: PersonalSkillStoreService
  ) {}

  private resolveUserId(req: Request): string {
    const user = (req as any).user;
    if (user?.id) return user.id;
    if (user?.userId) return user.userId;
    const headerUserId = req.headers['x-user-id'];
    if (typeof headerUserId === 'string' && headerUserId.trim()) {
      return headerUserId.trim();
    }
    // 开发环境兼容默认用户
    if (process.env.NODE_ENV !== 'production') {
      return 'default-user';
    }
    throw new UnauthorizedException('User authentication required');
  }

  @Post('captures')
  @ApiOperation({ summary: '从已确认任务或会话发起提炼生成个人技能' })
  @ApiResponse({ status: 202, description: '生成任务已提交排队', type: SkillCaptureStatusDto })
  async createCapture(
    @Req() req: Request,
    @Body() dto: CreateSkillCaptureDto
  ): Promise<SkillCaptureStatusDto> {
    const userId = this.resolveUserId(req);
    return this.captureService.createCapture(userId, dto);
  }

  @Get('captures/:captureId')
  @ApiOperation({ summary: '查询技能生成与安装状态' })
  @ApiResponse({ status: 200, type: SkillCaptureStatusDto })
  async getCaptureStatus(
    @Req() req: Request,
    @Param('captureId') captureId: string
  ): Promise<SkillCaptureStatusDto> {
    const userId = this.resolveUserId(req);
    return this.captureService.getCaptureStatus(userId, captureId);
  }

  @Get()
  @ApiOperation({ summary: '获取当前用户的个人技能列表' })
  @ApiResponse({ status: 200, type: [PersonalSkillSummaryDto] })
  async listSkills(@Req() req: Request): Promise<PersonalSkillSummaryDto[]> {
    const userId = this.resolveUserId(req);
    const records = await this.storeService.listSkills(userId);
    return records.map((r) => ({
      id: r.skillId,
      slug: r.slug,
      displayName: r.displayName,
      description: r.description,
      version: r.version,
      triggers: r.triggers,
      aliases: r.aliases,
      deliverables: r.deliverables,
      hasScript: r.hasScript,
      packageHash: r.packageHash,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  }

  @Get(':skillId')
  @ApiOperation({ summary: '查看个人技能规则、参数与当前版本详情' })
  @ApiResponse({ status: 200, type: PersonalSkillDetailDto })
  async getSkill(
    @Req() req: Request,
    @Param('skillId') skillId: string
  ): Promise<PersonalSkillDetailDto> {
    const userId = this.resolveUserId(req);
    const detail = await this.storeService.getSkill(userId, skillId);
    if (!detail) {
      throw new NotFoundException(`Personal skill ${skillId} not found`);
    }
    return detail;
  }

  @Post(':skillId/versions')
  @ApiOperation({ summary: '从修改指令或新任务更新技能版本' })
  @ApiResponse({ status: 200, description: '版本更新成功' })
  async createVersion(
    @Req() req: Request,
    @Param('skillId') skillId: string,
    @Body() dto: CreateSkillVersionDto
  ) {
    const userId = this.resolveUserId(req);
    return this.storeService.createVersion(userId, skillId, dto);
  }

  @Post(':skillId/copies')
  @ApiOperation({ summary: '复制为新的独立个人技能' })
  @ApiResponse({ status: 201, description: '技能复制成功' })
  async copySkill(
    @Req() req: Request,
    @Param('skillId') skillId: string,
    @Body() dto: CopyPersonalSkillDto
  ) {
    const userId = this.resolveUserId(req);
    return this.storeService.copySkill(userId, skillId, dto.targetDisplayName, dto.targetSlug);
  }

  @Get(':skillId/export')
  @ApiOperation({ summary: '导出技能标准目录 ZIP 压缩包' })
  async exportSkill(
    @Req() req: Request,
    @Param('skillId') skillId: string,
    @Query('version') version: string | undefined,
    @Res() res: Response
  ) {
    const userId = this.resolveUserId(req);
    const ver = version ? parseInt(version, 10) : undefined;
    const zipBuffer = await this.storeService.exportSkillZip(userId, skillId, ver);

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="skill-${skillId}.zip"`);
    res.send(zipBuffer);
  }

  @Delete(':skillId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '删除个人技能' })
  async deleteSkill(@Req() req: Request, @Param('skillId') skillId: string): Promise<void> {
    const userId = this.resolveUserId(req);
    await this.storeService.deleteSkill(userId, skillId);
  }
}
