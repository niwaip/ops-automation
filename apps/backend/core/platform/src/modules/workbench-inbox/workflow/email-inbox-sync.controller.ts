import {
  Controller,
  Get,
  Headers,
  Post,
  Query,
  Request,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { EmailInboxSyncService } from "./email-inbox-sync.service";

@ApiTags("Workbench Inbox Email Sync")
@ApiBearerAuth()
@Controller("workbench-inbox/sync-email")
export class EmailInboxSyncController {
  constructor(private readonly syncService: EmailInboxSyncService) {}

  private extractUserId(req: any): string {
    return req.user?.id || req.user?.userId || "anonymous";
  }

  @Post()
  @ApiOperation({ summary: "手动触发邮件同步到 GTD 收件箱并置为已读" })
  async triggerSync(
    @Request() req: any,
    @Headers("authorization") authToken?: string,
    @Query("limit") limit?: string
  ) {
    const userId = this.extractUserId(req);
    const parsedLimit = limit ? parseInt(limit, 10) : undefined;
    return await this.syncService.syncUserUnreadEmails(userId, {
      limit: parsedLimit,
      authToken,
    });
  }

  @Get("status")
  @ApiOperation({ summary: "查询当前用户邮件同步状态与最近同步时间" })
  async getStatus(@Request() req: any) {
    const userId = this.extractUserId(req);
    return await this.syncService.getSyncStatus(userId);
  }
}
