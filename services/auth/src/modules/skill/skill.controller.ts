/**
 * Skill Controller
 * Skill配置API接口 - 支持权限管控和AI语义匹配
 */

import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  HttpException,
  HttpStatus,
  UseGuards,
  Request,
  ForbiddenException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../guards/jwt-auth.guard';
import { RolesGuard } from '../../guards/roles.guard';
import { Roles } from '../../decorators/roles.decorator';
import { Public } from '../../decorators';
import { SkillService } from './skill.service';
import {
  CreateSkillDTO,
  SkillConfigDTO,
  SkillMatchResult,
  SkillPermissionDTO,
  GrantSkillDTO,
} from './interfaces';

@Controller('skills')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SkillController {
  constructor(private readonly skillService: SkillService) {}

  /**
   * 获取用户可访问的 Skills
   */
  @Get()
  async listSkills(@Request() req: any): Promise<{ skills: SkillConfigDTO[] }> {
    const userId = req.user.id;
    // 只返回用户有权限访问的 Skills
    const skills = await this.skillService.listSkillsForUser(userId);
    return { skills };
  }

  /**
   * 获取 Skill 详情（需检查权限）
   */
  @Get(':id')
  async getSkill(
    @Param('id') id: string,
    @Request() req: any,
  ): Promise<SkillConfigDTO> {
    const userId = req.user.id;

    // 检查用户是否有权限访问此 Skill
    const hasPermission = await this.skillService.checkUserSkillPermission(userId, id);
    if (!hasPermission) {
      throw new ForbiddenException('You do not have permission to access this skill');
    }

    const skill = await this.skillService.getSkill(id);
    if (!skill) {
      throw new HttpException('Skill not found', HttpStatus.NOT_FOUND);
    }
    return skill;
  }

  /**
   * 创建 Skill（仅管理员）
   */
  @Post()
  @Roles('admin')
  async createSkill(@Body() body: CreateSkillDTO): Promise<SkillConfigDTO> {
    return this.skillService.createSkill(body);
  }

  /**
   * 更新 Skill（仅管理员）
   */
  @Put(':id')
  @Roles('admin')
  async updateSkill(
    @Param('id') id: string,
    @Body() body: Partial<CreateSkillDTO>,
  ): Promise<SkillConfigDTO> {
    const skill = await this.skillService.updateSkill(id, body);
    if (!skill) {
      throw new HttpException('Skill not found', HttpStatus.NOT_FOUND);
    }
    return skill;
  }

  /**
   * 删除 Skill（仅管理员）
   */
  @Delete(':id')
  @Roles('admin')
  async deleteSkill(@Param('id') id: string): Promise<{ success: boolean }> {
    const success = await this.skillService.deleteSkill(id);
    if (!success) {
      throw new HttpException('Skill not found', HttpStatus.NOT_FOUND);
    }
    return { success };
  }

  /**
   * AI 语义匹配 Skill（带权限过滤）
   * 支持两种方式传递 userId：
   * 1. 通过 JWT 认证（req.user.id）
   * 2. 通过 body.userId（用于内部服务调用）
   * 注意：内部服务调用时使用 body.userId，跳过 JWT 认证
   */
  @Public()
  @Post('match')
  async matchSkill(
    @Body() body: { userInput: string; userId?: string },
    @Request() req: any,
  ): Promise<{ match: SkillMatchResult | null }> {
    // 优先使用 body.userId（内部服务调用），否则使用 JWT 认证的 userId
    const userId = body.userId || req.user?.id;
    if (!userId) {
      return { match: null };
    }
    // 使用 AI 语义匹配（自动过滤用户无权限的 Skills）
    const match = await this.skillService.matchSkillWithAI(body.userInput, userId);
    return { match };
  }

  /**
   * 授权 Skill 给角色（仅管理员）
   */
  @Post(':id/grant')
  @Roles('admin')
  async grantSkill(
    @Param('id') skillId: string,
    @Body() body: GrantSkillDTO,
    @Request() req: any,
  ): Promise<{ permission: SkillPermissionDTO }> {
    const grantedBy = req.user.id;
    const permission = await this.skillService.grantSkillToRole(skillId, body.roleId, grantedBy);
    return { permission };
  }

  /**
   * 撤销角色的 Skill 权限（仅管理员）
   */
  @Delete(':id/grant/:roleId')
  @Roles('admin')
  async revokeSkill(
    @Param('id') skillId: string,
    @Param('roleId') roleId: string,
  ): Promise<{ success: boolean }> {
    const success = await this.skillService.revokeSkillFromRole(skillId, roleId);
    return { success };
  }

  /**
   * 获取 Skill 的权限分配列表（仅管理员）
   */
  @Get(':id/permissions')
  @Roles('admin')
  async getSkillPermissions(
    @Param('id') skillId: string,
  ): Promise<{ permissions: SkillPermissionDTO[] }> {
    const permissions = await this.skillService.getSkillPermissions(skillId);
    return { permissions };
  }

  /**
   * 获取所有角色列表（仅管理员，用于权限分配）
   */
  @Get('roles')
  @Roles('admin')
  async listRoles(): Promise<{ roles: { id: string; name: string }[] }> {
    const roles = await this.skillService.listRoles();
    return { roles };
  }
}