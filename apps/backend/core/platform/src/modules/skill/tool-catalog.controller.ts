import { Controller, Get, Param, Patch, Body, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../guards/jwt-auth.guard';
import { RolesGuard } from '../../guards/roles.guard';
import { Roles } from '../../decorators/roles.decorator';
import { ToolCatalogService } from './tool-catalog.service';
import { UpdateToolCatalogDTO } from './interfaces';

@Controller('tools/catalog')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ToolCatalogController {
  constructor(private readonly toolCatalogService: ToolCatalogService) {}

  @Get()
  @Roles('admin')
  async listCatalog(
    @Query('status') status?: string,
    @Query('category') category?: string,
    @Query('runtimeType') runtimeType?: string,
    @Query('allowSkillBinding') allowSkillBinding?: string,
    @Query('keyword') keyword?: string
  ) {
    const tools = await this.toolCatalogService.listCatalog({
      status,
      category,
      runtimeType,
      allowSkillBinding: allowSkillBinding === undefined ? undefined : allowSkillBinding === 'true',
      keyword,
    });
    return { tools };
  }

  @Get(':name')
  @Roles('admin')
  async getCatalogItem(@Param('name') name: string) {
    const tool = await this.toolCatalogService.getCatalogItem(name);
    return { tool };
  }

  @Patch(':name')
  @Roles('admin')
  async updateCatalogItem(@Param('name') name: string, @Body() body: UpdateToolCatalogDTO) {
    const tool = await this.toolCatalogService.updateCatalogItem(name, body);
    return { tool };
  }
}
