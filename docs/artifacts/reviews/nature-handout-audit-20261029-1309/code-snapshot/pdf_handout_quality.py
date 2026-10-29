"""Writing-space layout for blank record tables; content stays model-authored."""
import html
import re


def expand_record_tables(markdown, prompt):
    if '记录卡' not in prompt:
        return markdown
    def cell(value):
        # Header/field labels stay plain; do not leak Markdown delimiters into HTML.
        value = re.sub(r'^(\*\*|__)(.*?)\1$', r'\2', value)
        return html.escape(value)
    names = re.search(r'(?:以及|包括|包含)\s*([^，。；\n]+?)[一二三四五六七八九十\d]+项记录卡', prompt)
    fields = [x.strip() for x in re.split(r'[、/]', names[1])] if names else []
    lines = markdown.splitlines()
    result = []
    index = 0
    while index < len(lines):
        block = []
        while index < len(lines) and lines[index].strip().startswith('|'):
            block.append(lines[index]); index += 1
        if not block:
            result.append(lines[index]); index += 1
            continue
        rows = [[c.strip() for c in line.strip()[1:-1].split('|')] for line in block]
        blank = lambda value: not re.sub(r'[\s_\-—.]', '', value)
        if (3 <= len(rows) <= 8 and all(len(row) == 2 for row in rows)
                and all(re.fullmatch(r':?-+:?', c) for c in rows[1])
                and all((row[0] or fields) and blank(row[1]) for row in rows[2:])):
            if 2 <= len(fields) <= 20:
                rows = rows[:2] + [[name, ''] for name in fields]
            header = ''.join('<th>' + cell(c) + '</th>' for c in rows[0])
            body = ''.join('<tr><td>' + cell(row[0]) + '</td><td></td></tr>' for row in rows[2:])
            result.append('\n<table class="record-card"><thead><tr>' + header + '</tr></thead><tbody>' + body + '</tbody></table>\n')
        else:
            result.extend(block)
    if fields and any('class="record-card"' in line for line in result):
        # Drop only duplicate empty quote fields; preserve any actual entered values.
        canonical = {''.join(c for c in name if c.isalnum()) for name in fields}
        result = [line for line in result if not (line.lstrip().startswith('>') and
                  ''.join(c for c in line if c.isalnum()) in canonical)]
    return '\n'.join(result)


def emphasize_requested_tips(markdown, prompt):
    if not re.search(r'浅色|色块|提示块', prompt):
        return markdown
    lines = markdown.splitlines()
    result = []
    index = 0
    while index < len(lines):
        line = lines[index]
        result.append(line); index += 1
        is_heading = bool(re.match(r'^#{1,6}\s+.*提示', line))
        is_label = '提示' in line and bool(re.fullmatch(r'\s*(?:\*\*)?[^。！？|]{1,40}提示(?:\*\*)?[：:]?\s*', line))
        if not (is_heading or is_label):
            continue
        block = []
        while index < len(lines) and not re.match(r'^(?:#{1,6}\s|<!--|!\[|<img|\|)', lines[index]):
            block.append(lines[index]); index += 1
        while block and not block[-1].strip():
            block.pop()
        result.extend('> ' + re.sub(r'^>\s?', '', text) if text.strip() else '>' for text in block)
        result.append('')
    return '\n'.join(result)
