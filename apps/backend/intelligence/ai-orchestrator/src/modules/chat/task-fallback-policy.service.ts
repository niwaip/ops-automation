import { Injectable } from '@nestjs/common';

@Injectable()
export class TaskFallbackPolicyService {
  isImplicitReactFallbackEnabled(): boolean {
    return process.env.PRODUCTION_REACT_FALLBACK_ENABLED === 'true';
  }
}
