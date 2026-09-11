import { Body, Controller, Get, Put, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AiAdminGuard } from '../../common/guards/ai-auth.guard';
import { StorageConfigService } from './storage-config.service';
import type {
  StorageConfigDTO,
  UpdateStorageConfigDTO,
  TestStorageConnectionDTO,
} from './storage.dto';

@ApiTags('AI-Storage-Admin')
@UseGuards(AiAdminGuard)
@Controller('ai/storage')
export class StorageConfigController {
  constructor(private readonly storageConfigService: StorageConfigService) {}

  @Get('config')
  @ApiOperation({ summary: 'Get current system storage configuration' })
  getConfig(): StorageConfigDTO {
    return this.storageConfigService.getConfig();
  }

  @Put('config')
  @ApiOperation({ summary: 'Update system storage configuration' })
  async updateConfig(@Body() body: UpdateStorageConfigDTO): Promise<StorageConfigDTO> {
    return this.storageConfigService.updateConfig(body);
  }

  @Post('test')
  @ApiOperation({ summary: 'Test storage connection and reachability' })
  async testConnection(@Body() body: UpdateStorageConfigDTO): Promise<TestStorageConnectionDTO> {
    return this.storageConfigService.testConnection(body);
  }
}
