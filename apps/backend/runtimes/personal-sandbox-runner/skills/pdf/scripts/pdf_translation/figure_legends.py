"""Translate independent workflow labels separately from embedded example prose."""
import re


def legend_units(node, lines, join):
    labels, prose = [], []
    for lid in sorted(node['line_ids'], key=lambda lid: (lines[lid]['bbox'][1], lines[lid]['bbox'][0])):
        text = lines[lid]['text']
        if re.match(r'^\d+[.)]\s+[A-Z]', text):
            labels.append([lid])
        else:
            prose.append(lid)
    if not labels:
        return []  # Existing single legend remains appropriate for ordinary images.
    groups = sorted(labels, key=lambda ids: int(re.match(r'\d+', lines[ids[0]]['text']).group()))
    if prose:
        groups.append(prose)
    return [dict(id=f'{node["id"]}_legend_{i}', line_ids=ids, text=join(ids, lines))
            for i, ids in enumerate(groups)]
