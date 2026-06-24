import { buildExecutionServiceDependencies } from './execution-service-dependency-factory';
import { matchExecutionServiceDependencies } from './execution-service-dependency-matcher';
import {
  ResolvedExecutionServiceDependencies,
  ResolveExecutionServiceDependenciesInput,
} from './execution-service-dependency-types';

export type {
  MatchedExecutionServiceDependencies,
  ResolvedExecutionServiceDependencies,
  ResolveExecutionServiceDependenciesInput,
} from './execution-service-dependency-types';

export function resolveExecutionServiceDependencies(
  input: ResolveExecutionServiceDependenciesInput
): ResolvedExecutionServiceDependencies {
  return buildExecutionServiceDependencies(input, matchExecutionServiceDependencies(input));
}
