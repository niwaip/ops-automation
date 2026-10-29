"""Real glyph QA against the failed turn and an unrelated fallback gallery."""
import json
from pathlib import Path
import sys
sys.path.insert(0, '/audit/apps/backend/runtimes/personal-sandbox-runner/skills/pdf/scripts')
from pdf_design import render_report
from pdf_design.symbols import symbol_html

out = Path('/out')
failed = Path('/audit/docs/artifacts/reviews/bilibili-call-audit-20261029-2011/attempt-4.json')
source = json.loads(failed.read_text())['normalized_markdown']
symbol_html(source)  # The exact text that previously raised U+1F4F0.
render_report(source.splitlines(), str(out / 'original-glyph-check.pdf'),
              title='原失败稿字形检查', template='handout', preview_dir=out / 'original')
gallery = ['# 📰 图标显示检查', '', '## 常用图标', '',
           '📰 报纸 · 📢 公告 · 🏀 体育 · 🌎 国际 · 💰 财经 · 📍 地点 · 🚗 汽车 · ✈️ 交通', '',
           '📅 日历 · ⏰ 时钟 · 👤 人物 · 💬 消息 · 📁 文件 · 🔍 搜索 · 📖 阅读 · 🏆 排名', '',
           '🔥 热度 · 📈 上升 · 📉 下降 · ➖ 持平 · ✅ 完成 · ❌ 取消 · ❤️ 关注', '',
           '## 不在资源表中的图标', '',
           '🦄 独角兽：用可读名称显示，不会中断文档。', '',
           '👩🏽\u200d💻 组合图标：完整保留人物、肤色与职业含义。', '',
           '🇪🇸 🇨🇳 国旗：显示地区标识。 1️⃣ 2️⃣ 数字键帽：保留数字。', '',
           '| 排名 | 内容 |', '|---|---|', '| 🥇 NO.1 | 📰 新闻 |', '| 🥈 | 🏀 体育 |', '| 🥉 | 💰 财经 |']
render_report(gallery, str(out / 'display-check.pdf'), template='handout',
              min_pages=1, max_pages=1, preview_dir=out / 'gallery')
original = json.loads((out / 'original/qa.json').read_text())
qa = json.loads((out / 'gallery/qa.json').read_text())
assert original['valid'] and qa['valid']
(out / 'validation.json').write_text(json.dumps({
    'exact_failed_source_glyphs': 'passed', 'original_glyph_check_pages': original['page_count'],
    'original_single_page_fits': original['page_count'] == 1,
    'gallery_one_page': qa['page_count'], 'missing_glyph_errors': original['errors'] + qa['errors'],
    'scope': 'Glyph QA only; original news facts are not reverified and original layout may exceed one page.'
}, ensure_ascii=False, indent=2))
