import { Injectable } from '@nestjs/common';
import type { SecurityLintIssue, SecurityLintResult } from '../../contracts/codegen-agent.types';

@Injectable()
export class SecurityLintService {
  summarize(issues: SecurityLintIssue[]): SecurityLintResult {
    const blocking = issues.some((issue) => issue.blocking);
    return {
      status: blocking ? 'failed' : issues.length > 0 ? 'needs_review' : 'passed',
      issues,
      summary: blocking
        ? 'Blocking security issues found'
        : issues.length > 0
          ? 'Manual review suggested'
          : 'No security issues found',
    };
  }
}
