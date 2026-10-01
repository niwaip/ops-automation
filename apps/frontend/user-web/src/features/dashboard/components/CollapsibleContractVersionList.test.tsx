import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CollapsibleContractVersionList } from './CollapsibleContractVersionList';
import type { FormattedContractVersion } from '../lib/contractComparisonHelper';

describe('CollapsibleContractVersionList', () => {
  const mockVersions: FormattedContractVersion[] = [
    {
      versionNumber: 3,
      versionLabel: 'V3 · 最新生效版',
      isLatest: true,
      name: '保密合同_豆包_v3.docx',
      url: '/api/attachments/v3.docx',
    },
    {
      versionNumber: 2,
      versionLabel: 'V2 · 经办人修订版',
      isLatest: false,
      name: '保密合同_豆包_v2.docx',
      url: '/api/attachments/v2.docx',
    },
    {
      versionNumber: 1,
      versionLabel: 'V1 · 初始初稿',
      isLatest: false,
      name: '保密合同_豆包_v1.docx',
      url: '/api/attachments/v1.docx',
    },
  ];

  it('renders nothing when versions array is empty', () => {
    const html = renderToStaticMarkup(<CollapsibleContractVersionList formattedVersions={[]} />);
    expect(html).toBe('');
  });

  it('renders only the single version and no collapse button when only 1 version exists', () => {
    const html = renderToStaticMarkup(
      <CollapsibleContractVersionList formattedVersions={[mockVersions[0]]} />
    );
    expect(html).toContain('保密合同_豆包_v3.docx');
    expect(html).toContain('V3 · 最新生效版');
    expect(html).not.toContain('查看历史版本');
  });

  it('renders latest version prominently and defaults history versions collapsed', () => {
    const html = renderToStaticMarkup(
      <CollapsibleContractVersionList formattedVersions={mockVersions} />
    );
    // 最新生效版必须直接呈现
    expect(html).toContain('保密合同_豆包_v3.docx');
    expect(html).toContain('V3 · 最新生效版');

    // 历史版本 (共2个) 默认收起，展现折叠按钮
    expect(html).toContain('查看历史版本 (2)');
    expect(html).toContain('已留存历史版本原稿');

    // 默认折叠状态下，历史版本文件名不平铺展开
    expect(html).not.toContain('保密合同_豆包_v2.docx');
    expect(html).not.toContain('保密合同_豆包_v1.docx');
  });

  it('constrains long filename width with ellipsis to prevent flex overflow past buttons', () => {
    const longName = '保密合同_豆包有限公司_v1_20261001_非常冗长且超出容器宽度的法务批注修订归档正式版.docx';
    const html = renderToStaticMarkup(
      <CollapsibleContractVersionList
        formattedVersions={[
          {
            versionNumber: 5,
            versionLabel: 'V5 · 最新生效版',
            isLatest: true,
            name: longName,
            url: '/api/attachments/long.docx',
          },
        ]}
      />
    );
    expect(html).toContain('text-overflow:ellipsis');
    expect(html).toContain('overflow:hidden');
    expect(html).toContain('min-width:0');
    expect(html).toContain(longName);
  });
});
