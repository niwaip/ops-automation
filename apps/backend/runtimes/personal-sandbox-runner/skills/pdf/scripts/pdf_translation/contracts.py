"""Versioned documents and atomic, private job records."""
import hashlib
import json
import os
from pathlib import Path
import time
import uuid

SCHEMA = 'pdf-translation/1'
IR_SCHEMA = 'pdf-document-ir/1'
TYPES = {'title', 'heading', 'author', 'paragraph', 'list', 'table', 'figure',
         'caption', 'formula', 'footnote', 'reference', 'furniture'}
EXEMPT = {'author', 'formula', 'furniture', 'reference'}


class TranslationError(ValueError):
    def __init__(self, code, message):
        self.code = code
        super().__init__(message)


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def write_json(path, data):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_name('.' + path.name + '.' + uuid.uuid4().hex)
    try:
        with temp.open('x', encoding='utf-8') as stream:
            os.chmod(temp, 0o600)
            json.dump(data, stream, ensure_ascii=False, indent=2, allow_nan=False)
        os.replace(temp, path)
    finally:
        temp.unlink(missing_ok=True)


def read_json(path):
    return json.loads(Path(path).read_text(encoding='utf-8'))


def check_time(deadline):
    if deadline is not None and time.monotonic() >= deadline:
        raise TranslationError('budget_exhausted', 'PDF翻译工具预算已耗尽，保留检查点，未发布文件。')


def validate_ir(ir):
    if ir.get('schema_version') != IR_SCHEMA:
        raise TranslationError('invalid_ir', '不支持的文档IR版本')
    nodes = ir.get('nodes', [])
    ids = [n['id'] for n in nodes]
    if not nodes or len(set(ids)) != len(ids) or ir.get('reading_order') != ids:
        raise TranslationError('invalid_ir', '正文节点为空、重复或阅读顺序不匹配')
    lines = [line['id'] for page in ir['pages'] for line in page['lines']]
    assigned = [x for node in nodes for x in node['line_ids']]
    if len(assigned) != len(set(assigned)) or set(lines) != set(assigned):
        raise TranslationError('layout_unresolved', '原始文字归属不完整或重复，停止翻译')
    for node in nodes:
        if node.get('type') not in TYPES:
            raise TranslationError('invalid_ir', '未知节点类型')
        if node['type'] == 'table':
            from .table_geometry import validate_table
            page = next(page for page in ir['pages'] if page['id'] == node['page_id'])
            try:
                validate_table(node, page)
            except ValueError as error:
                raise TranslationError('layout_unresolved', str(error)) from error
            cells = node.get('cells', [])
            cell_lines = [x for c in cells for x in c['line_ids']]
            if set(cell_lines) != set(node['line_ids']) or len(cell_lines) != len(set(cell_lines)):
                raise TranslationError('layout_unresolved', '表格文字归属不完整或重复')
        if node.get('legend_units'):
            legends = node['legend_units']
            legend_lines = [lid for unit in legends for lid in unit['line_ids']]
            if (node['type'] != 'figure' or set(legend_lines) != set(node['line_ids'])
                    or len(legend_lines) != len(set(legend_lines))):
                raise TranslationError('invalid_ir', '图例文字归属不完整或重复')
            from .source_text import join_lines as _join
            native = {line['id']: line for page in ir['pages'] for line in page['lines']}
            for unit in legends:
                if unit['text'] != _join(unit['line_ids'], native):
                    raise TranslationError('source_changed', '图例文字与原生行不一致')
    for page in ir['pages']:
        for table in page.get('native_tables', []):
            owners = [node for node in nodes if node.get('native_table_id') == table['id']
                      and node['page_id'] == page['id'] and node['type'] == 'table']
            if len(owners) != 1 or set(owners[0]['line_ids']) != set(table['line_ids']):
                raise TranslationError('layout_unresolved', 'native table mapping missing or duplicated')
    return ir


def text_units(ir):
    for node in ir['nodes']:
        if node['type'] in EXEMPT:
            continue
        if node['type'] == 'table':
            for cell in node['cells']:
                if cell['text'].strip():
                    yield cell
        elif node.get('legend_units'):
            yield from node['legend_units']
        elif node.get('text', '').strip():
            yield node
