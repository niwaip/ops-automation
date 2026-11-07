"""Ground visual review in the current PDF's coordinates, without approving it."""
import json
from collections import defaultdict
from pdfminer.pdfexceptions import PDFException
from pdfplumber.utils.exceptions import PdfminerException


def page_geometry_evidence(path, page_number):
    try:
        import pdfplumber
        with pdfplumber.open(path) as pdf:
            page = pdf.pages[page_number - 1]
            width, height = float(page.width), float(page.height)
            footer = [{'text': w['text'], 'bbox_pt': [round(w[k], 1) for k in ('x0', 'top', 'x1', 'bottom')]}
                      for w in page.extract_words() if w['top'] >= height - 45]
            chars = [c for c in page.chars if c.get('text', '').strip()
                     and c['x1'] > c['x0'] and c['bottom'] > c['top']]
            cells, pairs = defaultdict(list), set()
            overlaps = []
            for index, char in enumerate(chars):
                keys = [(x, y) for x in range(int(char['x0'] // 24), int(char['x1'] // 24) + 1)
                        for y in range(int(char['top'] // 24), int(char['bottom'] // 24) + 1)]
                for key in keys:
                    for previous in cells[key]:
                        pair = (previous, index)
                        if pair in pairs:
                            continue
                        pairs.add(pair)
                        other = chars[previous]
                        dx = min(char['x1'], other['x1']) - max(char['x0'], other['x0'])
                        dy = min(char['bottom'], other['bottom']) - max(char['top'], other['top'])
                        area = min((char['x1'] - char['x0']) * (char['bottom'] - char['top']),
                                   (other['x1'] - other['x0']) * (other['bottom'] - other['top']))
                        if dx > 0 and dy > 0 and dx * dy / area > .6:
                            overlaps.append({'text': other['text'] + '/' + char['text'],
                                'bbox_pt': [round(min(char['x0'], other['x0']), 1),
                                            round(min(char['top'], other['top']), 1)]})
                    cells[key].append(index)
            facts = {'page': page_number, 'page_size_pt': [round(width, 1), round(height, 1)],
                     'footer_text': footer, 'high_overlap_char_pairs': len(overlaps),
                     'overlap_samples': overlaps[:5],
                     'extracted_page_text': (page.extract_text() or '')[:7000],
                     'next_page_start': ((pdf.pages[page_number].extract_text() or '')[:500]
                                         if page_number < len(pdf.pages) else '')}
        return ('\n当前PDF程序提取的几何事实（仅作核对，不构成视觉通过；不覆盖图片内部文字）：'
            + json.dumps(facts, ensure_ascii=False)
            + '\n仅报告当前PNG中能定位的缺陷；REPAIR/FAIL须引用受影响文字、所在区域及可见现象。'
              '正常双栏、自然断行不等于粘连。请核对页脚实际位置，不能猜测右下角有页码。'
              '\n输出契约：发现实质缺陷返回REPAIR或FAIL并列出定位证据；'
              '没有实质缺陷只输出一行PASS。不要在PASS后混入编辑建议；可选美化不属于阻断缺陷。')
    except (OSError, ValueError, IndexError, ImportError, PDFException, PdfminerException):
        return ''
