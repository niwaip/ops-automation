import { SetMetadata } from '@nestjs/common';
import { ToolDefinition } from '../interfaces';

export const TOOL_METADATA_KEY = 'tool:metadata';

export interface ToolOptions {
  name: string;
  description: string;
  parameters: ToolDefinition['parameters'];
  category?: ToolDefinition['category'];
  requiresConfirmation?: boolean;
  requiredRoles?: string[];
  isDefault?: boolean;
}

/**
 * Decorator to mark a class as an AI Tool
 */
export const Tool = (options: ToolOptions) => SetMetadata(TOOL_METADATA_KEY, options);
