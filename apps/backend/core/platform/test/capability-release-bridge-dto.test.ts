import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { BridgeRecorderExportDTO } from '../src/release-manager';

describe('BridgeRecorderExportDTO', () => {
  it('accepts recorder export arrays under implicit conversion', () => {
    const dto = plainToInstance(
      BridgeRecorderExportDTO,
      {
        exportArtifacts: {
          templateSteps: [{ step_id: 'step_1', action: 'navigate' }],
          loopPlanPreview: [{ id: 'loop_target', type: 'loop_target' }],
          skillDraft: {
            invocation: 'invoke in chat',
            parameters: [{ name: 'username', source: 'template.step_1.params.value' }],
            outputs: [{ name: 'pageState', location: 'browser' }],
            commands: [{ tool: 'navigate', params: { url: 'https://example.com' } }],
            publishPayload: {
              executionFlow: [
                {
                  id: 'step_browser_recording_execute',
                  type: 'tool',
                  tool: { name: 'browser_step' },
                },
              ],
              loopPlanPreview: [{ id: 'loop_policy', type: 'loop_policy' }],
            },
          },
        },
      },
      { enableImplicitConversion: true }
    );

    const errors = validateSync(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    expect(errors).toEqual([]);
  });
});
