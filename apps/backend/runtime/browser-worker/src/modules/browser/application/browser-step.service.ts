import { Injectable } from '@nestjs/common';
import {
  BrowserExecutionAdapter,
  BrowserExecutionBackend,
  BrowserExecutionOptions,
  MCPCommand,
} from '../adapters/browser-execution.adapter';
import { BrowserActionStep } from '../domain/browser-step.types';
import { BrowserStepMapper } from '../mappers/browser-step.mapper';
import { BrowserParameterizationService } from './browser-parameterization.service';

@Injectable()
export class BrowserStepService {
  constructor(
    private readonly browserStepMapper: BrowserStepMapper,
    private readonly browserParameterizationService: BrowserParameterizationService
  ) {}

  async buildSteps(
    commands: MCPCommand[],
    results: Array<Record<string, unknown>>,
    backend: BrowserExecutionBackend,
    adapter?: BrowserExecutionAdapter,
    options?: BrowserExecutionOptions
  ): Promise<BrowserActionStep[]> {
    const baseSteps = commands.map((command, index) =>
      this.browserStepMapper.toActionStep({
        command,
        result: results[index],
        backend,
        index,
      })
    );

    const locatorEnrichedSteps = !adapter?.generateLocator
      ? baseSteps
      : await Promise.all(
          baseSteps.map(async (step) => {
            if (step.status !== 'success' || !step.runtimeTargetRef) {
              return step;
            }

            try {
              const locatorExpression = await adapter.generateLocator?.(
                step.runtimeTargetRef,
                options
              );
              return this.browserStepMapper.applyGeneratedLocator(step, locatorExpression);
            } catch {
              return step;
            }
          })
        );

    return locatorEnrichedSteps.map((step) =>
      this.browserParameterizationService.parameterizeStep(step)
    );
  }
}
