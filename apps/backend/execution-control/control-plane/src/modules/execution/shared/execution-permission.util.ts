import { NotFoundException } from '@nestjs/common';

export interface ExecutionPermissionRequester {
  id?: string | null;
  role?: string | null;
}

export function ensureExecutionPermission(
  executionOwnerId: string,
  requester?: ExecutionPermissionRequester
): void {
  if (!requester?.id) {
    return;
  }
  if (requester.role === 'admin') {
    return;
  }
  if (requester.id !== executionOwnerId) {
    throw new NotFoundException('Execution not found');
  }
}
