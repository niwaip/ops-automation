import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Put,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedRequest } from '../auth/auth.middleware';
import {
  ResolveScopedMemoryQueryDto,
  UpsertOwnScopedMemoryDto,
} from './experience-learning.dto';
import { ScopedMemoryService } from './scoped-memory.service';

@ApiTags('Internal Scoped Memory')
@ApiBearerAuth()
@Controller('internal/scoped-memories')
export class ScopedMemoryController {
  constructor(private readonly scopedMemory: ScopedMemoryService) {}

  @Get('resolve')
  @ApiOperation({ summary: 'Resolve the caller\'s highest-priority active planner memory' })
  async resolve(@Query() query: ResolveScopedMemoryQueryDto, @Req() request: AuthenticatedRequest) {
    const userId = request.user?.id;
    if (!userId) throw new UnauthorizedException('Authentication required');

    const scope = await this.scopedMemory.resolveTrustedScope({
      userId,
      activeOrganizationId: request.user?.organizationId,
    });
    return this.scopedMemory.resolve(scope, query.kind, query.memoryKey);
  }

  @Put('self')
  @ApiOperation({ summary: 'Upsert an explicit planner memory for the authenticated user only' })
  upsertOwn(@Body() body: UpsertOwnScopedMemoryDto, @Req() request: AuthenticatedRequest) {
    const userId = request.user?.id;
    if (!userId) throw new UnauthorizedException('Authentication required');
    if (Buffer.byteLength(JSON.stringify(body.value), 'utf8') > 8 * 1024) {
      throw new BadRequestException('Scoped memory value must not exceed 8 KiB');
    }
    return this.scopedMemory.upsert({
      scopeType: 'user',
      scopeId: userId,
      kind: body.kind,
      memoryKey: body.memoryKey,
      value: body.value,
      source: 'explicit',
    });
  }
}
