import type { ChatUploadedFileDTO } from './chat.dto';
import { createBuiltinRoutingPolicySnapshot, hasRoutingSignal } from '../planner/routing/routing-policy.matcher';

export function hasImageAttachment(files?: ChatUploadedFileDTO[]): boolean {
  return Boolean(files?.some((file) =>
    file.mimeType?.toLowerCase().startsWith('image/')
  ));
}

export function shouldRouteImageToNativeModel(input: {
  message: string;
  files?: ChatUploadedFileDTO[];
  webSearch?: boolean;
  externalMutation?: boolean;
}): boolean {
  if (!hasImageAttachment(input.files) || input.webSearch || input.externalMutation) return false;
  const policy = createBuiltinRoutingPolicySnapshot();
  return !(['artifact', 'sequential', 'externalSearch', 'webSource', 'uncoveredAction'] as const).some((signal) =>
    hasRoutingSignal(input.message, signal, policy)
  );
}
