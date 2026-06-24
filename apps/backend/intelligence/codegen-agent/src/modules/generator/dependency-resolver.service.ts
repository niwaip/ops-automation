import { Injectable } from '@nestjs/common';

export type DependencyCandidate = {
  name: string;
  reason: string;
};

@Injectable()
export class DependencyResolverService {
  resolve(candidates: DependencyCandidate[]): string[] {
    return [...new Set(candidates.map((item) => item.name.trim()).filter(Boolean))].sort();
  }
}
