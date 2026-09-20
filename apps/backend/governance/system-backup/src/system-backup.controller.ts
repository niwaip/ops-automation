import {
  Body,
  Controller,
  Get,
  Post,
  UseGuards,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard, Roles, RolesGuard } from '@ops/identity-access';
import { SystemBackupService } from './system-backup.service';
import {
  ExportBackupRequestDTO,
  ImportBackupRequestDTO,
  PreviewBackupRequestDTO,
  SystemAssetSummary,
  SystemBackupArchive,
  BackupPreviewResult,
  BackupImportResult,
} from './interfaces/system-backup.interface';

@ApiTags('System-Backup')
@Controller('system/backup')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SystemBackupController {
  private readonly logger = new Logger(SystemBackupController.name);

  constructor(private readonly systemBackupService: SystemBackupService) {}

  @Get('summary')
  @Roles('admin')
  @ApiOperation({ summary: 'Get summary of all exportable system assets' })
  async getSummary(): Promise<SystemAssetSummary> {
    return this.systemBackupService.getAssetSummary();
  }

  @Post('export')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Export system assets as a structured backup archive' })
  async exportBackup(@Body() body: ExportBackupRequestDTO): Promise<SystemBackupArchive> {
    try {
      return await this.systemBackupService.exportBackup(body?.modules);
    } catch (err: any) {
      console.error('CRITICAL EXPORT ERROR:', err);
      this.logger.error(`Failed to export backup: ${err?.message || err}`, err?.stack);
      throw err;
    }
  }

  @Post('preview')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Preview and validate backup archive for conflicts before import' })
  async previewBackup(@Body() body: PreviewBackupRequestDTO): Promise<BackupPreviewResult> {
    return this.systemBackupService.previewBackup(body?.payload);
  }

  @Post('import')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Execute system data restore from backup archive' })
  async importBackup(@Body() body: ImportBackupRequestDTO): Promise<BackupImportResult> {
    return this.systemBackupService.importBackup(body?.payload, body?.strategy, body?.modules);
  }
}
