"""Group related blocks and choose readable type sizes without imposing a page count."""
import re


def typography(language):
    chinese = language.lower().startswith(('zh', 'cn'))
    return dict(body=10.5 if chinese else 9.5, title=16 if chinese else 15,
                heading=11.5 if chinese else 10.5, small=8.8 if chinese else 8,
                table=9 if chinese else 8, lang=language)


def grouped_nodes(nodes, pages):
    """A table, notes and caption travel together; figure captions stay in their figure."""
    groups, index = [], 0
    while index < len(nodes):
        node = nodes[index]
        group = [node]
        index += 1
        if node['type'] in ('figure', 'table', 'formula'):
            while index < len(nodes) and nodes[index]['page_id'] == node['page_id']:
                next_node = nodes[index]
                if next_node['type'] == 'caption' or (node['type'] == 'table' and next_node['type'] == 'footnote'):
                    group.append(next_node)
                    index += 1
                else:
                    break
        groups.append(dict(nodes=group, page_id=node['page_id'], column=node.get('column'),
                           kind=node['type'], keep=len(group) > 1))
    # A page-bottom footnote is not a body paragraph in the middle of the next column.
    result, notes = [], []
    for group in groups:
        if result and group['page_id'] != result[-1]['page_id']:
            result.extend(notes)
            notes = []
        node = group['nodes'][0]
        height = pages.get(node['page_id'], {}).get('height_pt', 842)
        if group['kind'] == 'footnote' and node.get('bbox', [0, 0, 0, 0])[1] > height * .75:
            group.update(column=0, notes=True)
            notes.append(group)
        else:
            result.append(group)
    result.extend(notes)
    return result


def reconcile_columns(blocks, page, columns):
    if columns != 2:
        return blocks
    lines = {l['id']: l for l in page['lines']}
    mid = page['width_pt'] / 2
    result = []
    for block in blocks:
        if block['type'] not in ('paragraph', 'list', 'heading', 'footnote'):
            b_box = block.get('bbox')
            if b_box and ((b_box[0] < mid < b_box[2] and (b_box[2] - b_box[0]) > page['width_pt'] * 0.45)
                          or (b_box[2] - b_box[0]) > page['width_pt'] * 0.55):
                result.append(dict(block, column=0))
            else:
                result.append(block)
            continue
        ids = block.get('line_ids', [])
        lanes = {}
        for lid in ids:
            box = lines[lid]['bbox']
            column = 1 if box[2] < mid else 2 if box[0] > mid else 0
            lanes.setdefault(column, []).append(lid)
        b_box = block.get('bbox')
        is_full_width = (0 in lanes or
                         (b_box and (b_box[0] < mid < b_box[2] and (b_box[2] - b_box[0]) > page['width_pt'] * 0.45)) or
                         (b_box and (b_box[2] - b_box[0]) > page['width_pt'] * 0.55))
        if is_full_width:
            result.append(dict(block, column=0))
            continue
        for column, lane in sorted(lanes.items()):
            pending = []
            for lid in lane:
                if re.match(r'^\d+(?:\.\d+)+\s+[A-Z]', lines[lid]['text']):
                    if pending:
                        result.append(dict(block, line_ids=pending, column=column))
                        pending = []
                    result.append(dict(block, type='heading', line_ids=[lid], column=column))
                else:
                    pending.append(lid)
            if pending:
                result.append(dict(block, line_ids=pending, column=column))
    return result
