jest.mock('@nestjs/common', () => ({ Injectable: () => () => undefined }), {
  virtual: true,
});

import { RecorderDurableLocatorResolver } from './recorder-durable-locator-resolver.service';
import type { BrowserCommand } from '../intent';

describe('RecorderDurableLocatorResolver', () => {
  const resolver = new RecorderDurableLocatorResolver();

  describe('resolve', () => {
    it('prefers cli snapshot content over grounding chosenTarget when both conflict for the same ref', () => {
      // Regression for the live session: grounding chosenTarget pointed e28
      // at the "用户：" cell, while the cli snapshot line showed
      // `- button "登录" [ref=e28]`. The cli snapshot must win.
      const command: BrowserCommand = {
        tool: 'click',
        params: { target: 'e28' },
        locator: { strategy: 'ref', value: 'e28', generatedBy: 'system' },
        description: '点击登录',
      };
      const context = {
        history: [
          {
            execution: {
              results: [
                {
                  data: {
                    content:
                      '- textbox "ユーザー名" [ref=e12]\n- textbox "パスワード" [ref=e15]\n- button "登录" [ref=e28] [cursor=pointer]',
                  },
                },
              ],
            },
          },
        ],
      };
      const groundingTarget = { ref: 'e28', role: 'cell', name: '用户：' };

      const resolved = resolver.resolve(command, context, groundingTarget);

      expect(resolved).toEqual(
        expect.objectContaining({
          strategy: 'role',
          role: 'button',
          name: '登录',
          value: 'button[name="登录"]',
          resolvedFrom: 'cli-snapshot',
          ref: 'e28',
        })
      );
    });

    it('falls back to grounding chosenTarget when cli snapshot has no matching line but the target is consistent with command intent', () => {
      const command: BrowserCommand = {
        tool: 'click',
        params: { target: 'e9' },
        locator: { strategy: 'ref', value: 'e9', generatedBy: 'system' },
        description: '点击提交按钮',
      };
      const context = { history: [{ execution: { results: [{ data: { content: 'empty' } }] } }] };
      const groundingTarget = { ref: 'e9', role: 'button', name: '提交' };

      const resolved = resolver.resolve(command, context, groundingTarget);

      expect(resolved).toEqual(
        expect.objectContaining({
          strategy: 'role',
          role: 'button',
          name: '提交',
          resolvedFrom: 'grounding-chosen-target',
          ref: 'e9',
        })
      );
    });

    it('rejects grounding chosenTarget when command intent signals a different label', () => {
      // Grounding collisions caused the live regression: chosenTarget said
      // role=cell name="用户：" while description said "点击登录". The
      // resolver must downgrade to description-heuristic over the wrong
      // chosenTarget so the export can still produce a working locator.
      const command: BrowserCommand = {
        tool: 'click',
        params: { target: 'e28' },
        locator: { strategy: 'ref', value: 'e28' },
        description: '点击登录按钮',
      };
      const context = { history: [] };
      const groundingTarget = { ref: 'e28', role: 'cell', name: '用户：' };

      const resolved = resolver.resolve(command, context, groundingTarget);

      expect(resolved).toEqual(
        expect.objectContaining({
          strategy: 'role',
          role: 'button',
          name: '登录',
          resolvedFrom: 'description-heuristic',
        })
      );
    });

    it('returns undefined when no durable signal is available, so exporters can fail-fast', () => {
      const command: BrowserCommand = {
        tool: 'fill',
        params: { value: 'v' },
        locator: { strategy: 'ref', value: 'e99' },
        description: '',
      };
      const context = { history: [] };

      const resolved = resolver.resolve(command, context, undefined);
      expect(resolved).toBeUndefined();
    });

    it('returns undefined when command has no ephemeral ref at all', () => {
      const command: BrowserCommand = {
        tool: 'navigate',
        params: { url: 'http://example.com' },
        locator: { strategy: 'css', value: '#userName' },
        description: 'fill username',
      };
      const resolved = resolver.resolve(command, { history: [] }, undefined);
      expect(resolved).toBeUndefined();
    });

    it('returns undefined when command already has a durable locator, preserving the original', () => {
      const command: BrowserCommand = {
        tool: 'fill',
        params: { target: 'e20', value: 'S22014' },
        locator: { strategy: 'css', value: '#userName', expression: "locator('#userName')" },
        description: '填写用户名',
      };
      const context = {
        history: [{
          execution: { results: [{ data: { content: '- textbox "用户名" [ref=e20]' } }] }
        }]
      };
      const resolved = resolver.resolve(command, context, undefined);
      expect(resolved).toBeUndefined();
    });

    it('resolves fill command from description heuristic when cli snapshot and grounding are unavailable', () => {
      const command: BrowserCommand = {
        tool: 'fill',
        params: { value: 'abcd1234', target: 'e24', selector: '密码' },
        locator: { strategy: 'ref', value: 'e24', generatedBy: 'system' },
        description: '填写密码',
      };
      const context = { history: [] };

      const resolved = resolver.resolve(command, context, undefined);

      expect(resolved).toEqual(
        expect.objectContaining({
          strategy: 'label',
          value: '密码',
          resolvedFrom: 'description-heuristic',
          ref: 'e24',
        })
      );
    });
  });
});