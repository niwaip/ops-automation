import { ExecutionFlowRunnerService } from '../src/modules/execution/execution-flow-runner.service';

describe('ExecutionFlowRunnerService', () => {
  const createService = () => {
    const prisma = {
      execution: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };
    const executionStepService = {
      findNextPendingStep: jest.fn(),
      setCurrentStep: jest.fn(),
      startStep: jest.fn(),
      finishControlStep: jest.fn(),
      listByExecutionId: jest.fn(),
      insertPlannedStepsAfterStep: jest.fn(),
    };
    const service = new ExecutionFlowRunnerService(prisma as never, executionStepService as never);
    return { service, prisma, executionStepService };
  };

  const hooks = () => ({
    completeActivePhasesOnExecutionSuccess: jest.fn(),
    updateStatus: jest.fn(),
    closeRuntimeSessionQuietly: jest.fn(),
    extractStepUrl: jest.fn(),
    skipSingleStep: jest.fn(),
    executeBrowserGotoStep: jest.fn(),
    enterWaitingInput: jest.fn(),
    executeBrowserPhaseStep: jest.fn(),
    executeSystemSkillStep: jest.fn(),
    readBrowserTextBySelector: jest.fn(),
  });

  it('inserts the next iteration after loop_eval_after_iteration when stop condition is not met', async () => {
    const { service, prisma, executionStepService } = createService();
    const runnerHooks = hooks();

    prisma.execution.findUnique
      .mockResolvedValueOnce({
        id: 'execution-1',
        status: 'running',
        normalizedInputJson: {
          loopWorkflow: {
            loopId: 'loop-1',
            maxIterations: 5,
            stopWhen: {
              conditionFn: 'value === "无待审批"',
            },
          },
          loopWorkflowState: {
            loopId: 'loop-1',
            currentIteration: 1,
            maxIterations: 5,
            status: 'running',
          },
        },
      })
      .mockResolvedValueOnce({
        id: 'execution-1',
        status: 'running',
        normalizedInputJson: {
          loopWorkflow: {
            loopId: 'loop-1',
            maxIterations: 5,
          },
        },
      });

    executionStepService.findNextPendingStep
      .mockResolvedValueOnce({
        id: 'step-loop-eval-1',
        type: 'loop_control',
        action: 'loop_eval_after_iteration',
        targetJson: {
          loopControlAction: 'loop_eval_after_iteration',
          loopId: 'loop-1',
          loopStopCondition: {
            conditionFn: 'value === "无待审批"',
          },
        },
        inputJson: {},
      })
      .mockResolvedValueOnce({
        id: 'step-loop-iter-2',
        type: 'system',
        action: 'execute_browser_phase',
      });

    executionStepService.listByExecutionId.mockResolvedValue([
      {
        id: 'template-step-1',
        stepIndex: 2,
        name: '点击审批',
        type: 'system',
        action: 'execute_browser_phase',
        targetJson: {
          loopId: 'loop-1',
          loopSegment: 'iteration',
          loopIteration: 1,
          loopTemplate: true,
          commands: [{ action: 'click' }],
        },
        inputJson: {
          loopId: 'loop-1',
          loopSegment: 'iteration',
          loopIteration: 1,
          loopTemplate: true,
        },
        outputJson: {
          data: {
            text: '还有待审批',
          },
        },
      },
      {
        id: 'template-step-2',
        stepIndex: 3,
        name: '读取状态',
        type: 'system',
        action: 'execute_browser_phase',
        targetJson: {
          loopId: 'loop-1',
          loopSegment: 'iteration',
          loopIteration: 1,
          loopTemplate: true,
          commands: [{ action: 'read_page' }],
        },
        inputJson: {
          loopId: 'loop-1',
          loopSegment: 'iteration',
          loopIteration: 1,
          loopTemplate: true,
        },
        outputJson: {
          data: {
            text: '还有待审批',
          },
        },
      },
    ]);

    await service.advanceExecutionFlow('execution-1', 'runtime-1', runnerHooks);

    expect(executionStepService.insertPlannedStepsAfterStep).toHaveBeenCalledWith(
      expect.objectContaining({
        executionId: 'execution-1',
        afterStepId: 'step-loop-eval-1',
        steps: expect.arrayContaining([
          expect.objectContaining({
            name: '点击审批',
            targetJson: expect.objectContaining({
              loopIteration: 2,
              loopTemplate: false,
            }),
          }),
          expect.objectContaining({
            action: 'loop_eval_after_iteration',
            targetJson: expect.objectContaining({
              loopIteration: 2,
            }),
          }),
        ]),
      })
    );
    expect(prisma.execution.update).toHaveBeenCalledWith({
      where: { id: 'execution-1' },
      data: {
        normalizedInputJson: expect.objectContaining({
          loopWorkflowState: expect.objectContaining({
            loopId: 'loop-1',
            currentIteration: 2,
            lastDecision: 'continue',
          }),
        }),
      },
    });
    expect(runnerHooks.executeBrowserPhaseStep).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'execution-1' }),
      'runtime-1',
      'step-loop-iter-2'
    );
  });

  it('continues to post loop steps when the stop condition is met', async () => {
    const { service, prisma, executionStepService } = createService();
    const runnerHooks = hooks();

    prisma.execution.findUnique
      .mockResolvedValueOnce({
        id: 'execution-2',
        status: 'running',
        normalizedInputJson: {
          loopWorkflow: {
            loopId: 'loop-1',
            maxIterations: 5,
            stopWhen: {
              conditionFn: 'value === "无待审批"',
            },
          },
          loopWorkflowState: {
            loopId: 'loop-1',
            currentIteration: 1,
            maxIterations: 5,
            status: 'running',
          },
        },
      })
      .mockResolvedValueOnce({
        id: 'execution-2',
        status: 'running',
        normalizedInputJson: {
          loopWorkflow: {
            loopId: 'loop-1',
            maxIterations: 5,
          },
        },
      });

    executionStepService.findNextPendingStep
      .mockResolvedValueOnce({
        id: 'step-loop-eval-1',
        type: 'loop_control',
        action: 'loop_eval_after_iteration',
        targetJson: {
          loopControlAction: 'loop_eval_after_iteration',
          loopId: 'loop-1',
          loopStopCondition: {
            conditionFn: 'value === "无待审批"',
          },
        },
        inputJson: {},
      })
      .mockResolvedValueOnce({
        id: 'step-post-loop-1',
        type: 'system',
        action: 'execute_browser_phase',
      });

    executionStepService.listByExecutionId.mockResolvedValue([
      {
        id: 'template-step-1',
        stepIndex: 2,
        name: '读取状态',
        type: 'system',
        action: 'execute_browser_phase',
        targetJson: {
          loopId: 'loop-1',
          loopSegment: 'iteration',
          loopIteration: 1,
          loopTemplate: true,
        },
        inputJson: {},
        outputJson: {
          data: {
            text: '无待审批',
          },
        },
      },
    ]);

    await service.advanceExecutionFlow('execution-2', 'runtime-1', runnerHooks);

    expect(executionStepService.insertPlannedStepsAfterStep).not.toHaveBeenCalled();
    expect(prisma.execution.update).toHaveBeenCalledWith({
      where: { id: 'execution-2' },
      data: {
        normalizedInputJson: expect.objectContaining({
          loopWorkflowState: expect.objectContaining({
            loopId: 'loop-1',
            currentIteration: 1,
            lastDecision: 'stop',
            status: 'completed',
          }),
        }),
      },
    });
    expect(runnerHooks.executeBrowserPhaseStep).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'execution-2' }),
      'runtime-1',
      'step-post-loop-1'
    );
  });

  it('stops the loop when the runtime locator read satisfies the generated String(value) stop expression', async () => {
    const { service, prisma, executionStepService } = createService();
    const runnerHooks = hooks();
    runnerHooks.readBrowserTextBySelector.mockResolvedValue('');

    prisma.execution.findUnique
      .mockResolvedValueOnce({
        id: 'execution-3',
        status: 'running',
        normalizedInputJson: {
          loopWorkflow: {
            loopId: 'loop-1',
            maxIterations: 5,
            stopWhen: {
              read: {
                type: 'text',
                locator: {
                  type: 'css',
                  value: 'tr:has([data-ai-action="detail"]):has-text("保留中")',
                },
              },
              conditionFn: '!String(value || "").includes("保留中")',
            },
          },
          loopWorkflowState: {
            loopId: 'loop-1',
            currentIteration: 3,
            maxIterations: 5,
            status: 'running',
          },
        },
      })
      .mockResolvedValueOnce({
        id: 'execution-3',
        status: 'running',
        normalizedInputJson: {
          loopWorkflow: {
            loopId: 'loop-1',
            maxIterations: 5,
          },
        },
      });

    executionStepService.findNextPendingStep
      .mockResolvedValueOnce({
        id: 'step-loop-eval-3',
        type: 'loop_control',
        action: 'loop_eval_after_iteration',
        targetJson: {
          loopControlAction: 'loop_eval_after_iteration',
          loopId: 'loop-1',
          loopStopCondition: {
            read: {
              type: 'text',
              locator: {
                type: 'css',
                value: 'tr:has([data-ai-action="detail"]):has-text("保留中")',
              },
            },
            conditionFn: '!String(value || "").includes("保留中")',
          },
        },
        inputJson: {},
      })
      .mockResolvedValueOnce({
        id: 'step-post-loop-3',
        type: 'system',
        action: 'execute_browser_phase',
      });

    executionStepService.listByExecutionId.mockResolvedValue([
      {
        id: 'iteration-step-1',
        stepIndex: 20,
        name: '读取粗利率',
        type: 'system',
        action: 'execute_browser_phase',
        targetJson: {
          loopId: 'loop-1',
          loopSegment: 'iteration',
          loopIteration: 3,
          loopTemplate: false,
        },
        inputJson: {},
        outputJson: {
          data: {
            text: '12.0%',
          },
        },
      },
    ]);

    await service.advanceExecutionFlow('execution-3', 'runtime-1', runnerHooks);

    expect(runnerHooks.readBrowserTextBySelector).toHaveBeenCalledWith(
      'runtime-1',
      'tr:has([data-ai-action="detail"]):has-text("保留中")'
    );
    expect(executionStepService.insertPlannedStepsAfterStep).not.toHaveBeenCalled();
    expect(prisma.execution.update).toHaveBeenCalledWith({
      where: { id: 'execution-3' },
      data: {
        normalizedInputJson: expect.objectContaining({
          loopWorkflowState: expect.objectContaining({
            loopId: 'loop-1',
            currentIteration: 3,
            lastDecision: 'stop',
            status: 'completed',
          }),
        }),
      },
    });
    expect(runnerHooks.executeBrowserPhaseStep).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'execution-3' }),
      'runtime-1',
      'step-post-loop-3'
    );
  });
});
