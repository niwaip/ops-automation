"""Reconcile native margin, caption and section roles without discarding line IDs."""
import re

from .contracts import is_formula


def isolate_margin_lines(blocks, page):
    lines = {line['id']: line for line in page['lines']}
    width, height = page['width_pt'], page['height_pt']
    margin = {lid for lid, line in lines.items() if line.get('rotated') and (
        line['bbox'][2] < width * .09 or line['bbox'][0] > width * .91
        or line['bbox'][3] < height * .09 or line['bbox'][1] > height * .91)}
    result = []
    for block in blocks:
        current = dict(block)
        current['line_ids'] = [lid for lid in block.get('line_ids', []) if lid not in margin]
        if block.get('cells'):
            current['cells'] = [dict(cell, line_ids=[lid for lid in cell['line_ids'] if lid not in margin])
                                for cell in block['cells']]
        caption_ids = [lid for lid in current['line_ids'] if current.get('type') == 'figure'
                       and re.match(r'^(?:Figure|Fig\.)\s*\d+\s*[:.]', lines[lid]['text'], re.I)]
        current['line_ids'] = [lid for lid in current['line_ids'] if lid not in caption_ids]
        if current.get('type') == 'paragraph' and len(current['line_ids']) == 1:
            line = lines[current['line_ids'][0]]
            if len(line['text']) < 100 and re.match(r'^\d+\.\d+(?:\.\d+)*\s+[A-Z]', line['text']):
                current['type'] = 'heading'
        if current.get('type') == 'figure' and current.get('line_ids'):
            block_text = ' '.join(lines[lid]['text'] for lid in current['line_ids'] if lid in lines)
            if is_formula(block_text):
                current['type'] = 'formula'
        if current['line_ids'] or current.get('type') in ('figure', 'formula'):
            result.append(current)
        for lid in caption_ids:
            result.append(dict(type='caption', line_ids=[lid], bbox=list(lines[lid]['bbox']),
                               column=current.get('column', 0)))
    # Preserve each margin line separately; model word order is not authoritative
    # for rotated text. Their evidence remains exempt from prose translation.
    for lid in sorted(margin, key=lambda lid: (lines[lid]['bbox'][1], lines[lid]['bbox'][0])):
        result.append(dict(type='furniture', line_ids=[lid], bbox=list(lines[lid]['bbox']), column=0))

    # Reconcile isolated superscript/footnote marker blocks (e.g. '†', '1', '1 2 3 4 5')
    # into their horizontally aligned neighbor lines so they never become standalone headings.
    def _is_marker_block(b):
        return (bool(b.get('line_ids'))
                and b.get('type') not in ('table', 'figure', 'formula', 'furniture')
                and all(re.fullmatch(r'[\d*†‡§¶]+', lines[lid]['text'].strip())
                        and (lines[lid]['bbox'][2] - lines[lid]['bbox'][0]) < 15
                        for lid in b['line_ids']))

    non_markers = [b for b in result if not _is_marker_block(b)
                   and b.get('type') not in ('table', 'figure', 'formula', 'furniture')
                   and b.get('line_ids')]
    for b in result:
        if not _is_marker_block(b):
            continue
        remaining = []
        for lid in b['line_ids']:
            lb = lines[lid]['bbox']
            matched = None
            for target in non_markers:
                for idx, tlid in enumerate(target['line_ids']):
                    tb = lines[tlid]['bbox']
                    if abs(tb[1] - lb[1]) <= 4.5 and (
                        0 <= tb[0] - lb[2] <= 20
                        or (tb[0] - 5 <= lb[0] and lb[2] <= tb[2] + 5)
                    ):
                        matched = (target, idx, lb[0] <= tb[0])
                        break
                if matched:
                    break
            if matched:
                target, idx, before = matched
                target['line_ids'].insert(idx if before else idx + 1, lid)
            else:
                remaining.append(lid)
        b['line_ids'] = remaining
    result = [b for b in result if b.get('line_ids') or b.get('type') in ('figure', 'formula')]

    joined = []
    for block in result:
        prev = joined[-1] if joined else None
        same_col_para = (prev and block.get('type') == prev.get('type') == 'paragraph'
                         and block.get('column') == prev.get('column')
                         and prev['line_ids'] and block['line_ids'])
        hyphen_cont = (same_col_para
                       and re.search(r'[a-z]-$', lines[prev['line_ids'][-1]]['text'])
                       and re.match(r'^[a-z]', lines[block['line_ids'][0]]['text'])
                       and abs(lines[block['line_ids'][0]]['bbox'][0]
                               - lines[prev['line_ids'][0]]['bbox'][0]) < 25
                       and 0 <= lines[block['line_ids'][0]]['bbox'][1]
                               - lines[prev['line_ids'][-1]]['bbox'][3] < 20)
        unindented_mid_sentence = (same_col_para
                                   and re.search(r'[a-z0-9,;]$', lines[prev['line_ids'][-1]]['text'].strip())
                                   and re.match(r'^[a-z]', lines[block['line_ids'][0]]['text'].strip())
                                   and abs(lines[block['line_ids'][0]]['bbox'][0]
                                           - min(lines[lid]['bbox'][0] for lid in prev['line_ids'])) < 5
                                   and 0 <= lines[block['line_ids'][0]]['bbox'][1]
                                           - lines[prev['line_ids'][-1]]['bbox'][3] < 8)
        if hyphen_cont or unindented_mid_sentence:
            prev['line_ids'].extend(block['line_ids'])
        else:
            joined.append(block)
    return joined
