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
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SkillService } from './skill.service';
import { CreateSkillDTO, SkillConfigDTO, SkillMatchResult } from '../../ai-orchestrator/modules/react-engine/interfaces';

@ApiTags('Skills')
@Controller('skills')
export class SkillController {
  constructor(private readonly skillService: SkillService) {}

  @Get()
  @ApiOperation({ summary: 'List all skills' })
  @ApiResponse({ status: 200, description: 'Returns list of skills' })
  async listSkills(): Promise<{ skills: SkillConfigDTO[] }> {
    const skills = await this.skillService.listSkills();
    return { skills };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get skill details' })
  @ApiResponse({ status: 200, description: 'Returns skill details' })
  @ApiResponse({ status: 404, description: 'Skill not found' })
  async getSkill(@Param('id') id: string): Promise<SkillConfigDTO> {
    const skill = await this.skillService.getSkill(id);
    if (!skill) {
      throw new HttpException('Skill not found', HttpStatus.NOT_FOUND);
    }
    return skill;
  }

  @Post()
  @ApiOperation({ summary: 'Create a new skill' })
  @ApiResponse({ status: 201, description: 'Skill created successfully' })
  async createSkill(@Body() body: CreateSkillDTO): Promise<SkillConfigDTO> {
    return this.skillService.createSkill(body);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a skill' })
  @ApiResponse({ status: 200, description: 'Skill updated successfully' })
  @ApiResponse({ status: 404, description: 'Skill not found' })
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
  @ApiOperation({ summary: 'Delete a skill' })
  @ApiResponse({ status: 200, description: 'Skill deleted successfully' })
  @ApiResponse({ status: 404, description: 'Skill not found' })
  async deleteSkill(@Param('id') id: string): Promise<{ success: boolean }> {
    const success = await this.skillService.deleteSkill(id);
    if (!success) {
      throw new HttpException('Skill not found', HttpStatus.NOT_FOUND);
    }
    return { success };
  }

  @Post('match')
  @ApiOperation({ summary: 'Match skill from user input' })
  @ApiResponse({ status: 200, description: 'Returns matched skill or null' })
  async matchSkill(@Body() body: { userInput: string }): Promise<{ match: SkillMatchResult | null }> {
    const match = await this.skillService.matchSkill(body.userInput);
    return { match };
  }
}