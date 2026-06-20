jest.mock(
  '@nestjs/common',
  () => ({
    Injectable: () => () => undefined,
    Logger: class {
      log() {}
      warn() {}
      error() {}
      debug() {}
    },
  }),
  { virtual: true }
);

import { BrowserCandidateContextFormatter } from './browser-candidate-context.formatter';
import { BrowserPlannerPromptBuilder } from './browser-planner-prompt.builder';
import { BrowserPlannerResponseParser } from './browser-planner-response.parser';

describe('Browser planner components', () => {
  it('builds hierarchical candidate context for planner prompts', () => {
    const formatter = new BrowserCandidateContextFormatter();
    const promptBuilder = new BrowserPlannerPromptBuilder(formatter);

    const prompt = promptBuilder.buildPlanPrompt(
      '点击第一条记录的详情',
      {
        currentPageUrl: 'http://localhost/#approvals',
        lastFailureContext: {
          lastAction: { action: 'click', params: { text: '登录' } },
          errorMessage: 'Text click failed to find element: 登录',
          errorType: 'element_not_found',
          retryable: true,
        },
        availableCandidates: [
          {
            candidateId: 'action_24',
            kind: 'action',
            label: '保留中',
            summary:
              'candidateId=action_24 | kind=action | ref=e82 | role=button | label=保留中 | text=保留中',
            source: 'probe',
            ref: 'e82',
            role: 'button',
            text: '保留中',
            preferredLocator: { type: 'ref', value: 'e82' },
          },
          {
            candidateId: 'action_35',
            kind: 'action',
            label: '詳細',
            summary:
              'candidateId=action_35 | kind=action | role=button | row=1 | rowKey=PRJ-2026-001 | action=detail | label=詳細',
            source: 'row',
            role: 'button',
            text: '詳細',
            action: 'detail',
            row: {
              index: 1,
              key: 'PRJ-2026-001',
              text: 'PRJ-2026-001 保留中 詳細',
            },
          },
        ],
      },
      '- approvals -> http://localhost/#approvals'
    );

    expect(prompt).toContain('Visible Page Candidates');
    expect(prompt).toContain('Primary Actions:');
    expect(prompt).toContain('[action_24] button "保留中" (ref=e82)');
    expect(prompt).toContain('Rows:');
    expect(prompt).toContain('Row 1 (PRJ-2026-001)');
    expect(prompt).toContain('[action_35] button "詳細"');
    expect(prompt).toContain('Structured Candidate Hints:');
    expect(prompt).toContain('### Failure Context');
    expect(prompt).toContain('Text click failed to find element: 登录');
  });

  it('parses planner responses while ignoring analysis field', () => {
    const parser = new BrowserPlannerResponseParser();

    expect(
      parser.parseCommandResponse(
        JSON.stringify({
          analysis: '当前页面已经提供了 ref 候选，应优先使用 candidateId',
          commands: [
            {
              tool: 'click',
              params: { candidateId: 'action_1' },
              description: '点击登录',
            },
          ],
          explanation: '点击登录',
        })
      )
    ).toEqual({
      commands: [
        {
          tool: 'click',
          params: { candidateId: 'action_1' },
          description: '点击登录',
        },
      ],
      explanation: '点击登录',
    });

    expect(
      parser.parsePlanResponse(
        JSON.stringify({
          analysis: '需要先打开站点，再进行登录',
          steps: [
            {
              action: 'navigate',
              params: { url: 'https://example.com' },
              description: '打开示例站点',
            },
          ],
          explanation: '先打开示例站点',
        })
      )
    ).toEqual({
      steps: [
        {
          action: 'navigate',
          params: { url: 'https://example.com' },
          description: '打开示例站点',
        },
      ],
      explanation: '先打开示例站点',
    });
  });
});
