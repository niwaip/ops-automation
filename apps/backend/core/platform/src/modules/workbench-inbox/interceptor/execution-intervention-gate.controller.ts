import {
  Body,
  Controller,
  Headers,
  Post,
  Request,
  UnauthorizedException,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  ExecutionInterventionEvent,
  ExecutionInterventionGateService,
} from "./execution-intervention-gate.service";

@ApiTags("Workbench Inbox Intervention Gate")
@ApiBearerAuth()
@Controller("workbench-inbox/intervention-gate")
export class ExecutionInterventionGateController {
  constructor(private readonly gateService: ExecutionInterventionGateService) {}

  private extractUserId(req: any): string {
    return req.user?.id || req.user?.userId || "anonymous";
  }

  @Post("event")
  @ApiOperation({ summary: "上报执行状态变更并由门禁判定是否转入 GTD 收件箱" })
  async handleExecutionEvent(
    @Request() req: any,
    @Body() body: Partial<ExecutionInterventionEvent>,
    @Headers("x-internal-secret") internalSecretHeader?: string
  ) {
    const expectedSecret =
      process.env.INTERNAL_API_SHARED_SECRET || process.env.INTERNAL_API_SECRET;

    const userId = body.userId || this.extractUserId(req);
    if (!userId || userId === "anonymous") {
      if (expectedSecret && internalSecretHeader === expectedSecret) {
        // 允许内部服务调用
      } else {
        throw new UnauthorizedException("缺少有效的用户鉴权信息");
      }
    }

    if (!body.executionId || !body.status) {
      return { ingested: false, reason: "missing_required_fields" };
    }

    const event: ExecutionInterventionEvent = {
      executionId: body.executionId,
      userId: userId || "system",
      title: body.title,
      status: body.status,
      source: body.source,
      sessionId: body.sessionId,
      failureReason: body.failureReason,
      requiredInputPrompt: body.requiredInputPrompt,
      approvalPrompt: body.approvalPrompt,
      actionUrl: body.actionUrl,
      isUnattended: body.isUnattended,
    };

    return await this.gateService.evaluateAndIngest(event);
  }
}
