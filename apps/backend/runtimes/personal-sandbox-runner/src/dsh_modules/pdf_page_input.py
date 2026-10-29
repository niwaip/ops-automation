"""Conservative normalization of model page arguments without discarding content."""
import json
import re


def flow_markdown_chunks(chunks):
    """Join prose blocks without inserting blank lines inside split GFM tables."""
    output = ''
    for index, chunk in enumerate(chunks):
        previous = output.rstrip().rsplit('\n', 1)[-1].strip()
        first = chunk.lstrip().split('\n', 1)[0].strip()
        table_row = lambda line: line.startswith('|') and line.endswith('|')
        following = chunk.lstrip().splitlines()[1:2]
        if not following and index + 1 < len(chunks):
            following = chunks[index + 1].lstrip().splitlines()[:1]
        new_table = bool(following and re.fullmatch(r'\s*\|(?:\s*:?-{3,}:?\s*\|)+\s*', following[0]))
        separator = '\n' if table_row(previous) and table_row(first) and not new_table else '\n\n'
        output += (separator if output else '') + chunk
    return output


def normalize_pages(value):
    repairs = []
    if isinstance(value, str):
        if len(value) > 200_000:
            raise ValueError('pages JSON 字符串不得超过 200000 字符')
        try:
            value = json.loads(value)
        except (ValueError, RecursionError) as exc:
            raise ValueError('pages 必须是 Markdown 字符串数组；当前字符串不是有效 JSON 数组') from exc
        repairs.append('decoded_json_array')
    if not isinstance(value, list) or not 1 <= len(value) <= 100:
        raise ValueError('pages 必须为1至100项非空 Markdown 字符串')
    value = list(value)
    # A trailing empty item carries no content. Interior empty pages may be intentional,
    # so reject those explicitly rather than silently changing page numbering.
    removed = 0
    while value and isinstance(value[-1], str) and not value[-1].strip():
        value.pop()
        removed += 1
    if removed:
        repairs.append(f'removed_trailing_empty_pages:{removed}')
    if not value:
        raise ValueError('pages 不得全部为空；请提交实际 Markdown 正文')
    for index, page in enumerate(value, 1):
        if not isinstance(page, str) or not page.strip():
            raise ValueError(f'pages 第{index}项必须是非空 Markdown 字符串；请修正该项')
    if sum(map(len, value)) > 200_000:
        raise ValueError('单次 Markdown 内容不得超过 200000 字符')
    return value, repairs
