import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  Logger,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '@ops/identity-access';
import { UserEmailConnectionService } from '../user-connection/user-email-connection.service';
import { WorkbenchInboxService } from './workbench-inbox.service';

export interface InternalFetchUnreadEmailsDto {
  userId?: string;
  maxCount?: number;
}

export interface InternalMarkEmailsReadDto {
  userId?: string;
  messageIds: string[];
}

export interface InternalCollectInboxDto {
  userId?: string;
  items?: any[];
  emails?: any[];
  title?: string;
  rawContent?: string;
  sourceType?: string;
  sourceSender?: string;
  sourceRefId?: string;
  autoDeduplicate?: boolean;
}

function normalizeSourceType(sourceType?: string): any {
  const lower = (sourceType || 'manual').toLowerCase();
  if (lower === 'email') return 'email';
  if (lower === 'chat') return 'chat';
  if (lower === 'schedule') return 'schedule';
  if (lower === 'im_channel') return 'im_channel';
  return 'manual';
}

@ApiTags('Workbench Inbox Internal')
@Public()
@Controller('internal/workbench-inbox')
export class WorkbenchInboxInternalController {
  private readonly logger = new Logger(WorkbenchInboxInternalController.name);

  constructor(
    private readonly inboxService: WorkbenchInboxService,
    private readonly userEmailService: UserEmailConnectionService
  ) {}

  private resolveUserId(bodyUserId?: string, headerUserId?: string): string {
    const resolved = (bodyUserId || headerUserId || '').trim();
    if (!resolved) {
      throw new BadRequestException('操作失败：缺少必要的用户上下文 (userId)');
    }
    return resolved;
  }

  @Post('emails/fetch-unread')
  @ApiOperation({ summary: '内部接口：按用户拉取最新未读邮件（无硬编码，未配置则报错阻断）' })
  async fetchUnreadEmails(
    @Body() body: InternalFetchUnreadEmailsDto,
    @Headers('x-user-id') headerUserId?: string
  ) {
    const userId = this.resolveUserId(body.userId, headerUserId);
    const maxCount = body.maxCount ? Number(body.maxCount) : 20;

    this.logger.log(`Fetching unread emails for userId=${userId}, maxCount=${maxCount}`);
    const emails = await this.userEmailService.fetchUnreadEmails(userId, maxCount);

    return {
      success: true,
      emails,
      count: emails.length,
      maxCount,
    };
  }

  @Post('emails/mark-read')
  @ApiOperation({ summary: '内部接口：将指定用户的邮件回写标记为已读' })
  async markEmailsRead(
    @Body() body: InternalMarkEmailsReadDto,
    @Headers('x-user-id') headerUserId?: string
  ) {
    const userId = this.resolveUserId(body.userId, headerUserId);
    const messageIds = Array.isArray(body.messageIds) ? body.messageIds : [];

    this.logger.log(`Marking emails read for userId=${userId}, count=${messageIds.length}`);
    return await this.userEmailService.markEmailsAsRead(userId, messageIds);
  }

  @Post('collect')
  @ApiOperation({ summary: '内部接口：将 Activity 邮件或数据真实沉淀入库至 GTD 收件箱' })
  async collectInbox(
    @Body() body: InternalCollectInboxDto,
    @Headers('x-user-id') headerUserId?: string
  ) {
    const userId = this.resolveUserId(body.userId, headerUserId);
    const rawList = body.items || body.emails;

    // 1. 批量沉淀
    if (Array.isArray(rawList) && rawList.length > 0) {
      const createdItems = [];
      const messageIds = [];

      for (let idx = 0; idx < rawList.length; idx++) {
        const itm = rawList[idx];
        if (!itm || typeof itm !== 'object') continue;

        const title = String(itm.title || itm.subject || '').trim() || '未命名条目';
        const rawContent = String(
          itm.rawContent || itm.body || itm.snippet || title
        ).trim();
        const sourceType = normalizeSourceType(itm.sourceType || body.sourceType || 'email');
        const sourceSender = String(itm.sourceSender || itm.from || '').trim() || undefined;
        const sourceRefId = String(itm.sourceRefId || itm.id || '').trim() || undefined;

        try {
          const created = await this.inboxService.ingest(userId, {
            title,
            rawContent,
            sourceType,
            sourceSender,
            sourceRefId,
          });

          createdItems.push(created);
          if (sourceRefId) {
            messageIds.push(sourceRefId);
          }
        } catch (err: any) {
          this.logger.error(`Failed to ingest item for userId=${userId}: ${err.message}`, err.stack);
        }
      }

      this.logger.log(`Successfully ingested ${createdItems.length} items for userId=${userId}`);
      return {
        success: true,
        items: createdItems,
        messageIds,
        count: createdItems.length,
      };
    }

    // 2. 单条条目沉淀
    if (body.title || body.rawContent) {
      const title = String(body.title || '单条待办记录').trim();
      const rawContent = String(body.rawContent || title).trim();
      const sourceType = normalizeSourceType(body.sourceType);
      const sourceSender = body.sourceSender?.trim() || undefined;
      const sourceRefId = body.sourceRefId?.trim() || undefined;

      const created = await this.inboxService.ingest(userId, {
        title,
        rawContent,
        sourceType,
        sourceSender,
        sourceRefId,
      });

      return {
        success: true,
        item: created,
        items: [created],
        messageIds: sourceRefId ? [sourceRefId] : [created.id],
        count: 1,
      };
    }

    // 3. 空条目安全返回
    return {
      success: true,
      items: [],
      messageIds: [],
      count: 0,
      message: '无待沉淀条目',
    };
  }
}
