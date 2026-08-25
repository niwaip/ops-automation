import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  PlanRouteClassifierService,
  PlanRouteType,
} from '../../src/modules/planner/routing/plan-route-classifier.service';

type TargetPlanningClass =
  | 'saved_workflow'
  | 'single_capability'
  | 'recipe_plan'
  | 'generated_plan'
  | 'exploratory'
  | 'no_match';

interface RoutingGoldenCase {
  id: string;
  locale: 'zh-CN' | 'en-US';
  request: string;
  hasPreviousResult: boolean;
  expectedLegacyRoute: PlanRouteType;
  expectedTargetClass: TargetPlanningClass;
  notes: string;
}

const FIXTURE_FILES = [
  'single-capability.jsonl',
  'deterministic-plan.jsonl',
  'saved-workflow.jsonl',
  'no-match.jsonl',
  'adversarial.jsonl',
] as const;

function loadFixture(fileName: string): RoutingGoldenCase[] {
  const fixturePath = join(__dirname, 'fixtures', fileName);
  return readFileSync(fixturePath, 'utf8')
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line) as RoutingGoldenCase;
      } catch (error) {
        throw new Error(
          `Invalid JSONL in ${fileName}:${index + 1}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    });
}

const cases = FIXTURE_FILES.flatMap(loadFixture);

describe('task routing golden dataset', () => {
  const classifier = new PlanRouteClassifierService();

  it('keeps fixture ids unique and required evidence complete', () => {
    expect(cases.length).toBeGreaterThanOrEqual(24);
    expect(new Set(cases.map((item) => item.id)).size).toBe(cases.length);

    for (const item of cases) {
      expect(item.request.trim()).not.toBe('');
      expect(item.notes.trim()).not.toBe('');
      expect(['single_skill', 'deterministic_plan']).toContain(item.expectedLegacyRoute);
      expect([
        'saved_workflow',
        'single_capability',
        'recipe_plan',
        'generated_plan',
        'exploratory',
        'no_match',
      ]).toContain(item.expectedTargetClass);
    }
  });

  it.each(cases)('$id preserves the recorded legacy route', (item) => {
    expect(
      classifier.classifyRoute(item.request, {
        hasPreviousResult: item.hasPreviousResult,
      })
    ).toBe(item.expectedLegacyRoute);
  });
});
