/**
 * Skill Controller
 * Skill配置API接口
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
} from '@nestjs/common';
import { Public } from '../../decorators/permissions.decorator';
import { SkillService } from './skill.service';
import { CreateSkillDTO, SkillConfigDTO, SkillMatchResult } from './interfaces';

@Public()
@Controller('skills')
export class SkillController {
  constructor(private readonly skillService: SkillService) {}

  @Get()
  async listSkills(): Promise<{ skills: SkillConfigDTO[] }> {
    const skills = await this.skillService.listSkills();
    return { skills };
  }

  @Get(':id')
  async getSkill(@Param('id') id: string): Promise<SkillConfigDTO> {
    const skill = await this.skillService.getSkill(id);
    if (!skill) {
      throw new HttpException('Skill not found', HttpStatus.NOT_FOUND);
    }
    return skill;
  }

  @Post()
  async createSkill(@Body() body: CreateSkillDTO): Promise<SkillConfigDTO> {
    return this.skillService.createSkill(body);
  }

  @Put(':id')
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

  @Delete(':id')
  async deleteSkill(@Param('id') id: string): Promise<{ success: boolean }> {
    const success = await this.skillService.deleteSkill(id);
    if (!success) {
      throw new HttpException('Skill not found', HttpStatus.NOT_FOUND);
    }
    return { success };
  }

  @Post('match')
  async matchSkill(@Body() body: { userInput: string }): Promise<{ match: SkillMatchResult | null }> {
    const match = await this.skillService.matchSkill(body.userInput);
    return { match };
  }
}