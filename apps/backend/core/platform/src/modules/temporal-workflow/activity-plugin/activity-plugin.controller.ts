import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ActivityPluginProbeService, type ActivityPluginProbeRequest } from './activity-plugin-probe.service';
import { ActivityPluginRegistryService } from './activity-plugin-registry.service';
import type { ActivityPluginManifest, ActivityPluginProbeResult } from './activity-plugin.types';

@ApiTags('Activity Plugins')
@Controller('activity-plugins')
export class ActivityPluginController {
  constructor(
    private readonly registry: ActivityPluginRegistryService,
    private readonly probeService: ActivityPluginProbeService
  ) {}

  @Get()
  @ApiOperation({ summary: 'List fixed Activity plugin manifests and contracts' })
  list(): ActivityPluginManifest[] {
    return this.registry.list();
  }

  @Post('probe')
  @ApiOperation({ summary: 'Execute a real probe with the exact fixed Activity implementation' })
  probe(@Body() request: ActivityPluginProbeRequest): Promise<ActivityPluginProbeResult> {
    return this.probeService.probe(request);
  }
}
