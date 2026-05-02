import { SetMetadata } from '@nestjs/common';

export const TOOL_SECURITY_KEY = 'tool:security';

export interface SecurityPolicy {
  validatePath?: boolean;
  allowList?: string[];
  blockList?: string[];
  validateCommand?: boolean;
  maxContentLength?: number;
}

/**
 * Decorator to apply security policies to an AI Tool
 */
export const Secure = (policy: SecurityPolicy) => SetMetadata(TOOL_SECURITY_KEY, policy);
