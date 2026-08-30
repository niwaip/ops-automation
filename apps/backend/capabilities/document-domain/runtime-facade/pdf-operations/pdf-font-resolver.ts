import * as fs from 'fs';

export interface ResolvedPdfFont {
  path: string;
  familyName?: string;
}

const CJK_PATTERN = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;

const CJK_FONT_CANDIDATES: ResolvedPdfFont[] = [
  {
    path: '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
    familyName: 'NotoSansCJKsc-Regular',
  },
  { path: '/usr/share/fonts/opentype/noto/NotoSansCJKsc-Regular.otf' },
  { path: '/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc', familyName: 'WenQuanYiZenHei' },
  { path: '/System/Library/Fonts/PingFang.ttc', familyName: 'PingFangSC-Regular' },
  { path: '/System/Library/Fonts/Hiragino Sans GB.ttc', familyName: 'HiraginoSansGB-W3' },
  { path: 'C:\\Windows\\Fonts\\msyh.ttc', familyName: 'MicrosoftYaHei' },
  { path: 'C:\\Windows\\Fonts\\simhei.ttf' },
];

export function containsCjkText(value: string): boolean {
  return CJK_PATTERN.test(value);
}

export function resolveCjkPdfFont(): ResolvedPdfFont | undefined {
  return CJK_FONT_CANDIDATES.find((candidate) => fs.existsSync(candidate.path));
}
