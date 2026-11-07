"""Final geometry invariants, after every normalization or overlap adjustment."""
import math


def validate_regions(nodes, page):
    lines = {line['id']: line for line in page.get('lines', [])}
    for anchor in page.get('visual_bounds', []):
        ax, ay, bx, by = anchor
        if bx - ax < 50 or by - ay < 15:
            continue
        def coverage(node):
            x0, y0, x1, y1 = node['bbox']
            return max(0, min(bx, x1) - max(ax, x0)) * max(0, min(by, y1) - max(ay, y0)) / ((bx - ax) * (by - ay))
        if not any(n['type'] in ('figure', 'formula') and coverage(n) >= .95 for n in nodes):
            raise ValueError('native graphic is omitted or clipped: ' + str(anchor))
    for node in nodes:
        box = node['bbox']
        if len(box) != 4 or any(not isinstance(v, (int, float)) or not math.isfinite(v) for v in box):
            raise ValueError('invalid region: ' + node['id'])
        x0, y0, x1, y1 = box
        if not (0 <= x0 <= x1 <= page['width_pt'] + 1 and 0 <= y0 <= y1 <= page['height_pt'] + 1):
            raise ValueError('invalid region after overlap adjustment: ' + node['id'])
        if node['type'] not in ('figure', 'formula'):
            # Native PDFs can contain zero-height text anchors; these are not
            # crop regions. Their text is retained and checked after reflow.
            continue
        minimum = 6 if node['type'] == 'figure' else 2
        if x1 - x0 < minimum or y1 - y0 < minimum:
            raise ValueError('graphic region collapsed; identify the complete graphic: ' + node['id'])
        for lid in node.get('line_ids', []):
            b = lines[lid]['bbox']
            if b[0] < x0 - 2 or b[1] < y0 - 2 or b[2] > x1 + 2 or b[3] > y1 + 2:
                raise ValueError('graphic clipping removes its own labels: ' + node['id'])
