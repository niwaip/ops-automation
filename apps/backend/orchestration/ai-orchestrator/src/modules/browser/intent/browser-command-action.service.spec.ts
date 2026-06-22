import { BrowserCommandActionService } from './browser-command-action.service';
import { buildPendingClickIntent } from './action-intent.builder';
import { buildClickCommandFromResolvedTarget } from './click-command.factory';
import { resolveActionIntentToLocator } from './action-target-resolver.service';

describe('BrowserCommandActionService', () => {
  const service = new BrowserCommandActionService();

  const createHelpers = (availableCandidates: any[]) => ({
    getActionCandidates: () => availableCandidates,
    resolvePendingClickIntent: (intent: any, description: string) => {
      const resolvedTarget = resolveActionIntentToLocator(
        buildPendingClickIntent(intent),
        { availableCandidates }
      );
      return resolvedTarget
        ? buildClickCommandFromResolvedTarget({
            intent: buildPendingClickIntent(intent),
            description,
            resolvedTarget,
          })
        : null;
    },
  });

  it('parses default unique approve action from candidates', () => {
    const result = service.parseActionCommandDetailed(
      '点击承认按钮',
      {},
      createHelpers([
        {
          candidateId: 'action_1',
          kind: 'action',
          label: '承認する (Approve)',
          summary:
            'candidateId=action_1 | kind=action | ref=e301 | region=decision-actions | action=approve | stable=approve-project | label=承認する (Approve)',
          source: 'region',
          ref: 'e301',
          action: 'approve',
          stableName: 'approve-project',
          region: { name: 'decision-actions' },
          preferredLocator: { type: 'ref', value: 'e301' },
        },
        {
          candidateId: 'action_2',
          kind: 'action',
          label: '却下する (Reject)',
          summary:
            'candidateId=action_2 | kind=action | ref=e302 | region=decision-actions | action=reject | stable=reject-project | label=却下する (Reject)',
          source: 'region',
          ref: 'e302',
          action: 'reject',
          stableName: 'reject-project',
          region: { name: 'decision-actions' },
          preferredLocator: { type: 'ref', value: 'e302' },
        },
      ])
    );

    expect(result).toEqual({
      status: 'success',
      response: {
        success: true,
        commands: [
          {
            tool: 'click',
            params: {
              target: 'e301',
            },
            description: '点击承认按钮',
            locator: {
              strategy: 'ref',
              value: 'e301',
              generatedBy: 'candidate-first',
              confidence: 0.98,
              matchedCandidateId: 'action_1',
              resolutionMode: 'preferred-locator',
            },
          },
        ],
        explanation: '将点击承认按钮',
        parserMetadata: {
          action: {
            status: 'success',
            reason: 'action-default-candidate',
            resolvedTarget: '承认按钮',
            resolvedActionTerm: 'approve',
            semanticHint: 'confirm',
            resolvedRegion: undefined,
            resolvedRoleHint: undefined,
            rowIndex: undefined,
            categoryHint: 'ROW_ACTION',
            usedRuntimeProfile: false,
            matchedRuntimeRuleIds: [],
          },
        },
      },
    });
  });

  it('parses runtime action profile with region and role hints', () => {
    const result = service.parseActionCommandDetailed(
      '点击承认按钮',
      {},
      createHelpers([
        {
          candidateId: 'action_1',
          kind: 'action',
          label: '承認する (Approve)',
          summary:
            'candidateId=action_1 | kind=action | ref=e301 | region=decision-actions | action=approve | stable=approve-project | label=承認する (Approve)',
          source: 'region',
          ref: 'e301',
          action: 'approve',
          stableName: 'approve-project',
          role: 'button',
          region: { name: 'decision-actions' },
          preferredLocator: { type: 'ref', value: 'e301' },
        },
      ]),
      {
        runtimeRules: [
          {
            id: 'action-runtime-approve',
            category: 'ROW_ACTION',
            outputs: {
              profile_type: 'action_target',
              target_terms: ['承认按钮', '审批通过'],
              semantic_hint: 'approve',
              action_terms: ['approve'],
              region_terms: ['decision-actions'],
              role_hints: ['button'],
              category_hint: 'ROW_ACTION',
              intent_terms: ['点击'],
            },
          } as any,
        ],
      }
    );

    expect(result).toEqual({
      status: 'success',
      response: {
        success: true,
        commands: [
          {
            tool: 'click',
            params: {
              target: 'e301',
            },
            description: '点击承认按钮',
            locator: {
              strategy: 'ref',
              value: 'e301',
              generatedBy: 'candidate-first',
              confidence: 0.98,
              matchedCandidateId: 'action_1',
              resolutionMode: 'preferred-locator',
            },
          },
        ],
        explanation: '将点击承认按钮',
        parserMetadata: {
          action: {
            status: 'success',
            reason: 'action-runtime-region',
            resolvedTarget: '承认按钮',
            resolvedActionTerm: 'approve',
            semanticHint: 'confirm',
            resolvedRegion: 'decision-actions',
            resolvedRoleHint: 'button',
            rowIndex: undefined,
            categoryHint: 'ROW_ACTION',
            usedRuntimeProfile: true,
            matchedRuntimeRuleIds: ['action-runtime-approve'],
          },
        },
      },
    });
  });

  it('parses runtime detail-open action profile with row hint', () => {
    const result = service.parseActionCommandDetailed(
      '打开第一条记录的详情',
      {},
      createHelpers([
        {
          candidateId: 'action_31',
          kind: 'action',
          label: '詳細',
          summary:
            'candidateId=action_31 | kind=action | role=button | region=approval-list | row=1 | rowKey=PRJ-2026-001 | action=detail | stable=open-project-detail | label=詳細',
          source: 'row',
          role: 'button',
          text: '詳細',
          action: 'detail',
          stableName: 'open-project-detail',
          row: { index: 1, key: 'PRJ-2026-001' },
          region: { name: 'approval-list' },
          preferredLocator: {
            type: 'css',
            value:
              ':nth-match([data-ai-region="approval-list"] [data-ai-stable-name="open-project-detail"], 1)',
          },
        },
      ]),
      {
        runtimeRules: [
          {
            id: 'action-runtime-detail',
            category: 'DETAIL_OPEN',
            outputs: {
              profile_type: 'action_target',
              target_terms: ['详情', '详细页面'],
              semantic_hint: 'detail',
              action_terms: ['详情'],
              category_hint: 'DETAIL_OPEN',
              intent_terms: ['打开'],
            },
          } as any,
        ],
      }
    );

    expect(result).toEqual({
      status: 'success',
      response: {
        success: true,
        commands: [
          {
            tool: 'click',
            params: {
              target:
                ':nth-match([data-ai-region="approval-list"] [data-ai-stable-name="open-project-detail"], 1)',
            },
            description: '打开第一条记录的详情',
            locator: {
              strategy: 'css',
              value:
                ':nth-match([data-ai-region="approval-list"] [data-ai-stable-name="open-project-detail"], 1)',
              generatedBy: 'candidate-first',
              confidence: 0.98,
              matchedCandidateId: 'action_31',
              resolutionMode: 'preferred-locator',
            },
          },
        ],
        explanation: '将打开第一条记录的详情',
        parserMetadata: {
          action: {
            status: 'success',
            reason: 'action-runtime-row',
            resolvedTarget: '详情',
            resolvedActionTerm: '详情',
            semanticHint: 'open',
            resolvedRegion: undefined,
            resolvedRoleHint: undefined,
            rowIndex: 1,
            categoryHint: 'DETAIL_OPEN',
            usedRuntimeProfile: true,
            matchedRuntimeRuleIds: ['action-runtime-detail'],
          },
        },
      },
    });
  });

  it('parses runtime menu-selection action profile', () => {
    const result = service.parseActionCommandDetailed(
      '选择更多菜单',
      {},
      createHelpers([
        {
          candidateId: 'action_menu_1',
          kind: 'action',
          label: '更多',
          summary:
            'candidateId=action_menu_1 | kind=action | ref=e901 | role=button | region=toolbar-actions | action=menu | label=更多',
          source: 'region',
          ref: 'e901',
          role: 'button',
          action: 'menu',
          region: { name: 'toolbar-actions' },
          preferredLocator: { type: 'ref', value: 'e901' },
        },
      ]),
      {
        runtimeRules: [
          {
            id: 'action-runtime-menu',
            category: 'MENU_SELECTION',
            outputs: {
              profile_type: 'action_target',
              target_terms: ['更多菜单', '操作菜单'],
              semantic_hint: 'menu',
              action_terms: ['menu'],
              role_hints: ['button'],
              category_hint: 'MENU_SELECTION',
              intent_terms: ['选择'],
            },
          } as any,
        ],
      }
    );

    expect(result).toEqual({
      status: 'success',
      response: {
        success: true,
        commands: [
          {
            tool: 'click',
            params: {
              target: 'e901',
            },
            description: '选择更多菜单',
            locator: {
              strategy: 'ref',
              value: 'e901',
              generatedBy: 'candidate-first',
              confidence: 0.98,
              matchedCandidateId: 'action_menu_1',
              resolutionMode: 'preferred-locator',
            },
          },
        ],
        explanation: '将选择更多菜单',
        parserMetadata: {
          action: {
            status: 'success',
            reason: 'action-runtime-target',
            resolvedTarget: '更多菜单',
            resolvedActionTerm: 'menu',
            semanticHint: 'open',
            resolvedRegion: undefined,
            resolvedRoleHint: 'button',
            rowIndex: undefined,
            categoryHint: 'MENU_SELECTION',
            usedRuntimeProfile: true,
            matchedRuntimeRuleIds: ['action-runtime-menu'],
          },
        },
      },
    });
  });
});
