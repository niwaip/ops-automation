"""Translate editable drawing/comment text and formula literals without rebuilding objects."""
import html
from pathlib import Path
import re
import xml.etree.ElementTree as ET
from xml.sax.saxutils import escape

from xlsx_formula_references import FORMULA, STRING


def text_parts(folder):
    root = Path(folder)
    return sorted([*root.glob('xl/drawings/*.xml'), *root.glob('xl/comments*.xml'),
                   *root.glob('xl/charts/*.xml'), *root.glob('xl/worksheets/*.xml')])


def extract_native_text(folder, mapping, extracted):
    for part in text_parts(folder):
        relative = part.relative_to(folder).as_posix()
        tree = ET.parse(part).getroot()
        main = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
        cached_text = {id(cell.find(f'{{{main}}}v')) for cell in tree.iter(f'{{{main}}}c')
                       if cell.get('t') == 'str' and cell.find(f'{{{main}}}f') is not None}
        for index, element in enumerate(tree.iter()):
            if (element.tag.rsplit('}', 1)[-1] == 't' or id(element) in cached_text) and (element.text or '').strip():
                key = f'native_text_{len(mapping)}'
                mapping[key] = dict(type='xml_text', part=relative, index=index, orig_text=element.text)
                extracted[key] = element.text.strip()
    literals = {}
    for part in Path(folder, 'xl').rglob('*.xml'):
        for formula in FORMULA.finditer(part.read_text(encoding='utf-8')):
            # Literal validation lists already have individual option bindings.
            if formula.group('tag').split(':')[-1] not in ('f', 'formula'):
                continue
            for literal in STRING.findall(html.unescape(formula.group('body'))):
                value = literal[1:-1].replace('""', '"')
                if value.strip():
                    literals[value] = value
    for value in literals:
        key = f'formula_text_{len(mapping)}'
        mapping[key] = dict(type='formula_text', orig_text=value)
        extracted[key] = value


def pack_native_text(folder, mapping, translations, write_xml):
    by_part = {}
    for key, meta in mapping.items():
        if meta.get('type') == 'xml_text' and key in translations:
            by_part.setdefault(meta['part'], {})[meta['index']] = translations[key]
    for relative, values in by_part.items():
        part = Path(folder, relative)
        original = part.read_text(encoding='utf-8')
        tree = ET.parse(part)
        replacements = {}
        token_index = 0
        for index, element in enumerate(tree.getroot().iter()):
            if index in values:
                old = element.text or ''
                replacements[token_index] = re.match(r'^\s*', old).group(0) + values[index].strip() + re.search(r'\s*$', old).group(0)
            if element.tag.rsplit('}', 1)[-1] in ('t', 'v'):
                token_index += 1
        tokens = re.compile(r'<(?P<tag>(?:\w+:)?(?:t|v))\b[^>]*(?:/>|>(?P<body>[^<]*)</(?P=tag)>)')
        position = 0

        def replace(match):
            nonlocal position
            index = position
            position += 1
            if index not in replacements:
                return match.group(0)
            tag = match.group(0)
            return tag[:tag.index('>') + 1] + escape(replacements[index]) + tag[tag.rindex('</'):]
        # Keep namespace scopes and proprietary object markup byte-for-byte.
        part.write_text(tokens.sub(replace, original), encoding='utf-8')
