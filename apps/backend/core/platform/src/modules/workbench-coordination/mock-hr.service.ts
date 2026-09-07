import { Injectable, Logger } from '@nestjs/common';

export interface MockLeaveSyncRequest {
  taskId: string;
  applicantName: string;
  approverName: string;
  leaveType: string;
  startTime: string;
  endTime: string;
  durationHours: number;
  reason: string;
  handoverPerson?: string;
  emergencyContact?: string;
}

export interface MockLeaveSyncResult {
  success: boolean;
  trackingNumber: string;
  externalSystem: string;
  leaveRecordId: string;
  message: string;
  syncTime: string;
  detail: {
    applicant: string;
    approver: string;
    leaveType: string;
    duration: string;
    status: 'RECORDED_AND_DEDUCTED';
  };
}

@Injectable()
export class MockHrService {
  private readonly logger = new Logger(MockHrService.name);

  /**
   * 模拟向企业外部人事系统（如飞书/钉钉/Workday/自研考勤系统）同步已核准的请假数据
   */
  async syncLeaveApproval(data: MockLeaveSyncRequest): Promise<MockLeaveSyncResult> {
    const timestamp = new Date().toISOString();
    const trackingNumber = `HR-LEAVE-${Date.now().toString().slice(-8)}`;
    const leaveRecordId = `REC-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    this.logger.log(
      `[Mock HR System] 正在调用外部人事考勤 API: 申请人=${data.applicantName}, 审批人=${data.approverName}, 类型=${data.leaveType}, 时长=${data.durationHours}h, 事由=${data.reason}`
    );

    // 模拟网络处理延迟与对接成功
    const result: MockLeaveSyncResult = {
      success: true,
      trackingNumber,
      externalSystem: 'Mock Enterprise HRMS v4.2 (考勤集成网关)',
      leaveRecordId,
      message: `员工请假审批单已成功核准并同步至人事考勤中心，扣减年假/调休额度正常。`,
      syncTime: timestamp,
      detail: {
        applicant: data.applicantName,
        approver: data.approverName,
        leaveType: data.leaveType,
        duration: `${data.durationHours} 小时`,
        status: 'RECORDED_AND_DEDUCTED',
      },
    };

    this.logger.log(`[Mock HR System] 同步成功，单据凭证号: ${trackingNumber}`);
    return result;
  }
}
