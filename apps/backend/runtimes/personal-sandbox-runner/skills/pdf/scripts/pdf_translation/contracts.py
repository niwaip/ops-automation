"""Versioned documents and atomic, private job records."""
import hashlib
import json
import os
from pathlib import Path
import re
import time
import uuid

SCHEMA = 'pdf-translation/1'
IR_SCHEMA = 'pdf-document-ir/1'
TYPES = {'title', 'heading', 'author', 'paragraph', 'list', 'table', 'figure',
         'caption', 'formula', 'footnote', 'reference', 'furniture'}
EXEMPT = {'author', 'formula', 'furniture', 'reference'}

MATH_SYMBOLS = set("=±×÷∑∏∫∮∂∇√∛∝∞∠∧∨∩∪∈∉∋⊆⊇⊂⊃⊄⊕⊗⊥∥≤≥≠≈≡∼≃≅∝≪≫→←↔⇒⇐⇔↦θτωεπρστυϕχψωαβγδεζηικλμνξΓΔΘΛΞΠΣΥΦΨΩℓˆ|")
MATH_KEYWORDS = {
    "arg", "min", "max", "argmin", "argmax", "exp", "log", "ln", "sin", "cos", "tan",
    "det", "dim", "ker", "lim", "sup", "inf", "elbo", "mdl", "loss", "var", "cov",
    "diag", "tr", "vec", "rank", "st", "sub", "cid", "eq", "neq", "geq", "leq"
}


def is_formula(text: str) -> bool:
    if not isinstance(text, str):
        return False
    raw = text.strip()
    if not raw:
        return False
    if re.search(r'[\u4e00-\u9fff\u3040-\u30ff]', raw):
        return False
    words = [w.lower() for w in re.findall(r'[a-zA-Z]+', raw)]
    stopwords = {'the', 'of', 'and', 'in', 'to', 'for', 'with', 'is', 'are', 'was', 'were',
                 'this', 'that', 'these', 'those', 'from', 'which', 'each', 'then', 'when'}
    if any(w in stopwords for w in words):
        return False

    s = re.sub(r'\(cid:\d+\)', ' ', raw)
    has_math_sym = any(c in MATH_SYMBOLS for c in s) or bool(
        re.search(r'[=≠≤≥]|->|-->|=>|p_\w+|p\s*[θϕ]|q\s*[θϕ]|\b(?:d[xyst]|dτ|ds)\b', s)
    )
    if not has_math_sym:
        return False
    non_math_words = [w for w in words if len(w) > 1 and w not in MATH_KEYWORDS]
    return len(non_math_words) <= 2


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
    from .source_text import join_lines as _join
    native_lines = {line['id']: line for page in ir['pages'] for line in page['lines']}
    for node in nodes:
        if node.get('line_ids') and node.get('text'):
            if node['text'] != _join(node['line_ids'], native_lines):
                raise TranslationError('source_changed', f"节点 {node['id']} 结构块文字与原生行不一致")
        for cell in node.get('cells', []):
            if cell.get('line_ids') and cell.get('text'):
                if cell['text'] != _join(cell['line_ids'], native_lines):
                    raise TranslationError('source_changed', f"单元格 {cell['id']} 文字与原生行不一致")
        if node.get('type') not in TYPES:
            raise TranslationError('invalid_ir', '未知节点类型')
        if node['type'] == 'table':
            from .table_geometry import validate_table
            page = next(page for page in ir['pages'] if page['id'] == node['page_id'])
            try:
                validate_table(node, page)
            except ValueError as error:
                if not node.get('native_table_id'):
                    node['type'] = 'paragraph'
                    node.pop('cells', None)
                    page.setdefault('warnings', []).append(f"第{page.get('number', page.get('id', ''))}页表格格式异常({error})，已转为普通段落放行")
                    continue
                raise TranslationError('layout_unresolved', str(error)) from error
            cells = node.get('cells', [])
            cell_lines = [x for c in cells for x in c['line_ids']]
            if set(cell_lines) != set(node['line_ids']) or len(cell_lines) != len(set(cell_lines)):
                if not node.get('native_table_id'):
                    node['type'] = 'paragraph'
                    node.pop('cells', None)
                    page.setdefault('warnings', []).append(f"第{page.get('number', page.get('id', ''))}页表格文字归属不完整，已转为普通段落放行")
                    continue
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
            if node.get('type') == 'figure' and node.get('asset') and is_formula(node.get('text', '')):
                continue
            yield node
