"""Canonical native-line joining shared by layout, checkpoints, and publication."""


import re


def join_lines(ids, lines):
    text = ''
    i = 0
    while i < len(ids):
        lid = ids[i]
        value = lines[lid]['text']
        # 容错：若行尾连字符被误插入孤立角标/注脚数字（如 improv- 与 ing 之间夹着上标 1），
        # 优先将断词还原为完整自然词，并将角标置于词后，杜绝词内插数字导致的模型理解断裂
        if text.endswith('-') and re.fullmatch(r'\d+', value.strip()) and i + 1 < len(ids):
            next_val = lines[ids[i + 1]]['text']
            if next_val[:1].islower():
                next_parts = next_val.split(' ', 1)
                word_suffix = next_parts[0]
                rest = (' ' + next_parts[1]) if len(next_parts) > 1 else ''
                text = text[:-1] + word_suffix + ' ' + value.strip() + rest
                i += 2
                continue
        # PDF line wrapping must not turn a URL or command path into several tokens.
        if text and (text.endswith('/') or value.startswith('/') or re.search(r'https?://\S+-$', text)):
            text += value
        elif text.endswith('-') and value[:1].islower():
            text = text[:-1] + value
        else:
            text += (' ' if text else '') + value
        i += 1
    return text
