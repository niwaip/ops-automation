import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeChineseSpace,
  normalizeWaitingInputDisplayLabel,
  resolveWaitingInputDisplayLabel,
  buildWaitingInputDisplayGroups,
} from '../../dist/lib/waiting-input-display.js';

describe('waiting-input-display helpers', () => {
  it('normalizes chinese space while preserving english spacing', () => {
    assert.equal(normalizeChineseSpace('保 密 协 议'), '保密协议');
    assert.equal(normalizeChineseSpace('甲 方 公 司 全 称'), '甲方公司全称');
    assert.equal(normalizeChineseSpace('Hello World'), 'Hello World');
    assert.equal(normalizeChineseSpace('API 接口 规范'), 'API 接口规范');
  });

  it('normalizes waiting input display label correctly', () => {
    assert.equal(normalizeWaitingInputDisplayLabel('保 密 协 议 (中文)'), '保密协议');
    assert.equal(normalizeWaitingInputDisplayLabel('附 件 一'), '附件一');
    assert.equal(normalizeWaitingInputDisplayLabel('First Name'), 'First Name');
  });

  it('resolves friendly waiting input display label with space cleanup', () => {
    assert.equal(
      resolveWaitingInputDisplayLabel({
        name: 'contract_title',
        display_name: '保 密 协 议',
      }),
      '保密协议'
    );
    assert.equal(
      resolveWaitingInputDisplayLabel({
        name: 'party_a',
        description: '合同文本中的 甲 方 公 司 全 称 占位符',
      }),
      '甲方公司全称'
    );
    assert.equal(
      resolveWaitingInputDisplayLabel({
        name: 'fileBase64',
      }),
      '待提取的文档附件（请通过下方附件图标上传）'
    );
    assert.equal(
      resolveWaitingInputDisplayLabel({
        name: 'n1.fileBase64',
      }),
      '待提取的文档附件（请通过下方附件图标上传）'
    );
  });

  it('builds waiting input display groups with cleaned group labels', () => {
    const groups = buildWaitingInputDisplayGroups([
      {
        name: 'party_a',
        display_name: '甲 方 全 称',
        group_label: '保 密 协 议',
      },
      {
        name: 'party_b',
        display_name: '乙 方 全 称',
        group_label: '保 密 协 议',
      },
    ]);

    assert.equal(groups.length, 1);
    assert.equal(groups[0]?.label, '保密协议');
    assert.equal(groups[0]?.items.length, 2);
  });
});
