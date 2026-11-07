"""Verified checkpoints; a retry reuses evidence, never an arbitrary edited IR."""
from pathlib import Path
import shutil
import re

from .contracts import TranslationError, digest, read_json, write_json, validate_ir

IMPLEMENTATION_VERSION = 'layout-html/10'


def load_checkpoint(directory, source, destination, *, pack=False):
    directory = Path(directory).resolve()
    if not (directory / 'manifest.json').is_file():
        raise TranslationError('checkpoint_incomplete', '缺少布局检查点manifest；请使用auto重新解析')
    manifest = read_json(directory / 'manifest.json')
    if manifest.get('implementation_version') != IMPLEMENTATION_VERSION:
        raise TranslationError('checkpoint_version_mismatch', '检查点版本已变化，不能复用旧的布局或验收')
    if manifest.get('state') not in ('unpacked', 'candidate_ready', 'published', 'failed'):
        raise TranslationError('checkpoint_incomplete', '检查点尚未完成布局准备')
    path = directory / 'source.ir.json'
    if path.is_symlink() or not path.is_file() or digest(path) != manifest.get('source_ir_sha256'):
        raise TranslationError('source_changed', '检查点原始IR缺失或已被修改；不要手动改写来源层')
    ir = read_json(path)
    validate_ir(ir)
    if digest(source) != manifest.get('input_sha256') or ir['source']['sha256'] != digest(source):
        raise TranslationError('source_changed', '检查点与当前PDF来源不一致')
    # Independent extraction checks make a rehashed, edited source layer invalid.
    import pdfplumber
    from .native_parser import page_lines
    from .layout_analyzer import _join
    from .region_validation import validate_regions
    with pdfplumber.open(source) as pdf:
        if len(pdf.pages) != len(ir['pages']):
            raise TranslationError('source_changed', '检查点页面不完整')
        for index, page in enumerate(pdf.pages):
            record = ir['pages'][index]
            if page_lines(page, f'p{index + 1}') != record['lines']:
                raise TranslationError('source_changed', '检查点原生行与PDF不一致')
            from .source_links import extract_links
            if extract_links(page) != record.get('links', []):
                raise TranslationError('source_changed', '检查点链接证据与PDF不一致')
            validate_regions([n for n in ir['nodes'] if n['page_id'] == record['id']], record)
    lines = {l['id']: l for page in ir['pages'] for l in page['lines']}
    for node in ir['nodes']:
        for unit in [node, *node.get('cells', [])]:
            if unit['text'] != _join(unit['line_ids'], lines):
                raise TranslationError('source_changed', '检查点节点文字与原生行不一致')
    ir['translations'] = {}
    if pack:
        translated = directory / 'translated.json'
        if not translated.is_file():
            raise TranslationError('translation_input_missing',
                'pack需要完整的translated.json；请用auto INPUT OUTPUT --resume WORKDIR自动翻译，不要跳过翻译步骤')
        ir['translations'] = read_json(translated)
        if not isinstance(ir['translations'], dict) or any(not isinstance(v, str) for v in ir['translations'].values()):
            raise TranslationError('translation_incomplete', 'translated.json须为节点ID到译文字符串的字典')
    elif (directory / 'translated.ir.json').is_file():
        translated = read_json(directory / 'translated.ir.json')
        if translated.get('nodes') != ir['nodes'] or translated.get('source') != ir['source']:
            raise TranslationError('source_changed', '译文检查点改写了原始结构')
        ir['translations'] = translated.get('translations', {}) if manifest.get('lang') else {}
    destination = Path(destination)
    (destination / 'assets').mkdir(exist_ok=True)
    for asset in ir['assets']:
        if not re.fullmatch(r'p\d+_b\d+', asset['id']):
            raise TranslationError('asset_mapping_failed', '检查点素材ID无效')
        original = Path(asset['path'])
        if original.is_symlink() or not original.is_file() or digest(original) != asset['sha256']:
            raise TranslationError('asset_mapping_failed', '检查点图形缺失或哈希变化')
        target = destination / 'assets' / (asset['id'] + '.png')
        shutil.copyfile(original, target)
        asset['path'] = str(target)
        for node in ir['nodes']:
            if node['id'] == asset['id']:
                node['asset'] = str(target)
    return ir, manifest


def export_preparation(folder, directory, manifest):
    directory = Path(directory).absolute()
    if directory.is_symlink() or any(p.is_symlink() for p in directory.parents):
        raise TranslationError('invalid_output', '准备目录不能使用符号链接')
    directory.mkdir(parents=True, exist_ok=True)
    if any(directory.iterdir()):
        raise TranslationError('checkpoint_exists', '准备目录已存在；请复用其检查点或选择新的空目录')
    shutil.copyfile(Path(folder) / 'source.ir.json', directory / 'source.ir.json')
    write_json(directory / 'manifest.json', dict(manifest, checkpoint_dir=str(folder)))


def load_layout_checkpoint(directory, source, destination, deadline):
    """Reuse only a validated prefix; re-extract source geometry before trusting it."""
    from .native_parser import parse_native
    from .layout_analyzer import _join
    from .region_validation import validate_regions
    directory = Path(directory).resolve()
    manifest = read_json(directory / 'manifest.json')
    path = directory / 'source.ir.json'
    if (manifest.get('implementation_version') != IMPLEMENTATION_VERSION
            or manifest.get('stage') != 'layout' or manifest.get('state') != 'failed'
            or manifest.get('input_sha256') != digest(source)
            or path.is_symlink() or digest(path) != manifest.get('layout_ir_sha256')):
        raise TranslationError('source_changed', '布局检查点版本、来源或哈希不一致')
    previous = read_json(path)
    fresh = parse_native(source, destination, deadline)
    accepted = []
    for page, old in zip(fresh['pages'], previous.get('pages', [])):
        nodes = [n for n in previous.get('nodes', []) if n['page_id'] == page['id']]
        if not nodes:
            break
        for key in ('id', 'width_pt', 'height_pt', 'lines', 'links', 'visual_bounds', 'table_candidates', 'native_tables'):
            if page.get(key) != old.get(key):
                raise TranslationError('source_changed', '布局检查点原生证据不一致')
        validate_ir(dict(fresh, pages=[page], nodes=nodes, reading_order=[n['id'] for n in nodes]))
        validate_regions(nodes, page)
        lines = {line['id']: line for line in page['lines']}
        for node in nodes:
            for unit in [node, *node.get('cells', [])]:
                if unit['text'] != _join(unit['line_ids'], lines):
                    raise TranslationError('source_changed', '布局检查点文字不一致')
        page['columns'] = old.get('columns', 1)
        accepted.extend(nodes)
    if len(accepted) != len(previous.get('nodes', [])):
        raise TranslationError('checkpoint_incomplete', '布局检查点须为连续通过的页面')
    fresh['nodes'] = accepted
    fresh['reading_order'] = [n['id'] for n in accepted]
    return fresh
