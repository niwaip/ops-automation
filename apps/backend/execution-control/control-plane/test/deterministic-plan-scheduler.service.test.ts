import { DeterministicPlanSchedulerService } from '../src/modules/execution/plan-runtime/deterministic-plan-scheduler.service';

describe('DeterministicPlanSchedulerService', () => {
  const createService = () =>
    new DeterministicPlanSchedulerService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    ) as any;

  it.each([
    ['artifact', 'document'],
    ['document', 'document'],
    ['browser_template', 'browser'],
    ['browser', 'browser'],
    ['workflow', 'workflow'],
    ['api', 'api'],
  ])('maps plan runtimeType %s to execution runtimeType %s', (input, expected) => {
    expect(createService().mapPlanRuntimeTypeToExecutionRuntime(input)).toBe(expected);
  });
});
