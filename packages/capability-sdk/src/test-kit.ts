import Ajv, { type AnySchema } from 'ajv';
import addFormats from 'ajv-formats';
import type { CapabilityPackManifest, ManifestValidationResult } from './manifest';
import { validateCapabilityPackManifest } from './manifest';

export interface ContractFixture {
  name: string;
  input: unknown;
  output?: unknown;
  expectInputValid?: boolean;
  expectOutputValid?: boolean;
}

export interface FixtureFailure {
  fixture: string;
  phase: 'input' | 'output';
  errors: string[];
}

export function runCapabilityFixtures(
  manifest: CapabilityPackManifest,
  fixtures: ContractFixture[]
): { manifest: ManifestValidationResult; failures: FixtureFailure[] } {
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  const inputValidator = ajv.compile(manifest.contract.contracts.input.schema as AnySchema);
  const outputValidator = ajv.compile(manifest.contract.contracts.output.schema as AnySchema);
  const failures: FixtureFailure[] = [];
  for (const fixture of fixtures) {
    verify('input', fixture.input, fixture.expectInputValid ?? true, inputValidator);
    if (fixture.output !== undefined) {
      verify('output', fixture.output, fixture.expectOutputValid ?? true, outputValidator);
    }
    function verify(
      phase: 'input' | 'output',
      value: unknown,
      expected: boolean,
      validator: typeof inputValidator
    ) {
      const actual = Boolean(validator(value));
      if (actual !== expected) {
        failures.push({
          fixture: fixture.name,
          phase,
          errors: (validator.errors || []).map((error) => `${error.instancePath} ${error.message}`),
        });
      }
    }
  }
  return { manifest: validateCapabilityPackManifest(manifest), failures };
}
