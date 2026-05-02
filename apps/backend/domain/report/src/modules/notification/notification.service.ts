import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import {
  ReportSection,
  ValidationResult,
  NotificationResult,
  NotificationType,
} from '../../interfaces';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  async sendNotifications(
    sections: ReportSection[],
    validationResults: ValidationResult[],
    sessionId: string,
  ): Promise<NotificationResult[]> {
    this.logger.log(`Processing notifications for session ${sessionId}`);

    const results: NotificationResult[] = [];

    // Find sections that failed validation and need notification
    for (const section of sections) {
      if (!section.validation || section.validation.on_fail !== 'notify') {
        continue;
      }

      const validationResult = validationResults.find(v => v.section_id === section.id);
      if (!validationResult || validationResult.passed) {
        continue;
      }

      // Send notification
      const notificationResult = await this.sendNotification(section, validationResult, sessionId);
      results.push(notificationResult);
    }

    return results;
  }

  private async sendNotification(
    section: ReportSection,
    validationResult: ValidationResult,
    sessionId: string,
  ): Promise<NotificationResult> {
    const notifyConfig = section.validation?.notify_config;

    if (!notifyConfig) {
      return {
        section_id: section.id,
        sent: false,
        type: 'webhook',
        error: 'No notification configuration',
      };
    }

    try {
      const message = this.buildMessage(section, validationResult, sessionId, notifyConfig);

      if (notifyConfig.type === 'webhook' && notifyConfig.webhook_url) {
        await this.sendWebhook(notifyConfig.webhook_url, message);
        return {
          section_id: section.id,
          sent: true,
          type: 'webhook',
          recipients: [notifyConfig.webhook_url],
        };
      }

      if (notifyConfig.type === 'email' && notifyConfig.recipients?.length) {
        await this.sendEmail(notifyConfig.recipients, message);
        return {
          section_id: section.id,
          sent: true,
          type: 'email',
          recipients: notifyConfig.recipients,
        };
      }

      return {
        section_id: section.id,
        sent: false,
        type: notifyConfig.type,
        error: 'Missing recipients or webhook URL',
      };
    } catch (error) {
      this.logger.error(`Failed to send notification for section ${section.id}: ${error}`);
      return {
        section_id: section.id,
        sent: false,
        type: notifyConfig.type,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private buildMessage(
    section: ReportSection,
    validationResult: ValidationResult,
    sessionId: string,
    notifyConfig: { message_template?: string },
  ): string {
    const template = notifyConfig.message_template ||
      `Report validation failed for section "{{section_name}}" in session {{session_id}}.\nCondition: {{condition}}\nMessage: {{message}}`;

    return template
      .replace('{{section_name}}', section.name)
      .replace('{{session_id}}', sessionId)
      .replace('{{condition}}', validationResult.condition || 'Unknown')
      .replace('{{message}}', validationResult.message || 'No details');
  }

  private async sendWebhook(url: string, message: string): Promise<void> {
    this.logger.debug(`Sending webhook to ${url}`);

    await axios.post(url, {
      event: 'report_validation_failed',
      timestamp: new Date().toISOString(),
      message,
    }, {
      timeout: 10000,
    });
  }

  private async sendEmail(recipients: string[], message: string): Promise<void> {
    this.logger.debug(`Sending email to ${recipients.join(', ')}`);

    // For now, just log the email (would need SMTP configuration for real emails)
    this.logger.log(`Email notification:\nTo: ${recipients.join(', ')}\nMessage: ${message}`);

    // In production, this would use an email service like nodemailer or external API
  }
}